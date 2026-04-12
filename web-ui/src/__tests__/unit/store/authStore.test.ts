import { describe, it, expect, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { useAuthStore } from '../../../store/authStore';

describe('authStore', () => {
  beforeEach(() => {
    act(() => {
      useAuthStore.getState().logout();
    });
  });

  it('initial state is unauthenticated', () => {
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
  });

  it('login sets user and isAuthenticated', () => {
    const user = {
      id: 'test@test.com',
      email: 'test@test.com',
      name: 'Test User',
      default_currency_code: 'USD',
      hasCompletedOnboarding: true,
      modules: ['pointspal'],
    };
    act(() => {
      useAuthStore.getState().login(user as any, 'access-token', 'refresh-token');
    });
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.user?.email).toBe('test@test.com');
  });

  it('login preserves user.modules', () => {
    const user = {
      id: 'test@test.com',
      email: 'test@test.com',
      name: 'Test User',
      default_currency_code: 'USD',
      hasCompletedOnboarding: true,
      modules: ['pointspal'],
    };
    act(() => {
      useAuthStore.getState().login(user as any, 'token', 'refresh');
    });
    expect(useAuthStore.getState().user?.modules).toEqual(['pointspal']);
  });

  it('logout clears user and token', () => {
    act(() => {
      useAuthStore.getState().login({ id: 't@t.com', email: 't@t.com', name: 'T', default_currency_code: 'USD', hasCompletedOnboarding: true } as any, 'token', 'refresh');
    });
    act(() => {
      useAuthStore.getState().logout();
    });
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.token).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });
});
