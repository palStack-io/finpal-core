/**
 * The kind picker, and the helper that comes with each choice.
 *
 * *** THE CREATE FORM NEVER ASKED WHAT KIND OF GOAL IT WAS. *** It defaulted
 * to `savings` server-side, so every goal made through this UI — including
 * the ones paying a card off — was recorded as savings. The arithmetic
 * survived because `direction` is derived from the amounts, which is exactly
 * why nobody noticed for as long as they did.
 *
 * *** AND THE CALCULATORS EXIST TO FILL THE TARGET FIELD. *** Standing on the
 * page they stated a figure the reader then had to retype into a form. Inside
 * the panel the field is directly below, so "use this target" is the whole
 * point of moving them.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../services/goalService', () => ({
  goalService: { getBufferPicture: vi.fn(), getSinkingPicture: vi.fn() },
}));
import { goalService } from '../../services/goalService';
import { BufferCalculator } from '../../components/goals/BufferCalculator';
import { SinkingCalculator } from '../../components/goals/SinkingCalculator';
import {
  GOAL_KIND_OPTIONS, choiceForSuggestion, storedKind,
} from '../../utils/goalKinds';

const BUFFER = {
  essential_monthly: 2059.49, held: 8000, months_covered: 3.9,
  targets: [
    { months: 3, target: 6178.47, short_by: -1821.53 },
    { months: 6, target: 12356.94, short_by: 4356.94 },
  ],
};

const SINKING = {
  annual: 1200, monthly: 100, months_counted: 12, currency_code: 'USD',
};

beforeEach(() => {
  vi.mocked(goalService.getBufferPicture).mockReset();
  vi.mocked(goalService.getSinkingPicture).mockReset();
});

describe('the kind vocabulary', () => {
  it('offers four choices and stores three values', () => {
    /* `GOAL_KINDS` on the server is ['payoff','savings','custom'] with a
       OneOf validator, so a fourth stored value would be a 400. */
    expect(GOAL_KIND_OPTIONS.map((o) => o.value))
      .toEqual(['payoff', 'buffer', 'sinking', 'other']);
    expect(new Set(GOAL_KIND_OPTIONS.map((o) => o.stored)))
      .toEqual(new Set(['payoff', 'savings', 'custom']));
  });

  it('maps every choice to a value the API accepts', () => {
    const allowed = new Set(['payoff', 'savings', 'custom']);
    for (const option of GOAL_KIND_OPTIONS) {
      expect(allowed.has(storedKind(option.value))).toBe(true);
    }
  });

  it('routes a suggestion to its own kind, keyed on the CHECK', () => {
    /* *** BOTH SAVINGS SUGGESTIONS ARRIVE AS `savings`, SO THE HEADLINE IS
       THE ONLY OTHER DISCRIMINATOR AND IT IS COPY. *** Keying on the check
       name means rewording a headline cannot silently reroute the picker. */
    expect(choiceForSuggestion('payoff', 'has_debt_account_with_a_rate')).toBe('payoff');
    expect(choiceForSuggestion('savings', 'has_non_monthly_spending')).toBe('sinking');
    expect(choiceForSuggestion('savings', 'has_debt_and_no_savings_goal')).toBe('buffer');
  });
});

describe('the buffer calculator as a target picker', () => {
  it('hands the chosen target back', async () => {
    vi.mocked(goalService.getBufferPicture).mockResolvedValue(BUFFER);
    const onPickTarget = vi.fn();
    render(<BufferCalculator currency="USD" onPickTarget={onPickTarget} />);

    await userEvent.click(await screen.findByTestId('buffer-target-6'));
    expect(onPickTarget).toHaveBeenCalledWith(12356.94);
  });

  it('is NOT a button when there is nowhere for the target to go', async () => {
    /* An affordance that looks clickable and does nothing is worse than a
       plain figure. */
    vi.mocked(goalService.getBufferPicture).mockResolvedValue(BUFFER);
    render(<BufferCalculator currency="USD" />);

    const tile = await screen.findByTestId('buffer-target-6');
    expect(tile.tagName).toBe('DIV');
  });
});

describe('working the buffer out by hand', () => {
  /* *** THE MEASURED PATH FAILS EXACTLY THE PEOPLE WHO NEED IT MOST. ***
     `_essential_monthly_spend` reads categories sorted as Fixed, so somebody
     who has just arrived gets silence — and "I have no buffer and no idea how
     big one should be" is the state this whole feature is for. */

  it('offers the by-hand path even when finPal measured NOTHING', async () => {
    /* It used to render nothing at all for a null picture. That was right
       when there was no alternative to offer and wrong the moment there was. */
    vi.mocked(goalService.getBufferPicture).mockResolvedValue(null);
    render(<BufferCalculator currency="USD" />);

    expect(await screen.findByTestId('buffer-by-hand-toggle')).toBeInTheDocument();
    expect(screen.getByText(/none of your spending is sorted as Fixed/))
      .toBeInTheDocument();
  });

  it('is CLOSED until asked for', async () => {
    /* A second set of figures shown unasked is the real-estate complaint this
       whole change came from. */
    vi.mocked(goalService.getBufferPicture).mockResolvedValue(BUFFER);
    render(<BufferCalculator currency="USD" />);

    await screen.findByTestId('buffer-by-hand-toggle');
    expect(screen.queryByTestId('buffer-by-hand')).not.toBeInTheDocument();
  });

  it('keeps the MEASURED figures on screen beside the typed ones', async () => {
    /* *** finPal NEVER SILENTLY REPLACES A MEASURED FIGURE WITH A GUESS. ***
       Owner decision: both shown, the typed one labelled. */
    vi.mocked(goalService.getBufferPicture).mockResolvedValue(BUFFER);
    render(<BufferCalculator currency="USD" />);

    await userEvent.click(await screen.findByTestId('buffer-by-hand-toggle'));
    await userEvent.type(screen.getByLabelText(/Fixed costs a month/), '2050');

    // The measured six-month target is still there...
    expect(screen.getByTestId('buffer-target-6').textContent).toContain('$12,356.94');
    // ...beside the typed one, which says whose figure it is.
    const typed = screen.getByTestId('by-hand-target-6');
    expect(typed.textContent).toContain('$12,300.00');
    expect(typed.textContent).toContain('from what you said');
  });

  it('states what is spare and how long half of it takes', async () => {
    vi.mocked(goalService.getBufferPicture).mockResolvedValue(BUFFER);
    render(<BufferCalculator currency="USD" />);

    await userEvent.click(await screen.findByTestId('buffer-by-hand-toggle'));
    await userEvent.type(screen.getByLabelText(/Fixed costs a month/), '2050');
    await userEvent.type(screen.getByLabelText(/Income a month/), '4200');

    /* Scoped to the sentence, not the whole document: "12" also appears in
       the measured $12,356.94 above, and an ambiguous matcher is a test that
       passes on the wrong element. */
    const spare = screen.getByTestId('buffer-by-hand');
    expect(spare.textContent).toContain('$2,150.00');
    expect(spare.textContent).toMatch(/reaches six months in\s*12\s*months/);
    /* *** THE ASSUMPTION IS NAMED. *** finPal has no basis for choosing a
       savings rate, so "half" has to be visible as an illustration. */
    expect(screen.getByText(/not a recommendation/)).toBeInTheDocument();
  });

  it('says the costs exceed the income rather than showing nothing spare', async () => {
    vi.mocked(goalService.getBufferPicture).mockResolvedValue(BUFFER);
    render(<BufferCalculator currency="USD" />);

    await userEvent.click(await screen.findByTestId('buffer-by-hand-toggle'));
    await userEvent.type(screen.getByLabelText(/Fixed costs a month/), '2500');
    await userEvent.type(screen.getByLabelText(/Income a month/), '2200');

    expect(screen.getByText(/\$300\.00/)).toBeInTheDocument();
    expect(screen.getByText(/not the first thing to solve/)).toBeInTheDocument();
  });

  it('needs only the fixed costs — income is optional', async () => {
    vi.mocked(goalService.getBufferPicture).mockResolvedValue(BUFFER);
    const onPickTarget = vi.fn();
    render(<BufferCalculator currency="USD" onPickTarget={onPickTarget} />);

    await userEvent.click(await screen.findByTestId('buffer-by-hand-toggle'));
    await userEvent.type(screen.getByLabelText(/Fixed costs a month/), '1000');
    await userEvent.click(screen.getByTestId('by-hand-target-3'));

    expect(onPickTarget).toHaveBeenCalledWith(3000);
  });
});

describe('the sinking-fund calculator', () => {
  it('states the twelfth, which the buffer calculator deliberately does not', async () => {
    /* An emergency fund's size is a judgement finPal cannot make, so that one
       offers three months and six. A sinking fund is arithmetic: the annual
       total is observed and the divisor is twelve. */
    vi.mocked(goalService.getSinkingPicture).mockResolvedValue(SINKING);
    render(<SinkingCalculator currency="USD" />);

    expect(await screen.findByTestId('sinking-calculator')).toBeInTheDocument();
    expect(screen.getByText(/\$100\.00/)).toBeInTheDocument();
    expect(screen.getByText(/\$1,200\.00/)).toBeInTheDocument();
  });

  it('says what it counted, so an unsorted user knows the figure is short', async () => {
    vi.mocked(goalService.getSinkingPicture).mockResolvedValue(SINKING);
    render(<SinkingCalculator currency="USD" />);

    expect(await screen.findByText(/sorted as Non-monthly/)).toBeInTheDocument();
  });

  it('uses the ANNUAL total as the target, not the twelfth', async () => {
    /* The goal is the pot; the twelfth is what you put in each month. Setting
       the target to 100 would be a fund that is full after one payment. */
    vi.mocked(goalService.getSinkingPicture).mockResolvedValue(SINKING);
    const onPickTarget = vi.fn();
    render(<SinkingCalculator currency="USD" onPickTarget={onPickTarget} />);

    await userEvent.click(await screen.findByTestId('sinking-use-target'));
    expect(onPickTarget).toHaveBeenCalledWith(1200);
  });

  it('draws nothing when nothing is classified non-monthly', async () => {
    vi.mocked(goalService.getSinkingPicture).mockResolvedValue(null);
    const { container } = render(<SinkingCalculator currency="USD" />);
    await vi.waitFor(() =>
      expect(goalService.getSinkingPicture).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the currency the SERVER sent, not the page\'s', async () => {
    vi.mocked(goalService.getSinkingPicture).mockResolvedValue(SINKING);
    render(<SinkingCalculator currency="EUR" />);
    expect(await screen.findByText(/\$100\.00/)).toBeInTheDocument();
  });
});
