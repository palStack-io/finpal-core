/**
 * Authentication Store
 * Manages user authentication state, tokens, and user data
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, AuthState } from '../types/user';

interface AuthStore extends AuthState {
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  setRefreshToken: (token: string | null) => void;
  login: (user: User, accessToken: string, refreshToken: string) => void;
  logout: () => void;
  updateUser: (updates: Partial<User>) => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
      hasCompletedOnboarding: false,

      setUser: (user) =>
        set({
          user,
          isAuthenticated: !!user,
          hasCompletedOnboarding: user?.preferences !== undefined || user?.hasCompletedOnboarding || false,
        }),

      setToken: (token) => set({ token }),

      setRefreshToken: (refreshToken) => set({ refreshToken }),

      login: (user, accessToken, refreshToken) =>
        set({
          user,
          token: accessToken,
          refreshToken,
          isAuthenticated: true,
          hasCompletedOnboarding: user.hasCompletedOnboarding || false,
        }),

      logout: () =>
        set({
          user: null,
          token: null,
          refreshToken: null,
          isAuthenticated: false,
          hasCompletedOnboarding: false,
        }),

      updateUser: (updates) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...updates } : null,
          hasCompletedOnboarding: updates.hasCompletedOnboarding ?? state.hasCompletedOnboarding,
        })),

      setLoading: (isLoading) => set({ isLoading }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
        hasCompletedOnboarding: state.hasCompletedOnboarding,
      }),
    }
  )
);
