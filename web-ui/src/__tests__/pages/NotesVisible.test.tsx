/**
 * Notes on transactions and accounts are SHOWN, and editing an account keeps its note.
 *
 * Owner request, 2026-10-01. Both columns already existed and round-tripped through
 * the API — `Expense.notes` and `Account.description` (#129) — but neither page
 * rendered either one, so a note could be written and never seen again.
 *
 * *** AND EVERY ACCOUNT EDIT ERASED THE NOTE (D-307). *** `EditAccountForm` pre-fills
 * from `account.description` and sends it on every save, deliberately even when empty.
 * `Accounts.tsx` maps the API row into its own shape and never copied `description`
 * across — `git log -S description -- pages/Accounts.tsx` is empty — so the form always
 * opened blank and saved `''` over the stored note. D-139's own test rendered the form
 * with a hand-built account, which is why it never saw the page drop the field. The
 * last block here goes through the PAGE, and asserts on the request body.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { api } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { Transactions } from '../../pages/Transactions';
import { Accounts } from '../../pages/Accounts';
import { ToastProvider } from '../../contexts/ToastContext';

const BASE = '*';
const TX_NOTE = 'Paint for the nursery — keep the receipt for the return';
const ACCOUNT_NOTE = 'Joint account for rent, bills and the shared food shop';

beforeAll(() => { api.defaults.adapter = 'http'; });

beforeEach(() => {
  useAuthStore.setState({
    user: { id: 'alice@test.com', name: 'Alice', default_currency_code: 'USD' } as any,
    token: 'tok', refreshToken: 'r', isAuthenticated: true,
  });
  server.use(http.get(`${BASE}/api/v1/team/members`, () => HttpResponse.json([])));
});

describe('a transaction note shows on its row', () => {
  beforeEach(() => {
    const row = (id: number, description: string, notes: string | null) => ({
      id, description, notes, amount: 10, date: '2026-09-30T00:00:00',
      currency_code: 'USD', transaction_type: 'expense',
      category: { id: 1, name: 'Home' }, account: { id: 1, name: 'Checking' },
    });
    server.use(http.get(`${BASE}/api/v1/transactions/`, () => HttpResponse.json({
      success: true,
      transactions: [row(1, 'Hardware store', TX_NOTE), row(2, 'Groceries', null), row(3, 'Bakery', '   ')],
      pagination: { page: 1, per_page: 50, total: 3, pages: 1, has_next: false, has_prev: false },
      summary: { total_income: 0, total_expense: 30, net_balance: -30 },
    })));
  });

  it('renders the note text on the row that has one, and on no other', async () => {
    render(<MemoryRouter><Transactions /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Hardware store')).toBeInTheDocument());

    expect(screen.getByText(TX_NOTE)).toBeInTheDocument();
    // A null note and a whitespace-only one both render nothing, not an empty line.
    expect(document.querySelectorAll('[data-testid="row-note"]')).toHaveLength(1);
  });
});

function seedAccounts(description: string | null) {
  const accounts = [{
    id: 7, name: 'Shared', account_type: 'checking', balance: 100, currency_code: 'USD',
    institution: 'Bank', is_active: true, color: '#15803d', description,
    owner: { id: 'alice@test.com', name: 'Alice' },
  }];
  server.use(http.get(`${BASE}/api/v1/accounts`, () =>
    HttpResponse.json({ success: true, accounts })));
}

async function renderAccounts() {
  render(<MemoryRouter><ToastProvider><Accounts /></ToastProvider></MemoryRouter>);
  await waitFor(() => expect(screen.getByText('Shared')).toBeInTheDocument());
}

describe('an account note shows on its card', () => {
  it('renders the note when there is one', async () => {
    seedAccounts(ACCOUNT_NOTE);
    await renderAccounts();
    expect(screen.getByText(ACCOUNT_NOTE)).toBeInTheDocument();
  });

  it('renders nothing when there is none', async () => {
    seedAccounts(null);
    await renderAccounts();
    expect(document.querySelectorAll('[data-testid="row-note"]')).toHaveLength(0);
  });
});

describe('D-307: editing an account through the page keeps its note', () => {
  it('opens the edit form showing the stored note, and saves it unchanged', async () => {
    seedAccounts(ACCOUNT_NOTE);
    let sent: any = null;
    server.use(http.put(`${BASE}/api/v1/accounts/7`, async ({ request }) => {
      sent = await request.json();
      return HttpResponse.json({ success: true, account: { id: 7 }, message: 'ok' });
    }));
    await renderAccounts();

    fireEvent.click(screen.getAllByLabelText('Edit account')[0]);
    const box = await screen.findByDisplayValue(ACCOUNT_NOTE);
    expect(box.tagName).toBe('TEXTAREA');

    fireEvent.submit(box.closest('form')!);
    await waitFor(() => expect(sent).not.toBeNull());
    expect(sent.description).toBe(ACCOUNT_NOTE);
  });
});
