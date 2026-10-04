/**
 * RescueNet Native BLE Module Specification (RescueBle)
 * Platform-independent IBleTransport interface, supporting Android Kotlin TurboModule / Bridge
 * and future iOS CoreBluetooth implementations.
 */

import { NativeModules, NativeEventEmitter } from 'react-native';

export type BleMode = 'LOW_POWER' | 'BALANCED' | 'LOW_LATENCY' | 'BEACON_ONLY';
export type ScanMode = 'LOW_POWER' | 'BALANCED' | 'LOW_LATENCY';

export interface BleNeighbor {
  deviceId: string;
  name?: string;
  rssi: number;
  originFpPrefix: string; // 4 bytes (8 hex chars)
  protocolVersion: number;
  role: 'survivor' | 'rescuer' | 'gateway';
  flags: {
    hasSos: boolean;
    lowBattery: boolean;
    beaconOnly: boolean;
  };
  lastSeen: number;
}

export interface GattExchangeStats {
  bytesSent: number;
  bytesReceived: number;
  mtu: number;
  phy: '1M' | '2M' | 'CODED';
  gatt133Errors: number;
  connectAttempts: number;
  successfulExchanges: number;
  activeConnections: number;
}

export interface IBleTransport {
  // Peripheral operations
  startAdvertising(
    mode: BleMode,
    role: 'survivor' | 'rescuer' | 'gateway',
    flags: { hasSos: boolean; lowBattery: boolean; beaconOnly: boolean },
    originFpPrefix: string
  ): Promise<boolean>;

  stopAdvertising(): Promise<void>;
  isAdvertising(): boolean;
  setAdvertisingMode(mode: BleMode): Promise<void>;

  // Central operations
  startScanning(mode: ScanMode): Promise<boolean>;
  stopScanning(): Promise<void>;
  isScanning(): boolean;
  setScanMode(mode: ScanMode): Promise<void>;

  // Connection & Data Exchange
  connectAndSync(deviceId: string, localSummaryHex: string): Promise<{ success: boolean; peerSummaryHex?: string }>;
  sendFragment(deviceId: string, fragmentBytesBase64: string): Promise<boolean>;
  disconnect(deviceId: string): Promise<void>;

  // System & Recovery
  isBluetoothEnabled(): Promise<boolean>;
  enableBluetooth(): Promise<boolean>;
  isLocationEnabled(): Promise<boolean>;
  getExchangeStats(): Promise<GattExchangeStats>;

  // Event Listeners
  on(event: 'neighborDiscovered', callback: (neighbor: BleNeighbor) => void): () => void;
  on(event: 'neighborLost', callback: (event: { deviceId: string }) => void): () => void;
  on(event: 'rssiSample', callback: (event: { deviceId: string; rssi: number }) => void): () => void;
  on(event: 'fragmentReceived', callback: (event: { deviceId: string; fragmentBase64: string }) => void): () => void;
  on(event: 'bluetoothState', callback: (enabled: boolean) => void): () => void;

  onNeighborDiscovered(callback: (neighbor: BleNeighbor) => void): () => void;
  onNeighborLost(callback: (deviceId: string) => void): () => void;
  onRssiSample(callback: (deviceId: string, rssi: number) => void): () => void;
  onPacketFragmentReceived(callback: (deviceId: string, fragmentBase64: string) => void): () => void;
  onBluetoothStateChanged(callback: (enabled: boolean) => void): () => void;
}

/**
 * Headless & Test Mock Implementation of IBleTransport
 */
export class MockBleTransport implements IBleTransport {
  private advertising = false;
  private scanning = false;
  private btEnabled = true;
  private locEnabled = true;
  private currentAdvMode: BleMode = 'BALANCED';
  private currentScanMode: ScanMode = 'BALANCED';

  private neighbors: Map<string, BleNeighbor> = new Map();
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

  async startAdvertising(
    mode?: BleMode,
    _role?: 'survivor' | 'rescuer' | 'gateway',
    _flags?: { hasSos: boolean; lowBattery: boolean; beaconOnly: boolean },
    _originFpPrefix?: string
  ): Promise<boolean> {
    if (mode) this.currentAdvMode = mode;
    this.advertising = true;
    return true;
  }

  async stopAdvertising(): Promise<void> {
    this.advertising = false;
  }

  isAdvertising(): boolean {
    return this.advertising;
  }

  async setAdvertisingMode(mode: BleMode): Promise<void> {
    this.currentAdvMode = mode;
  }

  public getAdvertisingMode(): BleMode {
    return this.currentAdvMode;
  }

  async startScanning(mode?: ScanMode): Promise<boolean> {
    if (mode) this.currentScanMode = mode;
    this.scanning = true;
    return true;
  }

  async stopScanning(): Promise<void> {
    this.scanning = false;
  }

  isScanning(): boolean {
    return this.scanning;
  }

  async setScanMode(mode: ScanMode): Promise<void> {
    this.currentScanMode = mode;
  }

  public getScanMode(): ScanMode {
    return this.currentScanMode;
  }

  async connectAndSync(
    _deviceId: string,
    _localSummaryHex: string
  ): Promise<{ success: boolean; peerSummaryHex?: string }> {
    this.stats.connectAttempts++;
    this.stats.successfulExchanges++;
    return { success: true, peerSummaryHex: '' };
  }

  async sendFragment(_deviceId: string, fragmentBytesBase64: string): Promise<boolean> {
    this.stats.bytesSent += fragmentBytesBase64.length;
    return true;
  }

  async disconnect(_deviceId: string): Promise<void> {}

  async isBluetoothEnabled(): Promise<boolean> {
    return this.btEnabled;
  }

  async enableBluetooth(): Promise<boolean> {
    this.btEnabled = true;
    this.btStateListeners.forEach((cb) => cb(true));
    return true;
  }

  async isLocationEnabled(): Promise<boolean> {
    return this.locEnabled;
  }

  async getExchangeStats(): Promise<GattExchangeStats> {
    return { ...this.stats };
  }

  // Simulation helpers for testing
  public simulateDiscoveredNeighbor(neighbor: BleNeighbor): void {
    this.neighbors.set(neighbor.deviceId, neighbor);
    this.neighborDiscoveredListeners.forEach((cb) => cb(neighbor));
  }

  public simulateFragmentReceived(deviceId: string, fragmentBase64: string): void {
    this.stats.bytesReceived += fragmentBase64.length;
    this.fragmentListeners.forEach((cb) => cb({ deviceId, fragmentBase64 }));
  }

  public simulateBluetoothState(enabled: boolean): void {
    this.btEnabled = enabled;
    this.btStateListeners.forEach((cb) => cb(enabled));
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
}

/**
 * Native Bridge Implementation wrapping Android/iOS Native Module
 */
class NativeBleTransport implements IBleTransport {
  private module = NativeModules.RescueBleModule;
  private emitter: NativeEventEmitter | null = null;
  private fallbackMock = new MockBleTransport();

  constructor() {
    if (this.module) {
      this.emitter = new NativeEventEmitter(this.module);
    }
  }

  async startAdvertising(
    mode: BleMode,
    role: 'survivor' | 'rescuer' | 'gateway',
    flags: { hasSos: boolean; lowBattery: boolean; beaconOnly: boolean },
    originFpPrefix: string
  ): Promise<boolean> {
    if (!this.module) return this.fallbackMock.startAdvertising(mode, role, flags, originFpPrefix);
    return this.module.startAdvertising(mode, role, flags, originFpPrefix);
  }

  async stopAdvertising(): Promise<void> {
    if (!this.module) return this.fallbackMock.stopAdvertising();
    return this.module.stopAdvertising();
  }

  isAdvertising(): boolean {
    if (!this.module) return this.fallbackMock.isAdvertising();
    return false;
  }

  async setAdvertisingMode(mode: BleMode): Promise<void> {
    if (!this.module) return this.fallbackMock.setAdvertisingMode(mode);
    return this.module.setAdvertisingMode(mode);
  }

  async startScanning(mode: ScanMode): Promise<boolean> {
    if (!this.module) return this.fallbackMock.startScanning(mode);
    return this.module.startScanning(mode);
  }

  async stopScanning(): Promise<void> {
    if (!this.module) return this.fallbackMock.stopScanning();
    return this.module.stopScanning();
  }

  isScanning(): boolean {
    if (!this.module) return this.fallbackMock.isScanning();
    return false;
  }

  async setScanMode(mode: ScanMode): Promise<void> {
    if (!this.module) return this.fallbackMock.setScanMode(mode);
    return this.module.setScanMode(mode);
  }

  async connectAndSync(deviceId: string, localSummaryHex: string): Promise<{ success: boolean; peerSummaryHex?: string }> {
    if (!this.module) return this.fallbackMock.connectAndSync(deviceId, localSummaryHex);
    return this.module.connectAndSync(deviceId, localSummaryHex);
  }

  async sendFragment(deviceId: string, fragmentBytesBase64: string): Promise<boolean> {
    if (!this.module) return this.fallbackMock.sendFragment(deviceId, fragmentBytesBase64);
    return this.module.sendFragment(deviceId, fragmentBytesBase64);
  }

  async disconnect(deviceId: string): Promise<void> {
    if (!this.module) return this.fallbackMock.disconnect(deviceId);
    return this.module.disconnect(deviceId);
  }

  async isBluetoothEnabled(): Promise<boolean> {
    if (!this.module) return this.fallbackMock.isBluetoothEnabled();
    return this.module.isBluetoothEnabled();
  }

  async enableBluetooth(): Promise<boolean> {
    if (!this.module) return this.fallbackMock.enableBluetooth();
    return this.module.enableBluetooth();
  }

  async isLocationEnabled(): Promise<boolean> {
    if (!this.module) return this.fallbackMock.isLocationEnabled();
    return this.module.isLocationEnabled();
  }

  async getExchangeStats(): Promise<GattExchangeStats> {
    if (!this.module) return this.fallbackMock.getExchangeStats();
    return this.module.getExchangeStats();
  }

  on(event: 'neighborDiscovered', callback: (neighbor: BleNeighbor) => void): () => void;
  on(event: 'neighborLost', callback: (event: { deviceId: string }) => void): () => void;
  on(event: 'rssiSample', callback: (event: { deviceId: string; rssi: number }) => void): () => void;
  on(event: 'fragmentReceived', callback: (event: { deviceId: string; fragmentBase64: string }) => void): () => void;
  on(event: 'bluetoothState', callback: (enabled: boolean) => void): () => void;
  on(event: string, callback: any): () => void {
    if (this.emitter) {
      const sub = this.emitter.addListener(event, callback);
      return () => sub.remove();
    }
    return (this.fallbackMock as any).on(event, callback);
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
}

export const RescueBle: IBleTransport = new NativeBleTransport();
