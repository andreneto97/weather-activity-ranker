import { ScorerRegistry, UnknownScorerError } from './registry.js';
import type { ActivityScorer } from './scorer.js';

const makeScorer = (activity: ActivityScorer['activity']): ActivityScorer => ({
  activity,
  score: () => ({ value: 42, components: [] }),
});

describe('ScorerRegistry', () => {
  it('registers and retrieves scorers', () => {
    const registry = new ScorerRegistry()
      .register(makeScorer('SKIING'))
      .register(makeScorer('SURFING'));

    expect(registry.get('SKIING').activity).toBe('SKIING');
    expect(registry.get('SURFING').activity).toBe('SURFING');
  });

  it('all() returns registered scorers in insertion order', () => {
    const registry = new ScorerRegistry()
      .register(makeScorer('SKIING'))
      .register(makeScorer('SURFING'))
      .register(makeScorer('OUTDOOR_SIGHTSEEING'));

    expect(registry.all().map((s) => s.activity)).toEqual([
      'SKIING',
      'SURFING',
      'OUTDOOR_SIGHTSEEING',
    ]);
  });

  it('register overrides previous scorer for same activity', () => {
    const first = makeScorer('SKIING');
    const second = makeScorer('SKIING');
    const registry = new ScorerRegistry().register(first).register(second);
    expect(registry.get('SKIING')).toBe(second);
    expect(registry.all()).toHaveLength(1);
  });

  it('get throws UnknownScorerError when activity is not registered', () => {
    const registry = new ScorerRegistry();
    expect(() => registry.get('SKIING')).toThrow(UnknownScorerError);
    expect(() => registry.get('SKIING')).toThrow(/No scorer registered for activity: SKIING/);
  });
});
