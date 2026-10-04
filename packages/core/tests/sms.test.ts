import {
  SodiumCrypto,
  encodeSms,
  decodeSms,
  formatHumanSms,
  parseHumanSms,
  NeedsBitmask,
  TriageStatus,
  SMS_PREFIX,
} from '../src/index';

describe('SMS Fallback Profile', () => {
  let crypto: SodiumCrypto;

  beforeAll(async () => {
    crypto = await SodiumCrypto.getInstance();
  });

  it('encodes SMS into Base64URL string well under 100 characters', async () => {
    const originFp = crypto.randomBytes(8);
    const deviceSecret = crypto.randomBytes(32);

    const smsStr = await encodeSms(
      {
        version: 1,
        originFp,
        timestamp: 1700000000,
        latitude: 18.5204,
        longitude: 73.8567,
        accuracyMeters: 20,
        status: TriageStatus.CRITICAL,
        peopleCount: 4,
        needsMask: NeedsBitmask.MEDICAL | NeedsBitmask.WATER,
        batteryPercent: 85,
        sequenceNumber: 1,
        nonce: 123456,
        altitudeMeters: 10,
      },
      deviceSecret,
      crypto,
    );

    // Acceptance criteria: SMS string <= 100 characters!
    expect(smsStr.length).toBeLessThanOrEqual(100);
    expect(smsStr.startsWith(SMS_PREFIX)).toBe(true);

    // Decode with registered secret lookup
    const decoded = await decodeSms(smsStr, async () => deviceSecret, crypto);

    expect(decoded.version).toBe(1);
    expect(decoded.isRegistered).toBe(true);
    expect(decoded.lowTrust).toBe(false);
    expect(decoded.status).toBe(TriageStatus.CRITICAL);
    expect(decoded.peopleCount).toBe(4);
    expect(decoded.needsMask).toBe(NeedsBitmask.MEDICAL | NeedsBitmask.WATER);
    expect(Math.abs(decoded.latitude - 18.5204)).toBeLessThan(1e-4);
    expect(Math.abs(decoded.longitude - 73.8567)).toBeLessThan(1e-4);
  });

  it('flags unregistered device with zeros HMAC tag as low trust', async () => {
    const originFp = crypto.randomBytes(8);

    // Unregistered device has no shared secret (null)
    const smsStr = await encodeSms(
      {
        version: 1,
        originFp,
        timestamp: 1700000000,
        latitude: 28.6139,
        longitude: 77.209,
        accuracyMeters: 15,
        status: TriageStatus.INJURED,
        peopleCount: 2,
        needsMask: NeedsBitmask.FOOD,
        batteryPercent: 50,
        sequenceNumber: 2,
        nonce: 78910,
        altitudeMeters: 0,
      },
      null,
      crypto,
    );

    const decoded = await decodeSms(smsStr);
    expect(decoded.isRegistered).toBe(false);
    expect(decoded.lowTrust).toBe(true);
    expect(decoded.status).toBe(TriageStatus.INJURED);
    expect(decoded.peopleCount).toBe(2);
  });

  it('formats and parses human-readable SMS fallback correctly', () => {
    const sample = {
      latitude: 18.5204,
      longitude: 73.8567,
      accuracyMeters: 20,
      peopleCount: 4,
      status: TriageStatus.CRITICAL,
      needsMask: NeedsBitmask.MEDICAL | NeedsBitmask.WATER,
    };

    const formatted = formatHumanSms(sample);
    expect(formatted).toBe('RN SOS 18.5204,73.8567 +-20m P4 CRIT MED,WTR');

    const parsed = parseHumanSms(formatted);
    expect(parsed.latitude).toBeCloseTo(18.5204, 4);
    expect(parsed.longitude).toBeCloseTo(73.8567, 4);
    expect(parsed.accuracyMeters).toBe(20);
    expect(parsed.peopleCount).toBe(4);
    expect(parsed.status).toBe(TriageStatus.CRITICAL);
    expect(parsed.needsMask).toBe(NeedsBitmask.MEDICAL | NeedsBitmask.WATER);
  });

  it('fuzz tests human-readable SMS parsing across 1,000 variations', () => {
    const statuses = [
      TriageStatus.SAFE,
      TriageStatus.INJURED,
      TriageStatus.TRAPPED,
      TriageStatus.CRITICAL,
    ];
    for (let i = 0; i < 1000; i++) {
      const lat = Math.random() * 60 - 30;
      const lon = Math.random() * 60 + 60;
      const acc = Math.floor(Math.random() * 200) + 1;
      const people = Math.floor(Math.random() * 50) + 1;
      const status = statuses[i % 4]!;
      const needs = i % 255 || NeedsBitmask.MEDICAL;

      const formatted = formatHumanSms({
        latitude: lat,
        longitude: lon,
        accuracyMeters: acc,
        peopleCount: people,
        status,
        needsMask: needs,
      });

      const parsed = parseHumanSms(formatted);
      expect(parsed.latitude).toBeCloseTo(lat, 3);
      expect(parsed.longitude).toBeCloseTo(lon, 3);
      expect(parsed.accuracyMeters).toBe(acc);
      expect(parsed.peopleCount).toBe(people);
      expect(parsed.status).toBe(status);
    }
  });
});
