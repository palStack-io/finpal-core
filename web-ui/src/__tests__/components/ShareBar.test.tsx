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

// ══════════════════════════════════════════════════════════════════════════
// FINPAL-25 — "5 more" was a dead end
// ══════════════════════════════════════════════════════════════════════════

/**
 * *** THE ROW LOOKED LIKE A CONTROL AND WAS NOT ONE, AND NOTHING ELSE IN THE
 * APP SHOWED WHAT IT HID. ***
 *
 * `toSegments` keeps the top four and folds the rest into a fifth entry
 * labelled `N more`, styled identically to the four real ones. It was a dead
 * end in the strict sense: the folded categories appeared nowhere else — the
 * card's "View all" goes to `/transactions`, which is a transaction list, not
 * a breakdown, and Analytics surfaces only its own top four.
 *
 * *** THE LEGEND OPENS; THE BAR DOES NOT. *** Splitting the bar to nine
 * segments needs nine colours. There are five, and the component's own
 * docstring records that segments 4 and 5 measure **1.00** against each other
 * — identical luminance. Four more hues on a palette that cannot separate the
 * two it has is the repaint that note exists to refuse.
 */
const NINE = [
  group('Housing', 1800),
  group('Groceries', 216.93),
  group('Shopping', 157.12),
  group('Transportation', 52),
  group('Pets', 40),
  group('Gifts', 35),
  group('Health', 30),
  group('Books', 18.67),
  group('Coffee', 10),
];

const renderFolded = () =>
  render(<ShareBar memberCount={1} byCategory={NINE} byPerson={[]} currency="GBP" />);

describe('the folded categories can be opened', () => {
  it('folds the tail rather than dropping it', () => {
    // The unit the component works from. Before this the tail was summed and
    // discarded, which is what made the row a dead end.
    const segments = toSegments(NINE);
    expect(segments).toHaveLength(5);
    expect(segments[4].label).toBe('5 more');
    expect(segments[4].folded?.map((g) => g.label)).toEqual([
      'Pets', 'Gifts', 'Health', 'Books', 'Coffee',
    ]);
    // and the group's total is exactly what it folded — a header that
    // disagrees with the rows under it is D-102's family.
    const sum = segments[4].folded!.reduce((t, g) => t + g.total, 0);
    expect(segments[4].total).toBeCloseTo(sum, 2);
  });

  it('is a real button, announced with its state', () => {
    renderFolded();
    const more = screen.getByRole('button', { name: /5 more/ });
    expect(more).toHaveAttribute('aria-expanded', 'false');
  });

  it('hides the folded categories until it is opened', () => {
    renderFolded();
    expect(screen.queryByText('Coffee')).not.toBeInTheDocument();
    expect(screen.queryByText('Books')).not.toBeInTheDocument();
  });

  it('lists every folded category, with its amount, when opened', async () => {
    const user = userEvent.setup();
    renderFolded();
    await user.click(screen.getByRole('button', { name: /5 more/ }));

    for (const label of ['Pets', 'Gifts', 'Health', 'Books', 'Coffee']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    // the amounts, not just the names — a list of labels with no figures is
    // the same dead end with more rows
    expect(screen.getByText('£18.67')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /5 more/ })).toHaveAttribute(
      'aria-expanded', 'true',
    );
  });

  it('closes again', async () => {
    const user = userEvent.setup();
    renderFolded();
    const more = screen.getByRole('button', { name: /5 more/ });
    await user.click(more);
    await user.click(more);
    expect(screen.queryByText('Coffee')).not.toBeInTheDocument();
  });

  it('leaves the BAR at five segments when opened', async () => {
    // *** THE ASSERTION THIS WHOLE DESIGN TURNS ON. *** Nine legend rows over
    // a nine-segment bar would need four colours that do not exist and would
    // worsen a contrast weakness the component already documents.
    const user = userEvent.setup();
    const { container } = renderFolded();
    const count = () => container.querySelectorAll('.fp-sharebar-segment').length;
    expect(count()).toBe(5);
    await user.click(screen.getByRole('button', { name: /5 more/ }));
    expect(count()).toBe(5);
  });

  it('gives the sub-rows no dot, because they have no band in the bar', async () => {
    // A dot promises a segment. These sit inside the grouped one.
    const user = userEvent.setup();
    const { container } = renderFolded();
    await user.click(screen.getByRole('button', { name: /5 more/ }));
    const sub = container.querySelector('.fp-sharebar-sublegend');
    expect(sub).not.toBeNull();
    expect(sub!.querySelectorAll('.fp-sharebar-dot')).toHaveLength(0);
    expect(sub!.querySelectorAll('li')).toHaveLength(5);
  });

  it('offers nothing to open when nothing was folded', () => {
    // Four categories fold into nothing, and a disclosure over an empty list
    // is an affordance that lies — the failure this component's toggle rule
    // already names.
    render(<ShareBar memberCount={1} byCategory={CATEGORIES} byPerson={[]} currency="GBP" />);
    expect(screen.queryByRole('button', { name: /more/ })).not.toBeInTheDocument();
  });

  it('closes when the axis flips, so it cannot show the other reading\'s rows', async () => {
    // "5 more" means different categories and different people. An open panel
    // surviving the switch is a stale list that looks current.
    const user = userEvent.setup();
    const PEOPLE_9 = NINE.map((g, i) => group(`Person ${i}`, g.total, `p${i}`));
    const { container } = render(
      <ShareBar memberCount={3} byCategory={NINE} byPerson={PEOPLE_9} currency="GBP" />,
    );
    await user.click(screen.getByRole('button', { name: /5 more/ }));
    expect(container.querySelector('.fp-sharebar-sublegend')).not.toBeNull();

    await user.click(screen.getByRole('button', { name: 'By category' }));
    expect(container.querySelector('.fp-sharebar-sublegend')).toBeNull();
  });
});
