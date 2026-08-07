/**
 * A figure that says whose money it is has to actually render that on screen.
 *
 * AUDIT.md D-01: this instance is one household, and `/analytics/dashboard`
 * returns the caller's own net worth and expense share in the same payload as the
 * household's income and lists. The owner read `$0.00 expenses` above two other
 * members' expenses and reasonably called it a bug. The decision was to label
 * both scopings rather than change which query a handler uses.
 *
 * These assert the rendered output rather than the props, because a prop that is
 * accepted and dropped is exactly how the labelling would fail silently — the
 * same way `Input` accepted `isDark` and painted the wrong palette.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatCard } from '../../components/StatCard';
import { SCOPE_TAG } from '../../utils/scope';

const renderCard = (scope?: 'yours' | 'household' | 'mixed') =>
  render(
    <StatCard
      label="Monthly Income"
      value="$1,234.00"
      scope={scope}
      accentColor="#3b82f6"
      icon={<span data-testid="icon" />}
    />
  );

describe('StatCard scope labelling', () => {
  it('renders HOUSEHOLD beside a household figure', () => {
    renderCard('household');
    expect(screen.getByText(SCOPE_TAG.household)).toBeInTheDocument();
  });

  it("renders YOURS beside the caller's own figure", () => {
    renderCard('yours');
    expect(screen.getByText(SCOPE_TAG.yours)).toBeInTheDocument();
  });

  it('renders no tag at all for a figure that mixes both scopes', () => {
    // Guessing a side would be a new wrong label. `mixed` figures carry a
    // caption in their subtitle instead — see the savings rate on the Dashboard.
    renderCard('mixed');
    expect(screen.queryByText(SCOPE_TAG.household)).not.toBeInTheDocument();
    expect(screen.queryByText(SCOPE_TAG.yours)).not.toBeInTheDocument();
  });

  it('renders no tag when a card does not claim a scope', () => {
    renderCard(undefined);
    expect(screen.queryByText(SCOPE_TAG.household)).not.toBeInTheDocument();
    expect(screen.queryByText(SCOPE_TAG.yours)).not.toBeInTheDocument();
  });

  it('still renders the label and the value alongside the tag', () => {
    renderCard('household');
    expect(screen.getByText('Monthly Income')).toBeInTheDocument();
    expect(screen.getByText('$1,234.00')).toBeInTheDocument();
  });
});

/**
 * **The Dashboard figure map is GONE — D-18 item E — and this block is rewritten
 * rather than deleted, because deleting it would erase the reason it existed.**
 *
 * It asserted `monthlyIncome: 'household'`, `monthlyExpenses: 'yours'`,
 * `netWorth: 'yours'` and `savingsRate: 'mixed'`. Every one of those was true and
 * is now false: the dashboard's figures all describe the same people and follow
 * one member filter. Left in place, this block would have kept **passing** — the
 * map object still existed after the page stopped importing it — while
 * certifying a claim that had stopped being true of anything. That is the shape
 * #69/#71 hit, where a contract test went on asserting the exact definition that
 * caused the hole.
 *
 * What replaces it is not another copy of the map. `StatCard`'s `scope` prop is
 * still used by surfaces that genuinely mix scopes (Investments, pointsPal), so
 * the rendering assertions above stay; the *Dashboard's* answer now lives in
 * `DashboardMemberFilter.test.tsx`, asserted on the request and the rendered
 * figures instead of on a lookup table.
 */
describe('the retired Dashboard figure map', () => {
  it('is really gone, so nothing can quietly start reading it again', async () => {
    const scope = await import('../../utils/scope');

    expect('DASHBOARD_FIGURE_SCOPE' in scope).toBe(false);
    expect('MIXED_SCOPE_CAPTION' in scope).toBe(false);
  });

  it('leaves the vocabulary itself intact for the surfaces that still mix scopes', () => {
    expect(SCOPE_TAG.yours).toBe('YOURS');
    expect(SCOPE_TAG.household).toBe('HOUSEHOLD');
  });
});
