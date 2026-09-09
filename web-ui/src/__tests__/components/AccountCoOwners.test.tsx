/**
 * A co-owned account reads as "Joint", and can be made one from the list.
 *
 * *** THE COPY IS PART OF THE CORRECTNESS HERE. *** Co-ownership changes who may
 * manage the account and what it is called. It does NOT change attribution: a
 * charge on a joint card is still the primary owner's spending in every figure the
 * app computes. A user who read "co-owner" as "we split this" would be looking at
 * dashboard numbers that disagree with what they think they set up, so the panel
 * says so and this file asserts that it does.
 *
 * Asserted on rendered output and on the request body, never on a status code.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

const ALICE = { id: 'alice@test.com', name: 'Alice', email: 'alice@test.com',
                role: 'owner', joinedAt: '' };
const BOB = { id: 'bob@test.com', name: 'Bob', email: 'bob@test.com',
              role: 'member', joinedAt: '' };

const ALICE_OWNER = { id: 'alice@test.com', name: 'Alice', color: '#15803d', emoji: null };
const BOB_OWNER = { id: 'bob@test.com', name: 'Bob', color: '#123456', emoji: null };

function mockAccounts(accounts: unknown[], members: unknown[] = [ALICE, BOB]) {
  server.use(
    http.get(`${BASE}/api/v1/accounts`, () =>
      HttpResponse.json({ success: true, accounts })),
    http.get(`${BASE}/api/v1/team/members`, () => HttpResponse.json(members)),
  );
}

const SOLO = {
  id: 1, name: 'Alice Checking', account_type: 'checking', balance: 1104.55,
  currency_code: 'USD', user_id: 'alice@test.com', owner: ALICE_OWNER, owners: [],
};

const JOINT = { ...SOLO, id: 2, name: 'Joint Checking', owners: [BOB_OWNER] };

describe('Accounts — a co-owned account reads as Joint', () => {
  it('labels a co-owned account Joint and names both people', async () => {
    mockAccounts([JOINT]);
    render(<MemoryRouter><Accounts /></MemoryRouter>);

    expect(await screen.findByText(/Joint · Alice & Bob/)).toBeInTheDocument();
  });

  it('leaves a solo account labelled with its owner alone', async () => {
    mockAccounts([SOLO]);
    render(<MemoryRouter><Accounts /></MemoryRouter>);

    await screen.findByText('Alice Checking');
    expect(screen.queryByText(/Joint/)).not.toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('says attribution has NOT moved, because "co-owner" does not say that', async () => {
    mockAccounts([JOINT]);
    render(<MemoryRouter><Accounts /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: /Manage co-owners/i }));

    expect(
      screen.getByText(/still counted as the primary owner/i),
    ).toBeInTheDocument();
  });
});

describe('Accounts — making one joint', () => {
  it('POSTs the chosen member and refetches', async () => {
    let body: any = null;
    let getCount = 0;
    server.use(
      http.get(`${BASE}/api/v1/accounts`, () => {
        getCount += 1;
        return HttpResponse.json({ success: true, accounts: [SOLO] });
      }),
      http.get(`${BASE}/api/v1/team/members`, () => HttpResponse.json([ALICE, BOB])),
      http.post(`${BASE}/api/v1/accounts/1/owners`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ success: true, account: { ...SOLO, owners: [BOB_OWNER] } });
      }),
    );

    render(<MemoryRouter><Accounts /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: /Share this account/i }));
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: /Add a co-owner/i }), 'bob@test.com');

    await waitFor(() => expect(body).toEqual({ user_id: 'bob@test.com' }));
    // Refetched rather than patched locally: the server owns this list.
    await waitFor(() => expect(getCount).toBeGreaterThan(1));
  });

  it('never offers the PRIMARY owner as their own co-owner', async () => {
    // The server answers 400 for it, so offering it is an affordance that lies.
    mockAccounts([SOLO]);
    render(<MemoryRouter><Accounts /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: /Share this account/i }));

    const select = screen.getByRole('combobox', { name: /Add a co-owner/i });
    const options = within(select).getAllByRole('option').map((o) => o.textContent);
    expect(options).toContain('Bob');
    expect(options).not.toContain('Alice');
  });

  it('never offers someone who is ALREADY a co-owner', async () => {
    mockAccounts([JOINT]);
    render(<MemoryRouter><Accounts /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: /Manage co-owners/i }));

    expect(screen.getByText(/Everyone in your household already owns/i)).toBeInTheDocument();
  });

  it('offers no co-owner control at all in a ONE-member household', async () => {
    // With one member there is nobody to share with, and a picker with no valid
    // option is an affordance that cannot do anything.
    mockAccounts([SOLO], [ALICE]);
    render(<MemoryRouter><Accounts /></MemoryRouter>);

    await screen.findByText('Alice Checking');
    expect(screen.queryByRole('button', { name: /Share this account/i })).not.toBeInTheDocument();
  });

  it('DELETEs the right member when a chip is dismissed', async () => {
    let deleted: string | null = null;
    mockAccounts([JOINT]);
    server.use(
      http.delete(`${BASE}/api/v1/accounts/2/owners/:userId`, ({ params }) => {
        deleted = params.userId as string;
        return HttpResponse.json({ success: true, account: { ...JOINT, owners: [] } });
      }),
    );

    render(<MemoryRouter><Accounts /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: /Manage co-owners/i }));
    await userEvent.click(screen.getByRole('button', { name: /Remove Bob as a co-owner/i }));

    await waitFor(() => expect(deleted).toBe('bob@test.com'));
  });
});
