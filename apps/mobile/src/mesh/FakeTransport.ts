/**
 * RescueNet Deterministic In-Memory BLE FakeTransport
 * Links N MeshEngines in an arbitrary simulated radio graph for multi-hop verification.
 * Portable across mobile, tests, and packages/sim without native dependencies.
 */

import { BleMode, BleNeighbor, GattExchangeStats, IBleTransport, ScanMode } from '../native/RescueBle';

export interface FakeLinkOptions {
  rssi?: number;
  inRange?: boolean;
}

export class FakeBleNetwork {
  private static transports: Map<string, FakeTransport> = new Map();
  // Bidirectional link graph: "nodeA:nodeB" -> FakeLinkOptions
  private static links: Map<string, FakeLinkOptions> = new Map();

  public static register(transport: FakeTransport): void {
    FakeBleNetwork.transports.set(transport.nodeId, transport);
  }

  public static unregister(nodeId: string): void {
    FakeBleNetwork.transports.delete(nodeId);
    for (const key of FakeBleNetwork.links.keys()) {
      if (key.startsWith(`${nodeId}:`) || key.endsWith(`:${nodeId}`)) {
        FakeBleNetwork.links.delete(key);
      }
    }
  }

  public static setLink(nodeA: string, nodeB: string, options: FakeLinkOptions): void {
    const key1 = `${nodeA}:${nodeB}`;
    const key2 = `${nodeB}:${nodeA}`;
    FakeBleNetwork.links.set(key1, options);
    FakeBleNetwork.links.set(key2, options);

    // If both nodes are registered and one is advertising while other is scanning, notify
    const tA = FakeBleNetwork.transports.get(nodeA);
    const tB = FakeBleNetwork.transports.get(nodeB);
    if (tA && tB && options.inRange) {
      if (tA.isAdvertising() && tB.isScanning()) {
        tB.deliverDiscoveredNeighbor(tA.createNeighborAdvertisement(options.rssi ?? -65));
      }
      if (tB.isAdvertising() && tA.isScanning()) {
        tA.deliverDiscoveredNeighbor(tB.createNeighborAdvertisement(options.rssi ?? -65));
      }
    }
  }

  public static removeLink(nodeA: string, nodeB: string): void {
    FakeBleNetwork.links.delete(`${nodeA}:${nodeB}`);
    FakeBleNetwork.links.delete(`${nodeB}:${nodeA}`);
  }

  public static getLink(nodeA: string, nodeB: string): FakeLinkOptions | null {
    return FakeBleNetwork.links.get(`${nodeA}:${nodeB}`) ?? null;
  }

  public static getTransport(nodeId: string): FakeTransport | null {
    return FakeBleNetwork.transports.get(nodeId) ?? null;
  }

  public static clear(): void {
    FakeBleNetwork.transports.clear();
    FakeBleNetwork.links.clear();
  }
}

export class FakeTransport implements IBleTransport {
  public readonly nodeId: string;
  private advertising = false;
  private scanning = false;
  private btEnabled = true;
  private locEnabled = true;
  private advMode: BleMode = 'BALANCED';
  private scanMode: ScanMode = 'BALANCED';

  private advRole: 'survivor' | 'rescuer' | 'gateway' = 'survivor';
  private advFlags = { hasSos: false, lowBattery: false, beaconOnly: false };
  private advOriginFpPrefix = '00000000';

  private stats: GattExchangeStats = {
    bytesSent: 0,
    bytesReceived: 0,
    mtu: 247,
    phy: '2M',
    gatt133Errors: 0,
    connectAttempts: 0,
    successfulExchanges: 0,
    activeConnections: 0,
  };

  private neighborDiscoveredListeners: Array<(neighbor: BleNeighbor) => void> = [];
  private neighborLostListeners: Array<(event: { deviceId: string }) => void> = [];
  private rssiListeners: Array<(event: { deviceId: string; rssi: number }) => void> = [];
  private fragmentListeners: Array<(event: { deviceId: string; fragmentBase64: string }) => void> = [];
  private btStateListeners: Array<(enabled: boolean) => void> = [];

  constructor(nodeId: string) {
    this.nodeId = nodeId;
    FakeBleNetwork.register(this);
  }

  public createNeighborAdvertisement(rssi: number = -65): BleNeighbor {
    return {
      deviceId: this.nodeId,
      name: `RescueNode-${this.nodeId}`,
      rssi,
      originFpPrefix: this.advOriginFpPrefix,
      protocolVersion: 1,
      role: this.advRole,
      flags: { ...this.advFlags },
      lastSeen: Date.now(),
    };
  }

  public deliverDiscoveredNeighbor(neighbor: BleNeighbor): void {
    for (const listener of this.neighborDiscoveredListeners) {
      listener(neighbor);
    }
  }

  // Peripheral operations
  async startAdvertising(
    mode: BleMode = 'BALANCED',
    role: 'survivor' | 'rescuer' | 'gateway' = 'survivor',
    flags: { hasSos: boolean; lowBattery: boolean; beaconOnly: boolean } = {
      hasSos: false,
      lowBattery: false,
      beaconOnly: false,
    },
    originFpPrefix: string = '00000000'
  ): Promise<boolean> {
    this.advMode = mode;
    this.advRole = role;
    this.advFlags = flags;
    this.advOriginFpPrefix = originFpPrefix;
    this.advertising = true;

    // Check all registered scanning nodes and notify them if linked
    for (const [targetId, transport] of (FakeBleNetwork as any).transports.entries()) {
      if (targetId === this.nodeId) continue;
      const link = FakeBleNetwork.getLink(this.nodeId, targetId);
      if (link && link.inRange && transport.isScanning()) {
        transport.deliverDiscoveredNeighbor(this.createNeighborAdvertisement(link.rssi ?? -65));
      }
    }
    return true;
  }

  async stopAdvertising(): Promise<void> {
    this.advertising = false;
  }

  isAdvertising(): boolean {
    return this.advertising;
  }

  async setAdvertisingMode(mode: BleMode): Promise<void> {
    this.advMode = mode;
  }

  public getAdvertisingMode(): BleMode {
    return this.advMode;
  }

  // Central operations
  async startScanning(mode: ScanMode = 'BALANCED'): Promise<boolean> {
    this.scanMode = mode;
    this.scanning = true;

    // Look for all advertising nodes that are linked and in-range
    for (const [targetId, transport] of (FakeBleNetwork as any).transports.entries()) {
      if (targetId === this.nodeId) continue;
      const link = FakeBleNetwork.getLink(this.nodeId, targetId);
      if (link && link.inRange && transport.isAdvertising()) {
        this.deliverDiscoveredNeighbor(transport.createNeighborAdvertisement(link.rssi ?? -65));
      }
    }
    return true;
  }

  async stopScanning(): Promise<void> {
    this.scanning = false;
  }

  isScanning(): boolean {
    return this.scanning;
  }

  async setScanMode(mode: ScanMode): Promise<void> {
    this.scanMode = mode;
  }

  public getScanMode(): ScanMode {
    return this.scanMode;
  }

  // Data Exchange
  async connectAndSync(
    deviceId: string,
    _localSummaryHex: string
  ): Promise<{ success: boolean; peerSummaryHex?: string }> {
    this.stats.connectAttempts++;
    const link = FakeBleNetwork.getLink(this.nodeId, deviceId);
    if (!link || !link.inRange) {
      this.stats.gatt133Errors++;
      return { success: false };
    }
    this.stats.successfulExchanges++;
    return { success: true, peerSummaryHex: '' };
  }

  async sendFragment(deviceId: string, fragmentBytesBase64: string): Promise<boolean> {
    const link = FakeBleNetwork.getLink(this.nodeId, deviceId);
    if (!link || !link.inRange) {
      return false;
    }
    const target = FakeBleNetwork.getTransport(deviceId);
    if (!target) return false;

    this.stats.bytesSent += fragmentBytesBase64.length;
    await target.receiveFragmentFrom(this.nodeId, fragmentBytesBase64);
    return true;
  }

  public async receiveFragmentFrom(fromDeviceId: string, fragmentBytesBase64: string): Promise<void> {
    this.stats.bytesReceived += fragmentBytesBase64.length;
    for (const listener of this.fragmentListeners) {
      await listener({ deviceId: fromDeviceId, fragmentBase64: fragmentBytesBase64 });
    }
  }

  public emitRssiSample(deviceId: string, rssi: number): void {
    for (const listener of this.rssiListeners) {
      listener({ deviceId, rssi });
    }
  }

  async disconnect(_deviceId: string): Promise<void> {}

  async isBluetoothEnabled(): Promise<boolean> {
    return this.btEnabled;
  }

  async enableBluetooth(): Promise<boolean> {
    this.btEnabled = true;
    for (const cb of this.btStateListeners) cb(true);
    return true;
  }

  async isLocationEnabled(): Promise<boolean> {
    return this.locEnabled;
  }

  async getExchangeStats(): Promise<GattExchangeStats> {
    return { ...this.stats };
  }

  on(event: 'neighborDiscovered', callback: (neighbor: BleNeighbor) => void): () => void;
  on(event: 'neighborLost', callback: (event: { deviceId: string }) => void): () => void;
  on(event: 'rssiSample', callback: (event: { deviceId: string; rssi: number }) => void): () => void;
  on(event: 'fragmentReceived', callback: (event: { deviceId: string; fragmentBase64: string }) => void): () => void;
  on(event: 'bluetoothState', callback: (enabled: boolean) => void): () => void;
  on(event: string, callback: any): () => void {
    if (event === 'neighborDiscovered') {
      this.neighborDiscoveredListeners.push(callback);
      return () => {
        this.neighborDiscoveredListeners = this.neighborDiscoveredListeners.filter((c) => c !== callback);
      };
    } else if (event === 'neighborLost') {
      this.neighborLostListeners.push(callback);
      return () => {
        this.neighborLostListeners = this.neighborLostListeners.filter((c) => c !== callback);
      };
    } else if (event === 'rssiSample') {
      this.rssiListeners.push(callback);
      return () => {
        this.rssiListeners = this.rssiListeners.filter((c) => c !== callback);
      };
    } else if (event === 'fragmentReceived') {
      this.fragmentListeners.push(callback);
      return () => {
        this.fragmentListeners = this.fragmentListeners.filter((c) => c !== callback);
      };
    } else if (event === 'bluetoothState') {
      this.btStateListeners.push(callback);
      return () => {
        this.btStateListeners = this.btStateListeners.filter((c) => c !== callback);
      };
    }
    return () => {};
  }

  onNeighborDiscovered(callback: (neighbor: BleNeighbor) => void): () => void {
    return this.on('neighborDiscovered', callback);
  }

  onNeighborLost(callback: (deviceId: string) => void): () => void {
    return this.on('neighborLost', (e) => callback(e.deviceId));
  }

  onRssiSample(callback: (deviceId: string, rssi: number) => void): () => void {
    return this.on('rssiSample', (e) => callback(e.deviceId, e.rssi));
  }

  onPacketFragmentReceived(callback: (deviceId: string, fragmentBase64: string) => void): () => void {
    return this.on('fragmentReceived', (e) => callback(e.deviceId, e.fragmentBase64));
  }

  onBluetoothStateChanged(callback: (enabled: boolean) => void): () => void {
    return this.on('bluetoothState', callback);
  }

  public destroy(): void {
    FakeBleNetwork.unregister(this.nodeId);
    this.neighborDiscoveredListeners = [];
    this.neighborLostListeners = [];
    this.rssiListeners = [];
    this.fragmentListeners = [];
    this.btStateListeners = [];
  }
}
