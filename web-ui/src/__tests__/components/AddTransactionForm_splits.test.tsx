/**
 * Prefill and write, composed — the destructive half of D-54.
 *
 * D-54 made the splits editor prefilled, and the rule that came with it is: an
 * empty editor on a row that HAD splits means "delete them", so send `{}`. That
 * makes a **prefill failure destructive**. If the initializer ever produced
 * nothing — a shape change, a key-type mismatch, a remount that did not happen —
 * the editor would open empty, the submit handler would read that as a deletion,
 * and a user who changed only the description would silently lose the split. The
 * request would answer 200.
 *
 * So this asserts the two halves TOGETHER, through the real form: render it on a
 * transaction that has splits, submit without touching them, and require that
 * what goes on the wire is what came off it. Testing the initializer and the
 * payload builder separately — which is all typechecking gives you — cannot see
 * the failure, because each half is individually correct.
 *
 * The clearing case gets the same treatment from the other side: remove the rows
 * and require `{}`, because an editor that empties and sends nothing is a control
 * that appears to work and does not.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { api } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { AddTransactionForm } from '../../components/forms/AddTransactionForm';

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
    token: 'tok', refreshToken: 'r', isAuthenticated: true,
  });
});

/** A transaction the server says is split 60/40 across two categories. */
const SPLIT_TRANSACTION: any = {
  id: 7,
  description: 'Weekly shop',
  name: 'Weekly shop',
  amount: 100,
  date: '2026-08-07',
  transaction_type: 'expense',
  currency_code: 'USD',
  account_id: 1,
  category_splits: { '1': 60, '2': 40 },
  has_category_splits: true,
};

function mockForm() {
  const bodies: any[] = [];
  server.use(
    http.get(`${BASE}/api/v1/categories/`, () =>
      HttpResponse.json({ success: true, categories: [
        { id: 1, name: 'Food' }, { id: 2, name: 'Travel' }] })),
    http.get(`${BASE}/api/v1/accounts`, () =>
      HttpResponse.json({ success: true, accounts: [
        { id: 1, name: 'Chase', currency_code: 'USD' }] })),
    http.get(`${BASE}/api/v1/groups/`, () => HttpResponse.json({ success: true, groups: [] })),
    http.get(`${BASE}/api/v1/team/members`, () => HttpResponse.json([])),
    http.put(`${BASE}/api/v1/transactions/:id`, async ({ request }) => {
      bodies.push(await request.json());
      return HttpResponse.json({ success: true, transaction: SPLIT_TRANSACTION });
    })
  );
  return bodies;
}

const renderForm = () =>
  render(
    <AddTransactionForm
      transaction={SPLIT_TRANSACTION}
      onSuccess={() => {}}
      onCancel={() => {}}
    />
  );

describe('a split transaction survives an edit that does not touch its splits', () => {
  it('shows the splits it arrived with', async () => {
    mockForm();
    renderForm();

    // Two rows, prefilled with the server's amounts. Read off the screen: an
    // initializer that ran and produced nothing looks identical from outside.
    await waitFor(() => expect(screen.getByDisplayValue('60')).toBeInTheDocument());
    expect(screen.getByDisplayValue('40')).toBeInTheDocument();
  });

  it('sends them back unchanged when only the description is edited', async () => {
    const bodies = mockForm();
    renderForm();

    await waitFor(() => expect(screen.getByDisplayValue('60')).toBeInTheDocument());
    const name = screen.getByDisplayValue('Weekly shop');
    await userEvent.clear(name);
    await userEvent.type(name, 'Weekly shop, corrected');
    await userEvent.click(screen.getByRole('button', { name: /update|save/i }));

    await waitFor(() => expect(bodies).toHaveLength(1));
    // NOT `{}` — that would wipe the splits and answer 200 while doing it.
    expect(bodies[0].category_splits).toEqual({ '1': 60, '2': 40 });
  });

  it('sends {} when the rows are actually removed, so a deletion really deletes', async () => {
    const bodies = mockForm();
    renderForm();

    await waitFor(() => expect(screen.getByDisplayValue('60')).toBeInTheDocument());
    // Re-query between clicks: removing a row re-renders the list, so a batch of
    // element handles captured up front goes stale and only the first click lands.
    // (Written the batched way first; it removed one row and asserted on the other.)
    while (screen.queryAllByRole('button', { name: /remove|×|✕/i }).length) {
      await userEvent.click(screen.getAllByRole('button', { name: /remove|×|✕/i })[0]);
    }
    await userEvent.click(screen.getByRole('button', { name: /update|save/i }));

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0].category_splits).toEqual({});
  });
});
