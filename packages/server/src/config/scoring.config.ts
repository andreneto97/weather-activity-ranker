import type {
  IndoorWeights,
  OutdoorWeights,
  ScoringWeights,
  SkiWeights,
  SurfWeights,
} from '../domain/scoring/weights.js';

/**
 * Default scoring weights. Each object's sum must be ≤ 1 (enforced by weightedSum).
 * Adjust here without touching scorer code.
 *
 * Numbers grounded in domain heuristics — see justification comments in
 * domain/scoring/weights.ts and specs/02-scoring.spec.md.
 */
export const defaultSkiWeights: SkiWeights = {
  freshSnow: 0.4,
  coldEnough: 0.3,
  lowWind: 0.2,
  visibility: 0.1,
};

export const defaultSurfWeights: SurfWeights = {
  swellHeight: 0.35,
  cleanSwell: 0.3,
  lightWind: 0.25,
  warmEnough: 0.1,
};

export const defaultOutdoorWeights: OutdoorWeights = {
  comfortTemp: 0.3,
  noRain: 0.3,
  sunshine: 0.2,
  moderateUv: 0.1,
  cleanAir: 0.1, // dropped + renormalised via weightedSumRenormalized if AQI missing
};

export const defaultIndoorWeights: IndoorWeights = {
  rainy: 0.4,
  uncomfortableTemp: 0.3,
  overcast: 0.2,
  windy: 0.1,
};

export const defaultScoringWeights: ScoringWeights = {
  ski: defaultSkiWeights,
  surf: defaultSurfWeights,
  outdoor: defaultOutdoorWeights,
  indoor: defaultIndoorWeights,
};
