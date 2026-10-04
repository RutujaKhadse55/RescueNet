/**
 * RescueNet Mobile Internet Uplink Service (Phase 10-A)
 *
 * - Triggers on ONLINE transitions from ConnectivityGovernor and every 60 s while online.
 * - Also triggers immediately when a new SOS is created while online (onSosCreated).
 * - POST /v1/uplink: JSON batch, packets as hex, optional device-signed envelope header.
 * - Exponential backoff + jitter; honours Retry-After header.
 * - Data-saver mode restricts batches to SOS-class packets on metered networks.
 * - Download path: ACKs, mesh seeds injected into MeshEngine with fromServer=true.
 * - Bridge indicator: "You are a bridge: you uploaded N reports for people nearby."
 * - NEVER deletes packets after uplink; reduces copies_left to 1 so relaying continues.
 */

import { DatabaseManager } from '../db/DatabaseManager';
import { ConnectivityGovernor, NetworkState } from '../ble/ConnectivityGovernor';
import { MeshEngine } from '../mesh/MeshEngine';

export interface UplinkConfig {
  /** e.g. "http://localhost:3000/v1/uplink" */
  apiUrl: string;
  /** Default 200 */
  batchSizeLimit: number;
  /** Default 60 000 ms */
  intervalMs: number;
  /** Upload only SOS-class packets when on a metered network */
  dataSaver: boolean;
  /** When true, inject-fetch must use cert pinning (configured externally) */
  certPinningEnabled: boolean;
  /** Optional device-signed envelope value (from /devices/register) */
  deviceSignature?: string;
}

export interface PerPacketResult {
  packetIdHex: string;
  status: 'accepted' | 'duplicate' | 'rejected';
  reason?: string;
}

export interface UplinkResult {
  attempted: number;
  accepted: number;
  duplicate: number;
  rejected: number;
  perPacket: PerPacketResult[];
  pendingAcksCount: number;
  meshSeedsCount: number;
  serverTime?: number;
}

const MAX_BACKOFF_MS = 5 * 60_000; // 5 minutes

export class UplinkService {
  private db: DatabaseManager;
  private governor: ConnectivityGovernor;
  private meshEngine?: MeshEngine;
  private config: UplinkConfig;

  private isRunning = false;
  private periodicTimer: NodeJS.Timeout | null = null;
  private isUploading = false;

  private retryCount = 0;
  private nextRetryTimestamp = 0;

  /** Packets from OTHER nodes that we successfully bridged */
  private bridgePacketsUploaded = 0;
  private clockOffsetMs = 0;

  private customFetch?: typeof fetch;
  private onBridgeUpdate?: (text: string) => void;

  constructor(
    db: DatabaseManager,
    governor: ConnectivityGovernor,
    meshEngine?: MeshEngine,
    config?: Partial<UplinkConfig>,
    customFetch?: typeof fetch,
  ) {
    this.db = db;
    this.governor = governor;
    this.meshEngine = meshEngine;
    this.customFetch = customFetch;
    this.config = {
      apiUrl: 'http://localhost:3000/v1/uplink',
      batchSizeLimit: 200,
      intervalMs: 60_000,
      dataSaver: false,
      certPinningEnabled: false,
      ...config,
    };
  }

  // -- setters ----------------------------------------------------------------

  public setMeshEngine(engine: MeshEngine): void {
    this.meshEngine = engine;
  }

  public setDataSaver(enabled: boolean): void {
    this.config.dataSaver = enabled;
  }

  public isDataSaverEnabled(): boolean {
    return this.config.dataSaver;
  }

  public onBridgeUpdateChange(cb: (text: string) => void): void {
    this.onBridgeUpdate = cb;
  }

  // -- indicator --------------------------------------------------------------

  public getBridgeIndicatorText(): string {
    return `You are a bridge: you uploaded ${this.bridgePacketsUploaded} reports for people nearby.`;
  }

  public getUploadedBridgeCount(): number {
    return this.bridgePacketsUploaded;
  }

  public getClockOffsetMs(): number {
    return this.clockOffsetMs;
  }

  // -- lifecycle --------------------------------------------------------------

  /**
   * Starts background monitoring:
   * 1. Subscribes to ConnectivityGovernor ONLINE state transitions.
   * 2. Periodic poll every 60 s while ONLINE.
   */
  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    this.governor.onStateChange((state: NetworkState) => {
      if (state === 'ONLINE') {
        this.triggerUplink().catch(() => {});
      }
    });

    this.periodicTimer = setInterval(() => {
      if (this.governor.getNetworkState() === 'ONLINE') {
        this.triggerUplink().catch(() => {});
      }
    }, this.config.intervalMs);

    if (this.periodicTimer && typeof (this.periodicTimer as any).unref === 'function') {
      (this.periodicTimer as any).unref();
    }

    if (this.governor.getNetworkState() === 'ONLINE') {
      this.triggerUplink().catch(() => {});
    }
  }

  public stop(): void {
    this.isRunning = false;
    if (this.periodicTimer) {
      clearInterval(this.periodicTimer);
      this.periodicTimer = null;
    }
  }

  /** Call this immediately when a new SOS packet is created while online */
  public async onSosCreated(): Promise<void> {
    if (this.governor.getNetworkState() === 'ONLINE') {
      await this.triggerUplink();
    }
  }

  // -- core uplink ------------------------------------------------------------

  public async triggerUplink(): Promise<UplinkResult | null> {
    if (this.isUploading) return null;
    if (Date.now() < this.nextRetryTimestamp) return null;

    this.isUploading = true;
    try {
      return await this._doUplink();
    } catch {
      this.handleFailure();
      return null;
    } finally {
      this.isUploading = false;
    }
  }

  private async _doUplink(): Promise<UplinkResult | null> {
    // 1. Collect un-uplinked packets (SOS first; data-saver = SOS only)
    const unuplinked = await this.db.packets.getUnuplinkedPackets(
      this.config.batchSizeLimit,
      this.config.dataSaver,
    );

    if (unuplinked.length === 0) {
      return {
        attempted: 0,
        accepted: 0,
        duplicate: 0,
        rejected: 0,
        perPacket: [],
        pendingAcksCount: 0,
        meshSeedsCount: 0,
      };
    }

    // 2. Serialise as hex strings
    const packetsPayload: string[] = unuplinked.map(p => {
      if (/^[0-9a-fA-F]+$/.test(p.raw_bytes)) return p.raw_bytes;
      return Buffer.from(p.raw_bytes, 'base64').toString('hex');
    });

    const body = JSON.stringify({ packets: packetsPayload });

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Client-Platform': 'android',
      'X-Client-Version': '1.0.0',
    };
    if (this.config.deviceSignature) {
      headers['X-Device-Signature'] = this.config.deviceSignature;
    }

    // 3. POST with fallback across emulator endpoints
    const fetchImpl = this.customFetch || globalThis.fetch;
    let response: any = null;
    const candidateUrls = Array.from(
      new Set([
        this.config.apiUrl,
        'http://10.0.2.2:3000/v1/uplink',
        'http://localhost:3000/v1/uplink',
        'http://127.0.0.1:3000/v1/uplink',
      ]),
    );

    for (const url of candidateUrls) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3500);
        const res = await fetchImpl(url, {
          method: 'POST',
          headers,
          body,
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (res && (res.ok || res.status < 500)) {
          response = res;
          this.config.apiUrl = url;
          break;
        }
      } catch {
        // try next candidate
      }
    }

    if (!response) {
      this.handleFailure();
      return null;
    }

    if (response.status === 429 || response.status >= 500) {
      const retryAfter = response.headers?.get?.('Retry-After');
      this.handleFailure(retryAfter ? parseInt(retryAfter, 10) : undefined);
      return null;
    }

    if (!response.ok) {
      this.handleFailure();
      return null;
    }

    const resJson = await response.json();
    this.retryCount = 0;
    this.nextRetryTimestamp = 0;

    // 4. Parse per-packet results
    const perPacket: PerPacketResult[] = (resJson.results ?? []) as PerPacketResult[];
    let accepted = perPacket.filter(r => r.status === 'accepted').length;
    let duplicate = perPacket.filter(r => r.status === 'duplicate').length;
    let rejected = perPacket.filter(r => r.status === 'rejected').length;
    // Fallback to aggregate counts if server doesn't return per-packet detail
    if (perPacket.length === 0) {
      accepted = resJson.accepted ?? 0;
      duplicate = resJson.duplicate ?? 0;
      rejected = resJson.rejected ?? 0;
    }

    // 5. Mark uplinked; reduce copies_left to 1 - keep relaying!
    const nowIso = new Date().toISOString();
    for (const p of unuplinked) {
      await this.db.packets.markUplinkedWithCopies(p.packet_id, 1, nowIso);
    }

    // 6. Bridge indicator: count packets from other originFps
    const myOriginFp = await this.db.settings.get('origin_fp').catch(() => null);
    for (const p of unuplinked) {
      if (myOriginFp && p.origin_fp !== myOriginFp) {
        this.bridgePacketsUploaded++;
      }
    }
    if (this.onBridgeUpdate) {
      this.onBridgeUpdate(this.getBridgeIndicatorText());
    }

    // 7. Server clock correction
    if (typeof resJson.serverTime === 'number') {
      this.clockOffsetMs = resJson.serverTime * 1000 - Date.now();
    }

    // 8. Download path: ingest pending ACKs + mesh seed packets
    const pendingAcks: any[] = resJson.pendingAcks ?? [];
    const meshSeeds: string[] = resJson.meshSeedPackets ?? [];

    if (this.meshEngine) {
      for (const ack of pendingAcks) {
        if (ack?.rawHex) {
          const raw = this._hexToBytes(ack.rawHex);
          await this.meshEngine.receivePacket(raw, undefined, true);
        }
      }
      for (const seedHex of meshSeeds) {
        if (typeof seedHex === 'string') {
          const raw = this._hexToBytes(seedHex);
          await this.meshEngine.receivePacket(raw, undefined, true);
        }
      }
    }

    return {
      attempted: unuplinked.length,
      accepted,
      duplicate,
      rejected,
      perPacket,
      pendingAcksCount: pendingAcks.length,
      meshSeedsCount: meshSeeds.length,
      serverTime: resJson.serverTime,
    };
  }

  // -- helpers ----------------------------------------------------------------

  private handleFailure(explicitRetrySeconds?: number): void {
    this.retryCount++;
    let delayMs: number;
    if (explicitRetrySeconds !== undefined && explicitRetrySeconds > 0) {
      delayMs = explicitRetrySeconds * 1000;
    } else {
      const base = Math.min(MAX_BACKOFF_MS, 2_000 * Math.pow(2, this.retryCount - 1));
      const jitter = Math.random() * 0.2 * base;
      delayMs = base + jitter;
    }
    this.nextRetryTimestamp = Date.now() + delayMs;
  }

  private _hexToBytes(hex: string): Uint8Array {
    const pairs = hex.match(/.{1,2}/g) ?? [];
    return new Uint8Array(pairs.map(b => parseInt(b, 16)));
  }
}
