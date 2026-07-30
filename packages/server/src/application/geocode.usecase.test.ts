import { makeLocation } from '../../tests/support/factories.js';
import { InMemoryGeocoding } from '../../tests/support/in-memory-geocoding.js';
import { makeGeocodeUseCase } from './geocode.usecase.js';

describe('GeocodeUseCase', () => {
  it('returns matching locations from geocoding port', async () => {
    const lisbon = makeLocation();
    const geocoding = new InMemoryGeocoding().addSearch('lisbon', [lisbon]);
    const useCase = makeGeocodeUseCase({ geocoding });

    expect(await useCase.execute('lisbon')).toEqual([lisbon]);
  });

  it('returns [] for unknown queries', async () => {
    const useCase = makeGeocodeUseCase({ geocoding: new InMemoryGeocoding() });
    expect(await useCase.execute('atlantis')).toEqual([]);
  });

  it('honors limit', async () => {
    const a = makeLocation({ id: 'a' });
    const b = makeLocation({ id: 'b' });
    const geocoding = new InMemoryGeocoding().addSearch('multi', [a, b]);
    const useCase = makeGeocodeUseCase({ geocoding });
    expect(await useCase.execute('multi', 1)).toEqual([a]);
  });
});
