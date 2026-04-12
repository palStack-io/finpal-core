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

  it('hides module from nav when module_hidden_<slug>=true in localStorage', () => {
    localStorage.setItem('module_hidden_pointspal', 'true');
    act(() => {
      useAuthStore.getState().login(
        { id: 't@t.com', email: 't@t.com', name: 'T', default_currency_code: 'USD', hasCompletedOnboarding: true, modules: ['pointspal'] } as any,
        'token', 'refresh'
      );
    });
    renderSidebar();
    expect(screen.queryByText('pointsPal')).not.toBeInTheDocument();
  });
});
