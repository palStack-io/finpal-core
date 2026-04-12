# Mobile OIDC + Apple Sign In — Design

**Date:** 2026-03-11

## Goal

Add SSO login to the finPal mobile app via two flows: OIDC (Google, Keycloak, etc. — provider-configured via env vars) and native Apple Sign In (iOS only).

## Architecture

Two separate flows with a shared outcome: both produce finPal JWT tokens stored in the mobile authStore.

### Flow 1: OIDC (Google, Keycloak, Authentik, etc.)

- Provider is backend-configured via `OIDC_ENABLED` / `OIDC_PROVIDER_NAME` env vars
- Mobile first calls `GET /api/v1/auth/config` to discover if OIDC is enabled and what the provider name is
- Login screen shows "Sign in with [provider_name]" button only when `oidc_enabled: true`
- Tap opens `expo-web-browser` pointing to `/api/login/oidc?mobile=1`
- Backend runs existing PKCE flow; on `/oidc/callback` detects `mobile=1` flag
- Instead of Flask-Login session redirect, backend mints JWT tokens and redirects to `finpal://oidc/callback?access_token=...&refresh_token=...`
- Expo Router deep link handler extracts tokens → stores in authStore → navigates to dashboard

### Flow 2: Apple Sign In (iOS only)

- Enabled via `APPLE_SIGNIN_ENABLED=True` + `APPLE_CLIENT_ID=<bundle-id>` env vars
- Uses `expo-apple-authentication` — opens native iOS authentication sheet (no browser)
- App receives `{ identityToken, authorizationCode, fullName, email }` — note: Apple only provides `fullName` and `email` on the very first login
- App posts to new `POST /api/v1/auth/apple`: `{ identity_token, full_name?, email? }`
- Backend verifies `identityToken` JWT using Apple's public keys from `https://appleid.apple.com/auth/keys` (no private key required for mobile client verification)
- Backend creates or finds user using same `User.from_oidc` pattern
- Returns standard finPal JWT `{ access_token, refresh_token, user }`
- Android: button is hidden (Apple Sign In is iOS-only)

## Backend Changes

### New endpoint: `GET /api/v1/auth/config`
```json
{
  "oidc_enabled": true,
  "oidc_provider_name": "Google",
  "apple_signin_enabled": true
}
```

### Modified: `GET /api/login/oidc`
- Accepts `?mobile=1` query param
- Stores `mobile=1` in session alongside existing PKCE state

### Modified: `GET /oidc/callback`
- After successful token exchange + user creation:
  - If `mobile=1` in session: mint JWT tokens → `redirect("finpal://oidc/callback?access_token=...&refresh_token=...")`
  - Else: existing Flask-Login session redirect (unchanged)

### New endpoint: `POST /api/v1/auth/apple`
- Accepts `{ identity_token, full_name?, email? }`
- Fetches Apple public keys from `https://appleid.apple.com/auth/keys`
- Verifies JWT signature, issuer (`https://appleid.apple.com`), audience (bundle ID), expiry
- Calls `User.from_oidc({ sub, email, name, email_verified: True }, provider='apple')`
- Returns `{ access_token, refresh_token, user }`

## Mobile Changes

### New package: `expo-web-browser`
- Used for OIDC in-app browser flow

### New package: `expo-apple-authentication`
- Used for native Apple Sign In sheet

### New: `src/services/authService.ts` additions
- `getAuthConfig()` → `GET /api/v1/auth/config`
- `oidcLogin()` → opens browser to `/api/login/oidc?mobile=1`
- `appleLogin(identityToken, fullName?, email?)` → `POST /api/v1/auth/apple`

### New: `app/(auth)/oidc-callback.tsx`
- Deep link handler for `finpal://oidc/callback`
- Extracts `access_token` + `refresh_token` from URL params
- Stores in authStore → navigates to `/(tabs)/dashboard`

### Modified: `app/(auth)/login.tsx`
- Calls `getAuthConfig()` on mount
- Shows "Sign in with [provider_name]" button if `oidc_enabled`
- Shows "Sign in with Apple" button if iOS + `apple_signin_enabled`
- Buttons sit below existing form, separated by a divider

### Modified: `app.json`
- Add `finpal://oidc/callback` as an intentFilter / deep link scheme (already has `scheme: "finpal"`)

## Env Vars

```
# OIDC (existing)
OIDC_ENABLED=True
OIDC_CLIENT_ID=...
OIDC_CLIENT_SECRET=...
OIDC_DISCOVERY_URL=https://accounts.google.com/.well-known/openid-configuration
OIDC_PROVIDER_NAME=Google

# Apple (new)
APPLE_SIGNIN_ENABLED=True
APPLE_CLIENT_ID=io.palstack.finpal   # must match app bundle ID
```

## What Is Not Changing

- Web OIDC flow is untouched
- Email/password login unchanged on mobile and web
- Biometric unlock unchanged
- Android users do not get Apple Sign In
