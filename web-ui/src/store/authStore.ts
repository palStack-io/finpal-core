/**
 * Authentication Store
 * Manages user authentication state, tokens, and user data
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, AuthState, ServerFeatures } from '../types/user';
import { setNumberLocale } from '../styles/money';

const DEFAULT_FEATURES: ServerFeatures = { simplefin: true, investments: true };

interface AuthStore extends AuthState {
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  setRefreshToken: (token: string | null) => void;
  login: (user: User, accessToken: string, refreshToken: string, demoExpiresAt?: string, features?: ServerFeatures) => void;
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
      features: DEFAULT_FEATURES,

      setUser: (user) =>
        set({
          user,
          isAuthenticated: !!user,
          // `user.preferences` was a leftover from an older payload shape and is
          // never sent, so this always fell through to the flag below.
          hasCompletedOnboarding: user?.hasCompletedOnboarding || false,
          isDemoUser: user?.is_demo_user || false,
        }),

      setToken: (token) => set({ token }),

      setRefreshToken: (refreshToken) => set({ refreshToken }),

      login: (user, accessToken, refreshToken, demoExpiresAt, features) =>
        set({
          user,
          token: accessToken,
          refreshToken,
          isAuthenticated: true,
          hasCompletedOnboarding: user.hasCompletedOnboarding || false,
          isDemoUser: user.is_demo_user || false,
          demoExpiresAt: demoExpiresAt || null,
          features: features ?? DEFAULT_FEATURES,
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
          features: DEFAULT_FEATURES,
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
        features: state.features,
      }),
    }
  )
);

/**
 * Keep the money formatter in step with the user's number-format preference (#132).
 *
 * A SUBSCRIPTION rather than a call inside `setUser`/`login`/`updateUser`, because there
 * are four ways the user object can change — those three plus persist rehydration on a
 * page load — and a preference that applies on three of them is a preference that
 * silently stops working on refresh. One seam, nothing to bypass.
 */
let appliedNumberLocale: string | null | undefined;
const applyNumberLocale = (locale: string | null | undefined) => {
  if (locale === appliedNumberLocale) return;
  appliedNumberLocale = locale;
  setNumberLocale(locale ?? null);
};
applyNumberLocale(useAuthStore.getState().user?.number_locale);
useAuthStore.subscribe((state) => applyNumberLocale(state.user?.number_locale));
