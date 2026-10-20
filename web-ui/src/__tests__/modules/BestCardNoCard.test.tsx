/**
 * D-318: "no card covers this" is the server's 404 `{"message": "No cards found for 'gas'"}` (measured 2026-10-20 on
 * the core and premium demos). The page used to show its "couldn't work out the best card" error for it. It now says
 * no card covers the category; a genuine failure still shows the error. The category labels carry no emoji (core).
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { api } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import BestCard from '../../modules/pointspal/pages/BestCard';

const WIN = {
  category: 'travel', amount: 125,
  winner: { card_name: 'Sapphire', issuer: 'Chase', pts_earned: 375, value_usd: 3.75, effective_rate: 3, cap_note: null },
  displaced_winner: null,
  all_cards: [{ card_name: 'Sapphire', program: 'Ultimate Rewards', nominal_rate: 3, effective_rate: 3, pts_earned: 375,
    value_usd: 3.75, status: 'ok', cap_pct: null, tag: 'best' }],
};

beforeAll(() => {
  api.defaults.adapter = 'http';
});
beforeEach(() => {
  useAuthStore.setState({
    user: { id: 'alice@test.com', name: 'Alice', default_currency_code: 'USD' } as never,
    token: 'tok', refreshToken: 'r', isAuthenticated: true,
  });
});

function page() {
  render(<MemoryRouter><BestCard /></MemoryRouter>);
}
async function lookUp(categoryLabel: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: new RegExp(`^${categoryLabel}$`) }));
  await user.type(screen.getByPlaceholderText('0.00'), '125');
  await user.click(screen.getByRole('button', { name: /find best/i }));
}

describe('Best Card: no card covers this (D-318)', () => {
  it('says no card covers the category when the server answers its 404', async () => {
    server.use(http.get('*/api/v1/pointspal/recommend', () =>
      HttpResponse.json({ message: "No cards found for 'gas'" }, { status: 404 })));
    page();
    await lookUp('Gas');
    const none = await screen.findByTestId('best-card-none');
    expect(none.textContent).toContain('No card covers this');
    expect(none.textContent).toContain('bonus on gas');
    expect(screen.queryByText(/couldn't work out the best card/)).toBeNull();
  });

  it('still shows the error for a real failure', async () => {
    server.use(http.get('*/api/v1/pointspal/recommend', () => HttpResponse.json({ error: 'boom' }, { status: 500 })));
    page();
    await lookUp('Gas');
    await waitFor(() => expect(screen.getByText(/couldn't work out the best card/)).toBeTruthy());
    expect(screen.queryByTestId('best-card-none')).toBeNull();
  });

  it('shows the winner when a card covers it', async () => {
    server.use(http.get('*/api/v1/pointspal/recommend', () => HttpResponse.json(WIN)));
    page();
    await lookUp('Travel');
    await waitFor(() => expect(screen.getAllByText('Sapphire').length).toBeGreaterThan(0));
    expect(screen.queryByTestId('best-card-none')).toBeNull();
  });
});

describe('category labels carry no emoji (voice rule)', () => {
  const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u;
  it('the page source names the eight categories plainly', async () => {
    const { readFileSync } = await import('fs');
    const src = readFileSync('src/modules/pointspal/pages/BestCard.tsx', 'utf8');
    const block = src.slice(src.indexOf('const CATEGORIES'), src.indexOf('];', src.indexOf('const CATEGORIES')));
    expect((block.match(/value: '/g) ?? []).length).toBe(8);
    expect(block).not.toMatch(EMOJI);
  });
});
