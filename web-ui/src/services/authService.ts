/**
 * Authentication Service
 * Handles all authentication-related API calls
 */

import { api } from './api';
import API_CONFIG from '../config/api';
import type {
  LoginCredentials,
  RegisterCredentials,
  AuthResponse,
  User,
  OnboardingData
} from '../types/user';

export const authService = {
  /**
   * Login with email and password
   */
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    const response = await api.post<AuthResponse>(
      API_CONFIG.endpoints.auth.login,
      credentials
    );
    return response.data;
  },

  /**
   * Register a new user
   */
  async register(credentials: RegisterCredentials): Promise<AuthResponse> {
    const response = await api.post<AuthResponse>(
      API_CONFIG.endpoints.auth.register,
      credentials
    );
    return response.data;
  },

  /**
   * Logout the current user
   */
  async logout(): Promise<void> {
    try {
      await api.post(API_CONFIG.endpoints.auth.logout);
    } catch (error) {
      // Logout locally even if API call fails
      console.error('Logout error:', error);
    }
  },

  /**
   * Get current user profile
   */
  async getCurrentUser(): Promise<User> {
    const response = await api.get<User>(API_CONFIG.endpoints.auth.profile);
    return response.data;
  },

  /**
   * Complete user onboarding
   */
  async completeOnboarding(data: OnboardingData): Promise<User> {
    const response = await api.post<User>('/api/v1/auth/onboarding', data);
    return response.data;
  },

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken: string): Promise<{ access_token: string }> {
    const response = await api.post<{ access_token: string }>(
      API_CONFIG.endpoints.auth.refresh,
      {},
      {
        headers: {
          Authorization: `Bearer ${refreshToken}`,
        },
      }
    );
    return response.data;
  },

  /**
   * Verify email with token
   */
  async verifyEmail(token: string): Promise<{ success: boolean; message: string }> {
    const response = await api.post<{ success: boolean; message: string }>(
      '/api/v1/auth/verify-email',
      { token }
    );
    return response.data;
  },

  /**
   * Resend verification email
   */
  async resendVerification(email: string): Promise<{ success: boolean; message: string }> {
    const response = await api.post<{ success: boolean; message: string }>(
      '/api/v1/auth/resend-verification',
      { email }
    );
    return response.data;
  },

  /**
   * Request password reset email
   */
  async forgotPassword(email: string): Promise<{ success: boolean; message: string }> {
    const response = await api.post<{ success: boolean; message: string }>(
      '/api/v1/auth/forgot-password',
      { email }
    );
    return response.data;
  },

  /**
   * Reset password with token
   */
  async resetPassword(token: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    const response = await api.post<{ success: boolean; message: string }>(
      '/api/v1/auth/reset-password',
      { token, new_password: newPassword }
    );
    return response.data;
  },
};

export default authService;
