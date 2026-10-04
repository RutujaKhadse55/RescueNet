import { ConnectivityGovernor } from '../src/ble/ConnectivityGovernor';
import { MockBleTransport } from '../src/native/RescueBle';
import { DatabaseManager } from '../src/db/DatabaseManager';

describe('Phase 5: ConnectivityGovernor & Auto-Arm State Machine', () => {
  let transport: MockBleTransport;
  let db: DatabaseManager;
  let governor: ConnectivityGovernor;

  beforeEach(async () => {
    transport = new MockBleTransport();
    db = await DatabaseManager.create(true);
    governor = new ConnectivityGovernor(transport, db, {
      debounceMs: 50, // Accelerated for unit tests
      probeIntervalMs: 50,
      autoArmOnNetworkLost: true,
    });
  });

  afterEach(() => {
    governor.stop();
  });

  it('starts in OFFLINE / ARMED state when auto-arm is enabled', async () => {
    await governor.start();

    // In offline disaster environment without network, auto-arms mesh
    expect(governor.getNetworkState()).toBe('OFFLINE');
    expect(governor.getMeshMode()).toBe('ARMED');
    expect(transport.isScanning()).toBe(true);
    expect(transport.isAdvertising()).toBe(true);
    expect(transport.getScanMode()).toBe('BALANCED');
  });

  it('transitions to ACTIVE mode when an SOS is pending or received', async () => {
    await governor.start();
    expect(governor.getMeshMode()).toBe('ARMED');

    // Trigger SOS event
    await governor.onSosTriggered();

    expect(governor.getMeshMode()).toBe('ACTIVE');
    expect(transport.getScanMode()).toBe('LOW_LATENCY');
    expect(transport.getAdvertisingMode()).toBe('LOW_LATENCY');
  });

  it('transitions to ONLINE and drops to IDLE mode when network recovers and no SOS is pending', async () => {
    await governor.start();

    // Mock network probe returning 200 OK
    jest.spyOn(global, 'fetch').mockImplementation(async () => {
      return {
        ok: true,
        status: 200,
        json: async () => ({ status: 'healthy' }),
      } as any;
    });

    await governor.probeReachability();

    // Allow debounce timer to settle
    await new Promise(resolve => setTimeout(resolve, 80));

    expect(governor.getNetworkState()).toBe('ONLINE');
    expect(governor.getMeshMode()).toBe('IDLE');
    expect(transport.getScanMode()).toBe('LOW_POWER');
  });

  it('auto-recovers radio when Bluetooth is turned back ON', async () => {
    await governor.start();
    await governor.onSosTriggered(); // ACTIVE

    // Simulate BT turned off
    transport.simulateBluetoothState(false);

    // Simulate BT turned on by user / quick settings tile
    transport.simulateBluetoothState(true);

    // Wait for event cycle
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(transport.isScanning()).toBe(true);
    expect(transport.isAdvertising()).toBe(true);
  });
});
