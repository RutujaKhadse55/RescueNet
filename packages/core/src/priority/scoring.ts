/**
 * RescueNet Triage Priority Scoring Engine
 * Quantitative triage ranking for survivors and clusters.
 */

import { NeedsBitmask, TriageStatus } from '../codec/types';

export interface NeedsWeightsConfig {
  medical: number; // default 0.5
  evacuation: number; // default 0.2
  water: number; // default 0.2
  food: number; // default 0.1
  shelter: number; // default 0.1
  medicine: number; // default 0.3
  child_or_elderly: number; // default 0.2
  mobility: number; // default 0.2
}

export const DEFAULT_NEEDS_WEIGHTS: NeedsWeightsConfig = {
  medical: 0.5,
  evacuation: 0.2,
  water: 0.2,
  food: 0.1,
  shelter: 0.1,
  medicine: 0.3,
  child_or_elderly: 0.2,
  mobility: 0.2,
};

export interface PriorityScoreBreakdown {
  score: number; // 0.0 to 1.0
  severityNormalized: number;
  survivorCountNormalized: number;
  timeSinceLastSeenNormalized: number;
  declaredNeedsNormalized: number;
  locationUncertaintyNormalized: number;
  components: {
    severityWeighted: number; // 0.35 * severity
    survivorCountWeighted: number; // 0.25 * count
    timeSinceLastSeenWeighted: number; // 0.15 * time
    declaredNeedsWeighted: number; // 0.15 * needs
    locationUncertaintyDeduction: number; // -0.10 * uncertainty
  };
  flags: {
    large_group: boolean; // count >= 10
    possibly_failing: boolean; // staleness at cap (120 mins)
    low_trust: boolean; // unverified or low confidence
  };
}

export interface PriorityInput {
  status: TriageStatus | number; // 0 Safe, 1 Injured, 2 Trapped, 3 Critical, or pre-normalized [0..1]
  peopleCount: number; // 1 to 255 (or pre-normalized [0..1])
  minutesSinceLastSeen: number; // minutes elapsed (or pre-normalized [0..1])
  needsMask?: number; // NeedsBitmask bitmask
  declaredNeedsNormalized?: number; // Pre-normalized needs [0..1]
  radiusMeters?: number; // radius in meters (or pre-normalized [0..1])
  isPreNormalized?: boolean; // if true, inputs are already scaled 0..1
  lowTrust?: boolean;
}

export const SEVERITY_SCORES: Record<number, number> = {
  [TriageStatus.SAFE]: 0.1,
  [TriageStatus.INJURED]: 0.5,
  [TriageStatus.TRAPPED]: 0.75,
  [TriageStatus.CRITICAL]: 1.0,
};

/**
 * Computes normalized needs score from bitmask and weights config (capped at 1.0)
 */
export function computeNeedsScore(
  needsMask: number,
  config: NeedsWeightsConfig = DEFAULT_NEEDS_WEIGHTS,
): number {
  let sum = 0;
  if ((needsMask & NeedsBitmask.MEDICAL) !== 0) sum += config.medical;
  if ((needsMask & NeedsBitmask.EVACUATION) !== 0) sum += config.evacuation;
  if ((needsMask & NeedsBitmask.WATER) !== 0) sum += config.water;
  if ((needsMask & NeedsBitmask.FOOD) !== 0) sum += config.food;
  if ((needsMask & NeedsBitmask.SHELTER) !== 0) sum += config.shelter;
  if ((needsMask & NeedsBitmask.MEDICINE) !== 0) sum += config.medicine;
  if ((needsMask & NeedsBitmask.CHILD_OR_ELDERLY) !== 0) sum += config.child_or_elderly;
  if ((needsMask & NeedsBitmask.MOBILITY_ISSUE) !== 0) sum += config.mobility;

  return Math.min(1.0, sum);
}

/**
 * Calculates composite triage priority score
 */
export function calculatePriorityScore(
  input: PriorityInput,
  config: NeedsWeightsConfig = DEFAULT_NEEDS_WEIGHTS,
): PriorityScoreBreakdown {
  let severityNorm: number;
  let countNorm: number;
  let timeNorm: number;
  let needsNorm: number;
  let uncertNorm: number;

  let rawCount = 1;
  let rawMinutes = 0;

  if (input.isPreNormalized) {
    severityNorm = Math.min(1.0, Math.max(0, input.status));
    countNorm = Math.min(1.0, Math.max(0, input.peopleCount));
    timeNorm = Math.min(1.0, Math.max(0, input.minutesSinceLastSeen));
    needsNorm = Math.min(1.0, Math.max(0, input.declaredNeedsNormalized ?? 0));
    uncertNorm = Math.min(1.0, Math.max(0, input.radiusMeters ?? 0));
    rawCount = Math.round(countNorm * 20);
    rawMinutes = Math.round(timeNorm * 120);
  } else {
    severityNorm = SEVERITY_SCORES[input.status] ?? 0.1;
    rawCount = Math.max(1, input.peopleCount);
    countNorm = Math.min(rawCount, 20) / 20;

    rawMinutes = Math.max(0, input.minutesSinceLastSeen);
    timeNorm = Math.min(rawMinutes, 120) / 120;

    if (input.declaredNeedsNormalized !== undefined) {
      needsNorm = Math.min(1.0, Math.max(0, input.declaredNeedsNormalized));
    } else {
      needsNorm = computeNeedsScore(input.needsMask ?? 0, config);
    }

    const radius = Math.max(0, input.radiusMeters ?? 0);
    uncertNorm = Math.min(radius, 100) / 100;
  }

  const sevWeighted = 0.35 * severityNorm;
  const countWeighted = 0.25 * countNorm;
  const timeWeighted = 0.15 * timeNorm;
  const needsWeighted = 0.15 * needsNorm;
  const uncertDeduction = 0.1 * uncertNorm;

  const rawScore = sevWeighted + countWeighted + timeWeighted + needsWeighted - uncertDeduction;
  const finalScore = Math.max(0.0, Math.min(1.0, rawScore));

  const flags = {
    large_group: rawCount >= 10,
    possibly_failing: timeNorm >= 1.0,
    low_trust: !!input.lowTrust,
  };

  return {
    score: Math.round(finalScore * 10000) / 10000,
    severityNormalized: severityNorm,
    survivorCountNormalized: countNorm,
    timeSinceLastSeenNormalized: timeNorm,
    declaredNeedsNormalized: needsNorm,
    locationUncertaintyNormalized: uncertNorm,
    components: {
      severityWeighted: Math.round(sevWeighted * 10000) / 10000,
      survivorCountWeighted: Math.round(countWeighted * 10000) / 10000,
      timeSinceLastSeenWeighted: Math.round(timeWeighted * 10000) / 10000,
      declaredNeedsWeighted: Math.round(needsWeighted * 10000) / 10000,
      locationUncertaintyDeduction: Math.round(uncertDeduction * 10000) / 10000,
    },
    flags,
  };
}
