import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { act } from 'react';
import { Settings } from '../../pages/Settings';
import { useAuthStore } from '../../store/authStore';
import { api } from '../../services/api';

/**
 * D-148 — the Notifications panel used to show a success state for a request it
 * never made.
 *
 * *** THE ASSERTION THAT MATTERS IS THE REQUEST, NOT THE TICK. ***
 * `handleNotificationsSave` was three lines: a `// TODO: Implement notification
 * settings API endpoint` comment, `setSaveSuccess(true)`, and a timeout. So every
 * test that checked "the success message appears" would have passed against the
 * defect — which is why this asserts the PUT body and the panel's own labels
 * instead.
 *
 * The four toggles were also hardcoded and invented: only `budgetAlerts` named a
 * field the API accepts, `monthlyReports` and `goalReminders` named features that do
 * not exist, and none was ever loaded from the user. Settings and Onboarding, in the
 * same app, did not agree on what a notification preference is.
 */

vi.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: 'dark', toggleTheme: vi.fn() }),
}));

vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('../../services/api', () => ({
  api: {
    get: vi.fn().mockResolvedValue({ data: {} }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    put: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

function signIn(notifications?: Record<string, boolean>) {
  act(() => {
    useAuthStore.getState().login(
      {
        id: 't@t.com', email: 't@t.com', name: 'T',
        default_currency_code: 'USD', hasCompletedOnboarding: true, modules: [],
        ...(notifications ? { notifications } : {}),
      } as any,
      'token', 'refresh'
    );
  });
}

function openNotifications() {
  render(<MemoryRouter><Settings /></MemoryRouter>);
  const tab = screen.getAllByText('Notifications').find((n) => n.closest('.nav-item'));
  expect(tab, 'no Notifications tab').toBeTruthy();
  fireEvent.click(tab!.closest('.nav-item')!);
}

beforeEach(() => {
  vi.mocked(api.put).mockClear().mockResolvedValue({ data: {} } as any);
});

describe('Settings — Notifications (D-148)', () => {
  it('sends the toggles to the API instead of faking a save', async () => {
    signIn();
    openNotifications();

    fireEvent.click(screen.getByText('Save Preferences').closest('button')!);

    await waitFor(() => expect(api.put).toHaveBeenCalled());
    const [url, body] = vi.mocked(api.put).mock.calls[0];
    expect(url).toContain('/users/profile');
    expect(body).toHaveProperty('notifications');
    expect(Object.keys((body as any).notifications).sort())
      .toEqual(['budgetAlerts', 'email', 'transactionAlerts']);
  });

  it('offers only preferences the API actually stores', () => {
    signIn();
    openNotifications();

    expect(screen.getByText('Email notifications')).toBeTruthy();
    expect(screen.getByText('Budget alerts')).toBeTruthy();
    expect(screen.getByText('Transaction alerts')).toBeTruthy();

    // The three that were invented. `goalReminders` promised reminders for savings
    // goals finPal does not have; `monthlyReports` named a preference with no column
    // behind it; `transactionNotifications` was `transactionAlerts` misspelled.
    expect(screen.queryByText(/Goal Reminders/i)).toBeNull();
    expect(screen.queryByText(/Monthly Reports/i)).toBeNull();
    expect(screen.queryByText(/Transaction Notifications/i)).toBeNull();
  });

  it('does not offer a push toggle, because there is no push', () => {
    // finPal has no push stack at all — no expo-notifications, no APNs entitlement,
    // no device-token column, no sender. Mobile's "Push Notifications" switch is
    // being removed for the same reason (owner decision B2), so adding one here
    // would be the affordance we just deleted, on the other client.
    signIn();
    openNotifications();
    expect(screen.queryByText(/^Push/i)).toBeNull();
  });

  it('shows what the account actually holds, not `true`', () => {
    signIn({ email: false, budgetAlerts: true, transactionAlerts: true, push: true });
    openNotifications();

    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    // Panel order is email, budgetAlerts, transactionAlerts.
    expect(checkboxes[0].checked).toBe(false);
    expect(checkboxes[1].checked).toBe(true);
    expect(checkboxes[2].checked).toBe(true);
  });

  it('sends the toggle the user actually flipped', async () => {
    signIn({ email: true, budgetAlerts: true, transactionAlerts: false });
    openNotifications();

    fireEvent.click((screen.getAllByRole('checkbox') as HTMLInputElement[])[0]);
    fireEvent.click(screen.getByText('Save Preferences').closest('button')!);

    await waitFor(() => expect(api.put).toHaveBeenCalled());
    expect((vi.mocked(api.put).mock.calls[0][1] as any).notifications.email).toBe(false);
  });
});
