/**
 * Available credit, on a card that is owed money and on one that is overpaid.
 *
 * *** THIS UI HAS BEEN UNREACHABLE UNTIL NOW AND B1 SWITCHES IT ON. ***
 * `Accounts.tsx` has mapped `acc.credit_limit` into `creditLimit`/`availableCredit`
 * and gated the block on `account.creditLimit` for as long as the block has
 * existed -- against a payload that never carried the field, so the condition was
 * always false and the arithmetic was never executed by anyone. Adding
 * `credit_limit` to the account payload is what makes it render, which means the
 * change that adds a column also ships a calculation nobody has ever checked.
 *
 * The spec flags the same shape in `helpers.py:285` as *suspected, unverified* and
 * declines to file it, because D-90 -- a false defect report opened from a grep --
 * forbids opening a row on a read alone. So this file reproduces it behaviourally
 * instead of reasoning about it: the overpaid case is a rendered number, and it
 * was wrong.
 *
 * Card debt is a NEGATIVE balance (verified: `balances.py::_move` applies one rule
 * for every account type). An OVERPAID card is a POSITIVE one -- the bank owes the
 * user -- and `limit - Math.abs(balance)` subtracts that credit instead of adding
 * it, understating available credit by twice the overpayment.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { api } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { Accounts } from '../../pages/Accounts';

vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
  ToastProvider: ({ children }: any) => children,
}));

const BASE = '*';

beforeAll(() => { api.defaults.adapter = 'http'; });

beforeEach(() => {
  useAuthStore.setState({
    user: { id: 'alice@test.com', name: 'Alice', default_currency_code: 'USD' } as any,
    token: 'tok', refreshToken: 'r', isAuthenticated: true,
  });
});

function mockCard(balance: number, creditLimit: number | null) {
  server.use(
    http.get(`${BASE}/api/v1/accounts`, () => HttpResponse.json({
      success: true,
      accounts: [{
        id: 1, name: 'Chase Amazon', account_type: 'credit', balance,
        credit_limit: creditLimit, apr: 19.99, min_payment: 35,
        currency_code: 'USD', user_id: 'alice@test.com',
        owner: { id: 'alice@test.com', name: 'Alice', color: '#15803d', emoji: null },
        owners: [],
      }],
    })),
    http.get(`${BASE}/api/v1/team/members`, () => HttpResponse.json([
      { id: 'alice@test.com', name: 'Alice', email: 'alice@test.com',
        role: 'owner', joinedAt: '' },
    ])),
  );
}

describe('Accounts — available credit', () => {
  it('shows limit minus what is owed on an ordinary card', async () => {
    // Owing $1,125.41 against a $5,000 limit leaves $3,874.59.
    mockCard(-1125.41, 5000);
    render(<MemoryRouter><Accounts /></MemoryRouter>);

    expect(await screen.findByText('Available Credit')).toBeInTheDocument();
    expect(screen.getByText('$3,874.59')).toBeInTheDocument();
  });

  it('does not show the block at all when no limit is recorded', async () => {
    // NULL is "not stated", not zero. Inventing a limit here would put a made-up
    // available-credit figure on screen, which is what D-77's fabricated analytics
    // figures were.
    mockCard(-1125.41, null);
    render(<MemoryRouter><Accounts /></MemoryRouter>);

    await screen.findByText('Chase Amazon');
    expect(screen.queryByText('Available Credit')).not.toBeInTheDocument();
  });

  it('ADDS an overpayment to the limit instead of subtracting it', async () => {
    // *** THE DEFECT THIS FILE WAS WRITTEN TO CATCH. ***
    // A $200 credit balance on a $5,000 card means $5,200 is available, not
    // $4,800. `limit - Math.abs(balance)` gives 4,800: it treats money the bank
    // owes YOU as money you owe THEM, and is wrong by twice the overpayment.
    mockCard(200, 5000);
    render(<MemoryRouter><Accounts /></MemoryRouter>);

    expect(await screen.findByText('Available Credit')).toBeInTheDocument();
    expect(screen.getByText('$5,200.00')).toBeInTheDocument();
    expect(screen.queryByText('$4,800.00')).not.toBeInTheDocument();
  });

  it('shows zero available on a card at its limit, not a negative', async () => {
    mockCard(-5000, 5000);
    render(<MemoryRouter><Accounts /></MemoryRouter>);

    // Scoped to the block: the page's summary tiles also render $0.00 here, and
    // an unscoped match would pass on one of those instead.
    const label = await screen.findByText('Available Credit');
    expect(label.parentElement).toHaveTextContent('$0.00');
  });
});
