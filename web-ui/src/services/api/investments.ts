/**
 * Investment API Service
 * Handles all investment-related API calls
 */

import api from '../api';

export const investmentService = {
  // Portfolio endpoints
  getPortfolios: async () => {
    const response = await api.get('/api/v1/investments/portfolios');
    return response.data;
  },

  getPortfolio: async (id: number) => {
    const response = await api.get(`/api/v1/investments/portfolios/${id}`);
    return response.data;
  },

  createPortfolio: async (data: {
    name: string;
    description?: string;
    account_id?: number;
  }) => {
    const response = await api.post('/api/v1/investments/portfolios', data);
    return response.data;
  },

  updatePortfolio: async (id: number, data: {
    name?: string;
    description?: string;
    account_id?: number;
  }) => {
    const response = await api.put(`/api/v1/investments/portfolios/${id}`, data);
    return response.data;
  },

  deletePortfolio: async (id: number) => {
    const response = await api.delete(`/api/v1/investments/portfolios/${id}`);
    return response.data;
  },

  // Holdings endpoints
  getHoldings: async (portfolioId?: number) => {
    const params = portfolioId ? { portfolio_id: portfolioId } : {};
    const response = await api.get('/api/v1/investments/holdings', { params });
    return response.data;
  },

  getHolding: async (id: number) => {
    const response = await api.get(`/api/v1/investments/holdings/${id}`);
    return response.data;
  },

  createHolding: async (data: {
    portfolio_id: number;
    symbol: string;
    shares: number;
    purchase_price: number;
    purchase_date?: string;
    notes?: string;
  }) => {
    const response = await api.post('/api/v1/investments/holdings', data);
    return response.data;
  },

  updateHolding: async (id: number, data: {
    shares?: number;
    purchase_price?: number;
    notes?: string;
  }) => {
    const response = await api.put(`/api/v1/investments/holdings/${id}`, data);
    return response.data;
  },

  deleteHolding: async (id: number) => {
    const response = await api.delete(`/api/v1/investments/holdings/${id}`);
    return response.data;
  },

  // Transaction endpoints
  getTransactions: async (investmentId?: number) => {
    const params = investmentId ? { investment_id: investmentId } : {};
    const response = await api.get('/api/v1/investments/transactions', { params });
    return response.data;
  },

  createTransaction: async (data: {
    investment_id: number;
    transaction_type: 'buy' | 'sell' | 'dividend' | 'split';
    shares: number;
    price: number;
    date?: string;
    fees?: number;
    notes?: string;
  }) => {
    const response = await api.post('/api/v1/investments/transactions', data);
    return response.data;
  },

  // Quote and history endpoints
  getQuote: async (symbol: string, exchange?: string) => {
    const params = exchange ? { exchange } : {};
    const response = await api.get(`/api/v1/investments/quote/${symbol}`, { params });
    return response.data;
  },

  getHistory: async (symbol: string, exchange?: string, period?: string) => {
    const params = { exchange, period };
    const response = await api.get(`/api/v1/investments/history/${symbol}`, { params });
    return response.data;
  },

  getExchanges: async () => {
    const response = await api.get('/api/v1/investments/exchanges');
    return response.data;
  }
};
