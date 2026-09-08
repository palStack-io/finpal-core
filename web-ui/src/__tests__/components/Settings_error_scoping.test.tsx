import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { act } from 'react';
import { Settings } from '../../pages/Settings';
import { useAuthStore } from '../../store/authStore';
import { api } from '../../services/api';

/**
 * palStack-io/finpal-core#145 — an error from one tab was rendered on the others.
 *
 * *** THE REPORTER NAMED TWO TABS AND THE CODE EXPLAINS EXACTLY THOSE TWO. ***
 * They changed their password, got "Failed to change password", and the error kept
 * showing on "Profile" and on "Data & Privacy". `Settings.tsx` holds ONE `saveError`
 * state and renders it in three separate tab bodies — the profile tab (line 401),
 * the security tab (604) and the data tab (974) — and `setActiveTab` never cleared
 * it. There is no auto-dismiss either; the only `useEffect` on `saveError` restores
 * scroll position.
 *
 * So this is not a stale-render artifact. One piece of state is deliberately shown
 * in three places and nothing resets it when the user navigates away from the form
 * that produced it.
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

function signIn() {
  act(() => {
    useAuthStore.getState().login(
      {
        id: 't@t.com', email: 't@t.com', name: 'T',
        default_currency_code: 'USD', hasCompletedOnboarding: true, modules: [],
      } as any,
      'token', 'refresh'
    );
  });
}

function renderSettings() {
  return render(
    <MemoryRouter>
      <Settings />
    </MemoryRouter>
  );
}

/** Click a tab by its visible label. */
function openTab(label: string) {
  const tab = screen.getAllByText(label).find((n) => n.closest('.nav-item'));
  expect(tab, `no tab labelled "${label}"`).toBeTruthy();
  fireEvent.click(tab!.closest('.nav-item')!);
}

/**
 * Drive the security tab's password form into the failure the reporter hit.
 *
 * Uses the CLIENT-SIDE mismatch check rather than a mocked API rejection: it is the
 * same `setSaveError` call and it needs no network, so the test cannot pass or fail
 * for a reason to do with axios mocking.
 */
async function triggerAPasswordError() {
  openTab('Security');
  fireEvent.change(screen.getByPlaceholderText('Enter current password'),
    { target: { value: 'whatever' } });
  fireEvent.change(screen.getByPlaceholderText('Enter new password'),
    { target: { value: 'newpassword123' } });
  fireEvent.change(screen.getByPlaceholderText('Confirm new password'),
    { target: { value: 'DIFFERENT-password' } });
  fireEvent.click(screen.getByText('Update Password').closest('button')!);
  await waitFor(() =>
    expect(screen.getByText(/passwords do not match/i)).toBeTruthy()
  );
}

describe('Settings — an error belongs to the form that produced it (#145)', () => {
  afterEach(() => {
    localStorage.clear();
    act(() => { useAuthStore.getState().logout(); });
    vi.clearAllMocks();
  });

  it('shows the password error on the Security tab', () => {
    signIn();
    renderSettings();
    return triggerAPasswordError().then(() => {
      expect(screen.queryByText(/passwords do not match/i)).toBeTruthy();
    });
  });

  it('does NOT carry that error onto the Profile tab', async () => {
    signIn();
    renderSettings();
    await triggerAPasswordError();

    openTab('Profile');

    expect(screen.queryByText(/passwords do not match/i)).toBeNull();
  });

  it('does NOT carry that error onto the Data & Privacy tab', async () => {
    signIn();
    renderSettings();
    await triggerAPasswordError();

    openTab('Data & Privacy');

    expect(screen.queryByText(/passwords do not match/i)).toBeNull();
  });

  it('clears the error when leaving and does not resurrect it on return', async () => {
    signIn();
    renderSettings();
    await triggerAPasswordError();

    openTab('Profile');
    openTab('Security');

    // A stale error waiting on the tab you came back to is the same defect one
    // navigation later, and "hide it while away" would pass the two tests above.
    expect(screen.queryByText(/passwords do not match/i)).toBeNull();
  });
});
