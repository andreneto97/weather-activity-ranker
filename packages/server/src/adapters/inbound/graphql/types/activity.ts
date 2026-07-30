import { ACTIVITY_KINDS, type ActivityKind } from '../../../../domain/activity.js';
import { builder } from '../builder.js';

/** GraphQL enum mirror of domain ActivityKind. */
export const ActivityKindEnum = builder.enumType('ActivityKind', {
  description: 'Kinds of activities we score.',
  values: Object.fromEntries(ACTIVITY_KINDS.map((k) => [k, { value: k }])) as {
    [K in ActivityKind]: { value: K };
  },
});
