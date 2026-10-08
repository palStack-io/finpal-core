/**
 * The first-visit card on Accounts and Investments. What can go wrong in the
 * client: showing a card the user already dismissed, showing a blank one when
 * the server sent none, and hiding a card whose dismissal was never stored.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { FirstVisitCard } from '../../components/onboarding/FirstVisitCard';

const getFirstVisit = vi.fn();
const getCatalog = vi.fn();
const dismissFirstVisit = vi.fn();

vi.mock('../../services/onboardingService', () => ({
  onboardingService: {
    getFirstVisit: (...a: unknown[]) => getFirstVisit(...a),
    getCatalog: (...a: unknown[]) => getCatalog(...a),
    dismissFirstVisit: (...a: unknown[]) => dismissFirstVisit(...a),
  },
}));

const CARD = {
  heading: 'How your bank gets here',
  lines: ['The first sync asks for the last 90 days.', 'It varies by bank.'],
};

beforeEach(() => {
  vi.clearAllMocks();
  getCatalog.mockResolvedValue({ first_visit: { accounts: CARD } });
});

describe('FirstVisitCard', () => {
  it('shows the server\'s heading and every line to a user who has not dismissed it', async () => {
    getFirstVisit.mockResolvedValue({ dismissed: [] });
    render(<FirstVisitCard page="accounts" />);
    expect(await screen.findByRole('heading', { name: CARD.heading })).toBeTruthy();
    for (const line of CARD.lines) expect(screen.getByText(line)).toBeTruthy();
  });

  it('shows nothing, and never fetches the copy, once dismissed', async () => {
    getFirstVisit.mockResolvedValue({ dismissed: ['accounts'] });
    const { container } = render(<FirstVisitCard page="accounts" />);
    await waitFor(() => expect(getFirstVisit).toHaveBeenCalled());
    expect(getCatalog).not.toHaveBeenCalled();
    expect(container.textContent).toBe('');
  });

  it('shows nothing when the server sent no card for the page', async () => {
    getFirstVisit.mockResolvedValue({ dismissed: [] });
    const { container } = render(<FirstVisitCard page="investments" />);
    await waitFor(() => expect(getCatalog).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });

  it('shows nothing when the dismissal state cannot be read', async () => {
    getFirstVisit.mockRejectedValue(new Error('network'));
    const { container } = render(<FirstVisitCard page="accounts" />);
    await waitFor(() => expect(getFirstVisit).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });

  it('stores the dismissal on the server and then disappears', async () => {
    getFirstVisit.mockResolvedValue({ dismissed: [] });
    dismissFirstVisit.mockResolvedValue({ dismissed: ['accounts'] });
    render(<FirstVisitCard page="accounts" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Got it' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: CARD.heading })).toBeNull());
    expect(dismissFirstVisit).toHaveBeenCalledWith('accounts');
  });

  it('stays on screen when the dismissal was not stored, so it can be retried', async () => {
    getFirstVisit.mockResolvedValue({ dismissed: [] });
    dismissFirstVisit.mockRejectedValue(new Error('500'));
    render(<FirstVisitCard page="accounts" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Got it' }));
    await waitFor(() => expect(dismissFirstVisit).toHaveBeenCalled());
    expect(screen.getByRole('heading', { name: CARD.heading })).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Got it' }) as HTMLButtonElement).disabled).toBe(false);
  });
});
