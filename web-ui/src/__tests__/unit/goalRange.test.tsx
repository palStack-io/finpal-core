/**
 * The dashboard's range — spec variant B, "the range is the dashboard".
 *
 * *** THE CASE WORTH TESTING IS THE GOAL WITH NO PEAK. *** `Goal.peak` is
 * undefined on any backend that predates mountains, and a component that draws
 * something anyway would be inventing a shape for a fact the server never sent.
 * The Goals page already makes that choice; this asserts the range makes the
 * same one, because two pictures of one fact are how they drift apart.
 *
 * *** AND THE ABSENCE OF A DENOMINATOR. *** Decision 5 permits exactly one:
 * a target the user chose. "2 of 4 goals" is not that, and a range is precisely
 * where somebody would add it.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GoalRange } from '../../components/dashboard/GoalRange';
import type { Goal } from '../../types/goal';

const withPeak = (over: Partial<Goal>): Goal => ({
  id: 1,
  name: 'Emergency fund',
  target_amount: 16000,
  current_amount: 8000,
  peak: {
    scale: 'build', magnitude: 8000, unmeasured: false, band: 3,
    mountain: { slug: 'mount-rainier', name: 'Mount Rainier', elevation_m: 4392 },
  },
  ...over,
} as Goal);

describe('the goal range', () => {
  it('names each goal and the mountain it is drawn as', () => {
    render(<GoalRange goals={[withPeak({})]} currency="USD" />);
    expect(screen.getByText('Emergency fund')).toBeTruthy();
    expect(screen.getByText(/Mount Rainier/)).toBeTruthy();
    expect(screen.getByText(/4,392 m/)).toBeTruthy();
  });

  it('states what is left in the goal\'s OWN terms', () => {
    // A saving goal says what is still to save; a payoff goal says what the
    // debt COSTS, because the balance alone does not say whether to pay it
    // first. Two goals, two different sentences, from one component.
    render(
      <GoalRange
        goals={[
          withPeak({}),
          withPeak({
            id: 2, name: 'Pay off the Visa', target_amount: 0, current_amount: -800,
            peak: {
              scale: 'cost', magnitude: 13.33, unmeasured: false, band: 1,
              mountain: { slug: 'ben-nevis', name: 'Ben Nevis', elevation_m: 1345 },
            },
          } as Partial<Goal>),
        ]}
        currency="USD"
      />,
    );
    expect(screen.getByText(/8,000.00 still to save/)).toBeTruthy();
    expect(screen.getByText(/13.33 a month in interest/)).toBeTruthy();
  });

  it('*** SKIPS A GOAL WITH NO PEAK RATHER THAN DRAWING ONE ***', () => {
    const noPeak = { id: 9, name: 'From before mountains', target_amount: 100, current_amount: 0 } as Goal;
    render(<GoalRange goals={[withPeak({}), noPeak]} currency="USD" />);
    expect(screen.getByText('Emergency fund')).toBeTruthy();
    expect(screen.queryByText('From before mountains')).toBeNull();
  });

  it('renders nothing at all when no goal has a peak', () => {
    // Not an empty frame. Decoration standing in for a fact is the thing this
    // whole design removes, and "you have nothing yet" belongs to base camp.
    const { container } = render(
      <GoalRange goals={[{ id: 9, name: 'x', target_amount: 1, current_amount: 0 } as Goal]} currency="USD" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('marks a finished climb, and prints no count of them', () => {
    render(
      <GoalRange
        goals={[withPeak({
          id: 3, name: 'Holiday fund', target_amount: 500, current_amount: 500,
          peak: {
            scale: 'build', magnitude: 0, unmeasured: false, band: 0,
            mountain: { slug: 'table-mountain', name: 'Table Mountain', elevation_m: 1085 },
          },
        } as Partial<Goal>)]}
        currency="USD"
      />,
    );
    expect(screen.getByText(/Holiday fund ✓/)).toBeTruthy();
    // No "1 of 1", no "100%", no "1 goal complete" — decision 5.
    expect(screen.queryByText(/\bof \d+\b/)).toBeNull();
    expect(screen.queryByText(/%/)).toBeNull();
  });
});
