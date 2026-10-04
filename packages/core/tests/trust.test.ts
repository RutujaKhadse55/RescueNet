import { evaluateTrust, TrustInputs } from '../src/index';

describe('Trust-Scoring Engine', () => {
  it('assigns zero trust and flags untrustedSignature when signature is invalid', () => {
    const inputs: TrustInputs = {
      independentDeviceCount: 5,
      locationConsistencyScore: 0.9,
      timestampConsistencyScore: 0.95,
      deviceAgeDays: 60,
      isRegistered: true,
      priorFalseAlarmRate: 0.0,
      signatureValid: false, // Invalid signature!
    };

    const result = evaluateTrust(inputs);
    expect(result.trustScore).toBe(0.0);
    expect(result.warnings.untrustedSignature).toBe(true);
    expect(result.warnings.lowTrust).toBe(true);
  });

  it('evaluates high trust for registered multi-witness cluster with consistent telemetry', () => {
    const inputs: TrustInputs = {
      independentDeviceCount: 5,
      locationConsistencyScore: 0.9,
      timestampConsistencyScore: 0.95,
      deviceAgeDays: 45,
      isRegistered: true,
      priorFalseAlarmRate: 0.02,
      signatureValid: true,
    };

    const result = evaluateTrust(inputs);
    expect(result.trustScore).toBeGreaterThan(0.85);
    expect(result.warnings.lowTrust).toBe(false);
    expect(result.warnings.singleDeviceUnverified).toBe(false);
  });

  it('flags warning for single unverified device without dropping report', () => {
    const inputs: TrustInputs = {
      independentDeviceCount: 1,
      locationConsistencyScore: 0.5,
      timestampConsistencyScore: 0.5,
      deviceAgeDays: 0,
      isRegistered: false,
      priorFalseAlarmRate: 0.0,
      signatureValid: true,
    };

    const result = evaluateTrust(inputs);
    // Never drops: report has a score and clear warnings
    expect(result.trustScore).toBeGreaterThan(0);
    expect(result.warnings.singleDeviceUnverified).toBe(true);
    expect(result.warnings.lowTrust).toBe(true);
  });
});
