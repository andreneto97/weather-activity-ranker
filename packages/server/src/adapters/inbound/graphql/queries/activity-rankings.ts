import { GraphQLError } from 'graphql';
import { z } from 'zod';
import { builder } from '../builder.js';
import { ActivityRankingsResultType } from '../types/errors.js';

/**
 * Validates the query arguments — must provide **at least one** of
 * `cityQuery` or `locationId`. Both is allowed and legitimate: the frontend
 * typeahead resolves to a specific location and passes both for redundancy
 * (also allows sharing a URL like `/city/Lisbon?locationId=2267057` that
 * survives both direct clicks and deep-link visits). The use case's
 * "locationId wins if both provided" policy handles the collision.
 */
const ActivityRankingsInputSchema = z
  .object({
    cityQuery: z.string().min(2).optional(),
    locationId: z.string().min(1).optional(),
  })
  .refine((v) => v.cityQuery != null || v.locationId != null, {
    message: 'Provide at least one of cityQuery (min 2 chars) or locationId.',
  });

builder.queryField('activityRankings', (t) =>
  t.field({
    type: ActivityRankingsResultType,
    nullable: false,
    description:
      'Score all four activities for a city over the next 7 days. Provide either ' +
      '`cityQuery` (which will geocode + disambiguate) or `locationId` (obtained ' +
      'from a previous AmbiguousLocationError.candidates entry to skip geocoding).',
    args: {
      cityQuery: t.arg.string({ required: false }),
      locationId: t.arg.id({ required: false }),
    },
    async resolve(_root, args, ctx) {
      const rawInput: { cityQuery?: string; locationId?: string } = {};
      if (args.cityQuery != null) rawInput.cityQuery = args.cityQuery;
      if (args.locationId != null) rawInput.locationId = args.locationId;

      const parsed = ActivityRankingsInputSchema.safeParse(rawInput);
      if (!parsed.success) {
        throw new GraphQLError(parsed.error.issues[0]?.message ?? 'Invalid input', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }
      // Zod's inferred type has optional keys that could be `undefined`; conditionally
      // spread to comply with exactOptionalPropertyTypes on RankActivitiesInput.
      const input: { cityQuery?: string; locationId?: string } = {};
      if (parsed.data.cityQuery !== undefined) input.cityQuery = parsed.data.cityQuery;
      if (parsed.data.locationId !== undefined) input.locationId = parsed.data.locationId;
      // Pass the request-scoped child logger so upstream errors get the same
      // `requestId` correlator as the resolver's own logs.
      return ctx.rankActivities.execute(input, { logger: ctx.logger });
    },
  }),
);
