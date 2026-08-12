/**
 * Captures the Dashboard and Budgets pages so the contrast walk covers them too.
 *
 * *** THE WALK ONLY EVER SAW TRANSACTIONS, AND "UNMEASURED" IS NOT "CLEAN". ***
 * The palette adoption took that page to zero AA failures, which says nothing
 * about the two pages nobody had rendered.
 */
import { it, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from 'fs';
import { join } from 'path';
import { http, HttpResponse } from 'msw';
import { server } from '../../src/__tests__/mocks/server';
import { api } from '../../src/services/api';
import { useAuthStore } from '../../src/store/authStore';
import { Dashboard } from '../../src/pages/Dashboard';
import { Accounts } from '../../src/pages/Accounts';
import BudgetsMinimal from '../../src/pages/BudgetsMinimal';
import { Investments } from '../../src/pages/Investments';
import PointsPalOverview from '../../src/modules/pointspal/pages/Overview';
import CapTracker from '../../src/modules/pointspal/pages/CapTracker';
import BestCard from '../../src/modules/pointspal/pages/BestCard';
import MyCards from '../../src/modules/pointspal/pages/MyCards';
import Redeem from '../../src/modules/pointspal/pages/Redeem';
import { ToastProvider } from '../../src/contexts/ToastContext';
import { ThemeProvider } from '../../src/contexts/ThemeContext';

const OUT = join(__dirname, 'captured');

/* Stale captures are worse than none: the walk sweeps the directory, so a file
   left from an earlier experiment gets measured as if it were today's code and
   reports failures that were already fixed. Cleared on every run. */
beforeAll(() => {
  if (existsSync(OUT)) {
    for (const f of readdirSync(OUT)) {
      if (f.endsWith('.html') && f !== 'transactions.html') rmSync(join(OUT, f));
    }
  }
});

beforeAll(() => { api.defaults.adapter = 'http'; });
beforeEach(() => {
  useAuthStore.setState({
    user: { id: 'alice@test.com', name: 'Alice', default_currency_code: 'GBP' } as any,
    token: 'tok', refreshToken: 'r', isAuthenticated: true,
  });
});

/* The two endpoints the shared handlers do not carry. Realistic shapes, because
   a page rendered from empty data has no colours to measure. */
beforeEach(() => {
  server.use(
    http.get('*/api/v1/analytics/dashboard', () => HttpResponse.json({
      success: true,
      net_worth: 46125, monthly_income: 6180, monthly_expenses: 2904,
      savings_rate: 53,
      cash_flow: [{ month: 'Mar', income: 6180, expenses: 2904 }],
      category_breakdown: [
        { name: 'Groceries', total: 420, color: '#15803d' },
        { name: 'Bills', total: 380, color: '#3F7D5C' },
        { name: 'Eating out', total: 210, color: '#AB5437' },
      ],
      accounts: [{ id: 1, name: 'Everyday Current', balance: 1104.55, type: 'checking' }],
    })),
    http.get('*/api/v1/budgets/overview', () => HttpResponse.json({
      success: true,
      total_budget: 2000, total_spent: 1450, total_remaining: 550, percentage_used: 72,
      budgets: [
        { id: 1, name: 'Groceries', category: { name: 'Groceries' }, amount: 500, spent: 480, remaining: 20, percentage: 96, period: 'monthly' },
        { id: 2, name: 'Bills', category: { name: 'Bills' }, amount: 900, spent: 620, remaining: 280, percentage: 69, period: 'monthly' },
        { id: 3, name: 'Fun', category: { name: 'Fun' }, amount: 600, spent: 720, remaining: -120, percentage: 120, period: 'monthly' },
      ],
    })),
  );
});

/**
 * *** THE TIER 2 AND TIER 3 PAGES WERE NOT IN THE CAPTURE LIST AT ALL. ***
 *
 * The responsive pass (2026-08-11) targets three two-pane pointsPal layouts and
 * two data tables that reflow badly — and not one of those pages was captured,
 * so the overflow gate would have swept four pages that contain none of its
 * subjects and reported green forever. That is this file's own header comment
 * happening a second time: "unmeasured" is not "clean".
 *
 * Realistic payloads, not empty ones. A pointsPal page with zero cards renders
 * an empty state, which has no grid to measure — an empty capture passes an
 * overflow gate exactly the way a correct one does.
 */
const cardFace = (id: number, name: string, program: string, color: string) => ({
  id, card_name: name, program, issuer_color: color, points: 84210,
  est_value_usd: 1263.15, annual_fee: 95, expiry_alert: null, stale: false,
});

beforeEach(() => {
  server.use(
    http.get('*/api/v1/pointspal/overview', () => HttpResponse.json({
      total_value_usd: 2481.4, pts_earned_this_month: 12480,
      pts_missed_this_month: 3120, active_cap_alerts: 2, max_redeemable_usd: 1980.25,
      cards: [
        cardFace(1, 'Sapphire Preferred', 'Chase Ultimate Rewards', 'chase'),
        cardFace(2, 'Gold Card', 'Amex Membership Rewards', 'amex'),
        cardFace(3, 'Double Cash', 'Citi ThankYou', 'citi'),
      ],
      stale_cards: [{ id: 3, card_name: 'Double Cash', stale_status: 'stale',
        issuer_updated_at: '2025-11-02' }],
      action_items: [
        { type: 'capped', emoji: '🚫', title: 'Groceries cap reached on Gold Card',
          description: 'Switch to Sapphire Preferred for the rest of the quarter.',
          value: '4,200', value_label: 'pts at risk', link_to: '/pointspal/caps' },
        { type: 'opportunity', emoji: '✨', title: 'Transfer bonus to Flying Blue',
          description: '25% bonus ends in nine days.', value: '$312',
          value_label: 'extra value', link_to: '/pointspal/redeem' },
      ],
      recent_activity: [
        { card_name: 'Sapphire Preferred', dot_color: '#3b82f6',
          description: 'Whole Foods Market', subtitle: 'Groceries · 12 Aug',
          pts_earned: 428, pts_missed: 0 },
        { card_name: 'Gold Card', dot_color: '#f59e0b', description: 'Delta Air Lines',
          subtitle: 'Travel · 11 Aug', pts_earned: 1240, pts_missed: 310 },
      ],
    })),
    http.get('*/api/v1/pointspal/caps', () => HttpResponse.json([
      { category: 'Groceries', emoji: '🛒', card_name: 'Gold Card', cap_amount: 25000,
        cap_period: 'yearly', spent: 24100, cap_pct: 96.4, status: 'warning',
        effective_rate: 4, normal_rate: 4, room_left: 900, resets_at: '2027-01-01',
        recommended_switch: { card_name: 'Sapphire Preferred', rate: 3, cap: null } },
      { category: 'Dining', emoji: '🍽️', card_name: 'Sapphire Preferred', cap_amount: null,
        cap_period: 'none', spent: 1840, cap_pct: 0, status: 'ok', effective_rate: 3,
        normal_rate: 3, room_left: 0, resets_at: '', recommended_switch: null },
      { category: 'Travel', emoji: '✈️', card_name: 'Double Cash', cap_amount: 6000,
        cap_period: 'quarterly', spent: 6000, cap_pct: 100, status: 'capped',
        effective_rate: 1, normal_rate: 5, room_left: 0, resets_at: '2026-10-01',
        recommended_switch: { card_name: 'Gold Card', rate: 4, cap: 25000 } },
    ])),
    http.get('*/api/v1/pointspal/caps/summary', () => HttpResponse.json({
      period: 'monthly', pts_earned: 12480, pts_at_normal: 15600, pts_at_fallback: 2100,
      pts_missed: 3120, value_missed_usd: 46.8, active_alerts: 2,
      upcoming_resets: [
        { category: 'Travel', card_name: 'Double Cash', resets_at: '2026-10-01', period: 'quarterly' },
        { category: 'Groceries', card_name: 'Gold Card', resets_at: '2027-01-01', period: 'yearly' },
      ],
    })),
    http.get('*/api/v1/pointspal/cards', () => HttpResponse.json([
      { id: 1, card_name: 'Sapphire Preferred', issuer: 'Chase',
        program: 'Chase Ultimate Rewards', issuer_color: 'chase', last_four: '4021',
        points: 84210, est_value_usd: 1263.15, annual_fee: 95, avg_rate_ytd: 2.8,
        verified_at: '2026-08-01', stale_status: 'fresh', expiry_alert: null,
        earn_caps: [
          { category: 'Dining', rate: 3, cap_amount: null, cap_period: null },
          { category: 'Travel', rate: 2, cap_amount: null, cap_period: null },
        ], submitted_to_community: false },
      { id: 2, card_name: 'Gold Card', issuer: 'American Express',
        program: 'Amex Membership Rewards', issuer_color: 'amex', last_four: '1007',
        points: 51340, est_value_usd: 1027.0, annual_fee: 250, avg_rate_ytd: 3.4,
        verified_at: '2026-07-18', stale_status: 'fresh', expiry_alert: null,
        earn_caps: [
          { category: 'Groceries', rate: 4, cap_amount: 25000, cap_period: 'yearly' },
          { category: 'Dining', rate: 4, cap_amount: null, cap_period: null },
        ], submitted_to_community: true },
    ])),
    http.get('*/api/v1/pointspal/cards/:id/transactions', () => HttpResponse.json([
      { id: 11, date: '2026-08-12', description: 'Whole Foods Market',
        category: 'Groceries', amount: 107.02, rate: 4, pts_earned: 428 },
      { id: 12, date: '2026-08-11', description: 'Delta Air Lines',
        category: 'Travel', amount: 620.0, rate: 2, pts_earned: 1240 },
    ])),
    http.get('*/api/v1/pointspal/recommend', () => HttpResponse.json({
      category: 'groceries', amount: 250,
      winner: { card_name: 'Gold Card', pts_earned: 1000, value_usd: 20.0,
        effective_rate: 4, cap_note: '900 of cap left' },
      displaced_winner: { card_name: 'Double Cash', normal_rate: 5,
        status: 'capped', cap_note: 'Quarterly cap reached' },
      all_cards: [
        { card_name: 'Gold Card', program: 'Amex Membership Rewards', nominal_rate: 4,
          effective_rate: 4, pts_earned: 1000, value_usd: 20.0, status: 'ok',
          cap_pct: 96.4, tag: 'best' },
        { card_name: 'Sapphire Preferred', program: 'Chase Ultimate Rewards',
          nominal_rate: 3, effective_rate: 3, pts_earned: 750, value_usd: 15.0,
          status: 'ok', cap_pct: null, tag: 'good' },
        { card_name: 'Double Cash', program: 'Citi ThankYou', nominal_rate: 5,
          effective_rate: 1, pts_earned: 250, value_usd: 2.5, status: 'capped',
          cap_pct: 100, tag: 'capped' },
      ],
    })),
    http.get('*/api/v1/pointspal/redeem', () => HttpResponse.json({
      total_value_usd: 2481.4, max_redeemable_usd: 1980.25, total_points: 135550,
      card_count: 3,
      programs: [
        { program_name: 'Chase Ultimate Rewards', points: 84210, dot_color: '#3b82f6',
          options: [
            { partner: 'Hyatt', description: 'Transfer 1:1 to World of Hyatt',
              type: 'Transfer', cpp: 2.3, tag: 'Best' },
            { partner: 'Travel portal', description: 'Book flights at 1.25c',
              type: 'Portal', cpp: 1.25, tag: 'Good' },
            { partner: 'Statement credit', description: 'Cash out at 1c',
              type: 'Cash', cpp: 1.0, tag: 'Avoid' },
          ] },
        { program_name: 'Amex Membership Rewards', points: 51340, dot_color: '#f59e0b',
          options: [
            { partner: 'Flying Blue', description: 'Transfer 1:1, 25% bonus live',
              type: 'Transfer', cpp: 2.1, tag: 'Best' },
            { partner: 'Amex Travel', description: 'Book flights at 1c',
              type: 'Portal', cpp: 1.0, tag: 'OK' },
          ] },
      ],
      tips: [{ type: 'transfer', title: 'Transfer partners beat the portal',
        body: 'Both live programs redeem for more than 2c through airline and hotel partners.' }],
    })),
    http.get('*/api/v1/points/programs', () => HttpResponse.json([
      { program_id: 'chase-ur', program_name: 'Chase Ultimate Rewards', issuer: 'Chase',
        network: 'Visa', annual_fee: 95, effective_annual_fee: '$95', base_cpp: 1.0,
        tpg_cpp: 2.05, data_as_of: '2026-08-01', is_stale: false },
    ])),
    http.get('*/api/v1/investments/portfolios', () => HttpResponse.json({
      success: true,
      portfolios: [{ id: 1, name: 'Main', total_value: 48210.55, total_cost: 39000,
        total_gain_loss: 9210.55, total_gain_loss_percent: 23.6 }],
    })),
    http.get('*/api/v1/investments/holdings', () => HttpResponse.json({
      success: true,
      /**
       * *** THESE KEYS ARE COPIED FROM THE DEPLOYED PAYLOAD, NOT INVENTED. ***
       * The previous fixture sent `average_cost`, `market_value` and
       * `gain_loss_percent` — three names this API has never sent. The page reads
       * `purchase_price`, so `costBasis` was `undefined * shares` = **NaN**, and
       * this capture rendered **`$NaN` eight times**. `NaN >= 0` is false, so every
       * figure also took the RED branch and printed a red "+0.00%".
       *
       * Both gates called that page fine: NaN text still has a contrast ratio and a
       * NaN does not overflow. So investments' contrast numbers — and the responsive
       * pass's overflow numbers — were measured against a page in an error state.
       * Verified against the real endpoint with a token: `purchase_price`,
       * `current_price`, `current_value`, `gain_loss`, `gain_loss_percentage`.
       */
      holdings: [
        { id: 1, symbol: 'VWRP', name: 'Vanguard FTSE All-World Acc', shares: 210,
          purchase_price: 98.4, current_price: 121.2, current_value: 25452,
          gain_loss: 4788, gain_loss_percentage: 23.2, portfolio_id: 1 },
        { id: 2, symbol: 'AAPL', name: 'Apple Inc.', shares: 60, purchase_price: 168.2,
          current_price: 224.9, current_value: 13494, gain_loss: 3402,
          gain_loss_percentage: 33.7, portfolio_id: 1 },
        { id: 3, symbol: 'MSFT', name: 'Microsoft Corporation', shares: 22,
          purchase_price: 331.0, current_price: 421.6, current_value: 9275.2,
          gain_loss: 1993.2, gain_loss_percentage: 27.4, portfolio_id: 1 },
      ],
    })),
  );
});

/**
 * `drive` runs after the page has settled, for pages whose measurable layout only
 * exists after an interaction. BestCard's `<RecommendTable>` — one of the five real
 * `<table>` elements Tier 3 covers — is behind a form submit, so capturing the page
 * as it first paints captures the empty state and measures nothing.
 */
type Case = [string, React.FC, ((c: HTMLElement) => Promise<void>)?];

const cases: Case[] = [
  ['dashboard', Dashboard as React.FC],
  ['budgets', BudgetsMinimal as React.FC],
  // Accounts is walked at ONE realistic count. It was measured at 2/8/20 once,
  // to answer a density question; those captures then lingered in `captured/`
  // and the sweep dutifully walked three stale copies of the same page. The
  // capture now clears the directory, and the page is here as itself.
  ['accounts', Accounts as React.FC],
  ['investments', Investments as React.FC],
  ['pointspal-overview', PointsPalOverview as React.FC],
  ['pointspal-caps', CapTracker as React.FC],
  /**
   * MyCards is captured with the Add-Card modal OPEN, because that is the only place
   * its `130px 52px 90px 90px 52px` earn-rate grid — Tier 3's headline subject, 414px
   * of fixed track — actually renders. Capturing the page as it first paints captures
   * the wallet list and none of the thing the tier exists to fix.
   */
  ['pointspal-mycards', MyCards as React.FC, async () => {
    await userEvent.click(screen.getByRole('button', { name: /Add Card/ }));
    // No program is selected on open, so the manual earn-rate grid renders straight
    // away. Waiting on its last column header rather than on the modal, because the
    // modal opens whether or not that section is in it.
    await screen.findByText('Fallbk');
  }],
  ['pointspal-redeem', Redeem as React.FC],
  ['pointspal-bestcard', BestCard as React.FC, async () => {
    await userEvent.type(screen.getByPlaceholderText('0.00'), '250');
    await userEvent.click(screen.getByRole('button', { name: /Find Best/ }));
    // The RecommendTable is the point of the capture, so wait for a cell in it —
    // not for the button to re-enable, which happens whether or not it rendered.
    await screen.findByText('Sapphire Preferred', undefined, { timeout: 6000 });
  }],
];

it.each(cases)('captures %s', async (name, Page, drive) => {
  const { container } = render(
    <MemoryRouter><ThemeProvider><ToastProvider><Page /></ToastProvider></ThemeProvider></MemoryRouter>
  );
  // Wait for the loading spinner to go, or we capture a spinner and report zero.
  /**
   * *** WAIT FOR THE PAGE TO EXIST, NOT FOR A SPINNER TO STOP EXISTING. ***
   *
   * This used to be `expect(container.querySelector('.animate-spin')).toBeNull()`,
   * and that check is VACUOUS on any page whose loading state is not that spinner.
   * `Investments.tsx:170` renders a plain "Loading investment data..." div — two
   * elements, no `.animate-spin` — so the wait resolved on its FIRST tick and the
   * capture raced the fetch. It won that race on this machine nine times out of
   * nine and lost it on a CI runner, which is the worst possible distribution: the
   * page serialized as a two-element stub, and a stub overflows nowhere and has no
   * contrast pairs, so BOTH walks would have reported it clean.
   *
   * A check for the absence of something is satisfied by that something never
   * having existed. The condition below is positive and page-agnostic — it waits
   * for the property the captures actually need — and it makes the `painted < 50`
   * guard underneath an assertion rather than a coin toss.
   */
  // Enough of a shell to interact with. A driven page is deliberately BELOW the
  // final bar here — BestCard's empty state is a form and no results — so the full
  // threshold cannot be applied until after the drive.
  await waitFor(() => {
    expect(container.querySelectorAll('*').length).toBeGreaterThanOrEqual(20);
    expect(container.querySelector('.animate-spin')).toBeNull();
  }, { timeout: 6000 });

  if (drive) await drive(container);

  // The real readiness gate, applied to every page once it is in its final state.
  await waitFor(() => {
    expect(container.querySelectorAll('*').length).toBeGreaterThanOrEqual(50);
  }, { timeout: 6000 });

  const painted = container.querySelectorAll('*').length;
  if (painted < 50) throw new Error(`${name}: only ${painted} elements — captured a stub`);

  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `${name}.html`), container.innerHTML, 'utf8');
  // eslint-disable-next-line no-console
  console.log(`CAPTURED ${name}: ${painted} elements`);
});
