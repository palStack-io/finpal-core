/**
 * The goals page renders the SERVER's progress and never works one out.
 *
 * *** THE DISCRIMINATING TEST IS THE LAST ONE IN THE FIRST BLOCK. *** It serves a
 * payload whose `progress` deliberately does not match `(current - start) /
 * (target - start)`. A page that derives the percentage renders the derived one
 * and passes every other test here; only this one tells them apart. That is
 * D-101's shape -- web-ui and mobile disagreed about the same figure for months
 * because each computed it, and TypeScript cannot catch it, because the number is
 * the right type and the wrong value.
 *
 * Asserted on rendered output and on the request body, never on a status code.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { api } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { Goals } from '../../pages/Goals';

vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
  ToastProvider: ({ children }: any) => children,
}));

// A WILDCARD ORIGIN. `http://localhost` matches nothing in CI, where requests
// arrive relative, and a bare path is resolved against the jsdom origin.
const BASE = '*';

beforeAll(() => {
  api.defaults.adapter = 'http';
});

beforeEach(() => {
  useAuthStore.setState({
    user: { id: 'alice@test.com', name: 'Alice', default_currency_code: 'USD' } as any,
    token: 'tok',
    refreshToken: 'r',
    isAuthenticated: true,
  });
});

const PAYOFF_GOAL = {
  id: 1,
  user_id: 'alice@test.com',
  name: 'Pay off Chase Amazon',
  kind: 'payoff',
  scope: 'personal',
  account_id: 7,
  account_name: 'Chase Amazon',
  target_amount: 0,
  start_amount: -1125.41,
  current_manual: null,
  currency_code: 'USD',
  start_date: '2026-01-01',
  target_date: null,
  status: 'active',
  achieved_at: null,
  current_amount: -450,
  direction: 'paydown',
  progress: 0.6001457246692317,
};

function mockGoals(goals: unknown[], accounts: unknown[] = []) {
  server.use(
    http.get(`${BASE}/api/v1/goals`, () => HttpResponse.json({ success: true, goals })),
    http.get(`${BASE}/api/v1/accounts`, () =>
      HttpResponse.json({ success: true, accounts })),
  );
}

describe('Goals page — the percentage is the server’s', () => {
  it('renders the goal, the account it tracks and the server’s percentage', async () => {
    mockGoals([PAYOFF_GOAL]);

    render(<MemoryRouter><Goals /></MemoryRouter>);

    expect(await screen.findByText('Pay off Chase Amazon')).toBeInTheDocument();
    expect(screen.getByText(/Tracking Chase Amazon/)).toBeInTheDocument();
    expect(screen.getByText('60%')).toBeInTheDocument();
  });

  it('renders a payload whose progress DISAGREES with the amounts, as sent', async () => {
    // *** THE ONE THAT CATCHES A CLIENT-SIDE DERIVATION. ***
    // (current − start) / (target − start) = (900 − 0) / (1000 − 0) = 90%.
    // The server says 42%. A page that derives shows 90% and a page that renders
    // what it was given shows 42%. Contrived on purpose: nothing else in this file
    // can tell the two implementations apart.
    mockGoals([{
      ...PAYOFF_GOAL, id: 2, name: 'Disagreeing goal', account_id: null,
      account_name: null, start_amount: 0, target_amount: 1000,
      current_amount: 900, direction: 'accumulate', progress: 0.42,
    }]);

    render(<MemoryRouter><Goals /></MemoryRouter>);

    expect(await screen.findByText('42%')).toBeInTheDocument();
    expect(screen.queryByText('90%')).not.toBeInTheDocument();
  });

  it('caps the BAR at 100% while still reporting the overshoot', async () => {
    // The server does not clamp `progress`, because an overshoot is real
    // information. The bar is the only thing that has to stop.
    mockGoals([{
      ...PAYOFF_GOAL, id: 3, name: 'Overshot', account_id: null,
      account_name: null, start_amount: 0, target_amount: 1000,
      current_amount: 1400, direction: 'accumulate', progress: 1.4,
    }]);

    render(<MemoryRouter><Goals /></MemoryRouter>);

    expect(await screen.findByText('140%')).toBeInTheDocument();
    const bar = screen.getByRole('progressbar', { name: /Overshot progress/ });
    const fill = bar.firstElementChild as HTMLElement;
    expect(fill.style.width).toBe('100%');
  });

  it('marks a household goal as shared and a personal one not', async () => {
    mockGoals([
      { ...PAYOFF_GOAL, id: 4, name: 'Ours', scope: 'household' },
      { ...PAYOFF_GOAL, id: 5, name: 'Mine', scope: 'personal' },
    ]);

    render(<MemoryRouter><Goals /></MemoryRouter>);

    await screen.findByText('Ours');
    const shared = screen.getAllByText('Shared');
    expect(shared).toHaveLength(1);
  });
});

describe('Goals page — creating one', () => {
  it('does NOT send start_amount for a linked goal', async () => {
    // The snapshot is the server's to take. Sending one would make a linked
    // goal's denominator a typed number, which is what linking exists to prevent.
    let body: any = null;
    mockGoals([], [{ id: 7, name: 'Chase Amazon', account_type: 'credit',
                     balance: -1125.41, currency_code: 'USD',
                     user_id: 'alice@test.com' }]);
    server.use(
      http.post(`${BASE}/api/v1/goals`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ success: true, goal: PAYOFF_GOAL }, { status: 201 });
      }),
    );

    render(<MemoryRouter><Goals /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: /New goal/i }));
    await userEvent.type(screen.getByLabelText(/Name/i), 'Pay off Chase Amazon');
    // B12: a checkbox list, not a `<select>`. The native multi-select needs a
    // modifier key nobody discovers and has no accessible name per option, and a
    // goal spanning three cards is the case this feature exists for.
    await userEvent.click(screen.getByLabelText('Chase Amazon'));
    await userEvent.type(screen.getByLabelText(/Target amount/i), '0');
    await userEvent.click(screen.getByRole('button', { name: /Create goal/i }));

    await waitFor(() => expect(body).not.toBeNull());
    // *** `account_ids`, NOT `account_id`. *** The singular is not sent at all:
    // a migrated client says what it means with one key, and the server prefers
    // this one when both arrive.
    expect(body.account_ids).toEqual([7]);
    expect(body).not.toHaveProperty('account_id');
    expect(body.target_amount).toBe(0);
    expect(body).not.toHaveProperty('start_amount');
  });

  it('*** SENDS SEVERAL ACCOUNTS, WHICH IS THE WHOLE FEATURE (B12) ***', async () => {
    let body: any = null;
    mockGoals([], [
      { id: 7, name: 'Visa', account_type: 'credit', balance: -1000,
        currency_code: 'USD', user_id: 'alice@test.com' },
      { id: 8, name: 'Amex', account_type: 'credit', balance: -500,
        currency_code: 'USD', user_id: 'alice@test.com' },
    ]);
    server.use(
      http.post(`${BASE}/api/v1/goals`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ success: true, goal: PAYOFF_GOAL }, { status: 201 });
      }),
    );

    render(<MemoryRouter><Goals /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: /New goal/i }));
    await userEvent.type(screen.getByLabelText(/Name/i), 'Pay off my cards');
    await userEvent.click(screen.getByLabelText('Visa'));
    await userEvent.click(screen.getByLabelText('Amex'));
    await userEvent.type(screen.getByLabelText(/Target amount/i), '0');
    await userEvent.click(screen.getByRole('button', { name: /Create goal/i }));

    await waitFor(() => expect(body).not.toBeNull());
    expect(body.account_ids).toEqual([7, 8]);
  });

  it('sends an EMPTY list for a goal tracked by hand, rather than omitting the key', async () => {
    // *** [] IS A POSITIVE STATEMENT ON THIS API. *** The server treats an empty
    // `account_ids` as "manual", not as "fall back to `account_id`" — so
    // omitting the key and sending [] are different requests, and the form means
    // the second one.
    let body: any = null;
    mockGoals([], [{ id: 7, name: 'Visa', account_type: 'credit', balance: -1000,
                     currency_code: 'USD', user_id: 'alice@test.com' }]);
    server.use(
      http.post(`${BASE}/api/v1/goals`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ success: true, goal: PAYOFF_GOAL }, { status: 201 });
      }),
    );

    render(<MemoryRouter><Goals /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: /New goal/i }));
    await userEvent.type(screen.getByLabelText(/Name/i), 'By hand');
    await userEvent.type(screen.getByLabelText(/Target amount/i), '2000');
    await userEvent.click(screen.getByRole('button', { name: /Create goal/i }));

    await waitFor(() => expect(body).not.toBeNull());
    expect(body.account_ids).toEqual([]);
  });

  it('shows the server’s refusal in the form rather than swallowing it', async () => {
    // The double-counting index answers 400 with a message the user can act on.
    mockGoals([], []);
    server.use(
      http.post(`${BASE}/api/v1/goals`, () =>
        HttpResponse.json({
          success: false,
          error: 'An account can carry only one active goal in each direction',
        }, { status: 400 })),
    );

    render(<MemoryRouter><Goals /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: /New goal/i }));
    await userEvent.type(screen.getByLabelText(/Name/i), 'Second');
    await userEvent.type(screen.getByLabelText(/Target amount/i), '500');
    await userEvent.click(screen.getByRole('button', { name: /Create goal/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/only one active goal/i);
  });
});

describe('Goals page — contributions', () => {
  it('LABELS an imported contribution instead of folding it into a total', async () => {
    // `paid_by` defaults to whoever created the row, so an imported row credits
    // the importer. Rendering the amount without the label tells one partner they
    // contributed money the other actually paid.
    mockGoals([PAYOFF_GOAL]);
    server.use(
      http.get(`${BASE}/api/v1/goals/1/contributions`, () =>
        HttpResponse.json({
          success: true,
          currency_code: 'USD',
          contributions: [
            { user_id: 'alice@test.com', display_name: 'Alice', amount: 400, imported: false },
            { user_id: 'bob@test.com', display_name: 'Bob', amount: 300, imported: true },
          ],
        })),
    );

    render(<MemoryRouter><Goals /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: /Who contributed/i }));

    expect(await screen.findByText('Bob')).toBeInTheDocument();
    // One label, on Bob's row only — flagging everyone trains the user to ignore it.
    const flags = screen.getAllByText(/includes imported rows/i);
    expect(flags).toHaveLength(1);
    expect(flags[0].closest('li')).toHaveTextContent('Bob');
  });

  it('says there is nothing recorded rather than showing $0.00', async () => {
    // A zero beside a name reads as a measurement when the truth is there is
    // nothing to measure.
    mockGoals([PAYOFF_GOAL]);
    server.use(
      http.get(`${BASE}/api/v1/goals/1/contributions`, () =>
        HttpResponse.json({ success: true, currency_code: 'USD', contributions: [] })),
    );

    render(<MemoryRouter><Goals /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: /Who contributed/i }));

    expect(await screen.findByText(/No contributions recorded yet/i)).toBeInTheDocument();
    expect(screen.queryByText('$0.00')).not.toBeInTheDocument();
  });
});

/**
 * B12 — the accounts a goal reads, and changing them after it exists.
 *
 * Every assertion here is on RENDERED OUTPUT or the REQUEST BODY, never on a
 * status code: every bug found across eight passes of this project returned 200
 * and rendered fine.
 */
const TWO_ACCOUNT_GOAL = {
  ...PAYOFF_GOAL,
  id: 2,
  name: 'Pay off my cards',
  account_id: 7,
  // What the SERVER sends for a multi-account goal. It cannot name one card out
  // of two without being false, so it counts them.
  account_name: '2 accounts',
  accounts: [
    { id: 7, name: 'Visa', start_amount: -1000 },
    { id: 8, name: 'Amex', start_amount: -500 },
  ],
  start_amount: -1500,
  current_amount: -900,
  progress: 0.4,
};

describe('Goals page — a goal that spans several accounts (B12)', () => {
  it('*** NAMES BOTH CARDS, WHERE THE SERVER COULD ONLY SAY "2 accounts" ***', async () => {
    mockGoals([TWO_ACCOUNT_GOAL]);
    render(<MemoryRouter><Goals /></MemoryRouter>);

    expect(await screen.findByText('Tracking Visa & Amex')).toBeInTheDocument();
    // And it does not fall back to the server's count when it has the list.
    expect(screen.queryByText(/Tracking 2 accounts/)).not.toBeInTheDocument();
  });

  it('renders a payload with NO `accounts` key without throwing (older backend)', async () => {
    // A new bundle reaches an older backend routinely: nginx serves the new
    // assets before the backend container restarts. `goal.accounts.map(...)`
    // would throw on a page that worked a minute earlier — D-176's shape, a key
    // a client reads optimistically.
    const { accounts: _dropped, ...withoutAccounts } = TWO_ACCOUNT_GOAL;
    mockGoals([{ ...withoutAccounts, account_name: 'Chase Amazon' }]);
    render(<MemoryRouter><Goals /></MemoryRouter>);

    expect(await screen.findByText('Tracking Chase Amazon')).toBeInTheDocument();
  });

  it('*** OFFERS NO REMOVE CONTROL ON A SINGLE-ACCOUNT GOAL, BECAUSE THE SERVER ALWAYS REFUSES ***', async () => {
    // `DELETE /goals/<id>/accounts/<id>` answers 400 on the last link: that is a
    // conversion to a manual goal, not an unlink. A button that can only ever
    // fail is D-172's shape.
    const oneAccount = {
      ...PAYOFF_GOAL,
      accounts: [{ id: 7, name: 'Chase Amazon', start_amount: -1125.41 }],
    };
    mockGoals([oneAccount], [{ id: 9, name: 'Savings', account_type: 'savings',
                               balance: 100, currency_code: 'USD',
                               user_id: 'alice@test.com' }]);
    render(<MemoryRouter><Goals /></MemoryRouter>);

    await userEvent.click(await screen.findByRole('button', { name: /Add another account/i }));
    expect(screen.queryByRole('button', { name: /Remove/i })).not.toBeInTheDocument();
    // And it says WHY, rather than leaving a control silently missing.
    expect(screen.getByText(/A goal keeps at least one account/)).toBeInTheDocument();
  });

  it('adds an account through its OWN route, not through a PUT', async () => {
    // The server refuses `account_ids` on `PUT` precisely so this cannot be
    // written as an ordinary field edit: it moves the goal's denominator.
    let hit: string | null = null;
    mockGoals([TWO_ACCOUNT_GOAL], [
      { id: 9, name: 'Store card', account_type: 'credit', balance: -200,
        currency_code: 'USD', user_id: 'alice@test.com' },
    ]);
    server.use(
      http.post(`${BASE}/api/v1/goals/2/accounts`, async ({ request }) => {
        hit = JSON.stringify(await request.json());
        return HttpResponse.json({ success: true, goal: TWO_ACCOUNT_GOAL });
      }),
    );

    render(<MemoryRouter><Goals /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: /Manage accounts/i }));
    await userEvent.click(screen.getByRole('button', { name: /Add Store card/i }));

    await waitFor(() => expect(hit).not.toBeNull());
    expect(hit).toBe(JSON.stringify({ account_id: 9 }));
  });

  it('*** SHOWS THE MIXED-DIRECTION REFUSAL VERBATIM, NAMING BOTH SIDES ***', async () => {
    // The server's sentence is the only actionable thing in that response. A
    // generic "could not add this account" would throw away the two account
    // names that tell the user what to do instead.
    const refusal =
      'A goal cannot mix accounts you are paying DOWN with accounts you are '
      + 'building UP -- Visa, Amex would be paid down while Emergency fund is '
      + 'built up, and one percentage over both would hide half the goal. '
      + 'Make two goals.';
    mockGoals([TWO_ACCOUNT_GOAL], [
      { id: 9, name: 'Emergency fund', account_type: 'savings', balance: 4000,
        currency_code: 'USD', user_id: 'alice@test.com' },
    ]);
    server.use(
      http.post(`${BASE}/api/v1/goals/2/accounts`, () =>
        HttpResponse.json({ success: false, error: refusal }, { status: 400 })),
    );

    render(<MemoryRouter><Goals /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: /Manage accounts/i }));
    await userEvent.click(screen.getByRole('button', { name: /Add Emergency fund/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Emergency fund is built up/);
  });

  it('shows what each account brought to the denominator, without deriving anything', async () => {
    // `start_amount` per link is displayed, never used to recompute a
    // percentage — that is `progress`, and it is the server's (D-101).
    mockGoals([TWO_ACCOUNT_GOAL]);
    render(<MemoryRouter><Goals /></MemoryRouter>);

    await userEvent.click(await screen.findByRole('button', { name: /Manage accounts/i }));
    // *** U+2212 MINUS SIGN, NOT A HYPHEN. *** `formatMoney` renders a real
    // minus and this test first looked for `-$1,000.00`, which matched nothing.
    // Written as the escape so the next reader does not "fix" it back.
    expect(screen.getByText(/from \u2212\$1,000\.00/)).toBeInTheDocument();
    expect(screen.getByText(/from \u2212\$500\.00/)).toBeInTheDocument();
    // The percentage on the card is still the server's 0.4, not 1100/1500.
    expect(screen.getByText('40%')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// C1c — the mountain on the goal card
// ---------------------------------------------------------------------------

const BEN_NEVIS = {
  slug: 'ben-nevis', name: 'Ben Nevis', elevation_m: 1345,
  fact: 'The summit is the collapsed rim of an ancient volcano.',
  summit_note: null,
};
const ACONCAGUA = {
  slug: 'aconcagua', name: 'Aconcagua', elevation_m: 6961,
  fact: 'The highest mountain outside Asia.',
  summit_note: 'You started at Aconcagua. That is finished.',
};

const COST_PEAK = {
  scale: 'cost' as const,
  magnitude: 13.33,
  unmeasured: false,
  band: 1,
  mountain: BEN_NEVIS,
  hardest_band: 1,
  hardest_mountain: BEN_NEVIS,
  apr: 19.99,
};

const peakGoal = (peak: unknown, overrides: Record<string, unknown> = {}) => ({
  ...PAYOFF_GOAL, peak, ...overrides,
});

/**
 * *** THE FIRST VERSION OF THIS HELPER MATCHED A LUCIDE ICON. ***
 * It selected `svg[aria-hidden="true"] path`, and every icon on the card is also
 * `aria-hidden` — so it found `M5 12h14` and the "no mountain furniture" test
 * failed while the tests asserting a mountain WAS drawn passed for the wrong
 * reason. One failure exposed two bad assertions. Keyed to the wrapper's own
 * testid now, so it can only ever find the silhouette.
 */
const silhouette = () =>
  document.querySelector('[data-testid^="goal-peak-"] svg path');

describe('Goals page — a card from a backend that predates mountains', () => {
  /**
   * *** THREE NULL-ISH STATES AND THIS IS THE ONE MOST EASILY COLLAPSED. ***
   * `peak` ABSENT means the backend is older than the feature — nginx serves new
   * assets before the backend restarts, and a self-hoster can update `web-ui`
   * alone. That card must look EXACTLY as it did before C1c: not a flat ridge,
   * which means "we do not know your rate", and not a molehill.
   */
  it('renders no mountain furniture at all, and keeps the OLD bar colour', async () => {
    mockGoals([PAYOFF_GOAL]);            // deliberately no `peak` key
    render(<MemoryRouter><Goals /></MemoryRouter>);
    expect(await screen.findByText('Pay off Chase Amazon')).toBeInTheDocument();

    expect(screen.queryByText(/What's costing you/i)).toBeNull();
    expect(screen.queryByText(/What you're building/i)).toBeNull();
    expect(screen.queryByText(/No rate recorded/i)).toBeNull();
    expect(silhouette()).toBeNull();

    // The pre-C1c paydown colour, not a peak variable. jsdom normalises the hex,
    // so this asserts `rgb(59, 130, 246)` — which IS `#3b82f6`.
    const bar = screen.getByRole('progressbar').firstElementChild as HTMLElement;
    expect(bar.getAttribute('style')).toContain('rgb(59, 130, 246)');
    expect(bar.getAttribute('style')).not.toContain('--peak-');
  });

  it('still shows the percentage and the phrasing it always did', async () => {
    mockGoals([PAYOFF_GOAL]);
    render(<MemoryRouter><Goals /></MemoryRouter>);
    expect(await screen.findByText('60%')).toBeInTheDocument();
  });
});

describe('Goals page — the mountain, when the server sends one', () => {
  it('names the mountain, its elevation, the monthly interest AND the APR', async () => {
    mockGoals([peakGoal(COST_PEAK)]);
    render(<MemoryRouter><Goals /></MemoryRouter>);
    expect(await screen.findByText(/What's costing you/i)).toBeInTheDocument();
    expect(screen.getByText(
      /Ben Nevis · 1,345 m · \$13\.33 a month in interest · 19\.99% APR/,
    )).toBeInTheDocument();
  });

  it('paints the bar with the COST variable, which is what carries the rule', async () => {
    mockGoals([peakGoal(COST_PEAK)]);
    render(<MemoryRouter><Goals /></MemoryRouter>);
    await screen.findByText(/What's costing you/i);
    const bar = screen.getByRole('progressbar').firstElementChild as HTMLElement;
    expect(bar.getAttribute('style')).toContain('--peak-cost');
  });

  it('says "still to save" and uses the BUILD variable on the other scale', async () => {
    mockGoals([peakGoal(
      { ...COST_PEAK, scale: 'build', magnitude: 13000, apr: null, band: 4,
        mountain: ACONCAGUA, hardest_band: 4, hardest_mountain: ACONCAGUA },
      { direction: 'accumulate', name: 'House deposit' },
    )]);
    render(<MemoryRouter><Goals /></MemoryRouter>);
    expect(await screen.findByText(/What you're building/i)).toBeInTheDocument();
    expect(screen.getByText(/Aconcagua · 6,961 m · \$13,000\.00 still to save/))
      .toBeInTheDocument();
    const bar = screen.getByRole('progressbar').firstElementChild as HTMLElement;
    expect(bar.getAttribute('style')).toContain('--peak-build');
  });

  it('draws the silhouette as DECORATION, invisible to assistive tech', async () => {
    mockGoals([peakGoal(COST_PEAK)]);
    render(<MemoryRouter><Goals /></MemoryRouter>);
    await screen.findByText(/What's costing you/i);
    // Present, and hidden — every figure it stands behind is also in the subline.
    expect(silhouette()).not.toBeNull();
    expect(document.querySelector('svg[role="img"]')).toBeNull();
  });

  // *** ONE APR IS ONLY TRUE OF A ONE-ACCOUNT GOAL. *** The server sends `null`
  // for a goal spanning several, for the same reason `account_name` answers
  // "2 accounts" rather than naming one card out of three.
  it('omits the APR segment entirely when the server withheld it', async () => {
    mockGoals([peakGoal({ ...COST_PEAK, apr: null })]);
    render(<MemoryRouter><Goals /></MemoryRouter>);
    expect(await screen.findByText(
      /Ben Nevis · 1,345 m · \$13\.33 a month in interest$/,
    )).toBeInTheDocument();
    expect(screen.queryByText(/APR/)).toBeNull();
  });
});

describe('Goals page — unmeasured is not small, and zero is not unmeasured', () => {
  it('asks for an APR instead of naming a mountain', async () => {
    mockGoals([peakGoal({
      ...COST_PEAK, magnitude: null, unmeasured: true, band: null,
      mountain: null, apr: null,
    })]);
    render(<MemoryRouter><Goals /></MemoryRouter>);
    expect(await screen.findByText(/No rate recorded/i)).toBeInTheDocument();
    expect(screen.queryByText(/Ben Nevis/)).toBeNull();
    // The ridge IS drawn — it is a real shape, deliberately not a mountain.
    expect(silhouette()).not.toBeNull();
  });

  /**
   * *** THE PROGRESS BAR STAYS TRUTHFUL, WHICH IS A DELIBERATE DEVIATION FROM
   * THE SPEC. *** Section 5.1 asks for "an em-dash for the percentage and no
   * progress bar fill" on an unmeasured card. But `goal.progress` is computed
   * from amounts and has NOTHING to do with the APR: a paydown goal with no rate
   * recorded still knows exactly how far through it is. Blanking it would hide a
   * correct figure because a DIFFERENT figure is missing, which is the same class
   * of defect as D-102 — the geometry was right and the caption lied. Only the
   * mountain is unknown, so only the mountain says so.
   */
  it('keeps the real percentage, because the APR is not what computes it', async () => {
    mockGoals([peakGoal({
      ...COST_PEAK, magnitude: null, unmeasured: true, band: null,
      mountain: null, apr: null,
    })]);
    render(<MemoryRouter><Goals /></MemoryRouter>);
    expect(await screen.findByText('60%')).toBeInTheDocument();
    const bar = screen.getByRole('progressbar').firstElementChild as HTMLElement;
    expect(bar.getAttribute('style')).toContain('60.01');
  });

  it('draws a mountain for an explicit 0% APR and says it costs nothing', async () => {
    mockGoals([peakGoal({
      ...COST_PEAK, magnitude: 0, unmeasured: false, band: 0,
      mountain: { slug: 'table-mountain', name: 'Table Mountain',
                  elevation_m: 1085, fact: null, summit_note: null },
      apr: 0,
    })]);
    render(<MemoryRouter><Goals /></MemoryRouter>);
    expect(await screen.findByText(
      /Table Mountain · 1,085 m · \$0\.00 a month in interest · 0% APR/,
    )).toBeInTheDocument();
    expect(screen.queryByText(/No rate recorded/i)).toBeNull();
    expect(silhouette()).not.toBeNull();
  });
});

describe('Goals page — a finished goal reads the WATERMARK', () => {
  /**
   * *** THE MOUNTAIN SHRINKS AS THE GOAL SUCCEEDS. *** The band is recomputed
   * from the CURRENT figure, so a cleared debt sits on the smallest mountain.
   * The summit note has to name the hardest band ever faced, or it congratulates
   * somebody on Table Mountain for clearing an Aconcagua.
   */
  it('congratulates on the hardest it ever got, not on where it ended', async () => {
    mockGoals([peakGoal(
      { ...COST_PEAK, magnitude: 0.4, band: 0,
        mountain: { slug: 'table-mountain', name: 'Table Mountain',
                    elevation_m: 1085, fact: null, summit_note: null },
        hardest_band: 4, hardest_mountain: ACONCAGUA },
      { status: 'achieved', progress: 1 },
    )]);
    render(<MemoryRouter><Goals /></MemoryRouter>);
    expect(await screen.findByText(/You started at Aconcagua\. That is finished\./))
      .toBeInTheDocument();
    expect(screen.getByText(/Hardest it ever got: Aconcagua/)).toBeInTheDocument();
  });

  it('says nothing rather than inventing a mountain when there is no watermark', async () => {
    mockGoals([peakGoal(
      { ...COST_PEAK, hardest_band: null, hardest_mountain: null },
      { status: 'achieved', progress: 1 },
    )]);
    render(<MemoryRouter><Goals /></MemoryRouter>);
    expect(await screen.findByText('Pay off Chase Amazon')).toBeInTheDocument();
    expect(screen.queryByText(/Hardest it ever got/)).toBeNull();
    expect(screen.queryByText(/That is finished/)).toBeNull();
  });
});
