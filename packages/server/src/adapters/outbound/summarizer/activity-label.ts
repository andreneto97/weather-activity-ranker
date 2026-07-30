import type { ActivityKind } from '../../../domain/activity.js';

/** Human-readable lowercase labels for use in prose. */
const LABELS: Record<ActivityKind, string> = {
  SKIING: 'skiing',
  SURFING: 'surfing',
  OUTDOOR_SIGHTSEEING: 'outdoor sightseeing',
  INDOOR_SIGHTSEEING: 'indoor sightseeing',
};

export const activityLabel = (kind: ActivityKind): string => LABELS[kind];
