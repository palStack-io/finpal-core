/**
 * API Configuration
 * Updated to use nginx proxy
 */

export const API_CONFIG = {
  // Base URL - empty string uses relative URLs through nginx proxy
  // Use ?? instead of || so empty string "" is preserved (not falsy fallback)
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '',

  // API timeout
  timeout: 30000,

  // API endpoints
  endpoints: {
    auth: {
      login: '/api/v1/auth/login',
      register: '/api/v1/auth/register',
      logout: '/api/v1/auth/logout',
      refresh: '/api/v1/auth/refresh',
      // There is no `profile` entry: it pointed at `/api/v1/auth/profile`, which no
      // blueprint has ever served. The route is `/api/v1/auth/me`. Its only caller
      // was `authService.getCurrentUser`, which nothing called in turn.
    },
    transactions: {
      // Both spellings now reach the same flask-restx handler — the legacy
      // blueprint's rules are retired and it is no longer registered, so the
      // trailing slash on `list` is no longer load-bearing. Left as-is because
      // changing a URL clients already use buys nothing.
      list: '/api/v1/transactions/',
      create: '/api/v1/transactions',
      get: (id: number) => `/api/v1/transactions/${id}`,
      update: (id: number) => `/api/v1/transactions/${id}`,
      delete: (id: number) => `/api/v1/transactions/${id}`,
    },
    accounts: {
      list: '/api/v1/accounts',
      create: '/api/v1/accounts',
      update: (id: string) => `/api/v1/accounts/${id}`,
      delete: (id: string) => `/api/v1/accounts/${id}`,
    },
    budgets: {
      list: '/api/v1/budgets',
      create: '/api/v1/budgets',
      update: (id: string) => `/api/v1/budgets/${id}`,
      delete: (id: string) => `/api/v1/budgets/${id}`,
    },
    // There is no `dashboard` block: `stats` and `charts` named
    // /api/v1/dashboard/stats and /charts, neither of which any blueprint has
    // served. Nothing referenced them. The real endpoint is
    // /api/v1/analytics/dashboard, which `analyticsService` already uses directly.
  },
} as const;

export default API_CONFIG;
