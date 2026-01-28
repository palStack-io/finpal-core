/**
 * User Service
 * Handles user profile management, password changes, sessions, and account deletion
 */

import { api } from './api';
import type {
  User,
  ProfileUpdate,
  PasswordChangeRequest,
  Session,
  PasswordResetRequest,
  DeleteAccountRequest,
  PasswordStrength,
  PasswordStrengthResult,
} from '../types/user';

export const userService = {
  /**
   * Update user profile information
   */
  async updateProfile(data: ProfileUpdate): Promise<User> {
    const response = await api.put('/api/v1/users/profile', data);
    return response.data;
  },

  /**
   * Upload user avatar
   */
  async uploadAvatar(file: File): Promise<string> {
    const formData = new FormData();
    formData.append('avatar', file);

    const response = await api.post('/api/v1/users/avatar', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return response.data.avatarUrl;
  },

  /**
   * Change user password
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const data: PasswordChangeRequest = {
      currentPassword,
      newPassword,
    };

    await api.put('/api/v1/users/password', data);
  },

  /**
   * Request password reset email
   */
  async requestPasswordReset(email: string): Promise<void> {
    const data: PasswordResetRequest = { email };
    await api.post('/api/v1/users/password-reset', data);
  },

  /**
   * Get active sessions for current user
   */
  async getSessions(): Promise<Session[]> {
    const response = await api.get('/api/v1/users/sessions');
    return response.data;
  },

  /**
   * Terminate a specific session
   */
  async terminateSession(sessionId: string): Promise<void> {
    await api.delete(`/api/v1/users/sessions/${sessionId}`);
  },

  /**
   * Delete user account (requires password confirmation)
   */
  async deleteAccount(password: string): Promise<void> {
    const data: DeleteAccountRequest = { password };
    await api.delete('/api/v1/users/account', { data });
  },

  /**
   * Get login history
   */
  async getLoginHistory(limit: number = 10): Promise<any[]> {
    const response = await api.get('/api/v1/users/login-history', {
      params: { limit },
    });
    return response.data;
  },

  /**
   * Check password strength
   */
  checkPasswordStrength(password: string): PasswordStrengthResult {
    const feedback: string[] = [];
    let score = 0;

    // Length check
    if (password.length >= 8) score += 1;
    else feedback.push('Password should be at least 8 characters');

    if (password.length >= 12) score += 1;

    // Uppercase check
    if (/[A-Z]/.test(password)) score += 1;
    else feedback.push('Add uppercase letters');

    // Lowercase check
    if (/[a-z]/.test(password)) score += 1;
    else feedback.push('Add lowercase letters');

    // Number check
    if (/[0-9]/.test(password)) score += 1;
    else feedback.push('Add numbers');

    // Special character check
    if (/[^A-Za-z0-9]/.test(password)) score += 1;
    else feedback.push('Add special characters');

    // Determine strength
    let strength: PasswordStrength = 'weak';
    if (score >= 5) strength = 'strong';
    else if (score >= 3) strength = 'medium';

    return {
      strength,
      score,
      feedback,
    };
  },

  /**
   * Export all user data as JSON
   */
  async exportData(): Promise<Blob> {
    const response = await api.get('/api/v1/users/export', {
      responseType: 'blob',
    });
    return response.data;
  },

  /**
   * Import user data from JSON
   */
  async importData(file: File): Promise<void> {
    const formData = new FormData();
    formData.append('data', file);

    await api.post('/api/v1/users/import', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },

  /**
   * Clear user cache
   */
  async clearCache(): Promise<void> {
    await api.post('/api/v1/users/clear-cache');
  },

  /**
   * Reset categories to default
   */
  async resetCategories(): Promise<void> {
    await api.post('/api/v1/users/reset-categories');
  },

  /**
   * Delete all user data (dangerous!)
   */
  async deleteAllData(password: string): Promise<void> {
    await api.post('/api/v1/users/delete-all-data', { password });
  },

  /**
   * Get user API settings (SimpleFin, FMP API key, Investment tracking, etc.)
   */
  async getApiSettings(): Promise<{
    simplefinEnabled: boolean;
    simplefinGloballyEnabled: boolean;
    hasSimplefinConnection: boolean;
    investmentTrackingEnabled: boolean;
    investmentGloballyEnabled: boolean;
    fmpApiKey: string | null;
  }> {
    const response = await api.get('/api/v1/users/api-settings');
    return response.data;
  },

  /**
   * Update user API settings
   */
  async updateApiSettings(data: {
    simplefinEnabled?: boolean;
    investmentTrackingEnabled?: boolean;
    fmpApiKey?: string | null;
  }): Promise<void> {
    await api.put('/api/v1/users/api-settings', data);
  },
};

export default userService;
