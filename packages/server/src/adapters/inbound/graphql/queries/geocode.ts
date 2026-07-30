import { GraphQLError } from 'graphql';
import { z } from 'zod';
import { builder } from '../builder.js';
import { LocationType } from '../types/location.js';

const GeocodeInputSchema = z.object({
  query: z.string().min(2, 'Provide at least 2 characters.'),
  limit: z.number().int().min(1).max(20).optional(),
});

builder.queryField('geocode', (t) =>
  t.field({
    type: [LocationType],
    nullable: false,
    description: 'Search for locations by name. Used by the command palette (typeahead).',
    args: {
      query: t.arg.string({ required: true }),
      limit: t.arg.int({ required: false, defaultValue: 5 }),
    },
    async resolve(_root, args, ctx) {
      const parsed = GeocodeInputSchema.safeParse({
        query: args.query,
        limit: args.limit ?? undefined,
      });
      if (!parsed.success) {
        throw new GraphQLError(parsed.error.issues[0]?.message ?? 'Invalid input', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }
      const results = await ctx.geocode.execute(parsed.data.query, parsed.data.limit);
      return [...results];
    },
  }),
);
