import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { NotApplicableCard } from './NotApplicableCard.js';

describe('NotApplicableCard', () => {
  it('renders the N/A label', () => {
    render(<NotApplicableCard />);
    expect(screen.getByText('N/A')).toBeInTheDocument();
  });

  it('renders the reason when provided and reflects it in aria-label', () => {
    render(<NotApplicableCard reason="No coastal data for this city" />);
    expect(screen.getByText('No coastal data for this city')).toBeInTheDocument();
    expect(
      screen.getByLabelText('Not applicable: No coastal data for this city'),
    ).toBeInTheDocument();
  });

  it('omits the reason paragraph when no reason is passed', () => {
    render(<NotApplicableCard />);
    // Only the N/A label should be textual content.
    expect(screen.getByLabelText('Not applicable')).toBeInTheDocument();
    expect(screen.queryByText(/coastal/i)).not.toBeInTheDocument();
  });
});
