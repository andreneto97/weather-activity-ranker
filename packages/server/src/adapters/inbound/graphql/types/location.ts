import { builder } from '../builder.js';

/**
 * A resolved geographic location. `id` is opaque to the client (comes from
 * the geocoder) — used only to skip re-geocoding after ambiguity resolution.
 *
 * Pothos `exposeXXX` methods default to nullable; we pass `nullable: false`
 * on every required field so emitted SDL matches spec 04.
 */
export const LocationType = builder.objectType('Location', {
  description: 'A resolved geographic location.',
  fields: (t) => ({
    id: t.exposeID('id', { nullable: false }),
    name: t.exposeString('name', { nullable: false }),
    country: t.exposeString('country', { nullable: false }),
    admin1: t.string({
      nullable: true,
      resolve: (loc) => loc.admin1 ?? null,
    }),
    latitude: t.exposeFloat('latitude', { nullable: false }),
    longitude: t.exposeFloat('longitude', { nullable: false }),
    timezone: t.exposeString('timezone', { nullable: false }),
    population: t.int({
      nullable: true,
      resolve: (loc) => loc.population ?? null,
    }),
  }),
});
