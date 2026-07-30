/**
 * The four activity kinds we score.
 * Frozen tuple + type derivation keeps runtime array and type in sync.
 * See specs/01-domain-model.spec.md §Types.
 */
export const ACTIVITY_KINDS = [
  'SKIING',
  'SURFING',
  'OUTDOOR_SIGHTSEEING',
  'INDOOR_SIGHTSEEING',
] as const;

export type ActivityKind = (typeof ACTIVITY_KINDS)[number];
