/**
 * API Configuration
 * Updated to use nginx proxy
 */

export const API_CONFIG = {
  // Base URL - goes through nginx proxy on port 80
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost',

  // API timeout
  timeout: 30000,

  // API endpoints
  endpoints: {
    auth: {
      login: '/api/v1/auth/login',
      register: '/api/v1/auth/register',
      logout: '/api/v1/auth/logout',
      profile: '/api/v1/auth/profile',
      refresh: '/api/v1/auth/refresh',
    },
    transactions: {
      list: '/api/v1/transactions',
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
    dashboard: {
      stats: '/api/v1/dashboard/stats',
      charts: '/api/v1/dashboard/charts',
    },
  },
} as const;

export default API_CONFIG;
