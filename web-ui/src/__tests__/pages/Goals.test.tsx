/**
 * The goals page renders the SERVER's progress and never works one out.
 *
 * *** THE DISCRIMINATING TEST IS THE LAST ONE IN THE FIRST BLOCK. *** It serves a
 * payload whose `progress` deliberately does not match `(current - start) /
 * (target - start)`. A page that derives the percentage renders the derived one
 * and passes every other test here; only this one tells them apart. That is
 * D-101's shape -- web-ui and mobile disagreed about the same figure for months
 * because each computed it, and TypeScript cannot catch it, because the number is
 * the right type and the wrong value.
 *
 * Asserted on rendered output and on the request body, never on a status code.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { api } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { Goals } from '../../pages/Goals';

vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
  ToastProvider: ({ children }: any) => children,
}));

// A WILDCARD ORIGIN. `http://localhost` matches nothing in CI, where requests
// arrive relative, and a bare path is resolved against the jsdom origin.
const BASE = '*';

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

const PAYOFF_GOAL = {
  id: 1,
  user_id: 'alice@test.com',
  name: 'Pay off Chase Amazon',
  kind: 'payoff',
  scope: 'personal',
  account_id: 7,
  account_name: 'Chase Amazon',
  target_amount: 0,
  start_amount: -1125.41,
  current_manual: null,
  currency_code: 'USD',
  start_date: '2026-01-01',
  target_date: null,
  status: 'active',
  achieved_at: null,
  current_amount: -450,
  direction: 'paydown',
  progress: 0.6001457246692317,
};

function mockGoals(goals: unknown[], accounts: unknown[] = []) {
  server.use(
    http.get(`${BASE}/api/v1/goals`, () => HttpResponse.json({ success: true, goals })),
    http.get(`${BASE}/api/v1/accounts`, () =>
      HttpResponse.json({ success: true, accounts })),
  );
}

describe('Goals page — the percentage is the server’s', () => {
  it('renders the goal, the account it tracks and the server’s percentage', async () => {
    mockGoals([PAYOFF_GOAL]);

    render(<MemoryRouter><Goals /></MemoryRouter>);

    expect(await screen.findByText('Pay off Chase Amazon')).toBeInTheDocument();
    expect(screen.getByText(/Tracking Chase Amazon/)).toBeInTheDocument();
    expect(screen.getByText('60%')).toBeInTheDocument();
  });

  it('renders a payload whose progress DISAGREES with the amounts, as sent', async () => {
    // *** THE ONE THAT CATCHES A CLIENT-SIDE DERIVATION. ***
    // (current − start) / (target − start) = (900 − 0) / (1000 − 0) = 90%.
    // The server says 42%. A page that derives shows 90% and a page that renders
    // what it was given shows 42%. Contrived on purpose: nothing else in this file
    // can tell the two implementations apart.
    mockGoals([{
      ...PAYOFF_GOAL, id: 2, name: 'Disagreeing goal', account_id: null,
      account_name: null, start_amount: 0, target_amount: 1000,
      current_amount: 900, direction: 'accumulate', progress: 0.42,
    }]);

    render(<MemoryRouter><Goals /></MemoryRouter>);

    expect(await screen.findByText('42%')).toBeInTheDocument();
    expect(screen.queryByText('90%')).not.toBeInTheDocument();
  });

  it('caps the BAR at 100% while still reporting the overshoot', async () => {
    // The server does not clamp `progress`, because an overshoot is real
    // information. The bar is the only thing that has to stop.
    mockGoals([{
      ...PAYOFF_GOAL, id: 3, name: 'Overshot', account_id: null,
      account_name: null, start_amount: 0, target_amount: 1000,
      current_amount: 1400, direction: 'accumulate', progress: 1.4,
    }]);

    render(<MemoryRouter><Goals /></MemoryRouter>);

    expect(await screen.findByText('140%')).toBeInTheDocument();
    const bar = screen.getByRole('progressbar', { name: /Overshot progress/ });
    const fill = bar.firstElementChild as HTMLElement;
    expect(fill.style.width).toBe('100%');
  });

  it('marks a household goal as shared and a personal one not', async () => {
    mockGoals([
      { ...PAYOFF_GOAL, id: 4, name: 'Ours', scope: 'household' },
      { ...PAYOFF_GOAL, id: 5, name: 'Mine', scope: 'personal' },
    ]);

    render(<MemoryRouter><Goals /></MemoryRouter>);

    await screen.findByText('Ours');
    const shared = screen.getAllByText('Shared');
    expect(shared).toHaveLength(1);
  });
});

describe('Goals page — creating one', () => {
  it('does NOT send start_amount for a linked goal', async () => {
    // The snapshot is the server's to take. Sending one would make a linked
    // goal's denominator a typed number, which is what linking exists to prevent.
    let body: any = null;
    mockGoals([], [{ id: 7, name: 'Chase Amazon', account_type: 'credit',
                     balance: -1125.41, currency_code: 'USD',
                     user_id: 'alice@test.com' }]);
    server.use(
      http.post(`${BASE}/api/v1/goals`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ success: true, goal: PAYOFF_GOAL }, { status: 201 });
      }),
    );

    render(<MemoryRouter><Goals /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: /New goal/i }));
    await userEvent.type(screen.getByLabelText(/Name/i), 'Pay off Chase Amazon');
    await userEvent.selectOptions(screen.getByLabelText(/Account/i), '7');
    await userEvent.type(screen.getByLabelText(/Target amount/i), '0');
    await userEvent.click(screen.getByRole('button', { name: /Create goal/i }));

    await waitFor(() => expect(body).not.toBeNull());
    expect(body.account_id).toBe(7);
    expect(body.target_amount).toBe(0);
    expect(body).not.toHaveProperty('start_amount');
  });

  it('shows the server’s refusal in the form rather than swallowing it', async () => {
    // The double-counting index answers 400 with a message the user can act on.
    mockGoals([], []);
    server.use(
      http.post(`${BASE}/api/v1/goals`, () =>
        HttpResponse.json({
          success: false,
          error: 'An account can carry only one active goal in each direction',
        }, { status: 400 })),
    );

    render(<MemoryRouter><Goals /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: /New goal/i }));
    await userEvent.type(screen.getByLabelText(/Name/i), 'Second');
    await userEvent.type(screen.getByLabelText(/Target amount/i), '500');
    await userEvent.click(screen.getByRole('button', { name: /Create goal/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/only one active goal/i);
  });
});

describe('Goals page — contributions', () => {
  it('LABELS an imported contribution instead of folding it into a total', async () => {
    // `paid_by` defaults to whoever created the row, so an imported row credits
    // the importer. Rendering the amount without the label tells one partner they
    // contributed money the other actually paid.
    mockGoals([PAYOFF_GOAL]);
    server.use(
      http.get(`${BASE}/api/v1/goals/1/contributions`, () =>
        HttpResponse.json({
          success: true,
          currency_code: 'USD',
          contributions: [
            { user_id: 'alice@test.com', display_name: 'Alice', amount: 400, imported: false },
            { user_id: 'bob@test.com', display_name: 'Bob', amount: 300, imported: true },
          ],
        })),
    );

    render(<MemoryRouter><Goals /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: /Who contributed/i }));

    expect(await screen.findByText('Bob')).toBeInTheDocument();
    // One label, on Bob's row only — flagging everyone trains the user to ignore it.
    const flags = screen.getAllByText(/includes imported rows/i);
    expect(flags).toHaveLength(1);
    expect(flags[0].closest('li')).toHaveTextContent('Bob');
  });

  it('says there is nothing recorded rather than showing $0.00', async () => {
    // A zero beside a name reads as a measurement when the truth is there is
    // nothing to measure.
    mockGoals([PAYOFF_GOAL]);
    server.use(
      http.get(`${BASE}/api/v1/goals/1/contributions`, () =>
        HttpResponse.json({ success: true, currency_code: 'USD', contributions: [] })),
    );

    render(<MemoryRouter><Goals /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('button', { name: /Who contributed/i }));

    expect(await screen.findByText(/No contributions recorded yet/i)).toBeInTheDocument();
    expect(screen.queryByText('$0.00')).not.toBeInTheDocument();
  });
});
