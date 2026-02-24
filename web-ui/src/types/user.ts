/**
 * User Types
 */

export type Currency = 'USD' | 'EUR' | 'GBP' | 'INR' | 'CAD' | 'AUD';

export interface UserNotifications {
  email: boolean;
  push: boolean;
  budgetAlerts: boolean;
  transactionAlerts: boolean;
}

export interface User {
  id: string;
  email: string;
  name: string;
  user_color?: string;
  profile_emoji?: string;
  is_admin?: boolean;
  default_currency_code?: Currency;
  timezone?: string;
  hasCompletedOnboarding?: boolean;
  notifications?: UserNotifications;
  created_at?: string;
  phone?: string;
  bio?: string;
  avatar?: string;
  defaultAccount?: number;
  defaultCategory?: number;
  dateFormat?: string;
  numberFormat?: string;
  weekStartDay?: 'sunday' | 'monday';
  fiscalYearStart?: number;
  // Demo mode fields
  is_demo_user?: boolean;
}

export interface OnboardingData {
  default_currency_code: Currency;
  timezone: string;
  notifications: UserNotifications;
  profile_emoji?: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken?: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  hasCompletedOnboarding: boolean;
  // Demo mode state
  isDemoUser: boolean;
  demoExpiresAt: string | null;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterCredentials {
  email: string;
  password: string;
  username?: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  user: User;
  demo_expires_at?: string;
}

export interface ProfileUpdate {
  name?: string;
  email?: string;
  phone?: string;
  bio?: string;
  avatar?: string;
  user_color?: string;
  profile_emoji?: string;
  timezone?: string;
  default_currency_code?: Currency;
}

export interface PasswordChangeRequest {
  currentPassword: string;
  newPassword: string;
}

export interface Session {
  id: string;
  device: string;
  browser: string;
  location: string;
  ipAddress?: string;
  lastActive: string;
  createdAt: string;
  current: boolean;
}

export interface PasswordResetRequest {
  email: string;
}

export interface DeleteAccountRequest {
  password: string;
}

export type PasswordStrength = 'weak' | 'medium' | 'strong';

export interface PasswordStrengthResult {
  strength: PasswordStrength;
  score: number;
  feedback: string[];
}
