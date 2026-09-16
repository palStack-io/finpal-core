/**
 * The provider hand-off. On success it redirects and nobody ever sees it, so
 * *** THE ONLY STATE A HUMAN EVER READS IS THE FAILURE *** — and that state was
 * two lines and no chrome: the literal string "Authentication failed: no tokens
 * received." above a "Back to Login" button.
 *
 * It was not wrong. But "no tokens received" is provider-speak for "the sign-in
 * did not complete", and the thing a person actually wants to know when a
 * finance app will not let them in is whether anything happened to their money.
 * So it now says what happened in plain words, that nothing changed, and what
 * to try — two routes, because retrying the provider and falling back to a
 * password are different answers.
 *
 * This page also stopped being the odd one out on colour. It used
 * `var(--bg-primary)` while the other four pre-auth pages are hardcoded dark in
 * both themes, so an OIDC failure landed a light-mode user on a light page in
 * the middle of an otherwise dark flow. It is now in
 * `authPagesUseBrandColours.test.ts`'s page list with the rest of them.
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { api } from '../services/api';
import AuthShell from '../components/auth/AuthShell';

/** Why the hand-off did not finish. Each reads as a sentence, not as a code. */
type Failure = 'no-session' | 'no-profile';

const WHY: Record<Failure, string> = {
  // The provider came back without an access token — nothing was ever issued.
  'no-session': 'Your provider did not return a session.',
  // A session existed and /auth/me refused it, so we have a token and no user.
  'no-profile': 'We were signed in, but your profile would not load.',
};

/** The page's own dark surface — the same one Login and Register paint. */
const PAGE = 'linear-gradient(135deg, #0E1711 0%, #16241A 100%)';

export const OidcCallback: React.FC = () => {
  const navigate = useNavigate();
  const { setToken, setRefreshToken, login } = useAuthStore();
  const [failure, setFailure] = useState<Failure | null>(null);

  useEffect(() => {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');

    if (!accessToken || !refreshToken) {
      setFailure('no-session');
      return;
    }

    // Store tokens so the api interceptor can use them immediately
    setToken(accessToken);
    setRefreshToken(refreshToken);

    // Fetch user info with the new token.
    // /api/v1/auth/me is the real endpoint (auth_api.get_current_user); there is
    // no /api/v1/users/me route, so the previous URL 404'd and every OIDC login
    // ended on "could not load user profile".
    api.get('/api/v1/auth/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(({ data }) => {
        const user = data.user ?? data;
        login(user, accessToken, refreshToken);
        // Clear the fragment before navigating
        window.history.replaceState(null, '', window.location.pathname);
        navigate(user.hasCompletedOnboarding ? '/dashboard' : '/onboarding', { replace: true });
      })
      .catch(() => {
        setFailure('no-profile');
      });
  }, []);

  if (failure) {
    return (
      <div style={{
        minHeight: '100vh',
        background: PAGE,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}>
        <div style={{ width: '100%', maxWidth: '46rem' }}>
          <AuthShell
            art="clouded"
            kicker="Sign-in did not finish"
            headline="Weather closed in."
            blurb="Your account is untouched — the hand-off from your provider just did not complete."
            short
          >
            {/* The h1, and the only one: this page has never had a heading at
                all, so a screen reader arrived at an error with nothing to
                land on. */}
            <h1 style={{
              margin: '0 0 0.375rem',
              fontSize: '1.1875rem',
              fontWeight: 700,
              color: '#ffffff',
            }}>
              We could not finish signing you in
            </h1>
            <p style={{ margin: '0 0 1.25rem', fontSize: '0.8125rem', color: '#9CB3A3' }}>
              {WHY[failure]} Nothing has changed on your account.
            </p>
            <button
              onClick={() => { window.location.href = '/login/oidc'; }}
              style={{
                width: '100%',
                padding: '0.625rem 1.25rem',
                background: '#15803d',
                border: 'none',
                borderRadius: '8px',
                color: 'white',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.84375rem',
              }}
            >
              Try signing in again
            </button>
            {/* A second route, not a duplicate of the first: retrying the
                provider and using a password are different answers, and if the
                provider is the thing that is broken the first button loops. */}
            <button
              onClick={() => navigate('/login')}
              style={{
                width: '100%',
                marginTop: '0.5625rem',
                padding: '0.625rem 1.25rem',
                background: 'transparent',
                border: '1px solid #517E60',
                borderRadius: '8px',
                color: '#e2e8f0',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.84375rem',
              }}
            >
              Use email and password instead
            </button>
          </AuthShell>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: PAGE,
    }}>
      <div style={{
        width: '40px',
        height: '40px',
        border: '3px solid #517E60',
        borderTop: '3px solid #22c55e',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite'
      }} />
      <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default OidcCallback;
