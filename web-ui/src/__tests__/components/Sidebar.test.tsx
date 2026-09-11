import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { act } from 'react';
import { Sidebar } from '../../components/layout/Sidebar';
import { useAuthStore } from '../../store/authStore';

// Mock ThemeContext
vi.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: 'dark', toggleTheme: vi.fn() }),
}));

function renderSidebar() {
  return render(
    <MemoryRouter>
      <Sidebar />
    </MemoryRouter>
  );
}

describe('Sidebar — modules section', () => {
  afterEach(() => {
    localStorage.clear();
    act(() => { useAuthStore.getState().logout(); });
  });

  it('shows Modules section when user has pointspal module', () => {
    act(() => {
      useAuthStore.getState().login(
        { id: 't@t.com', email: 't@t.com', name: 'T', default_currency_code: 'USD', hasCompletedOnboarding: true, modules: ['pointspal'] } as any,
        'token', 'refresh'
      );
    });
    renderSidebar();
    expect(screen.getByText('Modules')).toBeInTheDocument();
    expect(screen.getByText('pointsPal')).toBeInTheDocument();
  });

  it('hides Modules section when user has no modules', () => {
    act(() => {
      useAuthStore.getState().login(
        { id: 't@t.com', email: 't@t.com', name: 'T', default_currency_code: 'USD', hasCompletedOnboarding: true, modules: [] } as any,
        'token', 'refresh'
      );
    });
    renderSidebar();
    expect(screen.queryByText('Modules')).not.toBeInTheDocument();
  });

  const signIn = (extra: Record<string, unknown>) => act(() => {
    useAuthStore.getState().login(
      {
        id: 't@t.com', email: 't@t.com', name: 'T', default_currency_code: 'USD',
        hasCompletedOnboarding: true, modules: ['pointspal'], ...extra,
      } as any,
      'token', 'refresh',
    );
  });

  it('hides a module the user has hidden, from `hidden_modules`', () => {
    // *** SERVER-SIDE SINCE 2026-09-11. *** This asserted
    // `localStorage['module_hidden_pointspal']`, which was a per-BROWSER hide:
    // it did not follow the user to another device and mobile could not see it
    // at all.
    signIn({ hidden_modules: ['pointspal'] });
    renderSidebar();
    expect(screen.queryByText('pointsPal')).not.toBeInTheDocument();
  });

  it('shows it when nothing is hidden', () => {
    signIn({ hidden_modules: [] });
    renderSidebar();
    expect(screen.getByText('pointsPal')).toBeInTheDocument();
  });

  it('*** A PAYLOAD WITH NO `hidden_modules` HIDES NOTHING ***', () => {
    // An older server does not send the key. `undefined` must mean "nothing
    // hidden", never "everything hidden" — a new client against an old backend
    // is routine (nginx serves new assets before the backend restarts), and
    // that is D-176's shape: a key a client reads optimistically, switched on
    // to a wrong answer.
    signIn({});
    renderSidebar();
    expect(screen.getByText('pointsPal')).toBeInTheDocument();
  });

  it('IGNORES a stale localStorage hide from before the migration', () => {
    // Users who hid a module in the old scheme still have the key in their
    // browser. It must not keep hiding things the server says are visible,
    // or the migration would look like it silently failed.
    localStorage.setItem('module_hidden_pointspal', 'true');
    signIn({ hidden_modules: [] });
    renderSidebar();
    expect(screen.getByText('pointsPal')).toBeInTheDocument();
  });
});
