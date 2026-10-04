import { SosController } from '../src/sos/SosController';
import { SurvivalModeManager } from '../src/sos/SurvivalModeManager';
import { DatabaseManager } from '../src/db/DatabaseManager';
import { IdentityService } from '../src/security/identity';
import { LocationProvider } from '../src/location/LocationProvider';
import { TriageStatus, NeedsBitmask, SodiumCrypto } from '@rescuenet/core';

describe('Phase 6: Emergency SOS Flow, Guards, and Survival Modes', () => {
  let db: DatabaseManager;
  let identityService: IdentityService;
  let locationProvider: LocationProvider;
  let sosController: SosController;
  let crypto: SodiumCrypto;

  beforeEach(async () => {
    crypto = await SodiumCrypto.getInstance();
    db = await DatabaseManager.create(true);
    identityService = await IdentityService.create(crypto);
    locationProvider = new LocationProvider({
      latitude: 18.5204,
      longitude: 73.8567,
      accuracyMeters: 5.0,
    });
    sosController = SosController.getInstance(db, identityService, locationProvider);
  });

  afterEach(() => {
    sosController.cancelSos();
  });

  it('triggers SOS with 5-second cancelable false-trigger guard window', async () => {
    await sosController.triggerSos('button_hold', {
      triage: TriageStatus.CRITICAL,
      peopleCount: 3,
      needsMask: NeedsBitmask.MEDICAL | NeedsBitmask.EVACUATION,
    });

    const state1 = sosController.getState();
    expect(state1.phase).toBe('COUNTDOWN_CANCELABLE');
    expect(state1.countdownSecondsRemaining).toBe(5);

    // Cancel before countdown expires
    sosController.cancelSos();
    const state2 = sosController.getState();
    expect(state2.phase).toBe('IDLE');
    expect(state2.activePacketId).toBeNull();
  });

  it('bypasses countdown immediately on instant_tap emergency (< 2 taps guarantee)', async () => {
    await sosController.triggerSos('instant_tap', {
      triage: TriageStatus.CRITICAL,
      peopleCount: 1,
    });

    const state = sosController.getState();
    expect(state.phase).toBe('ACTIVE_BROADCASTING');
    expect(state.activePacketId).not.toBeNull();
    expect(state.seq).toBeGreaterThan(0);

    // Check that packet was saved to local database
    const packets = await db.packets.getAllPackets();
    expect(packets.length).toBeGreaterThan(0);
    expect(packets[0]?.is_sos).toBe(1);
    expect(packets[0]?.copies_left).toBe(6); // Spray and Wait L=6
  });

  it('increments sequence number on repeated broadcasts', async () => {
    await sosController.triggerSos('instant_tap');
    const seq1 = sosController.getState().seq;

    await sosController.broadcastSosPacket();
    const seq2 = sosController.getNextSeq();

    expect(seq2).toBeGreaterThan(seq1);
  });

  it('evaluates distance threshold before rebroadcasting', async () => {
    await sosController.triggerSos('instant_tap');
    const origin = {
      latitude: 18.5204,
      longitude: 73.8567,
      accuracyMeters: 10.0,
      timestamp: Date.now(),
      isStaleFallback: false,
      ageSeconds: 0,
    };

    // Position moved only 2 meters (less than 10m accuracy) -> should skip
    const tinyMovement = {
      ...origin,
      latitude: 18.52041,
    };
    expect(sosController.shouldRebroadcast(tinyMovement)).toBe(false);

    // Position moved 50 meters -> should rebroadcast
    const largeMovement = {
      ...origin,
      latitude: 18.52085,
    };
    expect(sosController.shouldRebroadcast(largeMovement)).toBe(true);
  });

  it('resolves emergency via "I am safe now" flow', async () => {
    await sosController.triggerSos('instant_tap');
    expect(sosController.getState().phase).toBe('ACTIVE_BROADCASTING');

    await sosController.resolveSafe();
    const state = sosController.getState();
    expect(state.phase).toBe('RESOLVED_SAFE');
    expect(state.triage).toBe(TriageStatus.SAFE);
  });

  it('triggers dead-man beacon exactly once when battery reaches <= 5%', async () => {
    const survivalManager = SurvivalModeManager.getInstance();
    let deadmanTriggered = false;

    survivalManager.addDeadmanListener(() => {
      deadmanTriggered = true;
    });

    // Battery drops to 15% -> normal survival mode
    await survivalManager.updateBattery(15, false);
    expect(survivalManager.isInSurvivalMode()).toBe(true);
    expect(survivalManager.hasTriggeredDeadman()).toBe(false);

    // Battery drops to 4% -> triggers dead-man's beacon
    await survivalManager.updateBattery(4, false);
    expect(deadmanTriggered).toBe(true);
    expect(survivalManager.hasTriggeredDeadman()).toBe(true);

    // Subsequent updates do NOT re-trigger deadman packet
    deadmanTriggered = false;
    await survivalManager.updateBattery(3, false);
    expect(deadmanTriggered).toBe(false);
  });
});
