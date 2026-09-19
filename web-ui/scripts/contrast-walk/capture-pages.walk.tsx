/**
 * Captures the Dashboard and Budgets pages so the contrast walk covers them too.
 *
 * *** THE WALK ONLY EVER SAW TRANSACTIONS, AND "UNMEASURED" IS NOT "CLEAN". ***
 * The palette adoption took that page to zero AA failures, which says nothing
 * about the two pages nobody had rendered.
 */
import { it, beforeAll, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from 'fs';
import { join } from 'path';
import { http, HttpResponse } from 'msw';
import { server } from '../../src/__tests__/mocks/server';
import { api } from '../../src/services/api';
import { useAuthStore } from '../../src/store/authStore';
import { Dashboard } from '../../src/pages/Dashboard';
import { Accounts } from '../../src/pages/Accounts';
import BudgetsMinimal from '../../src/pages/BudgetsMinimal';
import Goals from '../../src/pages/Goals';
import { Investments } from '../../src/pages/Investments';
import Review from '../../src/pages/Review';
import LearnPalHome from '../../src/modules/learnpal/pages/Home';
import LearnPalLessons from '../../src/modules/learnpal/pages/Lessons';
import LearnPalRange from '../../src/modules/learnpal/pages/Range';
import PointsPalOverview from '../../src/modules/pointspal/pages/Overview';
import CapTracker from '../../src/modules/pointspal/pages/CapTracker';
import BestCard from '../../src/modules/pointspal/pages/BestCard';
import MyCards from '../../src/modules/pointspal/pages/MyCards';
import Redeem from '../../src/modules/pointspal/pages/Redeem';
import { Sidebar } from '../../src/components/layout/Sidebar';
import EmptyRange from '../../src/components/dashboard/EmptyRange';
import IncomeFlowChart from '../../src/components/analytics/IncomeFlowChart';
import { incomeFlow } from '../../src/utils/incomeFlow';
import PeriodCompareChart from '../../src/components/analytics/PeriodCompareChart';
import { comparePeriods } from '../../src/utils/periodComparison';

/**
 * The rail in the ONE state a phone user can ever see it in.
 *
 * *** CAPTURED WITH `isOpen`, BECAUSE WITHOUT IT THE 390px WALK MEASURES AN
 * ELEMENT DESIGNED TO BE INVISIBLE. *** Below `--bp-phone` the sidebar is
 * `transform: translateX(-100%)` and `isOpen` is what lifts the `is-open` class
 * that undoes it. Rendered closed, the responsive walk reported eighteen
 * "clipped" nav icons at 390px with **+0px of overflow** — every one of them
 * correct, and every one of them about a drawer that is shut. Above 767px the
 * class is inert, so one capture is valid at all four widths.
 */
const SidebarOpen: React.FC = () => <Sidebar isOpen onClose={() => {}} />;

/** The no-goals range, in the card the dashboard puts it in. */
const EmptyRangeFixture: React.FC = () => (
  <div style={{
    background: 'var(--bg-card)', border: '1px solid var(--border-light)',
    borderRadius: 16, padding: 24,
  }}>
    <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
      Your range
    </h1>
    <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: '4px 0 18px' }}>
      What you are climbing, once you pick something to climb.
    </p>
    <EmptyRange />
  </div>
);

/**
 * The comparison chart, on a fixture that contains all three of its states.
 *
 * *** THE FIXTURE IS THE TEST HERE AS MUCH AS THE WALK IS. *** A comparison
 * where every category merely grew is the easy case and the one a careless
 * fixture picks. This one carries a category that STOPPED (Gym), one that is
 * NEW (Streaming, which must show no percentage — there is none from zero), one
 * that did not move at all (Housing, the largest, which must not vanish) and
 * one that grew. Capture the comfortable case and the walk measures the version
 * of the chart nobody has a problem with — the trap D-227's `cost_basis`
 * fixture taught.
 *
 * Captured as the COMPONENT, not the page: `/analytics` reads seven endpoints
 * and is still one of the surfaces the walk does not cover. Stated rather than
 * implied.
 */
const CompareChartFixture: React.FC = () => {
  const cmp = comparePeriods(
    [
      { name: 'Housing', amount: 5400 }, { name: 'Groceries', amount: 500.49 },
      { name: 'Coffee', amount: 60 }, { name: 'Streaming', amount: 25 },
      { name: 'Transport', amount: 215.5 },
    ],
    [
      { name: 'Housing', amount: 5400 }, { name: 'Groceries', amount: 300 },
      { name: 'Gym', amount: 240 }, { name: 'Transport', amount: 260 },
    ],
  )!;
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border-light)',
      borderRadius: 16, padding: 24,
    }}>
      <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
        Spending, this period against the last
      </h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: '4px 0 20px' }}>
        Last 30 days vs the 30 days before
      </p>
      <PeriodCompareChart
        comparison={cmp}
        format={(a) => `£${a.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        nowLabel="Last 30 days"
        beforeLabel="the 30 days before"
        upIsGood={false}
      />
    </div>
  );
};

/**
 * The flow chart, on the live demo's own figures.
 *
 * *** CAPTURED AS THE COMPONENT, NOT THE PAGE, AND THAT IS A STATED LIMIT
 * RATHER THAN A SHORTCUT. *** `/analytics` reads seven endpoints and is not in
 * the capture at all — it is one of the five surfaces this walk still does not
 * cover. Wiring all seven fixtures to reach one tab would be a bigger change
 * than the chart, and leaving the chart UNMEASURED because the page is
 * unmeasured is how the six surfaces in D-243 stayed invisible.
 *
 * So this measures what is new: the bands, the three ink roles, and whether
 * eight labelled nodes fit at 390px. The page around it is still uncovered and
 * the roadmap says so.
 *
 * *** AND IT USES THE OVERSPENT CASE. *** The demo's September is 250.00 in
 * against 2,359.72 out, which is the state that adds a red "From savings or
 * credit" inflow and relabels the middle node — the widest content and the only
 * place `--re-ink` appears on this chart. Capturing the comfortable case would
 * measure the version of the chart nobody has a problem with.
 */
const FlowChartFixture: React.FC = () => {
  const flow = incomeFlow(
    [{ name: 'Income', amount: 9000 }, { name: 'Uncategorised', amount: 1900 }],
    [
      { name: 'Housing', amount: 12400 }, { name: 'Groceries', amount: 500.49 },
      { name: 'Shopping', amount: 357.11 }, { name: 'Transportation', amount: 215.5 },
      { name: 'Health & Fitness', amount: 149.97 }, { name: 'Electricity', amount: 134.5 },
      { name: 'Food & Dining', amount: 99.24 }, { name: 'Internet', amount: 79.99 },
      { name: 'Phone', amount: 60 }, { name: 'Subscriptions', amount: 45.99 },
    ],
  )!;
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border-light)',
      borderRadius: 16, padding: 24,
    }}>
      <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
        Where it went
      </h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: '4px 0 20px' }}>
        Last 30 days
      </p>
      <IncomeFlowChart
        flow={flow}
        format={(a) => `£${a.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
      />
    </div>
  );
};
import { Kit } from '../../src/pages/Kit';
import GroupDetail from '../../src/pages/GroupDetail';
import NotFound from '../../src/pages/NotFound';
import { Login } from '../../src/pages/Login';
import { Register } from '../../src/pages/Register';
import { ForgotPassword } from '../../src/pages/ForgotPassword';
import { ResetPassword } from '../../src/pages/ResetPassword';
import { CategoryManagement } from '../../src/components/CategoryManagement';
import { RecurringTransactions } from '../../src/components/RecurringTransactions';
import { TransactionRules } from '../../src/components/TransactionRules';
import { ToastProvider } from '../../src/contexts/ToastContext';
import { ThemeProvider } from '../../src/contexts/ThemeContext';

/**
 * `a-starter-buffer`'s approved body, copied from `lesson_bodies.py`. Kept here
 * as the literal text rather than imported: the walk renders the CLIENT, and a
 * capture that reached into the Python package would couple a browser fixture
 * to the backend's import graph.
 */
const LESSON_BODY = [
    '### The rope you tie on first',
    '',
    'There\'s a common piece of advice that you want three to six months of expenses saved before',
    'anything else. It\'s a reasonable target and it is completely out of reach for a lot of people,',
    'which makes it easy to hear as "don\'t bother starting".',
    '',
    'Here\'s the part that gets left out: **most of the protection comes from the first small bit.**',
    'The gap between nothing and a few hundred is the difference between a flat tyre being annoying',
    'and a flat tyre going on the credit card at 22%. The gap between four months and six months is',
    'real, but it is nothing like as sharp.',
    '',
    'So the number to aim at first isn\'t three months. It\'s whatever covers the next thing that',
    'breaks.',
    '',
    'If money is tight enough that even that feels far away, that isn\'t a failure of yours. Rent,',
    'food and borrowing have all outrun wages in most places for years, and "save more" is advice',
    'written for a world with more slack in it than this one has. Saying so isn\'t giving up — it\'s',
    'the reason the target here is the next thing that breaks rather than three months of expenses.',
    'What\'s still yours is where anything spare goes, and this is the highest-value place to send',
    'the first of it.',
    '',
    '> **Where the 3–6 months figure comes from:** it\'s a widely repeated rule of thumb in personal',
    '> finance guidance, not a rule finPal applies and not a threshold anyone checks you against.',
    '',
].join('\n');

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
    /* *** `modules` IS HERE FOR THE SIDEBAR SCOPE AND IT IS LOAD-BEARING. ***
       The rail renders a module section only for a slug in `user.modules`, and
       the two AA failures that prompted adding this scope were IN that section.
       Without these, the capture would serialize a rail with no module rows and
       the walk would measure it clean — the walk-fixture trap that made both
       browser gates report a $0.00 Investments page as green (D-227). */
    user: {
      id: 'alice@test.com', name: 'Alice', default_currency_code: 'GBP',
      modules: ['pointspal', 'learnpal'],
    } as any,
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
    /*
     * The wallet. Review reads it for the per-section "earned" badges, so
     * without a handler MSW's `error` strategy takes the whole capture down —
     * which is how it failed the pre-commit gate rather than quietly rendering
     * without badges.
     *
     * Non-zero coins on the acts the Review sections map to, deliberately: a
     * fixture of zeroes would capture a page with no badges on it, and a badge
     * the walk never sees is a colour pair the walk never measures. That is
     * D-165's rule — a fixture that cannot produce the real case measures
     * nothing.
     */
    http.get('*/api/v1/coins', () => HttpResponse.json({
      balance: 7603,
      earned: 7603,
      acts: [
        { slug: 'categories_classified', title: 'Sort your categories', coins: 1500, revealed: null },
        { slug: 'accounts_confirmed', title: 'Confirm what finPal guessed', coins: 800, revealed: null },
        { slug: 'transactions_categorised', title: 'Categorise your spending', coins: 2000, revealed: null },
      ],
      gear: [],
    })),

    http.get('*/api/v1/goals', () => HttpResponse.json({
      success: true,
      goals: [
        // *** GOAL 1 SPANS TWO CARDS (B12), AND ITS `account_name` IS THE
        // SERVER'S DEGRADED "2 accounts". *** A single-account fixture would
        // walk the page without ever rendering the longest string this page can
        // produce, which at 390px is the one at risk.
        { id: 1, user_id: 'demo@finpal.app', name: 'Pay off Chase Amazon',
          kind: 'payoff', scope: 'household', account_id: 7,
          account_name: '2 accounts',
          accounts: [
            { id: 7, name: 'Chase Amazon', start_amount: -1125.41 },
            { id: 9, name: 'Barclaycard Rewards', start_amount: -524.59 },
          ],
          target_amount: 0, start_amount: -1650,
          current_manual: null, currency_code: 'USD', start_date: '2026-01-01',
          target_date: '2027-06-30', status: 'active', achieved_at: null,
          current_amount: -450, direction: 'paydown', progress: 0.7272,
          // C1c. *** COST SCALE, AND `apr` IS NULL BECAUSE IT SPANS TWO CARDS. ***
          // The server refuses to print one rate for a goal at two rates, so
          // this fixture carries the real multi-account shape rather than the
          // easy one.
          peak: { scale: 'cost', magnitude: 312.5, unmeasured: false, band: 5,
                  mountain: { slug: 'everest', name: 'Everest', elevation_m: 8849,
                              fact: null, summit_note: null },
                  hardest_band: 5,
                  hardest_mountain: { slug: 'everest', name: 'Everest',
                                      elevation_m: 8849, fact: null,
                                      summit_note: null },
                  apr: null } },
        // Deliberately left single-account, so both shapes are on the page at
        // once and the walk measures the pair rather than one of them.
        { id: 2, user_id: 'demo@finpal.app', name: 'Emergency fund',
          kind: 'savings', scope: 'personal', account_id: 8,
          account_name: 'Ally Savings',
          accounts: [{ id: 8, name: 'Ally Savings', start_amount: 1000 }],
          target_amount: 10000, start_amount: 1000,
          current_manual: null, currency_code: 'USD', start_date: '2026-01-01',
          target_date: null, status: 'active', achieved_at: null,
          current_amount: 4000, direction: 'accumulate', progress: 0.3333,
          // BUILD scale, so both colours are on the page at once and the
          // contrast walk measures the pair rather than one of them.
          peak: { scale: 'build', magnitude: 6000, unmeasured: false, band: 3,
                  mountain: { slug: 'mount-rainier', name: 'Mount Rainier',
                              elevation_m: 4392, fact: null, summit_note: null },
                  hardest_band: 3,
                  hardest_mountain: { slug: 'mount-rainier',
                                      name: 'Mount Rainier', elevation_m: 4392,
                                      fact: null, summit_note: null },
                  apr: 24.99 } },
        { id: 3, user_id: 'demo@finpal.app', name: 'New laptop', kind: 'savings',
          scope: 'personal', account_id: null, account_name: null,
          target_amount: 2000, start_amount: 0, current_manual: 2100,
          currency_code: 'USD', start_date: '2026-01-01', target_date: null,
          status: 'achieved', achieved_at: '2026-08-01T00:00:00',
          current_amount: 2100, direction: 'accumulate', progress: 1.05,
          // *** ACHIEVED, SO THE SUMMIT NOTE RENDERS — AND IT IS THE LONGEST
          // STRING THIS PAGE CAN PRODUCE. *** The note plus "Hardest it ever
          // got: …" on one line is the thing that fits at 1440 and can overflow
          // at 390, which is exactly what the responsive walk exists to catch,
          // and a short fixture cannot make one. The watermark is deliberately
          // FOUR bands above the current one, because the note must read the
          // watermark and not where the goal ended.
          peak: { scale: 'build', magnitude: 0, unmeasured: false, band: 0,
                  mountain: { slug: 'table-mountain', name: 'Table Mountain',
                              elevation_m: 1085, fact: null, summit_note: null },
                  hardest_band: 4,
                  hardest_mountain: {
                    slug: 'aconcagua', name: 'Aconcagua', elevation_m: 6961,
                    fact: null,
                    summit_note: 'You started at Aconcagua, the highest mountain '
                               + 'outside Asia. That whole climb is behind you now.',
                  },
                  apr: null } },
        // *** THE UNMEASURED STATE, WHICH HAD NO FIXTURE UNTIL C1c. *** A flat
        // grey ridge and an italic prompt, and it must be measurable in both
        // themes: the muted colour on a card is the pair most likely to fall
        // under 4.5:1, and "we do not know your rate" is not allowed to be the
        // one line nobody checked.
        { id: 4, user_id: 'demo@finpal.app',
          name: 'Clear the John Lewis Partnership Card', kind: 'payoff',
          scope: 'personal', account_id: 12, account_name: 'John Lewis Partnership Card',
          accounts: [{ id: 12, name: 'John Lewis Partnership Card',
                       start_amount: -980.5 }],
          target_amount: 0, start_amount: -980.5, current_manual: null,
          currency_code: 'USD', start_date: '2026-02-01', target_date: null,
          status: 'active', achieved_at: null, current_amount: -612.25,
          direction: 'paydown', progress: 0.3755,
          peak: { scale: 'cost', magnitude: null, unmeasured: true, band: null,
                  mountain: null, hardest_band: null, hardest_mountain: null,
                  apr: null } },
      ],
    })),
    /*
     * B12. The Goals page loads accounts to build its picker and its
     * "add another account" list, and without this handler that list is empty —
     * so the walk would capture the panel's explainer and never its stack of
     * full-width buttons, which is the widest thing on the page at 390px.
     *
     * `Barclaycard Rewards` is deliberately long: a name that fits at 1440 and
     * overflows at 390 is exactly what the responsive walk exists to catch, and
     * a fixture of short names cannot produce one.
     */
    /*
     * *** D-191: EVERY PROVENANCE STATE IS REPRESENTED HERE, OR THE WALK WOULD
     * MEASURE A PAGE THAT HAS THE NEW UI AND NEVER SHOWS IT. *** A page being in
     * the walk is not the walk seeing what changed (D-165) -- the accounts page
     * has been captured for months and would have rendered none of this, because
     * a fixture without `last_sync` / `type_source` / `import_source` produces
     * exactly the screen that shipped before.
     *
     * The four rows are the four states a real user can be in, and the amber and
     * red ones are the pairs worth measuring in both themes:
     *   7   connected, synced today          quiet
     *   9   connected, 23 days ago           AMBER, past the 7-day threshold
     *   11  connected, NEVER synced          RED, the worrying case
     *   12  manual                           silent — nothing to be stale about
     */
    http.get('*/api/v1/accounts', () => HttpResponse.json({
      success: true,
      accounts: [
        { id: 7, name: 'Chase Amazon', type: 'credit', balance: -1125.41,
          currency_code: 'USD', user_id: 'demo@finpal.app',
          import_source: 'simplefin', type_source: 'user',
          last_sync: new Date(Date.now() - 3 * 86400000).toISOString() },
        { id: 9, name: 'Barclaycard Rewards', type: 'credit', balance: -524.59,
          currency_code: 'USD', user_id: 'demo@finpal.app',
          import_source: 'simplefin', type_source: 'inferred',
          last_sync: new Date(Date.now() - 23 * 86400000).toISOString() },
        { id: 11, name: 'Marcus Online Savings Account', type: 'savings',
          balance: 8200, currency_code: 'USD', user_id: 'demo@finpal.app',
          import_source: 'simplefin', type_source: 'default', last_sync: null },
        // Goal 4's card. Long on purpose, same reason as Barclaycard above.
        { id: 12, name: 'John Lewis Partnership Card', type: 'credit',
          balance: -612.25, currency_code: 'USD', user_id: 'demo@finpal.app',
          import_source: null, type_source: 'user', last_sync: null },
      ],
    })),
    /*
     * C1c. *** THE GOALS PAGE REQUESTS THIS NOW, AND WITHOUT A HANDLER THE
     * WHOLE CAPTURE FAILS. *** MSW's `onUnhandledRequest: 'error'` raises, the
     * goals capture times out, and CI goes red -- which is precisely how this
     * was found: I ran the full vitest suite after adding the fetch and did NOT
     * re-run the walk captures, then pushed with SKIP_PREFLIGHT=1. CI was the
     * backstop, which is what it is for.
     *
     * *** POPULATED RATHER THAN A 404, BECAUSE A 404 WOULD CAPTURE NOTHING
     * NEW. *** The banner and the per-goal strips are new UI, and a page being
     * in the walk is not the walk seeing what changed (D-165). The strip's
     * lesson title is deliberately LONG: it has to be a string that fits at
     * 1440 and can overflow at 390.
     */
    /**
     * *** `recurring` AND `rules` HAD NO CAPTURE FILE AT ALL, SO NO WALK HAD
     * EVER RENDERED EITHER OF THEM. *** Recorded under D-103. They are also the
     * two pages the eightieth pass measured at **0px left padding** — content
     * flush against the side nav — which is a layout defect no gate could see
     * because neither page was in one.
     *
     * *** EVERY KEY BELOW WAS READ OFF THE LIVE DEMO BEFORE BEING WRITTEN. ***
     * `curl /api/v1/recurring`, `/recurring/detect`, `/transaction-rules` and
     * `/transaction-rules/stats` against `demo1`, and the shapes here are those
     * responses with the strings lengthened. **D-107 is what happens when a
     * fixture invents keys**: an investments fixture sent three the API never
     * sent, the page rendered `$NaN` eight times, and both gates called it clean.
     *
     * *** `/transaction-rules` HAS NO `success` KEY AND EVERY SIBLING DOES. ***
     * Checked, not assumed — the live response is a bare `{rules: [...]}`. A
     * fixture that added one would still work here (nothing reads it) and would
     * teach the next person the wrong shape.
     */
    http.get('*/api/v1/recurring', () => HttpResponse.json({
      success: true,
      recurring: [
        // Long descriptions on purpose: a name that fits at 1440 and overflows
        // at 390 is the entire point of the responsive walk, and a short
        // fixture cannot produce one (D-165).
        { id: 1, description: 'Rent for the flat, including the service charge',
          amount: 1200, frequency: 'monthly',
          start_date: '2026-03-15T20:43:51', end_date: null, last_created: null,
          active: true, category_id: null, account_id: null,
          transaction_type: 'expense', destination_account_id: null,
          card_used: 'Primary Checking', split_method: 'none',
          paid_by: 'alice@test.com', user_id: 'alice@test.com',
          currency_code: 'GBP', original_amount: null,
          category: null, account: null },
        { id: 2, description: 'Annual professional indemnity insurance premium',
          amount: 462.5, frequency: 'yearly',
          start_date: '2026-01-04T09:00:00', end_date: null,
          last_created: '2026-01-04T09:00:00',
          active: false, category_id: null, account_id: null,
          transaction_type: 'expense', destination_account_id: null,
          card_used: 'John Lewis Partnership Mastercard', split_method: 'none',
          paid_by: 'alice@test.com', user_id: 'alice@test.com',
          currency_code: 'GBP', original_amount: null,
          category: null, account: null },
        // *** `weekly`, BECAUSE THE GROUND CONVERTS IT AT 52/12 AND NOT AT 4. ***
        // A weekly 60 is 260 a month, not 240, and this page is where a user
        // sees the frequency that figure comes from.
        { id: 3, description: 'Weekly supermarket delivery slot', amount: 60,
          frequency: 'weekly', start_date: '2026-02-01T00:00:00', end_date: null,
          last_created: null, active: true, category_id: null, account_id: null,
          transaction_type: 'expense', destination_account_id: null,
          card_used: null, split_method: 'none', paid_by: 'alice@test.com',
          user_id: 'alice@test.com', currency_code: 'GBP',
          original_amount: null, category: null, account: null },
      ],
    })),
    http.get('*/api/v1/recurring/detect', () => HttpResponse.json({
      success: true,
      patterns: [{
        pattern_key: 'salary deposit_4500.00',
        description: 'Salary deposit from the employer payroll run',
        amount: 4500, currency_code: 'GBP', frequency: 'monthly',
        account_id: 1, category_id: 1, transaction_type: 'income',
        confidence: 0.95, occurrences: 2,
        last_date: '2026-08-26T00:00:00', next_date: '2026-09-26T00:00:00',
        start_date: '2026-07-27T00:00:00', avg_interval: 30,
        transaction_ids: [1, 2],
        transactions: [
          { id: 1, description: 'Salary Deposit', amount: 4500,
            date: '2026-07-27T00:00:00', currency_code: 'GBP',
            account_id: 1, category_id: 1, transaction_type: 'income' },
          { id: 2, description: 'Salary Deposit', amount: 4500,
            date: '2026-08-26T00:00:00', currency_code: 'GBP',
            account_id: 1, category_id: 1, transaction_type: 'income' },
        ],
      }],
    })),
    // No `success` key. That is the live shape.
    http.get('*/api/v1/transaction-rules', () => HttpResponse.json({
      rules: [
        { id: 1, name: 'Bank fees, overdraft charges and ATM withdrawals',
          pattern: '\\b(bank fee|service fee|monthly fee|overdraft|nsf|atm fee'
                 + '|foreign transaction)\\b',
          pattern_field: 'description', is_regex: true, case_sensitive: false,
          amount_min: null, amount_max: null, transaction_type_filter: null,
          auto_category_id: 144, auto_category: 'Bank Fees',
          auto_account_id: null, auto_account: null,
          auto_transaction_type: null, auto_tags: [], auto_notes: null,
          priority: 100, active: true, match_count: 214,
          last_matched: '2026-09-09T11:02:00',
          created_at: '2026-09-10T19:11:13', updated_at: '2026-09-10T19:11:13' },
        { id: 2, name: 'Groceries', pattern: 'sainsbury',
          pattern_field: 'description', is_regex: false, case_sensitive: false,
          amount_min: 5, amount_max: 400, transaction_type_filter: 'expense',
          auto_category_id: 4, auto_category: 'Food, drink and the weekly shop',
          auto_account_id: null, auto_account: null,
          auto_transaction_type: null, auto_tags: ['household'],
          auto_notes: 'Set automatically by a rule', priority: 50,
          active: false, match_count: 0, last_matched: null,
          created_at: '2026-09-10T19:11:13', updated_at: '2026-09-10T19:11:13' },
      ],
    })),
    http.get('*/api/v1/transaction-rules/stats', () => HttpResponse.json({
      success: true,
      stats: {
        total_rules: 52, active_rules: 51, inactive_rules: 1,
        total_matches: 214,
        most_used_rules: [
          { id: 1, name: 'Bank fees, overdraft charges and ATM withdrawals',
            match_count: 214, last_matched: '2026-09-09T11:02:00' },
          { id: 3, name: 'Investment dividends and interest income',
            match_count: 12, last_matched: '2026-09-01T08:00:00' },
        ],
      },
    })),
    /**
     * *** learnPal's HOME PAYLOAD, AND EVERY STRING IN IT IS DELIBERATELY LONG.
     * *** A name that fits at 1440 and overflows at 390 is the entire point of
     * the responsive walk, and a short fixture cannot produce one (D-165). So
     * the goal names and lesson titles here are as long as anything a real user
     * would type, and `fact` carries a full sentence because the card renders it.
     *
     * *** THE MOUNTAIN FACT IS SEEDED CONTENT AND IS QUOTED, NOT INVENTED. ***
     * Ben Nevis's summit observatory ran 1883-1904 and the sentence below is
     * the approved one from `seed_mountains.py`. A fixture that makes up a fact
     * teaches the walk to render a claim nobody checked, which is D-107's shape
     * one layer up: an investments fixture invented three keys and the page
     * drew `$NaN` eight times while both gates called it clean.
     */
    /**
     * *** THE WHOLE POINT OF THIS CAPTURE IS THE PANEL, NOT THE LIST. *** The
     * lesson reader is a `SlidePanel`, so a fixture alone measures nineteen
     * rows and none of `LessonBody` -- D-165 exactly, and the same miss the
     * `recurring` case above records. The drive below opens one.
     *
     * *** THE ROWS AND THE PROSE ARE THE REAL ONES. *** Titles come from
     * `seed.py` and the body is `a-starter-buffer`'s approved draft, verbatim,
     * because this walk exists to measure a paragraph of real length wrapping
     * at 390px and a fixture sentence cannot make one (D-107's inverse: a
     * fixture kinder than the data hides what the data does). The longest title
     * in the list, "When consolidating helps, and when it doesn't", is likewise
     * the seeded one rather than a padded string.
     *
     * Six of nineteen are `earned` so both states are on screen: the rows that
     * offer a Read button and the rows that show an unlock caption.
     */
    http.get('*/api/v1/learnpal/lessons', () => HttpResponse.json({
      success: true,
      read: 6,
      total: 19,
      lessons: [
      { slug: 'what-a-goal-tracks', title: 'What a goal tracks', gear_slug: 'map',
        surface: 'setup', applies_to_direction: null,
        unlock_at_progress: null, earned: true, has_body: true },
      { slug: 'where-your-money-goes', title: 'Where your money goes', gear_slug: 'boots',
        surface: 'mountain', applies_to_direction: null,
        unlock_at_progress: null, earned: true, has_body: true },
      { slug: 'a-starter-buffer', title: 'The rope you tie on first', gear_slug: 'rope',
        surface: 'mountain', applies_to_direction: null,
        unlock_at_progress: 0.1, earned: true, has_body: true },
      { slug: 'what-your-apr-costs', title: 'What your APR actually costs', gear_slug: 'headlamp',
        surface: 'mountain', applies_to_direction: 'paydown',
        unlock_at_progress: 0.0, earned: true, has_body: true },
      { slug: 'why-minimums-barely-move-it', title: 'Why the minimum barely moves it', gear_slug: 'ice-axe',
        surface: 'mountain', applies_to_direction: 'paydown',
        unlock_at_progress: 0.15, earned: true, has_body: true },
      { slug: 'utilisation-and-your-score', title: 'Utilisation, and what it touches', gear_slug: 'gloves',
        surface: 'mountain', applies_to_direction: null,
        unlock_at_progress: null, earned: true, has_body: true },
      { slug: 'avalanche-vs-snowball', title: 'Avalanche or snowball', gear_slug: 'compass',
        surface: 'mountain', applies_to_direction: 'paydown',
        unlock_at_progress: 0.25, earned: false, has_body: true },
      { slug: 'fixed-vs-flexible', title: 'Fixed, flexible, and the ones that are neither', gear_slug: 'trekking-poles',
        surface: 'setup', applies_to_direction: null,
        unlock_at_progress: null, earned: false, has_body: true },
      { slug: 'income-vs-what-lands', title: 'Income vs what lands', gear_slug: 'pack-scale',
        surface: 'mountain', applies_to_direction: null,
        unlock_at_progress: null, earned: false, has_body: true },
      { slug: 'debt-to-income', title: 'Debt to income', gear_slug: 'slope-gauge',
        surface: 'mountain', applies_to_direction: null,
        unlock_at_progress: null, earned: false, has_body: true },
      { slug: 'when-consolidating-helps-and-when-it-doesnt', title: 'When consolidating helps, and when it doesn\'t', gear_slug: 'carabiner',
        surface: 'mountain', applies_to_direction: null,
        unlock_at_progress: null, earned: false, has_body: true },
      { slug: 'why-a-buffer-comes-first', title: 'Why a buffer comes first', gear_slug: 'bivvy',
        surface: 'mountain', applies_to_direction: null,
        unlock_at_progress: null, earned: false, has_body: true },
      { slug: 'how-much-is-enough', title: 'How much is enough', gear_slug: 'water-bottle',
        surface: 'mountain', applies_to_direction: 'accumulate',
        unlock_at_progress: 0.5, earned: false, has_body: true },
      { slug: 'sinking-funds', title: 'Sinking funds', gear_slug: 'cache',
        surface: 'mountain', applies_to_direction: null,
        unlock_at_progress: null, earned: false, has_body: true },
      { slug: 'paying-yourself-first', title: 'Paying yourself first', gear_slug: 'alpine-start',
        surface: 'mountain', applies_to_direction: null,
        unlock_at_progress: null, earned: false, has_body: true },
      { slug: 'what-inflation-does-to-cash', title: 'What inflation does to cash', gear_slug: 'thermometer',
        surface: 'mountain', applies_to_direction: 'accumulate',
        unlock_at_progress: 0.75, earned: false, has_body: true },
      { slug: 'when-to-stop-saving-and-start-paying-down', title: 'When to stop saving and start paying down', gear_slug: 'signpost',
        surface: 'mountain', applies_to_direction: null,
        unlock_at_progress: null, earned: false, has_body: true },
      { slug: 'insurance-as-risk-transfer', title: 'Insurance as risk transfer', gear_slug: 'helmet',
        surface: 'mountain', applies_to_direction: null,
        unlock_at_progress: 0.9, earned: false, has_body: true },
      { slug: 'what-finpal-cannot-tell-you', title: 'What finPal cannot tell you', gear_slug: 'guidebook',
        surface: 'mountain', applies_to_direction: null,
        unlock_at_progress: null, earned: false, has_body: true },
      ],
    })),
    http.get('*/api/v1/learnpal/lessons/:slug', ({ params }) => HttpResponse.json({
      success: true,
      lesson: {
        slug: params.slug, title: 'The rope you tie on first',
        gear_slug: 'rope', surface: 'mountain', earned: true, locked: false,
        body_md: LESSON_BODY,
      },
    })),
    http.get('*/api/v1/learnpal/stats', () => HttpResponse.json({
      success: true,
      stats: {
        /*
         * *** `without_body: 5` IS NO LONGER WHAT A SEEDED STACK REPORTS, AND
         * IS KEPT DELIBERATELY. *** C1d filled all nineteen bodies, so a fresh
         * install answers 0 and Home's "N have no write-up yet" note does not
         * render at all. The note is still reachable — a milestone can ship
         * ahead of its write-up, and four lessons are deliberately unwritten —
         * and a walk that only ever captured the zero case would measure a
         * string this page can still draw at no width. `total: 8` is likewise
         * a smaller set than the seeder holds; this fixture measures the
         * LAYOUT of the tile, and `learnpal-lessons` captures the real rows.
         */
        lessons: { read: 3, total: 8, without_body: 5 },
        gear: { earned: 3, total: 8 },
        highest: {
          band: 3, band_total: 6,
          mountain: {
            slug: 'mount-rainier', name: 'Mount Rainier', elevation_m: 4392,
            fact: 'Rainier carries more glacier ice than any other peak in the '
                + 'lower 48 states.',
            summit_note: 'You stood on the hardest one you ever faced.',
          },
          goal_id: 1,
          goal_name: 'Clear the John Lewis Partnership Mastercard before the '
                   + 'balance transfer offer expires',
          goal_status: 'archived',
        },
        recent: [
          { slug: 'what-your-apr-costs',
            title: 'What your APR actually costs you every single month',
            gear_slug: 'headlamp', has_body: true, verified_by: 'read',
            unlocked_at: '2026-09-02T08:14:00',
            goal_id: 1,
            goal_name: 'Clear the John Lewis Partnership Mastercard before the '
                     + 'balance transfer offer expires' },
          // *** NO GOAL NAME, ON PURPOSE. *** A predicate-gated lesson has none,
          // and the FK is SET NULL, so "unlocked by None" is the string this
          // fixture exists to make impossible to ship.
          { slug: 'where-your-money-goes',
            title: 'Where your money actually goes, once you look at it properly',
            gear_slug: 'boots', has_body: false, verified_by: 'read',
            unlocked_at: '2026-08-28T19:02:00',
            goal_id: null, goal_name: null },
        ],
        next: [
          { slug: 'avalanche-vs-snowball',
            title: 'Avalanche or snowball, and which one clears it sooner',
            gear_slug: 'compass', surface: 'mountain', has_body: false,
            unlock_at_progress: 0.25, applies_to_direction: 'paydown',
            gate: 'altitude',
            reason: 'Reach 25% on Clear the John Lewis Partnership Mastercard '
                  + 'before the balance transfer offer expires',
            goal_id: 1,
            goal_name: 'Clear the John Lewis Partnership Mastercard before the '
                     + 'balance transfer offer expires',
            goal_progress: 0.1812 },
          { slug: 'utilisation-and-your-score',
            title: 'Utilisation, and what it actually touches',
            gear_slug: 'gloves', surface: 'mountain', has_body: false,
            unlock_at_progress: null, applies_to_direction: null,
            gate: 'check',
            reason: 'Get your card utilisation below 30%',
            goal_id: null, goal_name: null, goal_progress: null },
          // *** `reason: null` IS A REAL STATE AND IS IN THE FIXTURE. *** The
          // server is fail-closed for a `check_type` this build does not
          // implement, so the page must render "we cannot say" rather than
          // printing nothing or `null`.
          { slug: 'what-finpal-cannot-tell-you',
            title: 'What finPal cannot tell you, and where to ask instead',
            gear_slug: 'guidebook', surface: 'mountain', has_body: false,
            unlock_at_progress: null, applies_to_direction: null,
            gate: null, reason: null,
            goal_id: null, goal_name: null, goal_progress: null },
        ],
      },
    })),
    http.get('*/api/v1/learnpal/range', () => HttpResponse.json({
      success: true,
      range: {
        cost: {
          heading: "What's costing you", unit: 'a month, in interest',
          total: 312.5,
          peaks: [{
            goal_id: 1, name: 'Clear the John Lewis Partnership Mastercard',
            currency_code: 'USD', progress: 0.7272, status: 'active',
            peak: { scale: 'cost', magnitude: 312.5, unmeasured: false, band: 5,
                    mountain: { slug: 'everest', name: 'Everest',
                                elevation_m: 8849, fact: null, summit_note: null },
                    hardest_band: 5,
                    hardest_mountain: { slug: 'everest', name: 'Everest',
                                        elevation_m: 8849, fact: null,
                                        summit_note: null },
                    apr: null },
            strip: {
              read: 3, total: 4,
              next: { slug: 'avalanche-vs-snowball',
                      title: 'Avalanche or snowball, and which clears it sooner',
                      unlock_at_progress: 0.25, gear_slug: 'compass' },
              gear: [
                { slug: 'headlamp', milestone_slug: 'what-your-apr-costs',
                  title: 'What your APR actually costs', earned: true },
                { slug: 'ice-axe', milestone_slug: 'why-minimums-barely-move-it',
                  title: 'Why the minimum barely moves it', earned: true },
                { slug: 'rope', milestone_slug: 'a-starter-buffer',
                  title: 'The rope you tie on first', earned: true },
                { slug: 'compass', milestone_slug: 'avalanche-vs-snowball',
                  title: 'Avalanche or snowball', earned: false },
              ],
            },
          }],
        },
        build: {
          heading: "What you're building", unit: 'still to save', total: 6000,
          peaks: [{
            goal_id: 2, name: 'Emergency fund', currency_code: 'USD',
            progress: 0.3333, status: 'active',
            peak: { scale: 'build', magnitude: 6000, unmeasured: false, band: 3,
                    mountain: { slug: 'mount-rainier', name: 'Mount Rainier',
                                elevation_m: 4392, fact: null, summit_note: null },
                    hardest_band: 3,
                    hardest_mountain: { slug: 'mount-rainier',
                                        name: 'Mount Rainier', elevation_m: 4392,
                                        fact: null, summit_note: null },
                    apr: 24.99 },
            strip: { read: 0, total: 2, next: null, gear: [] },
          }],
        },
        ground: { total: 1623, recurring: 1588, minimums: 35 },
        lessons: { read: 3, total: 8 },
        kit: [],
      },
    })),
    http.get('*/api/v1/goals/1/contributions', () => HttpResponse.json({
      success: true, currency_code: 'USD',
      contributions: [
        { user_id: 'harun@test.com', display_name: 'Harun', amount: 400, imported: false },
        { user_id: 'rachel@test.com', display_name: 'Rachel', amount: 300, imported: true },
      ],
    })),
    /**
     * *** THE BUDGETS PAGE WAS ALREADY IN THE WALK, WHICH IS NOT THE SAME AS THE
     * WALK SEEING THE SPENDING GROUPS. *** D-165. The old fixture had three flat
     * budgets named 'Groceries', 'Bills' and 'Fun' and no `groups` key at all, so
     * the page would render its empty-list branch and both walks would report a
     * page that contains none of their subjects.
     *
     * *** THE NAMES ARE DELIBERATELY LONG. *** A category name that fits at 1440
     * and overflows at 390 is the entire point of the responsive walk, and a
     * fixture full of six-letter words cannot produce one. These are the widest
     * strings the page can hold: a long name, beside a group control, beside
     * three money figures.
     *
     * The states most likely to be styled carelessly are all present on purpose:
     * an OVERSPENT flexible group (negative remaining in clay), an EMPTY
     * non-monthly group, a FIXED card that reports instead of scoring, and an
     * Unsorted section with two categories and their controls.
     */
    /**
     * *** THE CATEGORY SCREEN WAS NEVER IN THE WALK AT ALL. *** Not "captured
     * without the new control" -- absent, so neither walk had ever measured a
     * page that has shipped for as long as the app has. The spending-group
     * control lands there (spec §1 decision 3), which is what surfaced it.
     *
     * Long names on purpose: a category name sits beside a `<select>` and two
     * icon buttons on one row, which is the narrowest thing on this page and
     * the first to overflow at 390.
     */
    http.get('*/api/v1/categories/', () => HttpResponse.json({ categories: WALK_CATEGORIES })),
    http.get('*/api/v1/categories', () => HttpResponse.json({ categories: WALK_CATEGORIES })),
    http.get('*/api/v1/budgets/overview', () => HttpResponse.json({
      success: true,
      total_budget: 2000, total_spent: 1450, total_remaining: 550, percentage_used: 72,
      budget_count: 3,
      budgets: [
        budgetWalkRow(1, 'Rent, service charge and ground rent for the flat', 1300, 1300),
        budgetWalkRow(2, 'Groceries, household supplies and the corner shop', 500, 723),
        budgetWalkRow(3, 'Presents, birthdays and seasonal giving', 200, 60),
      ],
      groups: [
        { spending_type: 'fixed', label: 'Fixed', planned: 1300, actual: 1300, remaining: 0,
          budgets: [budgetWalkRow(1, 'Rent, service charge and ground rent for the flat', 1300, 1300)] },
        { spending_type: 'flexible', label: 'Flexible', planned: 500, actual: 723, remaining: -223,
          budgets: [budgetWalkRow(2, 'Groceries, household supplies and the corner shop', 500, 723)] },
        // Deliberately EMPTY: the group still renders, and its empty state is a
        // full-width line of prose that nothing else on the page produces.
        /*
         * Deliberately EMPTY: the group still renders, and its empty state is a
         * full-width line of prose that nothing else on the page produces.
         *
         * *** AND A KNOWN GAP, STATED RATHER THAN LEFT TO BE FOUND: *** the
         * "No pace mark — not a monthly thing" sentence therefore has NO row to
         * render on, so this walk does not measure it. Giving the group a row
         * was tried and the row did not render — the group HEADER took the
         * fixture's figures (£462.50, "1 budget") while the card never appeared,
         * and the cause was not worth chasing further here.
         *
         * The sentence IS gated: `BudgetGroups.test.tsx` asserts both wordings
         * behaviourally. And its colour pair is already covered — it uses
         * `fp-hint`, which this same capture measures many times over. So what
         * is missing is a second measurement of an already-measured pair, not
         * an unmeasured one.
         */
        { spending_type: 'non_monthly', label: 'Non-Monthly', planned: 0, actual: 0, remaining: 0,
          budgets: [] },
      ],
      unsorted: {
        count: 2,
        actual: 241.99,
        categories: [
          { id: 901, name: 'Gym membership and physiotherapy appointments', actual: 229.99 },
          { id: 902, name: 'Monthly bank account maintenance fee', actual: 12 },
        ],
        budget_count: 0,
        budgets: [],
      },
      totals: { planned: 2000, actual: 2083, remaining: -83 },
      income: 4200,
      left_to_budget: 2200,
      // Day 23 of 31 — deliberately NOT today, so a client deriving its own
      // date could not produce the same mark by coincidence.
      pace: { fraction: 0.7419, day: 23, days_in_month: 31, as_of: '2026-08-23' },
      // *** D-189's SECTION, WITH A LONG NAME ON PURPOSE. *** Income renders
      // above the expense groups with DIFFERENT column names, and both the
      // headings and the "no pace mark" sentence are new text with their own
      // colour pairs. A fixture without this measures a page that has the
      // section and never shows it (D-165).
      income_section: {
        planned: 4500, received: 1500, still_to_come: 3000,
        budgets: [budgetWalkRow(9, 'Salary from the main employer, paid monthly', 4500, 1500)],
      },
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
const WALK_CATEGORIES = [
  { id: 1, name: 'Housing, rent and everything the landlord bills for', icon: '🏠',
    color: '#3498db', parent_id: null, is_system: false, spending_type: 'fixed' },
  { id: 2, name: 'Home maintenance and occasional emergency repairs', icon: '🔧',
    color: '#3498db', parent_id: 1, is_system: false, spending_type: 'non_monthly' },
  { id: 3, name: 'Buildings and contents insurance', icon: '🛡️',
    color: '#3498db', parent_id: 1, is_system: false, spending_type: null },
  { id: 4, name: 'Food, drink and the weekly supermarket run', icon: '🍽️',
    color: '#e74c3c', parent_id: null, is_system: false, spending_type: 'flexible' },
  { id: 5, name: 'Gym membership and physiotherapy appointments', icon: '💪',
    color: '#1abc9c', parent_id: null, is_system: false, spending_type: null },
  { id: 6, name: 'Other', icon: '❓',
    color: '#95a5a6', parent_id: null, is_system: true, spending_type: null },
];

/*
 * *** THIS FIXTURE USED TO BE MORE GENEROUS THAN THE API, AND THAT IS WHY THE
 * WALK NEVER CAUGHT D-192. *** It sent `name`, `category_name` AND
 * `category.name` all populated with the same string, so a heading reading ANY
 * of the three rendered fine. The real `GET /budgets/overview` sends
 * `name: null` and the category name NESTED — there is no `category_name` key
 * on a grouped row at all — so on the live demo all four budgets rendered an
 * EMPTY `<h2>` while this capture showed them correctly named.
 *
 * A fixture that invents keys is D-107 (an investments fixture sent three the
 * API never sent and the page drew `$NaN` eight times); a fixture that sends
 * MORE than the API is the same mistake pointing the other way, and it hides
 * bugs instead of inventing them. The keys below were read off the live demo.
 */
const budgetWalkRow = (id: number, name: string, amount: number, spent: number) => ({
  id,
  // `null`, as the API sends for a budget nobody has separately labelled.
  name: null,
  amount, spent,
  remaining: amount - spent,
  percentage: amount > 0 ? (spent / amount) * 100 : 0,
  category_id: id + 100,
  // NO `category_name`. The API does not send one on a grouped row; the flat
  // list's enricher BUILDS it, which is exactly the asymmetry D-192 lived in.
  category: { id: id + 100, name, icon: '\u{1F4C1}', color: '#6c757d' },
  period: 'monthly',
  is_active: true,
  // *** THE WALK MUST SEE BOTH PACE STATES OR IT MEASURES NEITHER. *** A
  // fixture where every row applies would never render the "no pace mark"
  // sentence, and that sentence is new text with its own colour pair.
  pace_applies: true,
});

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
       *
       * *** AND THAT LIST WAS ITSELF INCOMPLETE — `cost_basis` AND `last_update`
       * ARE ALSO SENT, AND WERE MISSING HERE UNTIL 2026-09-15. *** Re-read from
       * the deployed payload, the holding keys are: `cost_basis`,
       * `current_price`, `current_value`, `gain_loss`, `gain_loss_percentage`,
       * `id`, `industry`, `last_update`, `name`, `notes`, `portfolio`,
       * `portfolio_id`, `purchase_date`, `purchase_price`, `sector`, `shares`,
       * `symbol`, `transactions`. Their absence was the SAME defect this comment
       * describes, one field further on: `holdingTotals` refuses a holding whose
       * `cost_basis` it cannot read, so all three rows landed in "not counted
       * above" and both walks would have measured a page reporting $0.00 —
       * an error state that has a contrast ratio and does not overflow.
       *
       * `cost_basis` here is `shares * purchase_price`, which is what the server
       * computes (`src/models/investment.py`, `@property`), and each one
       * reconciles with this fixture's own `gain_loss`: 25452-20664=4788,
       * 13494-10092=3402, 9275.2-7282=1993.2. Not invented — derived, then
       * checked against a figure that was already here.
       *
       * `last_update` has NO timezone suffix on purpose. That is the shape the
       * API sends, and it is what `lastPriceUpdate` has to read as UTC rather
       * than as local time.
       */
      holdings: [
        { id: 1, symbol: 'VWRP', name: 'Vanguard FTSE All-World Acc', shares: 210,
          purchase_price: 98.4, current_price: 121.2, current_value: 25452,
          cost_basis: 20664, gain_loss: 4788, gain_loss_percentage: 23.2,
          last_update: '2026-09-16T04:09:22.458182', portfolio_id: 1 },
        { id: 2, symbol: 'AAPL', name: 'Apple Inc.', shares: 60, purchase_price: 168.2,
          current_price: 224.9, current_value: 13494, cost_basis: 10092,
          gain_loss: 3402, gain_loss_percentage: 33.7,
          last_update: '2026-09-16T04:09:22.631104', portfolio_id: 1 },
        { id: 3, symbol: 'MSFT', name: 'Microsoft Corporation', shares: 22,
          purchase_price: 331.0, current_price: 421.6, current_value: 9275.2,
          cost_basis: 7282, gain_loss: 1993.2, gain_loss_percentage: 27.4,
          last_update: '2026-09-16T04:09:22.702551', portfolio_id: 1 },
      ],
    })),
    /*
     * *** THE REVIEW PAGE, WITH DELIBERATELY LONG STRINGS. ***
     *
     * A row here is a long name, a sentence of reasoning, a `<select>` and a
     * green button, all on one line — the widest row this app produces outside a
     * table, and the only place a green button sits directly beside a form
     * control. Short fixtures cannot make one: a name that fits at 1440 and
     * overflows at 390 is the entire point of the responsive half of this walk,
     * and D-165 is what happens when the fixture is comfortable.
     *
     * Every section is non-empty on purpose. The page renders NOTHING for a
     * section whose count is zero — that is deliberate, so the empty state is a
     * single card rather than three bare headings — which means a fixture with
     * one populated section would silently capture two thirds less page than
     * ships.
     */
    http.get('*/api/v1/review', () => HttpResponse.json({
      total: 5,
      counts: { categories: 2, accounts: 1, uncategorised: 2 },
      sections: {
        categories: {
          action: 'confirm',
          rows: [
            { id: 31, name: 'Gym, swimming and other fitness memberships',
              parent_name: 'Health & Wellbeing', spending_type: 'fixed',
              reason: 'finPal sorted this by its name. Whether it is fixed or '
                    + 'flexible depends on you — a gym contract is fixed, '
                    + 'pay-as-you-go is not.' },
            { id: 32, name: 'Subscriptions', parent_name: null,
              spending_type: 'flexible',
              reason: 'finPal sorted this by its name. Whether it is fixed or '
                    + 'flexible depends on you — a gym contract is fixed, '
                    + 'pay-as-you-go is not.' },
          ],
        },
        accounts: {
          action: 'confirm',
          rows: [
            { id: 9, name: 'Barclaycard Rewards Platinum Everyday', type: 'credit',
              balance: -524.59,
              reason: 'Your bank did not say what kind of account this is, so '
                    + 'finPal read it from the balance and the name.' },
          ],
        },
        uncategorised: {
          action: 'choose',
          rows: [
            /*
             * *** FULL ISO TIMESTAMPS, BECAUSE THAT IS WHAT THE SERVER SENDS. ***
             * Captured from the live demo: `"2026-09-01T07:46:39.847799"`.
             * This fixture first carried bare `'2026-09-09'` dates, which is the
             * fixture being more comfortable than reality — and it hid the page
             * rendering the raw timestamp, microseconds and all, through a whole
             * deploy. A fixture that cannot produce the real case cannot catch
             * the real defect (D-165).
             */
            { id: 501, description: 'SAINSBURYS S/MKTS 0123 LONDON GB',
              amount: 82.14, currency_code: 'GBP',
              date: '2026-09-09T18:42:11.104233',
              transaction_type: 'expense' },
            { id: 502, description: 'TFL TRAVEL CHARGE', amount: 6.8,
              currency_code: 'GBP', date: '2026-09-08T07:03:59.771820',
              transaction_type: 'expense' },
          ],
        },
      },
    })),
    /* Kit's wallet. `balance` is deliberately BELOW the cheapest unowned
       price: the savings bar only draws for a piece you cannot yet afford, and
       a fixture that can afford everything captures the page without it —
       which is how the "7,853 / 200" defect recorded in `Kit.tsx` survived
       every test that had one. */
    http.get('*/api/v1/coins', () => HttpResponse.json({
      earned: 940,
      balance: 140,
      /* *** BOTH HALVES OF THE SPLIT, OR THE WALK MEASURES ONE OF THEM. ***
         The kit files earned acts and unearned ones under two headings
         (FINPAL-30), and a fixture where everything is earned captures the page
         with the second section absent — the same shape as the savings-bar
         defect above. `taught_a_rule` deliberately carries no `open` flag: an
         act that arrives without it must still be drawn. */
      acts: [
        { slug: 'classify', title: 'Classified a month of spending', coins: 300, sentence: null, open: false },
        { slug: 'budget', title: 'Covered your spending with budgets', coins: 240, sentence: null, open: false },
        { slug: 'has_a_goal', title: 'Name what you are working toward', coins: 0, sentence: null, open: true },
        { slug: 'taught_a_rule', title: 'Teach finPal a rule', coins: 0, sentence: null },
      ],
      gear: [
        { slug: 'boots', price: 100, owned: true },
        { slug: 'compass', price: 120, owned: true },
        { slug: 'rope', price: 200, owned: false },
        { slug: 'tent', price: 350, owned: false },
        /* Real slugs only. All 21 have both art and an emoji fallback
           (checked), and an invented slug would render the fallback's blank —
           a fixture that cannot draw the art cannot notice when the art
           breaks. */
        { slug: 'headlamp', price: 500, owned: false },
      ],
    })),

    // ── the six surfaces added 2026-09-16 ──────────────────────────────────
    /*
     * *** THE GROUP FIXTURE CARRIES `expense_count`, AND THAT FIELD IS THE
     * POINT. *** The walk fixture for holdings once omitted `cost_basis`, so
     * both browser gates measured an Investments page reporting $0.00 — a page
     * in a defect's own shape, reported green. GroupDetail's head now shows
     * "Recorded: N expenses" from `expense_count`, and the settlement from
     * `simplified_debts` with BOTH ids: a fixture missing the ids would make
     * `settlementFor` refuse the group and capture the "this server does not
     * say who owes whom" state, which is a real state and not the one being
     * designed.
     *
     * The amount is `178.02` on purpose — the figure from the live demo that
     * disagreed with the members list's 178.03 (D-235).
     */
    http.get('*/api/v1/groups/1', () => HttpResponse.json({
      group: {
        id: 1, name: 'Apartment Roommates',
        description: 'Shared apartment expenses',
        created_by: 'alice@test.com',
        default_split_method: 'equal', default_payer: null,
        auto_include_all: false,
        expense_count: 2,
        members: [
          { id: 'alice@test.com', name: 'Alice', email: 'alice@test.com',
            balance: -178.025 },
          { id: 'jordan@test.com', name: 'Jordan Demo',
            email: 'jordan@test.com', balance: 178.025 },
        ],
      },
    })),
    http.get('*/api/v1/groups/1/balances', () => HttpResponse.json({
      balances: [{
        from: 'Alice', to: 'Jordan Demo',
        from_id: 'alice@test.com', to_id: 'jordan@test.com',
        amount: 178.02,
      }],
    })),
    /*
     * *** ZERO ROWS, WHICH IS THE LIVE BEHAVIOUR AND THE WHOLE OF D-236. ***
     * `/transactions/?group_id=1` returns nothing on the demo while the group
     * has two expenses. Returning rows here would capture a page nobody has,
     * and would hide the honest empty state this pass wrote.
     */
    http.get('*/api/v1/transactions/', () =>
      HttpResponse.json({ transactions: [] })),
    /*
     * Demo mode ON, so Login is captured in the state a visitor to the public
     * demo actually sees — the personas are the widest content in its form
     * column and the reason its layout was two different widths.
     */
    http.get('*/api/v1/demo/status', () => HttpResponse.json({
      enabled: true, timeout_minutes: 120,
    })),
    http.get('*/api/v1/demo/accounts', () => HttpResponse.json([
      { email: 'demo1@finpal.demo', name: 'Alex Demo', password: 'x',
        currency: 'USD', persona: 'personal finances' },
      { email: 'demo2@finpal.demo', name: 'Morgan Demo', password: 'x',
        currency: 'EUR', persona: 'international spending' },
      { email: 'demo3@finpal.demo', name: 'Jordan Demo', password: 'x',
        currency: 'USD', persona: 'group expenses' },
      { email: 'demo4@finpal.demo', name: 'Taylor Demo', password: 'x',
        currency: 'GBP', persona: 'investments' },
    ])),
  );
});

/**
 * `drive` runs after the page has settled, for pages whose measurable layout only
 * exists after an interaction. BestCard's `<RecommendTable>` — one of the five real
 * `<table>` elements Tier 3 covers — is behind a form submit, so capturing the page
 * as it first paints captures the empty state and measures nothing.
 */
/**
 * A fourth element, `entry`, for the pages that read the URL.
 *
 * *** SIX SURFACES CHANGED ON 2026-09-16 AND THIS WALK COULD SEE NONE OF THEM.
 * *** `captured/` held eighteen pages and not one of them was `/groups/:id`,
 * the 404, or any of the five pre-auth screens — so a redesign of all of those
 * could be reported "walks green" having been measured nowhere. That is the
 * gate-coverage failure this repo keeps paying for: a walk's scope list is a
 * lower bound on what it can notice, and nothing in the walk says what it is
 * blind to.
 *
 * `/groups/:id` needs a real id in the path, and `ResetPassword` bounces to
 * `/login` without a `token` and an `email` in the query, so those two are
 * rendered through a `<Routes>` at a concrete URL rather than as a bare
 * component at `/`.
 */
type Case = [
  string,
  React.FC,
  ((c: HTMLElement) => Promise<void>)?,
  { pattern: string; url: string }?,
  /**
   * The element floor for THIS page, when 50 is the wrong number for it.
   *
   * *** THE 50 FLOOR EXISTS TO CATCH A STUB, AND ON A SMALL PAGE IT CATCHES THE
   * PAGE. *** It was set when every scope was a data-dense app page: the
   * Investments capture once raced its fetch and serialized a two-element stub,
   * and a stub overflows nowhere and has no contrast pairs, so both walks
   * reported it clean. 50 is a good floor for a table of holdings.
   *
   * It is a bad floor for a 404. `NotFound` renders nine elements when it is
   * COMPLETE — a panel, a figure, a heading, a sentence, two destinations and a
   * ridge — and ForgotPassword is twenty-four with every field present. Given
   * as a per-page number with a reason rather than by lowering the shared
   * floor, because lowering it would blind the guard on the eighteen pages it
   * was written for.
   */
  number?,
];

const cases: Case[] = [
  /* *** DRIVEN, OR THE PEAK DETAIL IS MEASURED NOWHERE. *** The range's
     captions moved behind hover/focus/tap on 2026-09-19, so the popover — a
     panel with its own background, drawn ON TOP of a mountain — simply does
     not exist in an undriven capture. That is D-165's shape: a page being in
     the walk is not the walk seeing your change. Focus rather than hover,
     because jsdom's pointer events do not drive a CSS-less SVG reliably and
     focus is the path the keyboard takes anyway. */
  ['dashboard', Dashboard as React.FC, async (container: HTMLElement) => {
    await screen.findByText('Your range');
    const peak = container.querySelector<SVGGElement>('g[role="button"][aria-expanded]');
    if (!peak) throw new Error('dashboard: no focusable peak — the range drew no label');
    fireEvent.focus(peak);
    if (peak.getAttribute('aria-expanded') !== 'true') {
      throw new Error('dashboard: focusing a peak did not open it');
    }
    /* Looked for `g[aria-expanded="true"] rect` until 2026-09-19 and went red
       the moment the panel stopped being a child of its own peak — which is
       the fix for it painting under every label drawn after it. The panel is
       the SVG's last child now, so it is found on the SVG, not on the peak. */
    if (!container.querySelector('svg rect[rx="7"]')) {
      throw new Error('dashboard: focusing a peak drew no detail panel');
    }
  }],
  /**
   * *** THE SIX SCOPES ADDED 2026-09-16, ALL OF WHICH WERE REDESIGNED WHILE
   * INVISIBLE TO BOTH WALKS. *** Grouped here rather than scattered, because
   * the useful fact about them is that they are a set: `/groups/:id`, the new
   * 404, and the five pre-auth screens. `AuthShell` paints more pre-auth pixels
   * than any of the pages does, and until this list grew, nothing in either
   * walk had ever rendered it.
   */
  ['groupdetail', GroupDetail as React.FC, undefined,
    { pattern: '/groups/:id', url: '/groups/1' }],
  /**
   * *** THE SIDEBAR, WHICH IS NOT A PAGE AND HELD TWO AA FAILURES. ***
   * Every capture here renders a page component ALONE, without `AppLayout`, so
   * the rail — on screen on all 21 signed-in routes — had never been measured
   * by either walk. Reported by the owner as "on the sidenav the look like its
   * disabled", and it was: the module rows were 2.13:1 and the section headings
   * 1.52:1 in light.
   *
   * Captured with its module sections EXPANDED. Collapsed is the default for a
   * new visitor and it hides the sub-links entirely, which is exactly the shape
   * of capture that measures a page it is not looking at.
   */
  ['analytics-flow', FlowChartFixture],
  ['analytics-compare', CompareChartFixture],
  /* The dashboard a NEW user sees. Captured as the component because the
     dashboard scope is seeded with goals — and a state only a brand-new
     account reaches is exactly the one nothing else renders. D-77's lesson:
     an empty demo hid three defects. */
  ['dashboard-empty-range', EmptyRangeFixture, undefined, undefined, 6],
  /* *** KIT HAD NEVER BEEN IN THE WALK EITHER. *** It is a sidebar route every
     user can reach, and it was redesigned on 2026-09-16 without a single
     measured pixel behind it. Captured with a MIXED wallet — owned and unowned
     gear, and a balance that cannot afford the cheapest remaining piece, which
     is the only state that renders the savings bar. */
  ['kit', Kit as React.FC],
  ['sidebar', SidebarOpen, async () => {
    // Both module headers, by name — clicking by index would silently click
    // the same row twice if the registry order changed.
    for (const label of ['pointsPal', 'learnPal']) {
      const row = await screen.findByText(label);
      await userEvent.click(row);
    }
    // A nav-link label, not a page heading: 'Redemption Optimizer' is what
    // /pointspal/redeem is TITLED, and the rail says 'Redeem'. Waiting on the
    // wrong string made this capture fail rather than pass quietly, which is
    // the right direction — but it is the same class of mistake as guessing a
    // heading from a route (MODULE_HEADINGS in every-page.spec.ts).
    await screen.findByText('Redeem');
    await screen.findByText('Your range');
  }, undefined, 40],
  // Nine elements is this page COMPLETE: a panel, the figure, a heading, a
  // sentence, two destinations and the unmeasured ridge. See `Case`'s `floor`.
  ['notfound', NotFound as React.FC, undefined,
    { pattern: '*', url: '/a-link-that-went-stale' }, 8],
  /*
   * The pre-auth screens are dark in BOTH themes and use no CSS variables, so
   * the walk will measure two identical captures — and that is exactly the
   * assertion worth having: a `var(--…)` leaking into one of these files would
   * resolve to LIGHT values on a background that never changes, which is the
   * 3.00:1 defect `authPagesUseBrandColours.test.ts` was written for. The walk
   * resolves colours against their ACTUAL background, so it can see that where
   * a source scan cannot.
   */
  ['login', Login as React.FC],
  ['register', Register as React.FC],
  // One field and one button, which is the whole screen. 24 when complete.
  ['forgot-password', ForgotPassword as React.FC, undefined, undefined, 22],
  /*
   * `ResetPassword` navigates to `/login` without both query params — captured
   * without them, this scope would serialize whatever `/login` renders under a
   * file named `reset-password.html`, which is worse than not capturing it.
   */
  // Two fields, two reveal toggles and a button. 35 when complete.
  ['reset-password', ResetPassword as React.FC, undefined,
    { pattern: '/reset-password', url: '/reset-password?token=walk&email=demo1%40finpal.demo' },
    32],
  /**
   * *** CAPTURED AFTER TOUCHING A GROUP CONTROL, NOT AS IT FIRST PAINTS. ***
   * Same reason goals is captured with its panel open. The `<select>` carries
   * four options and sits inline beside a long category name and three money
   * figures -- it is the widest row this page can produce, and a focused
   * control is also the only state in which its border and text are measurable
   * against the card behind it.
   */
  ['budgets', BudgetsMinimal as React.FC, async () => {
    await screen.findByRole('heading', { level: 2, name: 'Fixed' });
    const controls = await screen.findAllByLabelText('Spending group');
    controls[0].focus();
    // Collapse one group so the walk sees a COLLAPSED header too: that is the
    // state a returning user lands in, and it is styled separately.
    await userEvent.click(
      await screen.findByRole('heading', { level: 2, name: 'Non-Monthly' }));
  }],
  /**
   * Captured with a spending-group control FOCUSED. A `<select>` inline beside
   * a long category name and two icon buttons is the widest row this page can
   * produce, and focus is the only state in which the control's own border and
   * text are measurable against the card behind it.
   */
  ['categories', CategoryManagement as React.FC, async () => {
    const controls = await screen.findAllByLabelText('Spending group');
    controls[0].focus();
  }],
  // Accounts is walked at ONE realistic count. It was measured at 2/8/20 once,
  // to answer a density question; those captures then lingered in `captured/`
  // and the sweep dutifully walked three stale copies of the same page. The
  // capture now clears the directory, and the page is here as itself.
  ['accounts', Accounts as React.FC],
  /**
   * Captured with a category `<select>` FOCUSED, for the reason budgets and
   * categories are: a focused control is the only state in which its own border
   * and text are measurable against the card behind it, and this page puts one
   * immediately beside a green confirm button — a pairing that exists nowhere
   * else, and exactly the kind of adjacency the ink tokens were introduced for.
   */
  ['review', Review as React.FC, async () => {
    const controls = await screen.findAllByLabelText(/^Spending group for /);
    controls[0].focus();
  }],
  /**
   * Captured with its contributions row EXPANDED, not as it first paints: the
   * breakdown is the only part of this page with a two-column money layout, and
   * capturing the collapsed state measures a progress bar and nothing else. Same
   * reason pointspal-mycards is captured with its modal open.
   *
   * *** AND WITH THE B12 "MANAGE ACCOUNTS" PANEL OPEN, FOR THE SAME REASON. ***
   * It is a row of account chips, each carrying a name AND a money figure, above
   * a stack of full-width buttons — the widest content this page can hold, and
   * none of it exists in the collapsed state. Left closed, the walk would report
   * the goals page green having measured the version of it that shipped before
   * this feature.
   */
  ['goals', Goals as React.FC, async () => {
    /*
     * *** THE ACCOUNTS CONTROL USED TO BE CLICKED HERE AND HAS MOVED INTO THE
     * EDIT PANEL. *** This interaction opened it on the card; the owner asked for
     * account changes to happen while editing, so it now lives in a `SlidePanel`
     * — which PORTALS to `document.body` while this walk writes
     * `container.innerHTML`, so it is unreachable from here by construction
     * (D-165). Its coverage did not vanish: `slidepanel-goal-edit` in the MODAL
     * walk renders that panel, accounts control included, at four widths in both
     * themes.
     *
     * *** THIS WALK'S OWN INTERACTION IS WHAT CAUGHT THE MOVE, *** by failing on
     * a button that no longer exists — which is the argument for adding the
     * interaction and not just the fixture.
     *
     * The contributions table stays: it is on the card and nowhere else. The
     * FIRST goal specifically, because `getByRole` refuses an ambiguous match
     * rather than picking, and only goal 1 has a contributions fixture.
     */
    const first = await screen.findByTestId('goal-1');
    await userEvent.click(within(first).getByRole('button', { name: /Who contributed/ }));
    await screen.findByText('Rachel');
  }],
  /**
   * *** learnPal's HOME AND RANGE HAD NEVER BEEN RENDERED BY ANY WALK. *** Both
   * are new: the range shipped in #176 and the home in this branch, and until
   * now the only learnPal thing either walk saw was the BANNER on the goals
   * page — which is a different component reading a different payload. A module
   * being mocked for another page's benefit is not the same as its own pages
   * being measured.
   *
   * Neither needs an interaction: every state worth measuring is on first
   * paint, and the one thing behind a click (a lesson reader) is a `SlidePanel`
   * that portals to `document.body` and is therefore unreachable from a walk
   * writing `container.innerHTML` (D-165). It belongs to the MODAL walk.
   */
  /**
   * *** NEITHER OF THESE HAD A CAPTURE FILE, SO NO WALK HAD EVER RENDERED
   * THEM. *** D-103. They are also two of the three pages measured at **0px
   * left padding** on 2026-09-11 — content flush against the side nav, a
   * defect that lived precisely because no walk had them.
   *
   * Expect new failing pairs to land in the D-103 **pending** bucket: reported,
   * not gated, and NOT added to `baseline.json`. A page's first audit finding
   * something is the point of giving it one.
   *
   * *** BOTH ALSO HAVE NO `<h1>` — their titles are `<h2>`. *** Recorded on
   * 2026-09-11 and deliberately not fixed here: promoting a heading changes how
   * it looks as well as what it means, and doing it inside a capture change
   * would hide a visual edit inside a test-infrastructure one.
   */
  ['learnpal-home', LearnPalHome as React.FC],
  /**
   * *** DRIVEN, BECAUSE THE FIXTURE ALONE MEASURED NOTHING OF `/recurring/detect`.
   * *** The detected-patterns section only exists after a click on "Detect
   * Patterns" — `handleDetectPatterns` is what sets `showPatternsSection` — so
   * the first capture here held the recurring LIST and none of the payload the
   * detect fixture describes. Verified by grepping `captured/recurring.html`
   * for the pattern's own description and getting **zero**, which is the check
   * that separates "the page is in the walk" from "the walk sees what changed"
   * (D-165).
   */
  ['recurring', RecurringTransactions as React.FC, async () => {
    await userEvent.click(screen.getByRole('button', { name: /Detect Patterns/ }));
    // Wait for a row of the detected section, not for the button to re-enable:
    // the button re-enables whether or not anything rendered.
    await screen.findByText(/Salary deposit from the employer payroll run/);
  }],
  ['rules', TransactionRules as React.FC],
  ['learnpal-range', LearnPalRange as React.FC],
  /**
   * DRIVEN: see the handler's own note. Waits on a sentence from inside the
   * body, not on the panel appearing -- the panel opens whether or not
   * `LessonBody` rendered anything, which is the same trap the `recurring`
   * case above records.
   */
  ['learnpal-lessons', LearnPalLessons as React.FC, async () => {
    const reads = await screen.findAllByRole('button', { name: /^Read$/ });
    await userEvent.click(reads[2]);
    await screen.findByText(/whatever covers the next thing that breaks/);
  }],
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

it.each(cases)('captures %s', async (name, Page, drive, entry, floor) => {
  // 50 unless the page says otherwise; see the `floor` note on `Case`.
  const minElements = floor ?? 50;
  const { container } = render(
    <MemoryRouter initialEntries={[entry?.url ?? '/']}>
      <ThemeProvider><ToastProvider>
        {entry
          ? <Routes><Route path={entry.pattern} element={<Page />} /></Routes>
          : <Page />}
      </ToastProvider></ThemeProvider>
    </MemoryRouter>
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
    expect(container.querySelectorAll('*').length)
      .toBeGreaterThanOrEqual(Math.min(20, minElements));
    expect(container.querySelector('.animate-spin')).toBeNull();
  }, { timeout: 6000 });

  if (drive) await drive(container);

  // The real readiness gate, applied to every page once it is in its final state.
  await waitFor(() => {
    expect(container.querySelectorAll('*').length)
      .toBeGreaterThanOrEqual(minElements);
  }, { timeout: 6000 });

  const painted = container.querySelectorAll('*').length;
  if (painted < minElements) {
    throw new Error(
      `${name}: only ${painted} elements against a floor of ${minElements} — `
      + 'captured a stub');
  }

  /*
   * *** AN EMPTY HEADING IS A NAME THAT DID NOT RESOLVE, AND NOTHING ELSE FAILS
   * ON ONE. *** D-192: every budget on the live page rendered an empty `<h2>`,
   * so four budgets were anonymous and nothing said which was which. The page
   * rendered, the endpoint answered 200, the figures were all correct, the
   * layout held — an empty string breaks nothing, it just leaves a gap.
   * `e2e/standards.spec.ts` checks heading STRUCTURE, not CONTENT, so four
   * empty `<h2>`s are a perfectly valid document.
   *
   * The contrast walk measures colours and the responsive walk measures
   * overflow; neither can see this. So it is asserted here, generically, for
   * every captured page — a heading with no text is always a bug, whatever page
   * it is on.
   */
  const blankHeadings = [...container.querySelectorAll('h1, h2, h3')]
    .filter((h) => !(h.textContent || '').trim());
  if (blankHeadings.length) {
    throw new Error(
      `${name}: ${blankHeadings.length} empty heading(s) — a name did not `
      + `resolve. Tags: ${blankHeadings.map((h) => h.tagName).join(', ')}`);
  }

  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `${name}.html`), container.innerHTML, 'utf8');
  // eslint-disable-next-line no-console
  console.log(`CAPTURED ${name}: ${painted} elements`);
});
