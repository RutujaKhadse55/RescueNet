import {
  calculatePriorityScore,
  computeNeedsScore,
  DEFAULT_NEEDS_WEIGHTS,
  NeedsBitmask,
  TriageStatus,
} from '../src/index';

describe('Triage Priority Scoring Engine', () => {
  it('satisfies the canonical worked example: Cluster A = 0.51, Cluster B = 0.40, A ranks first', () => {
    // Cluster A: severity 1.0, count 0.2 [4 people], staleness 0.1667 [20 min], needs 0.8, uncertainty 0.4
    const clusterA = calculatePriorityScore({
      status: 1.0,
      peopleCount: 0.2,
      minutesSinceLastSeen: 0.1667,
      declaredNeedsNormalized: 0.8,
      radiusMeters: 0.4,
      isPreNormalized: true,
    });

    // Cluster B: severity 0.5, count 0.6 [12 people], staleness 0.0833 [10 min], needs 0.5, uncertainty 0.15
    const clusterB = calculatePriorityScore({
      status: 0.5,
      peopleCount: 0.6,
      minutesSinceLastSeen: 0.0833,
      declaredNeedsNormalized: 0.5,
      radiusMeters: 0.15,
      isPreNormalized: true,
    });

    // Tolerance 0.01 per specification
    expect(Math.abs(clusterA.score - 0.51)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(clusterB.score - 0.4)).toBeLessThanOrEqual(0.01);
    expect(Math.round(clusterA.score * 100) / 100).toBe(0.51);
    expect(Math.round(clusterB.score * 100) / 100).toBe(0.4);

    // A ranks first!
    expect(clusterA.score).toBeGreaterThan(clusterB.score);

    // Breakdown components check
    expect(clusterA.components.severityWeighted).toBeCloseTo(0.35, 2);
    expect(clusterA.components.survivorCountWeighted).toBeCloseTo(0.05, 2);
    expect(clusterA.components.timeSinceLastSeenWeighted).toBeCloseTo(0.025, 2);
    expect(clusterA.components.declaredNeedsWeighted).toBeCloseTo(0.12, 2);
    expect(clusterA.components.locationUncertaintyDeduction).toBeCloseTo(0.04, 2);
  });

  it('computes raw un-normalized values correctly with flags', () => {
    const res = calculatePriorityScore({
      status: TriageStatus.CRITICAL, // severity 1.0
      peopleCount: 15, // large_group flag true (>= 10)
      minutesSinceLastSeen: 130, // capped at 120 -> possibly_failing flag true
      needsMask: NeedsBitmask.MEDICAL | NeedsBitmask.EVACUATION,
      radiusMeters: 25,
      lowTrust: true,
    });

    expect(res.flags.large_group).toBe(true);
    expect(res.flags.possibly_failing).toBe(true);
    expect(res.flags.low_trust).toBe(true);
    expect(res.severityNormalized).toBe(1.0);
    expect(res.survivorCountNormalized).toBe(15 / 20);
    expect(res.timeSinceLastSeenNormalized).toBe(1.0); // capped at 120/120
    expect(res.locationUncertaintyNormalized).toBe(25 / 100);
  });

  it('evaluates custom needs weights properly', () => {
    const customWeights = {
      ...DEFAULT_NEEDS_WEIGHTS,
      medical: 0.8,
      water: 0.3,
    };
    const score = computeNeedsScore(NeedsBitmask.MEDICAL | NeedsBitmask.WATER, customWeights);
    // 0.8 + 0.3 = 1.1 -> capped at 1.0
    expect(score).toBe(1.0);
  });
});
