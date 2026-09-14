import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { Kit } from '../../pages/Kit';

vi.mock('../../services/coinService', () => ({
  coinService: {
    getWallet: vi.fn(),
    buy: vi.fn(),
  },
}));

import { coinService } from '../../services/coinService';

const WALLET = {
  earned: 6500,
  balance: 540,
  acts: [
    { slug: 'debt_rates', title: 'Know what your debt costs', coins: 1200,
      revealed: 'Visa is at 19.99%, which costs you $13.33 a month.' },
    { slug: 'has_a_goal', title: 'Name what you are working toward', coins: 0,
      revealed: null },
  ],
  gear: [
    { slug: 'map', price: 100, owned: true },
    { slug: 'headlamp', price: 700, owned: false },
    { slug: 'oxygen', price: 900, owned: false },
  ],
};

describe('Your kit', () => {
  beforeEach(() => {
    vi.mocked(coinService.getWallet).mockResolvedValue(WALLET as never);
  });

  it('renders at all', async () => {
    render(<Kit />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Your kit' }))
      .toBeTruthy();
  });

  it('shows NO denominator anywhere except the price you are saving toward',
    async () => {
      render(<Kit />);
      await screen.findByRole('heading', { level: 1, name: 'Your kit' });
      // `540 / 700` is permitted — a price is a target the user chose. The
      // banned shape is the WORD "of", which is what all six live instances used.
      expect(document.body.textContent).not.toMatch(/\b\d[\d,]*\s+of\s+\d/);
    });

  it('*** RENDERS NOTHING FOR AN ACT WHOSE PAYOFF IS NULL ***', async () => {
    /* Not a placeholder, not "well done". Four payoffs were caught on
       2026-09-14 returning copy that claimed an act was done beside
       `coins: 0`; a fallback here would put that straight back. */
    render(<Kit />);
    await screen.findByRole('heading', { level: 1, name: 'Your kit' });

    const row = screen.getByTestId('act-has_a_goal');
    expect(row.textContent).toContain('Name what you are working toward');
    expect(row.querySelector('p')).toBeNull();
  });

  it('offers Buy only for gear the balance can actually cover', async () => {
    render(<Kit />);
    await screen.findByRole('heading', { level: 1, name: 'Your kit' });

    // 540 covers nothing here: map is owned, headlamp is 700, oxygen is 900.
    expect(screen.queryAllByRole('button', { name: 'Buy' })).toHaveLength(0);
    expect(screen.getByTestId('gear-map').textContent).toContain('owned');
    // The cheapest unowned piece is the one being saved for, and it is the ONE
    // progress bar the product allows.
    await waitFor(() => expect(screen.getByTestId('gear-saving-bar')).toBeTruthy());
  });
});
