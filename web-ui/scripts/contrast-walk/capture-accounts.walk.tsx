/**
 * Renders the real Accounts page at several account counts, so the question
 * "does this list get dense enough to want slice 3's treatment?" is answered by
 * measuring rather than by opinion.
 *
 * *** THE COUNTS ARE INVENTED AND THAT IS THE POINT TO REMEMBER. *** Slice 3's
 * density argument rested on PER_PAGE = 50, which is what the app actually
 * serves. Here there is no equivalent constant — a household has as many
 * accounts as it has. So this locates a THRESHOLD; it does not establish that
 * anyone is over it.
 */
import { it, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { server } from '../../src/__tests__/mocks/server';
import { api } from '../../src/services/api';
import { useAuthStore } from '../../src/store/authStore';
import { Accounts } from '../../src/pages/Accounts';
import { ToastProvider } from '../../src/contexts/ToastContext';

const BASE = '*';
const OUT = join(__dirname, 'captured');
const COUNTS = [2, 8, 20];

beforeAll(() => { api.defaults.adapter = 'http'; });
beforeEach(() => {
  useAuthStore.setState({
    user: { id: 'alice@test.com', name: 'Alice', default_currency_code: 'GBP' } as any,
    token: 'tok', refreshToken: 'r', isAuthenticated: true,
  });
});

const NAMES = ['Everyday Current', 'Joint Current', 'Savings Pot', 'Sam Credit',
  'Travel Card', 'Emergency Fund', 'Old Current', 'Cash ISA', 'Stocks ISA',
  'Car Fund', 'House Fund', 'Bills Pot', 'Holiday Pot', 'Amex', 'Barclaycard',
  'Monzo', 'Starling', 'Chase Saver', 'Premium Bonds', 'Pension Cash'];

it.each(COUNTS)('captures the Accounts page with %i accounts', async (n) => {
  const accounts = Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: NAMES[i % NAMES.length],
    account_type: i % 3 === 0 ? 'checking' : i % 3 === 1 ? 'savings' : 'credit',
    balance: 1000 + i * 137.5,
    currency_code: 'GBP',
    institution: 'Bank',
    is_active: true,
    color: '#15803d',
    owner: { id: 'alice@test.com', name: 'Alice' },
  }));

  server.use(
    http.get(`${BASE}/api/v1/accounts`, () =>
      HttpResponse.json({ success: true, accounts })),
    http.get(`${BASE}/api/v1/team/members`, () => HttpResponse.json([
      { id: 'alice@test.com', name: 'Alice', email: 'alice@test.com', role: 'owner', joinedAt: '2026-01-01' },
    ])),
  );

  const { container } = render(
    <MemoryRouter><ToastProvider><Accounts /></ToastProvider></MemoryRouter>
  );
  await waitFor(() => expect(screen.getAllByText(NAMES[0]).length).toBeGreaterThan(0),
    { timeout: 5000 });

  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `accounts.${n}.html`), container.innerHTML, 'utf8');
  // eslint-disable-next-line no-console
  console.log(`CAPTURED ${n} accounts`);
});
