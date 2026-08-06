/**
 * An account has to say who it belongs to, and creating one has to let you choose.
 *
 * Item A of the D-18 build. Under the household model settled on 2026-08-06 the
 * accounts list is **household-wide**, and a transaction's attribution derives from
 * the account it sits on. So a list that shows every member's accounts while
 * labelling none of them makes every row read as the signed-in user's — and it is
 * the reason a member who has entered nothing can show the household's whole income
 * as their own surplus.
 *
 * Asserted on rendered output and on the request body, never on a status code: the
 * bug being prevented here returns 201 and renders a perfectly ordinary account.
 *
 * The picker is deliberately hidden for a single-member household — with one member
 * there is nothing to choose — so each test states which household it is in.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { api } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { Accounts } from '../../pages/Accounts';

// Following App_routes.test.tsx: the page reads ToastContext, and a toast is not
// what any assertion here is about — the in-form error box is.
vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
  ToastProvider: ({ children }: any) => children,
}));

const BASE = 'http://localhost';

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

const ALICE = { id: 'alice@test.com', name: 'Alice', email: 'alice@test.com',
                role: 'owner', joinedAt: '' };
const BOB = { id: 'bob@test.com', name: 'Bob', email: 'bob@test.com',
              role: 'member', joinedAt: '' };

/** Two accounts, one owned by each member — what the household list really returns. */
const HOUSEHOLD_ACCOUNTS = [
  {
    id: 1, name: 'Alice Checking', account_type: 'checking', balance: 1104.55,
    currency_code: 'USD', user_id: 'alice@test.com',
    owner: { id: 'alice@test.com', name: 'Alice', color: '#15803d', emoji: null },
  },
  {
    id: 2, name: 'Bob Savings', account_type: 'savings', balance: 612.40,
    currency_code: 'USD', user_id: 'bob@test.com',
    owner: { id: 'bob@test.com', name: 'Bob', color: '#123456', emoji: '🦊' },
  },
];

function mockAccounts(accounts: unknown[], members: unknown[]) {
  server.use(
    http.get(`${BASE}/api/v1/accounts`, () =>
      HttpResponse.json({ success: true, accounts })),
    http.get(`${BASE}/api/v1/team/members`, () => HttpResponse.json(members)),
  );
}

describe('Accounts page — whose account is this', () => {
  it('names the owner of every row when the household has more than one member', async () => {
    mockAccounts(HOUSEHOLD_ACCOUNTS, [ALICE, BOB]);

    render(<MemoryRouter><Accounts /></MemoryRouter>);

    await waitFor(() => expect(screen.getByText('Bob Savings')).toBeInTheDocument());

    // The discriminating assertion: the housemate's name is on screen as its own
    // badge. Matched exactly — /Bob/ would also match the account name "Bob
    // Savings" and pass without any label being rendered at all.
    await waitFor(() => expect(screen.getByText('🦊 Bob')).toBeInTheDocument());
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('does not label anything in a single-member household', async () => {
    mockAccounts([HOUSEHOLD_ACCOUNTS[0]], [ALICE]);

    render(<MemoryRouter><Accounts /></MemoryRouter>);

    await waitFor(() =>
      expect(screen.getByText('Alice Checking')).toBeInTheDocument());

    // "Alice" appears nowhere as an owner badge: with one member every account is
    // hers, and a badge repeating that on each row is noise rather than information.
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
  });
});

describe('Creating an account assigns it to a member', () => {
  it('sends owner_id when a housemate is chosen', async () => {
    let sent: Record<string, unknown> | null = null;

    mockAccounts(HOUSEHOLD_ACCOUNTS, [ALICE, BOB]);
    server.use(
      http.post(`${BASE}/api/v1/accounts`, async ({ request }) => {
        sent = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          { success: true, account: { id: 3, name: 'Joint Card' } }, { status: 201 });
      }),
    );

    render(<MemoryRouter><Accounts /></MemoryRouter>);
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText('Alice Checking')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /add account/i }));

    await waitFor(() =>
      expect(screen.getByLabelText(/belongs to/i)).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText(/Main Checking Account/i), 'Joint Card');
    await user.type(screen.getByPlaceholderText('0.00'), '25');
    await user.selectOptions(screen.getByLabelText(/belongs to/i), 'bob@test.com');
    await user.click(screen.getByRole('button', { name: /^create account$/i }));

    await waitFor(() => expect(sent).not.toBeNull());
    expect(sent!.owner_id).toBe('bob@test.com');
  });

  it('omits owner_id entirely when the account is the caller\'s own', async () => {
    let sent: Record<string, unknown> | null = null;

    mockAccounts(HOUSEHOLD_ACCOUNTS, [ALICE, BOB]);
    server.use(
      http.post(`${BASE}/api/v1/accounts`, async ({ request }) => {
        sent = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          { success: true, account: { id: 3, name: 'Mine' } }, { status: 201 });
      }),
    );

    render(<MemoryRouter><Accounts /></MemoryRouter>);
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText('Alice Checking')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /add account/i }));
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/Main Checking Account/i)).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText(/Main Checking Account/i), 'Mine');
    await user.type(screen.getByPlaceholderText('0.00'), '10');
    await user.click(screen.getByRole('button', { name: /^create account$/i }));

    await waitFor(() => expect(sent).not.toBeNull());
    // Absent, not an empty string: the server defaults an omitted owner to the
    // caller, and handing it '' would make it interpret a blank id.
    expect('owner_id' in sent!).toBe(false);
  });
});

describe('A refused assignment tells the user why', () => {
  it('shows the server\'s reason for a 400, not axios\'s status-code message', async () => {
    mockAccounts(HOUSEHOLD_ACCOUNTS, [ALICE, BOB]);
    server.use(
      http.post(`${BASE}/api/v1/accounts`, () =>
        HttpResponse.json(
          { success: false, error: 'Owner must be a member of this household' },
          { status: 400 })),
    );

    render(<MemoryRouter><Accounts /></MemoryRouter>);
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText('Alice Checking')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /add account/i }));
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/Main Checking Account/i)).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText(/Main Checking Account/i), 'Nope');
    await user.type(screen.getByPlaceholderText('0.00'), '5');
    await user.click(screen.getByRole('button', { name: /^create account$/i }));

    // The whole point: axios sets err.message to "Request failed with status code
    // 400", and this form used to render exactly that.
    await waitFor(() => expect(
      screen.getByText('Owner must be a member of this household'),
    ).toBeInTheDocument());
    expect(
      screen.queryByText(/Request failed with status code/),
    ).not.toBeInTheDocument();
  });
});
