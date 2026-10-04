/**
 * RescueNet Trust-Scoring Engine
 * Evaluates authenticity and credibility of SOS reports without ever silently dropping alerts.
 */

export interface TrustInputs {
  independentDeviceCount: number; // Number of distinct phones witnessing/in cluster
  locationConsistencyScore: number; // 0.0 to 1.0 (GPS accuracy vs spatial variance)
  timestampConsistencyScore: number; // 0.0 to 1.0 (monotonic clock sanity)
  deviceAgeDays: number; // Days since initial registration or first discovery
  isRegistered: boolean; // Device has valid Agency registration credential
  priorFalseAlarmRate: number; // 0.0 to 1.0 history of cancelled/false alarms
  signatureValid: boolean; // Cryptographic Ed25519 signature validity
}

export interface TrustScoreResult {
  trustScore: number; // 0.0 to 1.0
  breakdown: {
    multiWitnessWeight: number;
    locationConsistencyWeight: number;
    timestampConsistencyWeight: number;
    registrationAndAgeWeight: number;
    priorReliabilityWeight: number;
  };
  warnings: {
    lowTrust: boolean;
    singleDeviceUnverified: boolean;
    untrustedSignature: boolean;
    highFalseAlarmHistory: boolean;
  };
}

export function evaluateTrust(inputs: TrustInputs): TrustScoreResult {
  if (!inputs.signatureValid) {
    return {
      trustScore: 0.0,
      breakdown: {
        multiWitnessWeight: 0,
        locationConsistencyWeight: 0,
        timestampConsistencyWeight: 0,
        registrationAndAgeWeight: 0,
        priorReliabilityWeight: 0,
      },
      warnings: {
        lowTrust: true,
        singleDeviceUnverified: inputs.independentDeviceCount <= 1,
        untrustedSignature: true,
        highFalseAlarmHistory: inputs.priorFalseAlarmRate > 0.25,
      },
    };
  }

  // 1. Multi-witness corroboration (up to 30%)
  const witnessRatio = Math.min(Math.max(1, inputs.independentDeviceCount), 5) / 5;
  const multiWitnessWeight = 0.3 * witnessRatio;

  // 2. Location consistency (up to 20%)
  const locationConsistencyWeight =
    0.2 * Math.min(1.0, Math.max(0, inputs.locationConsistencyScore));

  // 3. Timestamp consistency (up to 15%)
  const timestampConsistencyWeight =
    0.15 * Math.min(1.0, Math.max(0, inputs.timestampConsistencyScore));

  // 4. Registration and device age (up to 20%: 15% registered, 5% age)
  const ageRatio = Math.min(Math.max(0, inputs.deviceAgeDays), 30) / 30;
  const registrationAndAgeWeight = (inputs.isRegistered ? 0.15 : 0.0) + 0.05 * ageRatio;

  // 5. Prior reliability / false alarm rate (up to 15%)
  const reliability = 1.0 - Math.min(1.0, Math.max(0, inputs.priorFalseAlarmRate));
  const priorReliabilityWeight = 0.15 * reliability;

  const total =
    multiWitnessWeight +
    locationConsistencyWeight +
    timestampConsistencyWeight +
    registrationAndAgeWeight +
    priorReliabilityWeight;

  const finalScore = Math.max(0.0, Math.min(1.0, Math.round(total * 1000) / 1000));

  const warnings = {
    lowTrust: finalScore < 0.5,
    singleDeviceUnverified: inputs.independentDeviceCount <= 1 && !inputs.isRegistered,
    untrustedSignature: false,
    highFalseAlarmHistory: inputs.priorFalseAlarmRate > 0.25,
  };

  return {
    trustScore: finalScore,
    breakdown: {
      multiWitnessWeight: Math.round(multiWitnessWeight * 1000) / 1000,
      locationConsistencyWeight: Math.round(locationConsistencyWeight * 1000) / 1000,
      timestampConsistencyWeight: Math.round(timestampConsistencyWeight * 1000) / 1000,
      registrationAndAgeWeight: Math.round(registrationAndAgeWeight * 1000) / 1000,
      priorReliabilityWeight: Math.round(priorReliabilityWeight * 1000) / 1000,
    },
    warnings,
  };
}
