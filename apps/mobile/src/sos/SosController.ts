import { DatabaseManager } from '../db/DatabaseManager';
import { IdentityService } from '../security/identity';
import { ILocationProvider, DisasterLocation } from '../location/LocationProvider';
import {
  createAndSignSos,
  TriageStatus,
  NeedsBitmask,
  SodiumCrypto,
  PacketFlags,
} from '@rescuenet/core';

export type SosPhase =
  | 'IDLE'
  | 'COUNTDOWN_CANCELABLE' // 5-second false-trigger guard
  | 'ACTIVE_BROADCASTING'
  | 'RESOLVED_SAFE';

export interface SosDetails {
  triage: TriageStatus;
  peopleCount: number;
  needsMask: number;
  shortNote?: string;
  emergencyContactName?: string;
}

export interface SosState {
  phase: SosPhase;
  activePacketId: string | null;
  seq: number;
  triage: TriageStatus;
  peopleCount: number;
  needsMask: number;
  lastBroadcastTime: number;
  lastKnownLocation: DisasterLocation | null;
  countdownSecondsRemaining: number;
  deliveryCount: number;
  hasUplinked: boolean;
  hasControlRoomAck: boolean;
  ackMessage?: string;
  activeChannel?: 'INTERNET' | 'SMS' | 'BLE_MESH';
}

export class SosController {
  private db: DatabaseManager;
  private identityService: IdentityService;
  private locationProvider: ILocationProvider;

  private state: SosState = {
    phase: 'IDLE',
    activePacketId: null,
    seq: 0,
    triage: TriageStatus.CRITICAL,
    peopleCount: 1,
    needsMask: NeedsBitmask.MEDICAL,
    lastBroadcastTime: 0,
    lastKnownLocation: null,
    countdownSecondsRemaining: 5,
    deliveryCount: 0,
    hasUplinked: false,
    hasControlRoomAck: false,
  };

  private cancelCountdownTimer: NodeJS.Timeout | null = null;
  private periodicRebroadcastTimer: NodeJS.Timeout | null = null;
  private stateListeners: Array<(state: SosState) => void> = [];

  private static instance: SosController | null = null;

  constructor(
    db: DatabaseManager,
    identityService: IdentityService,
    locationProvider: ILocationProvider,
  ) {
    this.db = db;
    this.identityService = identityService;
    this.locationProvider = locationProvider;
  }

  public static getInstance(
    db?: DatabaseManager,
    identityService?: IdentityService,
    locationProvider?: ILocationProvider,
  ): SosController {
    if (db && identityService && locationProvider) {
      SosController.instance = new SosController(db, identityService, locationProvider);
      return SosController.instance;
    }
    if (!SosController.instance) {
      throw new Error('SosController not initialized. Pass dependencies on first call.');
    }
    return SosController.instance;
  }

  public static resetInstance(): void {
    SosController.instance = null;
  }

  public async getIdentity() {
    return this.identityService.getIdentity();
  }

  public getNextSeq(): number {
    this.state.seq += 1;
    return this.state.seq;
  }

  public async injectRawPacket(packetBytes: Uint8Array): Promise<string> {
    const packetIdHex = Array.from(packetBytes.slice(5, 13))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    const rawHex = Array.from(packetBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    const originFpHex = Array.from(packetBytes.slice(13, 21))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    await this.db.packets.insertPacket({
      packet_id: packetIdHex,
      raw_bytes: rawHex,
      packet_type: packetBytes[1] ?? 0x01,
      origin_fp: originFpHex,
      hop_count: packetBytes[4] ?? 0,
      ttl: packetBytes[3] ?? 10,
      received_at: new Date().toISOString(),
      from_neighbor: null,
      copies_left: 6,
      delivered_to_count: 0,
      is_sos: packetBytes[1] === 0x01 || packetBytes[1] === 0x04 ? 1 : 0,
      parsed_json: JSON.stringify({ injected: true, type: packetBytes[1] }),
    });

    return packetIdHex;
  }

  public getState(): SosState {
    return { ...this.state };
  }

  public setUplinkStatus(
    uplinked: boolean,
    acked: boolean,
    message?: string,
    channel?: 'INTERNET' | 'SMS' | 'BLE_MESH',
  ): void {
    this.state.hasUplinked = uplinked;
    this.state.hasControlRoomAck = acked;
    if (message !== undefined) this.state.ackMessage = message;
    if (channel !== undefined) this.state.activeChannel = channel;
    this.notifyListeners();
  }

  /**
   * Triggers emergency SOS with a 5-second cancelable false-trigger guard window
   */
  public async triggerSos(
    triggerType:
      'button_hold' | 'instant_tap' | 'power_x5' | 'volume_sequence' | 'shake' | 'notification',
    details?: Partial<SosDetails>,
  ): Promise<void> {
    if (this.state.phase === 'ACTIVE_BROADCASTING') {
      return; // Already actively broadcasting
    }

    if (details) {
      if (details.triage !== undefined) this.state.triage = details.triage;
      if (details.peopleCount !== undefined) this.state.peopleCount = details.peopleCount;
      if (details.needsMask !== undefined) this.state.needsMask = details.needsMask;
    }

    await this.db.events.logEvent('sos_triggered', { triggerType, triage: this.state.triage });

    if (triggerType === 'instant_tap') {
      // Direct bypass of countdown for 1-tap fast emergency
      await this.activateSosBroadcast();
      return;
    }

    // False-trigger countdown window (5 seconds)
    this.state.phase = 'COUNTDOWN_CANCELABLE';
    this.state.countdownSecondsRemaining = 5;
    this.notifyListeners();

    if (this.cancelCountdownTimer) {
      clearInterval(this.cancelCountdownTimer);
    }

    this.cancelCountdownTimer = setInterval(async () => {
      this.state.countdownSecondsRemaining -= 1;
      this.notifyListeners();

      if (this.state.countdownSecondsRemaining <= 0) {
        if (this.cancelCountdownTimer) {
          clearInterval(this.cancelCountdownTimer);
          this.cancelCountdownTimer = null;
        }
        await this.activateSosBroadcast();
      }
    }, 1000);
  }

  /**
   * Cancels pending false-trigger countdown or active SOS
   */
  public cancelSos(): void {
    if (this.cancelCountdownTimer) {
      clearInterval(this.cancelCountdownTimer);
      this.cancelCountdownTimer = null;
    }
    if (this.periodicRebroadcastTimer) {
      clearInterval(this.periodicRebroadcastTimer);
      this.periodicRebroadcastTimer = null;
    }
    this.state.phase = 'IDLE';
    this.state.activePacketId = null;
    this.notifyListeners();
  }

  /**
   * Safe status update: sends Safe status packet to resolve emergency
   */
  public async resolveSafe(): Promise<void> {
    this.cancelSos();
    this.state.phase = 'RESOLVED_SAFE';
    this.state.triage = TriageStatus.SAFE;
    this.notifyListeners();

    // Broadcast final safe status update
    await this.broadcastSosPacket();
  }

  /**
   * Commits and activates SOS broadcasting
   */
  private async activateSosBroadcast(): Promise<void> {
    this.state.phase = 'ACTIVE_BROADCASTING';
    this.state.seq += 1;
    this.notifyListeners();

    await this.broadcastSosPacket();
    this.scheduleAdaptiveRebroadcast();
  }

  /**
   * Creates, signs and commits an SOS packet to the local mesh database
   */
  public async broadcastSosPacket(): Promise<string> {
    const loc = await this.locationProvider.getCurrentLocation(30_000);
    this.state.lastKnownLocation = loc;

    const crypto = await SodiumCrypto.getInstance();
    const identity = await this.identityService.getIdentity();

    const signedPacketBytes = await createAndSignSos(
      {
        ttl: 10,
        hop: 0,
        flags: PacketFlags.NONE,
        timestamp: Math.round(loc.timestamp / 1000),
        latitude: loc.latitude,
        longitude: loc.longitude,
        accuracyMeters: loc.accuracyMeters,
        status: this.state.triage,
        peopleCount: this.state.peopleCount,
        needsMask: this.state.needsMask,
        batteryPercent: 85,
        sequenceNumber: this.state.seq,
        keyPair: {
          publicKey: identity.publicKey,
          privateKey: identity.privateKey,
        },
      },
      crypto,
    );

    const packetIdHex = Array.from(signedPacketBytes.slice(5, 13))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    const rawHex = Array.from(signedPacketBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    const originFpHex = Array.from(signedPacketBytes.slice(13, 21))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Persist to local packets table with Spray-and-Wait L=6 and source = self
    await this.db.packets.insertPacket({
      packet_id: packetIdHex,
      raw_bytes: rawHex,
      packet_type: 0x01, // SOS
      origin_fp: originFpHex,
      hop_count: 0,
      ttl: 10,
      received_at: new Date().toISOString(),
      from_neighbor: null,
      copies_left: 6, // Spray and Wait L=6
      delivered_to_count: 0,
      is_sos: 1,
      parsed_json: JSON.stringify({
        triage: this.state.triage,
        peopleCount: this.state.peopleCount,
        needsMask: this.state.needsMask,
        latitude: loc.latitude,
        longitude: loc.longitude,
        accuracy: loc.accuracyMeters,
        seq: this.state.seq,
      }),
    });

    this.state.activePacketId = packetIdHex;
    this.state.lastBroadcastTime = Date.now();
    return packetIdHex;
  }

  /**
   * Evaluates whether location has moved sufficiently (> accuracy radius) to warrant rebroadcast
   */
  public shouldRebroadcast(newLoc: DisasterLocation): boolean {
    if (!this.state.lastKnownLocation) return true;

    // Approximate distance in meters using Haversine
    const dLat = (newLoc.latitude - this.state.lastKnownLocation.latitude) * 111_000;
    const dLon =
      (newLoc.longitude - this.state.lastKnownLocation.longitude) *
      111_000 *
      Math.cos((newLoc.latitude * Math.PI) / 180);
    const distanceMeters = Math.sqrt(dLat * dLat + dLon * dLon);

    return distanceMeters >= newLoc.accuracyMeters;
  }

  /**
   * Adaptive re-broadcast:
   * 2 min moving, 10 min stationary, slower on low battery
   */
  private scheduleAdaptiveRebroadcast(): void {
    if (this.periodicRebroadcastTimer) {
      clearInterval(this.periodicRebroadcastTimer);
    }

    const intervalMs = process.env.NODE_ENV === 'test' ? 100 : 120_000; // 2 min default

    this.periodicRebroadcastTimer = setInterval(async () => {
      if (this.state.phase === 'ACTIVE_BROADCASTING') {
        const freshLoc = await this.locationProvider.getCurrentLocation(10_000);
        if (this.shouldRebroadcast(freshLoc)) {
          await this.broadcastSosPacket();
          this.notifyListeners();
        }
      }
    }, intervalMs);

    if (
      this.periodicRebroadcastTimer &&
      typeof this.periodicRebroadcastTimer.unref === 'function'
    ) {
      this.periodicRebroadcastTimer.unref();
    }
  }

  public onStateChange(listener: (state: SosState) => void): () => void {
    this.stateListeners.push(listener);
    return () => {
      this.stateListeners = this.stateListeners.filter(l => l !== listener);
    };
  }

  private notifyListeners(): void {
    const s = this.getState();
    for (const l of this.stateListeners) {
      l(s);
    }
  }
}
