# Mobile OIDC + Apple Sign In Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add OIDC (Google / any configured provider) and Apple Sign In to the finPal mobile app.

**Architecture:** Backend exposes a new `/api/v1/auth/config` endpoint so the mobile app discovers what SSO is enabled. OIDC uses `expo-web-browser` to open an in-app browser to the existing `/login/oidc` route (with a `?mobile=1` flag); the backend callback detects mobile and redirects to `finpal://oidc/callback?access_token=...&refresh_token=...` instead of a Flask-Login session. Apple Sign In uses `expo-apple-authentication` for the native iOS sheet; the app sends the `identityToken` to a new `POST /api/v1/auth/apple` endpoint which verifies it using Apple's public keys and returns JWT tokens.

**Tech Stack:** Flask (Blueprint `api_bp`), Flask-JWT-Extended, PyJWT, Expo Router, Zustand, expo-web-browser, expo-apple-authentication, React Native Platform API

---

### Task 1: Backend — `GET /api/v1/auth/config` endpoint

**Files:**
- Modify: `finpal_core/src/services/auth/api_routes.py`

**Step 1: Add the endpoint** — append after the existing imports at the top of the file and after the last route:

```python
@api_bp.route('/config', methods=['GET'])
def auth_config():
    """Return auth capabilities so mobile can show correct login options."""
    import os
    oidc_enabled = current_app.config.get('OIDC_ENABLED', False)
    oidc_provider_name = current_app.config.get('OIDC_PROVIDER_NAME', 'SSO')
    apple_signin_enabled = os.getenv('APPLE_SIGNIN_ENABLED', 'False').lower() == 'true'
    return jsonify({
        'oidc_enabled': bool(oidc_enabled),
        'oidc_provider_name': oidc_provider_name,
        'apple_signin_enabled': apple_signin_enabled,
    }), 200
```

**Step 2: Verify manually**

```bash
curl http://localhost:8085/api/v1/auth/config
```
Expected: `{"oidc_enabled": false, "oidc_provider_name": "SSO", "apple_signin_enabled": false}`

**Step 3: Commit**

```bash
git add finpal_core/src/services/auth/api_routes.py
git commit -m "feat: add GET /api/v1/auth/config for mobile capability discovery"
```

---

### Task 2: Backend — OIDC mobile flag in `/login/oidc`

**Files:**
- Modify: `finpal_core/integrations/oidc/auth.py`

The `/login/oidc` route builds the redirect. We need to store `mobile=1` in the session so the callback knows to return JWT instead of a Flask-Login session.

**Step 1: Find the `/login/oidc` handler** — it's the function decorated with `@app.route('/login/oidc')` inside `register_oidc_routes`. Locate the line that reads `next_url` or `redirect_to` from the request args. Right after the existing session stores (e.g. `set_oidc_session('state', state_token)`), add:

```python
# Store mobile flag so callback can return JWT deep link
mobile = request.args.get('mobile', '0')
set_oidc_session('mobile', mobile)
```

**Step 2: Verify the function still redirects correctly**

```bash
# With OIDC disabled this just redirects to login, that's fine
curl -v http://localhost:8085/login/oidc 2>&1 | grep Location
```
Expected: redirect to login page (OIDC disabled in dev).

**Step 3: Commit**

```bash
git add finpal_core/integrations/oidc/auth.py
git commit -m "feat: store mobile flag in OIDC session for JWT callback branch"
```

---

### Task 3: Backend — OIDC callback mobile branch (JWT + deep link redirect)

**Files:**
- Modify: `finpal_core/integrations/oidc/auth.py`

**Step 1: Find the success path in `/oidc/callback`** — it's the section after `login_user(user)` that currently does:

```python
login_user(user)
redirect_to = get_oidc_session('redirect_to', url_for('dashboard'), delete=True)
return redirect(redirect_to)
```

**Step 2: Replace those three lines** with:

```python
is_mobile = get_oidc_session('mobile', '0', delete=True) == '1'

if is_mobile:
    # Mobile flow: return JWT tokens via deep link instead of Flask-Login session
    from flask_jwt_extended import create_access_token, create_refresh_token
    access_token = create_access_token(
        identity=user.id,
        additional_claims={'email': user.id}
    )
    refresh_token = create_refresh_token(identity=user.id)
    deep_link = (
        f"finpal://oidc/callback"
        f"?access_token={access_token}"
        f"&refresh_token={refresh_token}"
    )
    return redirect(deep_link)

# Web flow: unchanged
login_user(user)
redirect_to = get_oidc_session('redirect_to', url_for('dashboard'), delete=True)
return redirect(redirect_to)
```

**Step 3: Commit**

```bash
git add finpal_core/integrations/oidc/auth.py
git commit -m "feat: OIDC callback returns JWT deep link when mobile=1"
```

---

### Task 4: Backend — `POST /api/v1/auth/apple` endpoint

**Files:**
- Modify: `finpal_core/src/services/auth/api_routes.py`

Apple Sign In verification: the mobile app sends `identity_token` (a JWT signed by Apple). We verify it using Apple's public JWKS, then create/find the user the same way as OIDC.

**Step 1: Add the endpoint** after the `/config` route added in Task 1:

```python
@api_bp.route('/apple', methods=['POST'])
def apple_signin():
    """Verify Apple Sign In identity token and return finPal JWT tokens."""
    import os
    import requests as http_requests
    import jwt as pyjwt
    from jwt.algorithms import RSAAlgorithm

    if os.getenv('APPLE_SIGNIN_ENABLED', 'False').lower() != 'true':
        return jsonify({'error': 'Apple Sign In is not enabled'}), 403

    data = request.get_json() or {}
    identity_token = data.get('identity_token')
    if not identity_token:
        return jsonify({'error': 'identity_token is required'}), 400

    try:
        # Fetch Apple's public keys
        keys_resp = http_requests.get(
            'https://appleid.apple.com/auth/keys', timeout=10
        )
        keys_resp.raise_for_status()
        apple_keys = keys_resp.json().get('keys', [])

        # Find the key matching the token's kid header
        header = pyjwt.get_unverified_header(identity_token)
        kid = header.get('kid')
        apple_key_dict = next((k for k in apple_keys if k['kid'] == kid), None)
        if not apple_key_dict:
            return jsonify({'error': 'Invalid token: key not found'}), 401

        # Build RSA public key and verify the token
        public_key = RSAAlgorithm.from_jwk(apple_key_dict)
        bundle_id = os.getenv('APPLE_CLIENT_ID', '')
        claims = pyjwt.decode(
            identity_token,
            public_key,
            algorithms=['RS256'],
            audience=bundle_id,
            issuer='https://appleid.apple.com',
        )

        # Extract user info — Apple only sends email on first login
        sub = claims['sub']
        token_email = claims.get('email') or data.get('email')
        if not token_email:
            return jsonify({'error': 'Could not determine user email from Apple token'}), 400

        full_name = data.get('full_name')
        name = full_name or token_email.split('@')[0]

        oidc_data = {
            'sub': sub,
            'email': token_email,
            'name': name,
            'email_verified': True,
        }

        # Reuse existing OIDC user creation logic
        from integrations.oidc.user import extend_user_model
        # User.from_oidc is added by extend_user_model at startup
        user = User.from_oidc(oidc_data, provider='apple')
        if not user:
            return jsonify({'error': 'Failed to create or find user'}), 500

        db.session.commit()

        access_token = create_access_token(
            identity=user.id,
            additional_claims={'email': user.id}
        )
        refresh_token = create_refresh_token(identity=user.id)

        return jsonify({
            'access_token': access_token,
            'refresh_token': refresh_token,
            'user': {
                'id': user.id,
                'name': user.name,
                'email': user.id,
                'default_currency_code': getattr(user, 'default_currency_code', 'USD') or 'USD',
                'profile_emoji': getattr(user, 'profile_emoji', '👤'),
            }
        }), 200

    except pyjwt.ExpiredSignatureError:
        return jsonify({'error': 'Apple token has expired'}), 401
    except pyjwt.InvalidTokenError as e:
        current_app.logger.warning(f"Apple token validation failed: {e}")
        return jsonify({'error': 'Invalid Apple token'}), 401
    except Exception as e:
        current_app.logger.error(f"Apple Sign In error: {e}")
        return jsonify({'error': 'Authentication failed'}), 500
```

**Step 2: Make sure `PyJWT` with RSA support is in requirements**

Check:
```bash
grep -i "pyjwt\|PyJWT\|cryptography" finpal_core/requirements.txt
```

If `PyJWT` is not there (Flask-JWT-Extended pulls it in as a dep, but cryptography may not be explicit):
```bash
echo "PyJWT>=2.8.0\ncryptography>=42.0.0" >> finpal_core/requirements.txt
```

**Step 3: Test the endpoint rejects missing token**

```bash
curl -X POST http://localhost:8085/api/v1/auth/apple \
  -H "Content-Type: application/json" \
  -d '{}'
```
Expected: `{"error": "Apple Sign In is not enabled"}` (403) since env var is False in dev.

**Step 4: Commit**

```bash
git add finpal_core/src/services/auth/api_routes.py finpal_core/requirements.txt
git commit -m "feat: add POST /api/v1/auth/apple for Apple Sign In JWT verification"
```

---

### Task 5: Mobile — install packages

**Files:**
- Modify: `mobile/package.json` (auto-updated by expo install)

**Step 1: Install**

```bash
cd /Users/basestation/Documents/Palstacks/finPal/mobile
npx expo install expo-web-browser expo-apple-authentication
```

**Step 2: Verify packages are in package.json**

```bash
grep -E "expo-web-browser|expo-apple-authentication" package.json
```
Expected: both listed under `dependencies`.

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: add expo-web-browser and expo-apple-authentication"
```

---

### Task 6: Mobile — `authService` additions

**Files:**
- Modify: `mobile/src/services/authService.ts`

**Step 1: Add types and three new methods** to the existing `authService` object. Add at the top of the file alongside existing imports:

```typescript
import * as WebBrowser from 'expo-web-browser';
import { useConfigStore } from '../store/configStore';
```

Add these types after the existing `AuthResponse` interface:

```typescript
export interface AuthConfig {
  oidc_enabled: boolean;
  oidc_provider_name: string;
  apple_signin_enabled: boolean;
}
```

Add these methods inside the `authService` object:

```typescript
  getAuthConfig: async (): Promise<AuthConfig> => {
    const response = await api.get('/auth/config');
    return response.data;
  },

  oidcLogin: async (): Promise<{ access_token: string; refresh_token: string } | null> => {
    // Get raw backend URL (OIDC routes are NOT under /api/v1)
    const backendUrl = useConfigStore.getState().backendUrl || 'https://findemo.palstack.io';
    const result = await WebBrowser.openAuthSessionAsync(
      `${backendUrl}/login/oidc?mobile=1`,
      'finpal://oidc/callback'
    );
    if (result.type === 'success' && result.url) {
      const url = new URL(result.url);
      const access_token = url.searchParams.get('access_token');
      const refresh_token = url.searchParams.get('refresh_token');
      if (access_token && refresh_token) {
        return { access_token, refresh_token };
      }
    }
    return null;
  },

  appleLogin: async (
    identityToken: string,
    fullName?: string,
    email?: string,
  ): Promise<AuthResponse> => {
    const response = await api.post('/auth/apple', {
      identity_token: identityToken,
      full_name: fullName || undefined,
      email: email || undefined,
    });
    return response.data;
  },
```

**Step 2: Verify TypeScript compiles**

```bash
cd /Users/basestation/Documents/Palstacks/finPal/mobile
npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

**Step 3: Commit**

```bash
git add src/services/authService.ts
git commit -m "feat: add getAuthConfig, oidcLogin, appleLogin to authService"
```

---

### Task 7: Mobile — OIDC deep link callback screen (fallback)

**Files:**
- Create: `mobile/app/oidc/callback.tsx`

This screen handles the case where the OS opens the app via the `finpal://oidc/callback` deep link directly (rather than via `openAuthSessionAsync`). It's a thin screen that just extracts tokens and redirects.

**Step 1: Create directory and file**

```bash
mkdir -p /Users/basestation/Documents/Palstacks/finPal/mobile/app/oidc
```

```tsx
// mobile/app/oidc/callback.tsx
import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useAuthStore } from '../../src/store/authStore';
import { authService } from '../../src/services/authService';

export default function OidcCallbackScreen() {
  const params = useLocalSearchParams<{ access_token?: string; refresh_token?: string }>();
  const { setTokens, setUser } = useAuthStore();

  useEffect(() => {
    const finish = async () => {
      const { access_token, refresh_token } = params;
      if (!access_token || !refresh_token) {
        router.replace('/(auth)/login');
        return;
      }
      setTokens(access_token, refresh_token);
      try {
        const user = await authService.getCurrentUser();
        setUser(user);
      } catch {
        // non-fatal — user will be fetched later
      }
      router.replace('/(tabs)/dashboard');
    };
    finish();
  }, []);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#15803d" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
});
```

**Step 2: Verify TypeScript compiles**

```bash
cd /Users/basestation/Documents/Palstacks/finPal/mobile
npx tsc --noEmit 2>&1 | head -20
```

**Step 3: Commit**

```bash
git add app/oidc/callback.tsx
git commit -m "feat: add OIDC deep link callback screen for mobile"
```

---

### Task 8: Mobile — update login screen with SSO + Apple buttons

**Files:**
- Modify: `mobile/app/(auth)/login.tsx`

**Step 1: Add imports** at the top of `login.tsx`, alongside existing imports:

```typescript
import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { authService, AuthConfig } from '../../src/services/authService';
```

**Step 2: Add state and effect** inside the component, alongside existing `useState`/`useEffect` calls:

```typescript
const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);

useEffect(() => {
  authService.getAuthConfig()
    .then(setAuthConfig)
    .catch(() => {}); // non-fatal — buttons just won't show
}, []);
```

**Step 3: Add OIDC handler** inside the component:

```typescript
const handleOidcLogin = async () => {
  try {
    setLoading(true);
    const result = await authService.oidcLogin();
    if (!result) return; // user cancelled browser
    const { setTokens, setUser } = useAuthStore.getState();
    setTokens(result.access_token, result.refresh_token);
    try {
      const user = await authService.getCurrentUser();
      setUser(user);
    } catch {}
    router.replace('/(tabs)/dashboard');
  } catch {
    setError('SSO sign in failed. Please try again.');
  } finally {
    setLoading(false);
  }
};
```

**Step 4: Add Apple handler** inside the component:

```typescript
const handleAppleSignIn = async () => {
  try {
    setLoading(true);
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
    if (!credential.identityToken) throw new Error('No identity token');
    const fullName = credential.fullName
      ? [credential.fullName.givenName, credential.fullName.familyName]
          .filter(Boolean).join(' ') || undefined
      : undefined;
    const response = await authService.appleLogin(
      credential.identityToken,
      fullName,
      credential.email || undefined,
    );
    const { setTokens, setUser } = useAuthStore.getState();
    setTokens(response.access_token, response.refresh_token);
    setUser(response.user);
    router.replace('/(tabs)/dashboard');
  } catch (e: any) {
    if (e.code !== 'ERR_REQUEST_CANCELED') {
      setError('Apple sign in failed. Please try again.');
    }
  } finally {
    setLoading(false);
  }
};
```

**Step 5: Add the buttons to JSX** — find the closing part of the form (near the register link / forgot password link). Add this block just above the register link:

```tsx
{/* SSO / Social sign-in divider + buttons */}
{(authConfig?.oidc_enabled || (Platform.OS === 'ios' && authConfig?.apple_signin_enabled)) && (
  <>
    {/* Divider */}
    <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 20 }}>
      <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.2)' }} />
      <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginHorizontal: 12 }}>or</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.2)' }} />
    </View>

    {/* OIDC button */}
    {authConfig?.oidc_enabled && (
      <TouchableOpacity
        onPress={handleOidcLogin}
        disabled={loading}
        style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
          backgroundColor: 'rgba(255,255,255,0.12)',
          borderRadius: 12, paddingVertical: 14, paddingHorizontal: 20,
          borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
          marginBottom: 12,
        }}
      >
        <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>
          Sign in with {authConfig.oidc_provider_name}
        </Text>
      </TouchableOpacity>
    )}

    {/* Apple Sign In — iOS only, uses required Apple-designed button */}
    {Platform.OS === 'ios' && authConfig?.apple_signin_enabled && (
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
        buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
        cornerRadius={12}
        style={{ height: 50, marginBottom: 12 }}
        onPress={handleAppleSignIn}
      />
    )}
  </>
)}
```

**Step 6: Verify TypeScript compiles**

```bash
cd /Users/basestation/Documents/Palstacks/finPal/mobile
npx tsc --noEmit 2>&1 | head -30
```
Expected: no errors.

**Step 7: Commit**

```bash
git add app/(auth)/login.tsx
git commit -m "feat: add OIDC and Apple Sign In buttons to mobile login screen"
```

---

### Task 9: Rebuild local dev stack to test backend changes

**Step 1: Rebuild only the backend container**

```bash
cd /Users/basestation/Documents/Palstacks/finPal/finpal_core
docker compose -f docker-compose.dev.yml build backend
docker compose -f docker-compose.dev.yml up -d backend
```

**Step 2: Verify `/auth/config` responds**

```bash
sleep 5
curl http://localhost:8085/api/v1/auth/config
```
Expected: `{"apple_signin_enabled": false, "oidc_enabled": false, "oidc_provider_name": "SSO"}`

**Step 3: Verify `/auth/apple` is 403 when disabled**

```bash
curl -X POST http://localhost:8085/api/v1/auth/apple \
  -H "Content-Type: application/json" -d '{}'
```
Expected: `{"error": "Apple Sign In is not enabled"}` with 403.

**Step 4: Commit**

```bash
# Nothing to commit here — just verification
```

---

### Task 10: Wire up deep link scheme in app.json (if not already handled by expo-router)

**Files:**
- Check/Modify: `mobile/app.json`

**Step 1: Verify the scheme is set**

```bash
grep -A3 '"scheme"' /Users/basestation/Documents/Palstacks/finPal/mobile/app.json
```
Expected: `"scheme": "finpal"` already present (confirmed from exploration).

**Step 2: Expo Router automatically handles `finpal://oidc/callback` → `app/oidc/callback.tsx`** — no additional config needed since the scheme is already set.

**Step 3: Final verification commit**

```bash
cd /Users/basestation/Documents/Palstacks/finPal/mobile
git add -A
git commit -m "feat: mobile OIDC + Apple Sign In complete"
```

---

## Testing Checklist

**Backend (can test now without mobile):**
- [ ] `GET /api/v1/auth/config` returns correct JSON
- [ ] `POST /api/v1/auth/apple` returns 403 when `APPLE_SIGNIN_ENABLED=False`
- [ ] `POST /api/v1/auth/apple` returns 401 for invalid token when enabled
- [ ] `/login/oidc?mobile=1` stores mobile flag in session (enable OIDC in dev env to test)

**Mobile (requires Expo Go or simulator):**
- [ ] Login screen shows no SSO buttons when config returns `oidc_enabled: false`
- [ ] Login screen shows OIDC button when `oidc_enabled: true`
- [ ] Apple button only appears on iOS
- [ ] OIDC browser opens on tap, closes after auth
- [ ] Tokens stored in authStore after OIDC success
- [ ] Apple sign in sheet opens on tap (simulator needs Apple ID)

## Env Vars to Enable in Production

```bash
# OIDC (existing + new mobile support)
OIDC_ENABLED=True
OIDC_CLIENT_ID=your-google-client-id
OIDC_CLIENT_SECRET=your-google-secret
OIDC_DISCOVERY_URL=https://accounts.google.com/.well-known/openid-configuration
OIDC_PROVIDER_NAME=Google

# Apple (new)
APPLE_SIGNIN_ENABLED=True
APPLE_CLIENT_ID=io.palstack.finpal   # must match app bundle ID in app.json
```
