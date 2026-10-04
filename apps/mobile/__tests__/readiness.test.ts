import { calculateReadinessScore, ReadinessInputs } from '../src/preparedness/readinessScore';
import { BleRangeTester } from '../src/preparedness/rangeTest';
import { DrillModeManager } from '../src/preparedness/drillMode';
import { MonsoonReminderService } from '../src/preparedness/monsoonAlert';

describe('Preparedness Self-Test & Readiness Scoring', () => {
  test('calculates 100% score and Disaster Ready tier when all criteria met', () => {
    const perfectInputs: ReadinessInputs = {
      permissionsGrantedPercentage: 100, // 20 pts
      batteryOptimizationExempt: true,    // 10 pts
      bluetoothEnabled: true,             // 10 pts
      locationEnabled: true,              // 10 pts
      bleAdvertisingSupported: true,      // 10 pts
      codedPhySupported: true,            // 5 pts
      smsAvailable: true,                 // 5 pts
      identityRegistered: true,           // 10 pts
      mapPackDownloaded: true,            // 10 pts
      controlRoomNumbersSynced: true,     // 5 pts
      emergencyContactsSet: true,         // 5 pts
    };

    const evalResult = calculateReadinessScore(perfectInputs);
    expect(evalResult.score).toBe(100);
    expect(evalResult.tier).toBe('Disaster Ready');
    expect(evalResult.missingCount).toBe(0);
    expect(evalResult.items).toHaveLength(11);
  });

  test('calculates partial score and Appropriate Tier when items missing', () => {
    const degradedInputs: ReadinessInputs = {
      permissionsGrantedPercentage: 50,  // 10 pts
      batteryOptimizationExempt: false,   // 0 pts
      bluetoothEnabled: true,             // 10 pts
      locationEnabled: true,              // 10 pts
      bleAdvertisingSupported: true,      // 10 pts
      codedPhySupported: false,           // 0 pts
      smsAvailable: true,                 // 5 pts
      identityRegistered: false,          // 0 pts
      mapPackDownloaded: false,           // 0 pts
      controlRoomNumbersSynced: true,     // 5 pts
      emergencyContactsSet: false,        // 0 pts
    };

    const evalResult = calculateReadinessScore(degradedInputs);
    // Score = 10 + 0 + 10 + 10 + 10 + 0 + 5 + 0 + 0 + 5 + 0 = 50
    expect(evalResult.score).toBe(50);
    expect(evalResult.tier).toBe('Moderate');
    expect(evalResult.missingCount).toBeGreaterThan(0);
  });

  test('BleRangeTester: calculates distance correctly from RSSI', () => {
    // At reference distance (1m), RSSI = -59 dBm
    const d1m = BleRangeTester.calculateDistance(-59, -59, 2.5);
    expect(d1m).toBe(1);

    // At further distance (e.g. -74 dBm), distance should be larger
    const dFar = BleRangeTester.calculateDistance(-74, -59, 2.5);
    expect(dFar).toBeGreaterThan(1);
    expect(dFar).toBeLessThan(10);
  });

  test('DrillModeManager: sets and clears test_drill packet flag', () => {
    const drill = new DrillModeManager(false);
    expect(drill.isDrillActive()).toBe(false);

    // Flag 0x01 (has_extension)
    const baseFlags = 0x01;
    expect(drill.applyDrillFlag(baseFlags)).toBe(0x01);

    drill.setDrillActive(true);
    expect(drill.isDrillActive()).toBe(true);
    // 0x01 | 0x08 = 0x09
    expect(drill.applyDrillFlag(baseFlags)).toBe(0x09);

    drill.setDrillActive(false);
    expect(drill.applyDrillFlag(0x09)).toBe(0x01);
  });

  test('MonsoonReminderService: evaluates monsoon season correctly', () => {
    // June 15 (Monsoon)
    const juneDate = new Date('2026-06-15T00:00:00.000Z');
    const alertJune = MonsoonReminderService.checkMonsoonSeason(juneDate);
    expect(alertJune.isMonsoonSeason).toBe(true);
    expect(alertJune.alertTitle).toContain('Monsoon Preparedness Warning');

    // January 10 (Non-Monsoon)
    const janDate = new Date('2026-01-10T00:00:00.000Z');
    const alertJan = MonsoonReminderService.checkMonsoonSeason(janDate);
    expect(alertJan.isMonsoonSeason).toBe(false);
  });
});
