/**
 * Demo Mode Service
 * Handles demo mode related API calls
 */

import { api } from './api';

export interface DemoStatus {
  enabled: boolean;
  timeout_minutes: number;
}

export interface DemoAccount {
  email: string;
  password: string;
  name: string;
  persona: string;
  currency: string;
}

export const demoService = {
  /**
   * Get demo mode status and configuration
   */
  async getDemoStatus(): Promise<DemoStatus> {
    const response = await api.get<DemoStatus>('/api/v1/demo/status');
    return response.data;
  },

  /**
   * Get list of demo accounts (only available when demo mode is enabled)
   */
  async getDemoAccounts(): Promise<DemoAccount[]> {
    const response = await api.get<DemoAccount[]>('/api/v1/demo/accounts');
    return response.data;
  },
};

export default demoService;
