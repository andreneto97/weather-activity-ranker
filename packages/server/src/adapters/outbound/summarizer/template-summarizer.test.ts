import { describe, expect, it } from '@jest/globals';
import { makeLocation } from '../../../../tests/support/factories.js';
import type { ActivityKind } from '../../../domain/activity.js';
import type { RankedForecast } from '../../../domain/ranked-forecast.js';
import { TemplateSummarizer } from './template-summarizer.js';

const summarizer = new TemplateSummarizer();
const lisbon = makeLocation({ name: 'Lisbon', timezone: 'Europe/Lisbon' });

const makeRanking = (
  activity: ActivityKind,
  overallScore: number,
  bestDay = { date: '2026-07-29', value: overallScore }, // Wednesday
): RankedForecast => ({
  activity,
  dailyScores: [
    { date: '2026-07-28', score: { value: 0, components: [] } },
    { date: '2026-07-29', score: { value: bestDay.value, components: [] } },
    { date: '2026-07-30', score: { value: 0, components: [] } },
    { date: '2026-07-31', score: { value: 0, components: [] } },
    { date: '2026-08-01', score: { value: 0, components: [] } },
    { date: '2026-08-02', score: { value: 0, components: [] } },
    { date: '2026-08-03', score: { value: 0, components: [] } },
  ],
  bestDay: { date: bestDay.date, score: { value: bestDay.value, components: [] } },
  overallScore,
});

const generatedAt = new Date('2026-07-28T12:00:00Z');

describe('TemplateSummarizer', () => {
  it('mentions city, top activity, best day (weekday name), and score', async () => {
    const out = await summarizer.summarize({
      city: lisbon,
      generatedAt,
      rankings: [makeRanking('OUTDOOR_SIGHTSEEING', 85), makeRanking('INDOOR_SIGHTSEEING', 40)],
    });
    expect(out).toContain('Lisbon');
    expect(out).toContain('outdoor sightseeing');
    expect(out).toContain('Wednesday'); // 2026-07-29 in Europe/Lisbon
    expect(out).toContain('85');
  });

  it('calls out Not Applicable when bottom activity has overallScore 0', async () => {
    const out = await summarizer.summarize({
      city: lisbon,
      generatedAt,
      rankings: [
        makeRanking('OUTDOOR_SIGHTSEEING', 85),
        makeRanking('INDOOR_SIGHTSEEING', 30),
        makeRanking('SKIING', 0), // No snow in Lisbon
      ],
    });
    expect(out).toContain('Skip skiing');
    expect(out).toContain('not applicable');
  });

  it('mentions "rough week" when even the top scores < 30', async () => {
    const out = await summarizer.summarize({
      city: makeLocation({ name: 'London', timezone: 'Europe/London' }),
      generatedAt,
      rankings: [makeRanking('INDOOR_SIGHTSEEING', 25), makeRanking('OUTDOOR_SIGHTSEEING', 15)],
    });
    expect(out).toContain('Rough week');
    expect(out).toContain('London');
    expect(out).toContain('Indoor sightseeing');
  });

  it('handles empty rankings without throwing', async () => {
    const out = await summarizer.summarize({
      city: lisbon,
      generatedAt,
      rankings: [],
    });
    expect(out).toContain('Lisbon');
  });

  it('never throws even if timezone or date is invalid', async () => {
    const brokenCity = makeLocation({ timezone: 'Not/A_Real_Zone' });
    const out = await summarizer.summarize({
      city: brokenCity,
      generatedAt,
      rankings: [makeRanking('OUTDOOR_SIGHTSEEING', 70)],
    });
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
  });

  it('formats weekdays in the city timezone (not UTC)', async () => {
    // 2026-07-29 00:00 in Europe/Lisbon (UTC+1 in July) = 2026-07-28 23:00 UTC.
    // If we naively used UTC, this would report Tuesday. In city tz it's Wednesday.
    const out = await summarizer.summarize({
      city: lisbon,
      generatedAt,
      rankings: [makeRanking('OUTDOOR_SIGHTSEEING', 70)],
    });
    expect(out).toContain('Wednesday');
  });
});
