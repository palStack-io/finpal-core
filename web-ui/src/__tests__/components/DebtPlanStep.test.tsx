/**
 * The debt plan, now in two places: a STEP in the create panel and a STRIP on
 * the goal card.
 *
 * *** IT USED TO BE ONE PANEL PARKED ON THE GOALS PAGE. *** Owner,
 * 2026-09-20: the advice panels *"need to show only when a user is trying to
 * create a goal... currently it just takin alot of real estate"*. The picker
 * moved into the create flow; the status moved onto the payoff goal's own
 * card, because otherwise the plan becomes write-once and `plan_status` has
 * nowhere to be read.
 *
 * *** THE ORDER FIXTURE MUST DISCRIMINATE THE TWO METHODS. *** Three
 * sabotages passed this session, every one of them a fixture hole. The
 * analogous hole here is debts whose avalanche and snowball orderings
 * coincide: a test written against those passes whichever method the server
 * was asked for. So the fixtures below are deliberately opposed — the
 * highest-rate debt is also the biggest.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../services/goalService', () => ({
  goalService: { getDebtPlan: vi.fn(), setDebtPlan: vi.fn() },
}));
import { goalService } from '../../services/goalService';
import { DebtMethodStep } from '../../components/goals/DebtMethodStep';
import { DebtPlanStatus } from '../../components/goals/DebtPlanStatus';
import type { Account } from '../../services/accountService';

/** See `GoalHelpers.test.tsx`: a LOADING component is empty too. */
async function settled(mock: { mock: { calls: unknown[] } }) {
  await waitFor(() => expect(mock.mock.calls.length).toBeGreaterThan(0));
  await act(async () => { await Promise.resolve(); });
}

const account = (id: number, name: string, type: string): Account => ({
  id, name, account_type: type, balance: -1000, currency_code: 'USD',
  is_active: true, user_id: 'a@b.c',
} as Account);

const TWO_DEBTS = [
  account(1, 'Chase Amazon', 'credit'),
  account(2, 'Car loan', 'loan'),
];

/* *** OPPOSED ON PURPOSE. *** The 24.99% card is also the LARGER balance, so
   avalanche and snowball give genuinely different first rows. A fixture where
   the priciest debt is also the smallest proves nothing about the method. */
const AVALANCHE_ORDER = [
  { id: 1, name: 'Chase Amazon', balance: -4200, apr: 24.99 },
  { id: 2, name: 'Car loan', balance: -900, apr: 4.5 },
];
const SNOWBALL_ORDER = [
  { id: 2, name: 'Car loan', balance: -900, apr: 4.5 },
  { id: 1, name: 'Chase Amazon', balance: -4200, apr: 24.99 },
];

beforeEach(() => {
  vi.mocked(goalService.getDebtPlan).mockReset();
  vi.mocked(goalService.setDebtPlan).mockReset();
});

const ONE_DEBT = [
  account(1, 'Chase Amazon', 'credit'),
  account(3, 'Everyday', 'checking'),
  account(4, 'Rainy day', 'savings'),
];

describe('when there is nothing to order', () => {
  it('draws nothing at all for somebody with no debt', async () => {
    vi.mocked(goalService.getDebtPlan).mockResolvedValue(null);
    const { container } = render(
      <DebtMethodStep
        accounts={[account(3, 'Everyday', 'checking'), account(4, 'Rainy day', 'savings')]}
        currency="USD"
      />,
    );
    await settled(vi.mocked(goalService.getDebtPlan));
    expect(container).toBeEmptyDOMElement();
  });

  it('drops the METHOD radios for one debt, and keeps the rest of the panel',
    async () => {
      /* *** THE DEPLOYED DEMO IS WHAT FOUND THIS. *** Its persona carries one
         card, and hiding the whole panel below two debts meant the goals page
         showed nothing of the feature at all. "Which one first" is meaningless
         about a single card; "am I keeping to what I said I would pay" is not. */
      vi.mocked(goalService.getDebtPlan).mockResolvedValue(null);
      render(<DebtMethodStep accounts={ONE_DEBT} currency="USD" />);

      expect(await screen.findByTestId('debt-method-step')).toBeInTheDocument();
      expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
      expect(screen.getByLabelText(/put at this a month/i)).toBeInTheDocument();
      expect(screen.getByText(/will not tell you off/i)).toBeInTheDocument();
    });

  it('saves a one-debt plan without asking the user to pick an ordering', async () => {
    /* The server requires a method and the two orderings of ONE debt are
       identical, so sending `avalanche` is not finPal choosing on somebody's
       behalf — there is nothing to choose between. */
    vi.mocked(goalService.getDebtPlan).mockResolvedValue(null);
    vi.mocked(goalService.setDebtPlan).mockResolvedValue({
      method: 'avalanche', monthly_amount: 150, order: [], status: null,
    });
    render(<DebtMethodStep accounts={ONE_DEBT} currency="USD" />);

    await userEvent.type(await screen.findByLabelText(/put at this a month/i), '150');
    await userEvent.click(screen.getByTestId('debt-amount-save'));
    expect(goalService.setDebtPlan).toHaveBeenCalledWith('avalanche', 150);
  });

  it('offers the picker with no plan yet, and no ordering', async () => {
    /* Before a method is chosen there is no ordering to state, and the panel
       does NOT derive one — that would be a second computation of a figure
       the server already owns (D-101). */
    vi.mocked(goalService.getDebtPlan).mockResolvedValue(null);
    render(<DebtMethodStep accounts={TWO_DEBTS} currency="USD" />);

    expect(await screen.findByTestId('debt-method-avalanche')).toBeInTheDocument();
    expect(screen.getByTestId('debt-method-avalanche')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByTestId('debt-method-snowball')).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByTestId('debt-order')).not.toBeInTheDocument();
  });
});

describe('the order the chosen method implies', () => {
  it('renders the server ordering for avalanche, priciest first', async () => {
    vi.mocked(goalService.getDebtPlan).mockResolvedValue({
      method: 'avalanche', monthly_amount: 300, order: AVALANCHE_ORDER, status: null,
    });
    render(<DebtMethodStep accounts={TWO_DEBTS} currency="USD" />);

    const rows = (await screen.findByTestId('debt-order')).querySelectorAll('li');
    expect([...rows].map((r) => r.textContent)).toEqual([
      expect.stringContaining('Chase Amazon'),
      expect.stringContaining('Car loan'),
    ]);
  });

  it('renders the server ordering for snowball, smallest first', async () => {
    /* Same two debts, opposite order — which is what makes the previous test
       an assertion about the METHOD rather than about the fixture. */
    vi.mocked(goalService.getDebtPlan).mockResolvedValue({
      method: 'snowball', monthly_amount: 300, order: SNOWBALL_ORDER, status: null,
    });
    render(<DebtMethodStep accounts={TWO_DEBTS} currency="USD" />);

    const rows = (await screen.findByTestId('debt-order')).querySelectorAll('li');
    expect([...rows].map((r) => r.textContent)).toEqual([
      expect.stringContaining('Car loan'),
      expect.stringContaining('Chase Amazon'),
    ]);
  });

  it('says a rate is not recorded rather than printing 0%', async () => {
    /* A missing APR is the reason that debt sorts LAST under avalanche.
       Rendering it as 0% would be a figure finPal invented. */
    vi.mocked(goalService.getDebtPlan).mockResolvedValue({
      method: 'avalanche', monthly_amount: null,
      order: [{ id: 2, name: 'Car loan', balance: -900, apr: null }], status: null,
    });
    render(<DebtMethodStep accounts={TWO_DEBTS} currency="USD" />);

    expect(await screen.findByText(/rate not recorded/)).toBeInTheDocument();
    expect(screen.queryByText(/0%/)).not.toBeInTheDocument();
  });

  it('marks the chosen method by MORE than colour', async () => {
    /* D-269: colour alone is not a signal. `aria-checked` carries it for a
       screen reader, the tick for everyone else. */
    vi.mocked(goalService.getDebtPlan).mockResolvedValue({
      method: 'snowball', monthly_amount: 300, order: SNOWBALL_ORDER, status: null,
    });
    render(<DebtMethodStep accounts={TWO_DEBTS} currency="USD" />);

    const snowball = await screen.findByTestId('debt-method-snowball');
    expect(snowball).toHaveAttribute('aria-checked', 'true');
    expect(snowball.textContent).toContain('✓');
    expect(screen.getByTestId('debt-method-avalanche')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByTestId('debt-method-avalanche').textContent).not.toContain('✓');
  });
});

describe('the lesson offer', () => {
  it('is OFFERED, and the goal saves either way', async () => {
    /* Owner decision 2026-09-20: an offer, not a gate. finPal has never
       withheld a user's own money from them, and a form that refuses to
       submit until you have read something is a nag with a lock on it. The
       step says so in as many words. */
    vi.mocked(goalService.getDebtPlan).mockResolvedValue({
      method: 'avalanche', monthly_amount: 300, order: AVALANCHE_ORDER, status: null,
    });
    const onOpenLesson = vi.fn();
    render(<DebtMethodStep accounts={TWO_DEBTS} currency="USD"
                           onOpenLesson={onOpenLesson} />);

    await userEvent.click(await screen.findByTestId('debt-open-lesson'));
    expect(onOpenLesson).toHaveBeenCalled();
    expect(screen.getByText(/skip this and set it later/i)).toBeInTheDocument();
  });

  it('shows NO lesson link when learnPal is not running', async () => {
    /* *** A LINK TO A 404 IS WORSE THAN NO LINK. *** The caller passes the
       handler only when the module answered, so its absence must remove the
       affordance rather than leave a dead one. */
    vi.mocked(goalService.getDebtPlan).mockResolvedValue({
      method: 'avalanche', monthly_amount: 300, order: AVALANCHE_ORDER, status: null,
    });
    render(<DebtMethodStep accounts={TWO_DEBTS} currency="USD" />);

    await screen.findByTestId('debt-order');
    expect(screen.queryByTestId('debt-open-lesson')).not.toBeInTheDocument();
  });
});

describe('writing a plan', () => {
  it('shows the order the WRITE did not return, by re-reading', async () => {
    /* *** `PUT /debt-plan` ANSWERS WITH METHOD AND AMOUNT ONLY. *** Storing
       the write's payload would blank the ordering at the exact moment the
       reader expects it to appear; `setDebtPlan` re-reads for that reason. */
    vi.mocked(goalService.getDebtPlan).mockResolvedValue(null);
    vi.mocked(goalService.setDebtPlan).mockResolvedValue({
      method: 'avalanche', monthly_amount: null, order: AVALANCHE_ORDER, status: null,
    });
    render(<DebtMethodStep accounts={TWO_DEBTS} currency="USD" />);

    await userEvent.click(await screen.findByTestId('debt-method-avalanche'));

    /* No amount, explicitly: `setDebtPlan` omits `monthly_amount` from the
       body when it is `undefined`, and the server reads ABSENT as unchanged —
       so picking a method never clears a figure the user recorded. */
    expect(goalService.setDebtPlan).toHaveBeenCalledWith('avalanche', undefined);
    const rows = (await screen.findByTestId('debt-order')).querySelectorAll('li');
    expect(rows[0].textContent).toContain('Chase Amazon');
  });

  it('keeps the method when only the amount changes', async () => {
    /* Absent means unchanged on the server side; here the mirror of it — the
       amount save must not silently switch the ordering the user chose. */
    vi.mocked(goalService.getDebtPlan).mockResolvedValue({
      method: 'snowball', monthly_amount: null, order: SNOWBALL_ORDER, status: null,
    });
    vi.mocked(goalService.setDebtPlan).mockResolvedValue({
      method: 'snowball', monthly_amount: 250, order: SNOWBALL_ORDER, status: null,
    });
    render(<DebtMethodStep accounts={TWO_DEBTS} currency="USD" />);

    await userEvent.type(await screen.findByLabelText(/put at this a month/i), '250');
    await userEvent.click(screen.getByTestId('debt-amount-save'));

    expect(goalService.setDebtPlan).toHaveBeenCalledWith('snowball', 250);
  });

  it('says the plan is unchanged when the write fails', async () => {
    vi.mocked(goalService.getDebtPlan).mockResolvedValue(null);
    vi.mocked(goalService.setDebtPlan).mockRejectedValue(new Error('nope'));
    render(<DebtMethodStep accounts={TWO_DEBTS} currency="USD" />);

    await userEvent.click(await screen.findByTestId('debt-method-avalanche'));
    expect(await screen.findByText(/did not save/i)).toBeInTheDocument();
  });
});


/**
 * The status strip, which lives on the payoff goal's own card.
 *
 * *** IT EXISTS BECAUSE THE PICKER MOVED. *** With the panel gone from the
 * page, a plan with no visible status would be write-once — and
 * `plan_status` was built so that "every week we tell them how they are
 * doing" has somewhere to be read.
 */
describe('the status strip on the card', () => {
  it('states behind, and offers nothing', async () => {
    /* Owner decision 2026-09-19. The person who is behind is usually behind
       because they could not pay; a prompt they cannot act on is a reminder
       that they are failing. The figure is the message. */
    vi.mocked(goalService.getDebtPlan).mockResolvedValue({
      method: 'avalanche', monthly_amount: 300, order: AVALANCHE_ORDER,
      status: { method: 'avalanche', planned: 300, paid: 120,
                difference: -180, state: 'behind' },
    });
    render(<DebtPlanStatus currency="USD" />);

    const status = await screen.findByTestId('debt-plan-status');
    expect(status.textContent).toContain('Behind by');
    expect(status.textContent).toContain('$180.00');
    /* No button and no link: `onChangePlan` was not passed, so the strip must
       offer literally nothing. */
    expect(status.querySelector('button')).toBeNull();
    expect(status.querySelector('a')).toBeNull();
  });

  it('prints the BASIS of `paid`, because a zero is "not observed"', async () => {
    /* `paid_toward_debt` counts transfers recorded against a debt account, so
       somebody paying their card from a bank finPal does not hold scores zero
       and reads as behind. Saying so is the difference between a figure and a
       scold — and without it this is D-102 with teeth. */
    vi.mocked(goalService.getDebtPlan).mockResolvedValue({
      method: 'avalanche', monthly_amount: 300, order: AVALANCHE_ORDER,
      status: { method: 'avalanche', planned: 300, paid: 0,
                difference: -300, state: 'behind' },
    });
    render(<DebtPlanStatus currency="USD" />);

    const status = await screen.findByTestId('debt-plan-status');
    expect(status.textContent).toMatch(/transfers recorded against these accounts/);
    expect(status.textContent).toMatch(/bank finPal does not hold/);
  });

  it('says ahead with a WORD, not only a colour', async () => {
    vi.mocked(goalService.getDebtPlan).mockResolvedValue({
      method: 'snowball', monthly_amount: 300, order: SNOWBALL_ORDER,
      status: { method: 'snowball', planned: 300, paid: 450,
                difference: 150, state: 'ahead' },
    });
    render(<DebtPlanStatus currency="USD" />);

    const status = await screen.findByTestId('debt-plan-status');
    expect(status.textContent).toContain('Ahead by');
    expect(status.textContent).toContain('$150.00');
  });

  it('names the method even when there is no amount to measure against', async () => {
    /* *** AN ORDERING WITH NO MONTHLY FIGURE IS A PLAN HALF MADE, AND SAYING
       SO IS THE POINT. *** Rendering the method and then nothing would leave
       the reader unable to tell "on plan" from "not measured". */
    vi.mocked(goalService.getDebtPlan).mockResolvedValue({
      method: 'snowball', monthly_amount: null, order: SNOWBALL_ORDER, status: null,
    });
    render(<DebtPlanStatus currency="USD" />);

    const status = await screen.findByTestId('debt-plan-status');
    expect(status.textContent).toContain('Smallest balance first');
    expect(status.textContent).toMatch(/nothing to measure this month against/);
  });

  it('draws nothing at all when no plan exists', async () => {
    vi.mocked(goalService.getDebtPlan).mockResolvedValue(null);
    const { container } = render(<DebtPlanStatus currency="USD" />);
    await settled(vi.mocked(goalService.getDebtPlan));
    expect(container).toBeEmptyDOMElement();
  });

  it('offers Change plan only when there is somewhere for it to go', async () => {
    /* An affordance that looks clickable and does nothing is worse than no
       affordance — D-05's class, and the reason the card passes a handler
       while a bare strip does not. */
    vi.mocked(goalService.getDebtPlan).mockResolvedValue({
      method: 'avalanche', monthly_amount: 300, order: AVALANCHE_ORDER, status: null,
    });
    const onChangePlan = vi.fn();
    render(<DebtPlanStatus currency="USD" onChangePlan={onChangePlan} />);

    await userEvent.click(await screen.findByTestId('debt-change-plan'));
    expect(onChangePlan).toHaveBeenCalled();
  });

  it('renders the currency the SERVER converted into, not the page\'s', async () => {
    /* D-278: a euro household's dollar card printed as EUR600.00 because the
       client reached for the page's currency. The server now converts every
       figure into one code and ships it. */
    vi.mocked(goalService.getDebtPlan).mockResolvedValue({
      method: 'avalanche', monthly_amount: 300, currency_code: 'USD',
      order: AVALANCHE_ORDER,
      status: { method: 'avalanche', planned: 300, paid: 120,
                difference: -180, state: 'behind' },
    });
    render(<DebtPlanStatus currency="EUR" />);

    const status = await screen.findByTestId('debt-plan-status');
    expect(status.textContent).toContain('$180.00');
    expect(status.textContent).not.toContain('€');
  });
});
