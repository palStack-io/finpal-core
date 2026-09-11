import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { act } from 'react';
import { Settings } from '../../pages/Settings';
import { useAuthStore } from '../../store/authStore';

// Mock heavy dependencies that Settings imports
vi.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: 'dark', toggleTheme: vi.fn() }),
}));

vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

// Mock all API calls from Settings
vi.mock('../../services/api', () => ({
  api: {
    get: vi.fn().mockResolvedValue({ data: {} }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    put: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

function renderSettings() {
  return render(
    <MemoryRouter>
      <Settings />
    </MemoryRouter>
  );
}

describe('Settings — Modules tab', () => {
  afterEach(() => {
    localStorage.clear();
    act(() => { useAuthStore.getState().logout(); });
  });

  it('Modules tab absent when user has no modules', () => {
    act(() => {
      useAuthStore.getState().login(
        { id: 't@t.com', email: 't@t.com', name: 'T', default_currency_code: 'USD', hasCompletedOnboarding: true, modules: [] } as any,
        'token', 'refresh'
      );
    });
    renderSettings();
    expect(screen.queryByText('Modules')).not.toBeInTheDocument();
  });

  it('Modules tab present when user has modules', () => {
    act(() => {
      useAuthStore.getState().login(
        { id: 't@t.com', email: 't@t.com', name: 'T', default_currency_code: 'USD', hasCompletedOnboarding: true, modules: ['pointspal'] } as any,
        'token', 'refresh'
      );
    });
    renderSettings();
    expect(screen.getByText('Modules')).toBeInTheDocument();
  });

  /**
   * *** THE TEST THIS REPLACES WAS VACUOUS AND PASSED FOR IT. ***
   * It read:
   *
   *     const hideBtn = screen.queryByText(/Hide in sidebar|Show in sidebar/i);
   *     if (hideBtn) { fireEvent.click(hideBtn); expect(...).toBeTruthy(); }
   *
   * The component renders "Hidden in sidebar" / "Visible in sidebar", so the
   * query matched NOTHING, the `if` never ran, and the test asserted nothing at
   * all — it stayed green through the entire rewrite of the thing it names. A
   * conditional assertion is an assertion that can be skipped; this project has
   * the same shape recorded as "a gate that inspects nothing looks exactly like
   * one that passes".
   */
  const signIn = (hidden: string[] = []) => act(() => {
    useAuthStore.getState().login(
      {
        id: 't@t.com', email: 't@t.com', name: 'T', default_currency_code: 'USD',
        hasCompletedOnboarding: true, modules: ['pointspal'],
        hidden_modules: hidden,
      } as any,
      'token', 'refresh',
    );
  });

  const openModulesTab = () => {
    renderSettings();
    fireEvent.click(screen.getByText('Modules'));
  };

  it('shows the CURRENT state from the server, not from localStorage', () => {
    signIn(['pointspal']);
    openModulesTab();
    expect(screen.getByText('Hidden in sidebar')).toBeInTheDocument();
    // Announced as a control, not merely coloured.
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  });

  it('*** PUTs THE PREFERENCE TO THE SERVER *** and updates the store', async () => {
    const { api } = await import('../../services/api');
    (api.put as any).mockResolvedValueOnce({ data: { success: true, hidden: ['pointspal'] } });
    signIn([]);
    openModulesTab();
    expect(screen.getByText('Visible in sidebar')).toBeInTheDocument();

    await act(async () => { fireEvent.click(screen.getByRole('switch')); });

    // Asserted on the REQUEST BODY, not on a status code and not on localStorage.
    expect(api.put).toHaveBeenCalledWith(
      '/users/module-preferences/pointspal', { visible: false });
    expect(useAuthStore.getState().user?.hidden_modules).toEqual(['pointspal']);
  });

  it('un-hiding sends visible:true', async () => {
    const { api } = await import('../../services/api');
    (api.put as any).mockResolvedValueOnce({ data: { success: true, hidden: [] } });
    signIn(['pointspal']);
    openModulesTab();

    await act(async () => { fireEvent.click(screen.getByRole('switch')); });

    expect(api.put).toHaveBeenCalledWith(
      '/users/module-preferences/pointspal', { visible: true });
    expect(useAuthStore.getState().user?.hidden_modules).toEqual([]);
  });

  it('*** A FAILED SAVE DOES NOT FLIP THE SWITCH ***', async () => {
    // The old localStorage write could not fail; a request can. There is no
    // optimistic update, so the user never sees a state the server refused.
    const { api } = await import('../../services/api');
    (api.put as any).mockRejectedValueOnce(new Error('network'));
    signIn([]);
    openModulesTab();

    await act(async () => { fireEvent.click(screen.getByRole('switch')); });

    expect(screen.getByText('Visible in sidebar')).toBeInTheDocument();
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
    expect(useAuthStore.getState().user?.hidden_modules).toEqual([]);
  });

  it('writes NOTHING to localStorage any more', () => {
    // The whole point of the change: a per-browser hide did not follow the user
    // to another device and mobile could not see it at all.
    signIn([]);
    openModulesTab();
    fireEvent.click(screen.getByRole('switch'));
    expect(localStorage.getItem('module_hidden_pointspal')).toBeNull();
  });
});
