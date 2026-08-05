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
import {
  DASHBOARD_FIGURE_SCOPE,
  MIXED_SCOPE_CAPTION,
  SCOPE_TAG,
} from '../../utils/scope';

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

describe('the Dashboard figure map', () => {
  it('keeps income and expenses on different scopes', () => {
    // The asymmetry the written summary of D-01 missed: the backend's income
    // loop applies no user filter, while the expense loop takes the caller's
    // split share. Asserted against the live handler in
    // tests/integration/test_dashboard_scope_mix.py.
    expect(DASHBOARD_FIGURE_SCOPE.monthlyIncome).toBe('household');
    expect(DASHBOARD_FIGURE_SCOPE.monthlyExpenses).toBe('yours');
    expect(DASHBOARD_FIGURE_SCOPE.netWorth).toBe('yours');
  });

  it('gives the savings rate a caption instead of a tag', () => {
    expect(DASHBOARD_FIGURE_SCOPE.savingsRate).toBe('mixed');
    expect(MIXED_SCOPE_CAPTION.savingsRate).toMatch(/household/i);
    expect(MIXED_SCOPE_CAPTION.savingsRate).toMatch(/your/i);
  });
});
