/**
 * The share bar, and the rule it exists to embody.
 *
 * **Show a dimension only when that dimension varies.** The owner's first
 * question about this design was what a bar sliced by person does on a one-user
 * instance — it degrades to one full-width block conveying nothing, and for a
 * self-hosted finance app one user is likely the *majority* case. So one user
 * slices by **category**, two or more by **person**, and the toggle appears only
 * in the second case.
 *
 * ── Asserted on rendered output, never on props ─────────────────────────────
 *
 * An accepted-and-ignored prop is a dead control — D-46, the hamburger that took
 * a prop, rendered, and did nothing. "The component received `memberCount: 1`"
 * and "no person's name is on the screen" are different claims, and only the
 * second is what a user experiences.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShareBar, toSegments } from '../../components/dashboard/ShareBar';
import type { SpendingGroup } from '../../services/api/spendingSummary';

const group = (label: string, total: number, key?: string): SpendingGroup => ({
  key: key ?? label,
  label,
  total,
  count: 1,
});

const CATEGORIES = [group('Groceries', 300), group('Bills', 200), group('Travel', 100)];
const PEOPLE = [group('Alice', 400), group('Bob', 200)];

const renderBar = (memberCount: number, overrides: Partial<Parameters<typeof ShareBar>[0]> = {}) =>
  render(
    <ShareBar
      memberCount={memberCount}
      byCategory={CATEGORIES}
      byPerson={PEOPLE}
      currency="GBP"
      {...overrides}
    />
  );

describe('one user: the bar slices by category and offers no second reading', () => {
  it('renders the categories, not the people', () => {
    renderBar(1);
    expect(screen.getByText('Groceries')).toBeInTheDocument();
    expect(screen.queryByText('Alice')).toBeNull();
  });

  it('shows NO toggle, because there is no second reading to offer', () => {
    renderBar(1);
    expect(screen.queryByRole('group', { name: /slice the month by/i })).toBeNull();
    expect(screen.queryByText('By person')).toBeNull();
  });

  it('ignores by-person data even when it is handed some', () => {
    // The guard that matters: a one-user instance must not render people just
    // because a payload arrived. Fetching is gated too, but a component that
    // renders whatever it is given puts the whole rule one bug away.
    renderBar(1, { byPerson: PEOPLE, initialAxis: 'person' });
    expect(screen.queryByText('Alice')).toBeNull();
    expect(screen.getByText('Groceries')).toBeInTheDocument();
  });
});

describe('two or more users: the bar slices by person and the toggle appears', () => {
  it('renders the people by default', () => {
    renderBar(2);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('offers both readings', () => {
    renderBar(2);
    expect(screen.getByRole('group', { name: /slice the month by/i })).toBeInTheDocument();
    expect(screen.getByText('By person')).toBeInTheDocument();
    expect(screen.getByText('By category')).toBeInTheDocument();
  });

  it('actually switches the bar when the toggle is used', async () => {
    // Not just "the button exists" — a toggle that renders and does nothing is
    // the same dead control in a different costume.
    renderBar(2);
    await userEvent.click(screen.getByText('By category'));

    expect(screen.getByText('Groceries')).toBeInTheDocument();
    expect(screen.queryByText('Alice')).toBeNull();
  });
});

describe('first run: the bar is ABSENT, not empty', () => {
  /**
   * A bar of nothing is a broken bar. With no spending there is nothing to
   * slice, so the surface becomes an invitation instead — drawing a grey track
   * with a £0.00 legend would be an affordance lying about having data.
   */
  it('renders nothing at all when there is no spending', () => {
    const { container } = render(
      <ShareBar memberCount={1} byCategory={[]} byPerson={[]} currency="GBP" />
    );
    expect(container.querySelector('.fp-sharebar')).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the groups exist but all total zero', () => {
    const { container } = render(
      <ShareBar
        memberCount={2}
        byCategory={[group('Groceries', 0)]}
        byPerson={[group('Alice', 0)]}
        currency="GBP"
      />
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe('the bar never carries meaning by colour alone', () => {
  it('states every segment value as text (WCAG 1.4.1)', () => {
    // This is what makes the measured adjacent-luminance problem a polish issue
    // rather than a blocker: adjacent segments are 1.03, 1.06, 1.64 and — for
    // 4 and 5 — 1.00 against each other, so the legend is doing the real work.
    renderBar(2);
    expect(screen.getByText('£400.00')).toBeInTheDocument();
    expect(screen.getByText('£200.00')).toBeInTheDocument();
  });

  it('describes the whole bar to a screen reader', () => {
    renderBar(2);
    const bar = screen.getByRole('img');
    expect(bar.getAttribute('aria-label')).toMatch(/Alice £400\.00/);
    expect(bar.getAttribute('aria-label')).toMatch(/Bob £200\.00/);
  });
});

describe('segments fold rather than multiply', () => {
  it('keeps at most five, with the tail summed into the last', () => {
    const many = Array.from({ length: 9 }, (_, i) => group(`Cat ${i}`, 100 - i));
    const segments = toSegments(many);

    expect(segments).toHaveLength(5);
    expect(segments[4].label).toBe('5 more');
    // Nothing is dropped on the way — the folded segment carries the remainder.
    expect(segments.reduce((sum, s) => sum + s.total, 0)).toBe(
      many.reduce((sum, s) => sum + s.total, 0)
    );
  });

  it('drops zero and negative groups rather than drawing invisible segments', () => {
    expect(toSegments([group('A', 10), group('B', 0)])).toHaveLength(1);
  });

  it('leaves a short list alone', () => {
    expect(toSegments(CATEGORIES)).toHaveLength(3);
  });
});
