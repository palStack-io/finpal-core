import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { act, Suspense } from 'react';
import { useAuthStore } from '../../store/authStore';
import { moduleRegistry } from '../../modules';

vi.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: 'dark', toggleTheme: vi.fn() }),
  ThemeProvider: ({ children }: any) => children,
}));
vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
  ToastProvider: ({ children }: any) => children,
}));
vi.mock('../../components/common/Toast', () => ({
  ToastContainer: () => null,
}));
vi.mock('../../services/api', () => ({
  api: {
    get: vi.fn().mockResolvedValue({ data: {} }),
    post: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

// Stub all lazy module pages so they render immediately
vi.mock('../../modules/pointspal/pages/Overview', () => ({
  default: () => <div data-testid="pointspal-overview">pointsPal Overview</div>,
}));
vi.mock('../../modules/pointspal/pages/CapTracker', () => ({
  default: () => <div>Cap Tracker</div>,
}));
vi.mock('../../modules/pointspal/pages/BestCard', () => ({
  default: () => <div>Best Card</div>,
}));
vi.mock('../../modules/pointspal/pages/MyCards', () => ({
  default: () => <div>My Cards</div>,
}));
vi.mock('../../modules/pointspal/pages/Redeem', () => ({
  default: () => <div>Redeem</div>,
}));

// Stub auth-guarded pages
vi.mock('../../components/auth/ProtectedRoute', () => ({
  ProtectedRoute: ({ children }: any) => children,
}));
vi.mock('../../components/layout/Sidebar', () => ({
  Sidebar: () => <nav data-testid="sidebar" />,
}));

describe('App — module routes', () => {
  afterEach(() => {
    localStorage.clear();
    act(() => { useAuthStore.getState().logout(); });
  });

  it('moduleRegistry has pointspal module with /pointspal route', () => {
    const pp = moduleRegistry.find(m => m.slug === 'pointspal');
    const route = pp?.routes.find(r => r.path === '/pointspal');
    expect(route).toBeDefined();
  });

  it('user with modules includes pointspal', () => {
    act(() => {
      useAuthStore.getState().login(
        { id: 't@t.com', email: 't@t.com', name: 'T', default_currency_code: 'USD', hasCompletedOnboarding: true, modules: ['pointspal'] } as any,
        'token', 'refresh'
      );
    });
    const user = useAuthStore.getState().user;
    expect(user?.modules).toContain('pointspal');
  });

  it('user without modules has empty modules array', () => {
    act(() => {
      useAuthStore.getState().login(
        { id: 't@t.com', email: 't@t.com', name: 'T', default_currency_code: 'USD', hasCompletedOnboarding: true, modules: [] } as any,
        'token', 'refresh'
      );
    });
    const user = useAuthStore.getState().user;
    expect(user?.modules).toEqual([]);
  });

  it('moduleRegistry filter returns pointspal for user with access', () => {
    const userModules = ['pointspal'];
    const active = moduleRegistry.filter(m => userModules.includes(m.slug));
    expect(active).toHaveLength(1);
    expect(active[0].slug).toBe('pointspal');
  });

  it('moduleRegistry filter returns empty for user with no modules', () => {
    const userModules: string[] = [];
    const active = moduleRegistry.filter(m => userModules.includes(m.slug));
    expect(active).toHaveLength(0);
  });
});
