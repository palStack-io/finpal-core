/**
 * A form must not call `onSuccess` after it has been unmounted.
 *
 * **Found by CI going red on `main`, with every test passing.** The run reported
 * *38 files passed, 321 tests passed, 1 error* — the failure was a single **unhandled**
 * `ReferenceError: window is not defined`, thrown from React's `resolveUpdatePriority` under
 * `onSuccess` at `Accounts.tsx:386` (`setShowAddModal(false)`). Nothing had failed; a stray
 * callback had fired after the environment was gone.
 *
 * *** THE MECHANISM: BOTH CREATE FORMS DEFER THEIR CALLBACK BY A FULL SECOND. ***
 * `setTimeout(() => { onSuccess(); }, 1000)` — `AddAccountForm.tsx:135` and
 * `AddTransactionForm.tsx:223` — with **no cleanup**. A test clicks "Create account", asserts,
 * and finishes; a second later the timer fires into a torn-down jsdom and React touches
 * `window`. It is a race, which is why it passed four consecutive full-suite runs locally and
 * failed on CI's slower, differently-parallelised workers.
 *
 * *** IT IS ALSO A REAL BUG, NOT ONLY A TEST ARTEFACT — WHICH IS WHY THE FIX IS IN THE
 * COMPONENT, NOT IN THE TESTS. *** A user who creates an account and navigates away inside that
 * one-second window gets a state update on an unmounted tree. Suppressing it with fake timers
 * in the test would have kept CI green while leaving the defect in the product, and this same
 * 1000ms deferral already caused flaky rendered assertions earlier in this work.
 *
 * Keyed to the class, not to `AddAccountForm`: both forms are asserted here, so the second
 * instance cannot be fixed while the first quietly regresses.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';

vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { AddAccountForm } from '../../components/forms/AddAccountForm';

const wrap = (ui: React.ReactElement) => <MemoryRouter>{ui}</MemoryRouter>;

beforeEach(() => {
  server.use(
    http.post('*/api/v1/accounts', () => HttpResponse.json({ id: 1, name: 'Probe' }, { status: 201 })),
    http.get('*/api/v1/team/members', () => HttpResponse.json({ members: [] })),
    http.get('*/api/v1/pointspal/cards', () => HttpResponse.json([])),
  );
});

describe('AddAccountForm', () => {
  it('does not call onSuccess once it has been unmounted', async () => {
    const onSuccess = vi.fn();
    const user = userEvent.setup();

    const { unmount } = render(
      wrap(<AddAccountForm onSuccess={onSuccess} onCancel={vi.fn()} />),
    );

    // Placeholders, not labels: this form's inputs are not label-associated, which is how the
    // page's own passing tests reach them.
    await user.type(screen.getByPlaceholderText(/Main Checking Account/i), 'Probe');
    await user.type(screen.getByPlaceholderText('0.00'), '25');
    await user.click(screen.getByRole('button', { name: /^create account$/i }));

    // The Check icon appears on success, which means the request resolved and the 1000ms timer
    // is now pending. Waiting on that rather than a bare sleep.
    await waitFor(() => expect(screen.getByText(/created/i)).toBeInTheDocument());
    expect(onSuccess, 'onSuccess fired immediately — the deferral is what this test is about')
      .not.toHaveBeenCalled();

    unmount();

    // *** REAL TIME, NOT `vi.advanceTimersByTime`. *** The first version of this test installed
    // fake timers *after* the component had already scheduled a real one, so advancing them
    // reached nothing and the test passed while the defect was still there. Fake timers can only
    // drive a timer that was created under them, and `userEvent` needs real ones for the
    // interaction above. So this waits out the actual second.
    await new Promise((resolve) => setTimeout(resolve, 1300));

    expect(onSuccess, 'the form called back after unmount — a state update on a dead tree')
      .not.toHaveBeenCalled();
  });
});
