/**
 * The two things the Goals page now offers before a goal exists.
 *
 * *** BOTH RENDER NOTHING WHEN THEY HAVE NOTHING TO SAY, AND THAT IS THE
 * FEATURE. *** A page that always has advice is a page whose advice means
 * nothing — the same reason `coverage` returns `None` for a dormant act rather
 * than a zero. Neither draws an empty state, a placeholder, or a box.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../services/goalService', () => ({
  goalService: { getSuggestions: vi.fn(), getBufferPicture: vi.fn() },
}));
import { goalService } from '../../services/goalService';
import { GoalSuggestions } from '../../components/goals/GoalSuggestions';
import { BufferCalculator } from '../../components/goals/BufferCalculator';


/**
 * *** A LOADING COMPONENT IS ALSO EMPTY, AND THAT BROKE THESE TESTS. ***
 * `waitFor(() => expect(container).toBeEmptyDOMElement())` passes on the FIRST
 * tick, before the fetch resolves — so it asserted the loading state and
 * proved nothing about the resolved one. Both empty-state sabotages passed
 * against it.
 *
 * This waits for the request to have been made AND for its state update to
 * flush, so "still empty" is a statement about the answer.
 */
async function settled(mock: { mock: { calls: unknown[] } }) {
  await waitFor(() => expect(mock.mock.calls.length).toBeGreaterThan(0));
  await act(async () => { await Promise.resolve(); });
}

const SUGGESTION = {
  kind: 'savings' as const,
  headline: 'Start a buffer',
  because: 'You are carrying debt and have no savings goal.',
  lesson_slug: 'why-a-buffer-comes-first',
  check: 'has_debt_and_no_savings_goal',
};

beforeEach(() => {
  vi.mocked(goalService.getSuggestions).mockReset();
  vi.mocked(goalService.getBufferPicture).mockReset();
});

describe('goal suggestions', () => {
  it('names the CONDITION, not just the action', async () => {
    /* Voice rule 11: name the conditions, then name what is still yours.
       Stating what finPal observed lets the reader disagree with the premise
       rather than only with the advice — the difference between a suggestion
       and a nag. */
    vi.mocked(goalService.getSuggestions).mockResolvedValue([SUGGESTION]);
    render(<GoalSuggestions onStart={() => {}} />);

    expect(await screen.findByText('Start a buffer')).toBeInTheDocument();
    expect(screen.getByText(/carrying debt and have no savings goal/)).toBeInTheDocument();
  });

  it('*** RENDERS NOTHING AT ALL WHEN THERE IS NOTHING TO SUGGEST ***', async () => {
    vi.mocked(goalService.getSuggestions).mockResolvedValue([]);
    const { container } = render(<GoalSuggestions onStart={() => {}} />);
    await settled(vi.mocked(goalService.getSuggestions));
    expect(container).toBeEmptyDOMElement();
  });

  it('stays silent when the request fails, rather than shouting', async () => {
    // A suggestion is an extra. An error banner over a working goals page
    // would be the page complaining about the wrong thing.
    vi.mocked(goalService.getSuggestions).mockRejectedValue(new Error('nope'));
    const { container } = render(<GoalSuggestions onStart={() => {}} />);
    await settled(vi.mocked(goalService.getSuggestions));
    expect(container).toBeEmptyDOMElement();
  });

  it('opens the create panel on the suggestion\'s own KIND CHOICE', async () => {
    /* *** IT USED TO HAND BACK THE STORED KIND, WHICH IS LOSSY. *** Both
       savings suggestions arrive as `'savings'`, so a picker preselected
       from that alone cannot tell an emergency fund from a sinking fund.
       `choiceForSuggestion` keys on the CHECK name instead — an identifier,
       not copy somebody will reword.

       The whole row is the button now, not a "Start one" inside it: the card
       shrank to one line on 2026-09-20 because three always-on panels were
       half the first screen. */
    vi.mocked(goalService.getSuggestions).mockResolvedValue([SUGGESTION]);
    const onStart = vi.fn();
    render(<GoalSuggestions onStart={onStart} />);

    await userEvent.click(
      await screen.findByTestId(`suggestion-${SUGGESTION.check}`));
    expect(onStart).toHaveBeenCalledWith('buffer');
  });
});

describe('the buffer calculator', () => {
  const PICTURE = {
    essential_monthly: 2000,
    held: 8000,
    months_covered: 4,
    targets: [
      { months: 3, target: 6000, short_by: -2000 },
      { months: 6, target: 12000, short_by: 4000 },
    ],
  };

  it('offers both conventions and recommends NEITHER', async () => {
    /* Three and six are conventions, not facts: which is right depends on job
       security, dependants and health, none of which finPal knows. */
    vi.mocked(goalService.getBufferPicture).mockResolvedValue(PICTURE);
    const { container } = render(<BufferCalculator currency="USD" />);

    await screen.findByTestId('buffer-target-3');
    expect(screen.getByTestId('buffer-target-6')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/recommend|you should|we suggest/i);
  });

  it('says a covered target is covered, and by how much', async () => {
    // `short_by` is NOT clamped: "2,000 over" is worth knowing, and a 0 would
    // read as "exactly enough", which is a different fact.
    vi.mocked(goalService.getBufferPicture).mockResolvedValue(PICTURE);
    render(<BufferCalculator currency="USD" />);

    const three = await screen.findByTestId('buffer-target-3');
    expect(three.textContent).toMatch(/covered/);
    expect(await screen.findByTestId('buffer-target-6')).toHaveTextContent(/to go/);
  });

  it('*** STATES WHAT IT COUNTED ***', async () => {
    /* The target is built from spending sorted as Fixed, so an unsorted user
       gets an UNDERSTATED target — the dangerous direction. The basis is
       printed rather than assumed. */
    vi.mocked(goalService.getBufferPicture).mockResolvedValue(PICTURE);
    render(<BufferCalculator currency="USD" />);
    expect(await screen.findByText(/sorted as Fixed/)).toBeInTheDocument();
  });

  it('*** DRAWS NO ZERO TARGET WHEN finPal CANNOT SAY ***', async () => {
    // "You need $0.00" is a sentence finPal cannot justify — the same
    // fail-closed rule the coin payoffs follow.
    vi.mocked(goalService.getBufferPicture).mockResolvedValue(null);
    const { container } = render(<BufferCalculator currency="USD" />);
    await settled(vi.mocked(goalService.getBufferPicture));
    expect(container).toBeEmptyDOMElement();
  });
});
