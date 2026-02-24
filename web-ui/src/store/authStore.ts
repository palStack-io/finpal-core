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
  login: (user: User, accessToken: string, refreshToken: string, demoExpiresAt?: string) => void;
  logout: () => void;
  updateUser: (updates: Partial<User>) => void;
  setLoading: (loading: boolean) => void;
  setDemoExpiry: (expiresAt: string | null) => void;
  checkDemoExpiry: () => boolean;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
      hasCompletedOnboarding: false,
      isDemoUser: false,
      demoExpiresAt: null,

      setUser: (user) =>
        set({
          user,
          isAuthenticated: !!user,
          hasCompletedOnboarding: user?.preferences !== undefined || user?.hasCompletedOnboarding || false,
          isDemoUser: user?.is_demo_user || false,
        }),

      setToken: (token) => set({ token }),

      setRefreshToken: (refreshToken) => set({ refreshToken }),

      login: (user, accessToken, refreshToken, demoExpiresAt) =>
        set({
          user,
          token: accessToken,
          refreshToken,
          isAuthenticated: true,
          hasCompletedOnboarding: user.hasCompletedOnboarding || false,
          isDemoUser: user.is_demo_user || false,
          demoExpiresAt: demoExpiresAt || null,
        }),

      logout: () =>
        set({
          user: null,
          token: null,
          refreshToken: null,
          isAuthenticated: false,
          hasCompletedOnboarding: false,
          isDemoUser: false,
          demoExpiresAt: null,
        }),

      updateUser: (updates) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...updates } : null,
          hasCompletedOnboarding: updates.hasCompletedOnboarding ?? state.hasCompletedOnboarding,
        })),

      setLoading: (isLoading) => set({ isLoading }),

      setDemoExpiry: (expiresAt) => set({ demoExpiresAt: expiresAt }),

      checkDemoExpiry: () => {
        const state = get();
        if (!state.isDemoUser || !state.demoExpiresAt) {
          return false;
        }
        const expiryTime = new Date(state.demoExpiresAt).getTime();
        const now = Date.now();
        return now >= expiryTime;
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
        hasCompletedOnboarding: state.hasCompletedOnboarding,
        isDemoUser: state.isDemoUser,
        demoExpiresAt: state.demoExpiresAt,
      }),
    }
  )
);
