/**
 * User Types
 */

/**
 * The currencies the app supports.
 *
 * `JPY` was missing here while `Settings.tsx:142` offers it and the backend seeds it
 * (`src/cli.py:200`), so a user could select a currency this type said did not exist —
 * and `getBranding` fell back to USD for it, branding a yen account "DollarPal" with a
 * `$`. Found via D-45, because the vacuous typecheck gate meant the resulting
 * assignment error was never reported.
 */
export type Currency = 'USD' | 'EUR' | 'GBP' | 'INR' | 'JPY' | 'CAD' | 'AUD';

export interface ServerFeatures {
  simplefin: boolean;
  investments: boolean;
}

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
  /** BCP-47 tag driving number formatting (#132). Null/absent means the app default. */
  number_locale?: string | null;
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
  // Module system — slugs granted by adminPal. ENTITLEMENT: "may you".
  modules?: string[];
  /**
   * Slugs this user has chosen to HIDE. PREFERENCE: "do you want to" — a
   * different question from `modules`, and a different table server-side
   * (`user_module_preferences`, owner decision 2026-09-11).
   *
   * *** DELIBERATELY NOT SUBTRACTED FROM `modules`. *** Settings renders its
   * Modules tab from `modules` and is the only screen that can un-hide one, so
   * filtering hidden slugs out of that list would make hiding a one-way door.
   * The sidebar honours this; Settings ignores it.
   *
   * Optional because a payload from a server older than this feature has no
   * such key, and `undefined` must mean "nothing hidden", not "everything".
   */
  hidden_modules?: string[];
}

export interface OnboardingData {
  /** Number-format preference (#132). `null` keeps the app default. */
  number_locale?: string | null;
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
  // Server-level optional features
  features: ServerFeatures;
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
  features?: ServerFeatures;
}

export interface ProfileUpdate {
  /**
   * BCP-47 tag for number formatting (#132). `null` clears it back to the app default,
   * which is a real choice and not an omission — the API distinguishes the two.
   */
  number_locale?: string | null;
  name?: string;
  email?: string;
  phone?: string;
  bio?: string;
  avatar?: string;
  user_color?: string;
  profile_emoji?: string;
  timezone?: string;
  default_currency_code?: Currency;
  /**
   * D-148. Partial: only the keys present are written, so a Settings panel can save
   * its own toggles without resetting the ones it does not render.
   *
   * `PUT /users/profile` is the ONLY path that changes these after onboarding.
   * `POST /auth/onboarding` also writes them and sets `has_completed_onboarding`
   * unconditionally, so using it as a settings route re-completes onboarding as a
   * side effect — which is why "wire the UI to the existing endpoint" was the wrong
   * fix and this field exists.
   */
  notifications?: Partial<UserNotifications>;
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
