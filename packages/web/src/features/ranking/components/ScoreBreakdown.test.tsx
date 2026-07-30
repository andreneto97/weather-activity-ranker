import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { ScoreBreakdown } from './ScoreBreakdown.js';

describe('ScoreBreakdown', () => {
  it('renders an empty-state message when no components are provided', () => {
    render(<ScoreBreakdown components={[]} />);
    expect(screen.getByText('No breakdown available.')).toBeInTheDocument();
  });

  it('renders one row per contributing factor with label, rounded value, and weight', () => {
    render(
      <ScoreBreakdown
        components={[
          { label: 'Temperature', value: 0.85, weight: 0.4 },
          { label: 'Precipitation', value: 0.6, weight: 0.3 },
          { label: 'Wind', value: 0.2, weight: 0.2 },
        ]}
      />,
    );
    expect(screen.getByText('Temperature')).toBeInTheDocument();
    expect(screen.getByText('Precipitation')).toBeInTheDocument();
    expect(screen.getByText('Wind')).toBeInTheDocument();
    // 0.85 * 100 → 85, weight 0.4 → 0.40
    expect(screen.getByText('85 · w 0.40')).toBeInTheDocument();
    expect(screen.getByText('60 · w 0.30')).toBeInTheDocument();
    expect(screen.getByText('20 · w 0.20')).toBeInTheDocument();
  });

  it('clamps the bar width to the 0–100 range for out-of-band values', () => {
    const { container } = render(
      <ScoreBreakdown
        components={[
          { label: 'Under', value: -0.5, weight: 0.5 },
          { label: 'Over', value: 1.5, weight: 0.5 },
        ]}
      />,
    );
    const bars = container.querySelectorAll<HTMLDivElement>('div[style*="width"]');
    // Two bars, one per row. Under → 0%, Over → 100%.
    expect(bars[0]?.style.width).toBe('0%');
    expect(bars[1]?.style.width).toBe('100%');
  });
});
