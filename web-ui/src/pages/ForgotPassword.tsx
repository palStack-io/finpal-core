/*
 * PRE-AUTH BRAND PALETTE, and the six things that have been wrong about the colours here.
 *
 * 1. They are HARDCODED HEX, and that is deliberate. Every pre-auth page — Landing, Login,
 *    Register, ForgotPassword, ResetPassword — is dark in BOTH themes and uses zero CSS
 *    variables. `ThemeProvider` does wrap these routes, so a `var(--…)` would resolve
 *    here; it would also resolve to LIGHT values in light mode and put near-white text on
 *    a dark gradient. Making these pages theme-aware is a design decision, not a colour
 *    fix, and it is not this change.
 *
 * 2. The green was NOT a finPal green. It was #10b981 / #059669 — emerald-500/600, which
 *    is not a brand value and not a token. finPal's is #15803d, with #166534 dark and
 *    #22c55e glow.
 *
 * 3. The page was slate. #0f172a → #1e293b is the same leftover navy that made dark mode
 *    read as two designs stacked (see darkSurfacesAreNotBlue.test.ts); the gradient is now
 *    --kt-wash → --kt-card, the palette the rest of dark mode resolves through.
 *
 * 4. THE OLD GREEN ALSO FAILED WCAG AA, WHICH IS WHY THE ROLES ARE SPLIT. White on
 *    #10b981 is 2.54:1 — and that was the primary call to action on this page. The brand
 *    green fixes it: white on #15803d is 5.02:1 and on #166534 is 7.13:1. But #15803d is
 *    only 3.64:1 against the new page background, so it is wrong for TEXT. Hence two
 *    values doing two jobs, not one green used everywhere:
 *
 *      button background   #15803d, hover #166534   (white on it: 5.02 / 7.13)
 *      accent text/icon/border  #22c55e             (on the page: 8.02:1)
 *
 *    Measured, not eyeballed. Pinned by authPagesUseBrandColours.test.ts.
 *
 * 5. THE TEXT COLOURS ARE HEX FOR A MEASURED REASON, NOT A STYLISTIC ONE. This file mixed
 *    a hardcoded DARK page with THEME-AWARE text — `color: 'var(--text-muted)'`. In dark
 *    mode that resolves to #9CB3A3 and reads at 8.17:1. In LIGHT mode it resolves to
 *    #56685D, and on this page's dark gradient that is **3.00:1 — below AA**. So every
 *    light-mode user read the password-reset instructions at 3:1, and no gate saw it
 *    because the token is legible against the surface the theme THINKS it is on.
 *
 * 6. *** AND THE GATE THAT PINS ALL OF THE ABOVE WAS BLIND TO HALF OF WHAT IT BANS. ***
 *    It matched the four banned colours as HEX only. Written as rgb they went straight
 *    through. Measured across the five pre-auth pages: **21 occurrences of four banned
 *    colours**, every one of them in rgb form — emerald-500 as `rgba(16, 185, 129, …)`
 *    here and in ForgotPassword, slate-900/800 as `rgba(15, 23, 42, …)` / `rgba(30, 41,
 *    59, …)` in Login and Register, blue-500 as `rgba(59, 130, 246, …)` in Login. All of
 *    it behind a green test whose entire job was to remove exactly those four values. The
 *    gate now matches both spellings. Third time a guard keyed to a spelling has gone
 *    blind in this repo; D-59's rule again.
 *
 *    The hover handlers had the same shape of bug in the small: `onMouseLeave` restored
 *    **#94a3b8**, slate-400, not the #9CB3A3 the link actually started as — so passing the
 *    mouse over "Back to sign in" once left it a different grey for the rest of the visit.
 */
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { authService } from '../services/authService';
import { useToast } from '../contexts/ToastContext';
import AuthShell from '../components/auth/AuthShell';

const PAGE = 'linear-gradient(135deg, #0E1711 0%, #16241A 100%)';
const INK = '#ffffff';
const SOFT = '#9CB3A3';
const FIELD_INK = '#e2e8f0';

export const ForgotPassword: React.FC = () => {
  const { showToast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  const validateEmail = (email: string) => {
    if (!email) {
      return 'Email is required';
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      return 'Email is invalid';
    }
    return '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validationError = validateEmail(email);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await authService.forgotPassword(email.trim().toLowerCase());

      if (response.success) {
        setEmailSent(true);
        showToast('Password reset email sent!', 'success');
      } else {
        showToast(response.message || 'Failed to send reset email', 'error');
      }
    } catch (err: any) {
      console.error('Forgot password error:', err);
      showToast('An unexpected error occurred. Please try again.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    await handleSubmit(new Event('submit') as any);
  };

  const primaryButton = (label: string): React.CSSProperties => ({
    width: '100%',
    padding: '0.75rem 1.5rem',
    fontSize: '0.9375rem',
    fontWeight: 600,
    color: INK,
    background: isLoading ? '#6b7280' : '#15803d',
    border: 'none',
    borderRadius: '10px',
    cursor: isLoading ? 'not-allowed' : 'pointer',
    transition: 'all 0.2s',
    marginTop: label ? '0.25rem' : 0,
  });

  /** The quiet "back" link, and the colour it must return to when the mouse leaves. */
  const backLink: React.CSSProperties = {
    display: 'block',
    marginTop: '0.9375rem',
    textAlign: 'center',
    fontSize: '0.8125rem',
    fontWeight: 600,
    color: SOFT,
    textDecoration: 'none',
    transition: 'color 0.2s',
  };

  const page = (children: React.ReactNode) => (
    <div style={{
      minHeight: '100vh',
      background: PAGE,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem',
    }}>
      <div style={{ width: '100%', maxWidth: '46rem' }}>{children}</div>
    </div>
  );

  if (emailSent) {
    return page(
      <AuthShell
        art="lost"
        kicker="Check your email"
        headline="The way back is in your inbox."
        blurb="Still the same mountain. Nothing about your money has changed."
        short
      >
        {/* *** AN h1, WHERE THIS PAGE HAD AN h2 AND NO h1 AT ALL. *** Both states
            of this screen opened at level two, so a reader navigating by
            headings arrived at a password-reset flow with nothing at the top of
            it. `every-page.spec.ts` asserts exactly one h1 per route but skips
            the signed-out pages by name, so it never measured this one. */}
        <h1 style={{ margin: '0 0 0.25rem', fontSize: '1.1875rem', fontWeight: 700, color: INK }}>
          Check your email
        </h1>
        <p style={{ margin: '0 0 1.125rem', fontSize: '0.8125rem', color: SOFT, lineHeight: 1.6 }}>
          Reset instructions are on their way to{' '}
          <span style={{ color: '#22c55e', fontWeight: 600 }}>{email}</span>. The link works
          once. If it does not arrive, check your spam folder or send another.
        </p>

        <button onClick={handleResend} disabled={isLoading} style={primaryButton('resend')}
          onMouseEnter={(e) => !isLoading && (e.currentTarget.style.background = '#166534')}
          onMouseLeave={(e) => !isLoading && (e.currentTarget.style.background = '#15803d')}>
          {isLoading ? 'Sending…' : 'Send another link'}
        </button>

        <Link to="/login" style={backLink}
          onMouseEnter={(e) => { e.currentTarget.style.color = INK; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = SOFT; }}>
          Back to sign in
        </Link>
      </AuthShell>,
    );
  }

  return page(
    <AuthShell
      art="lost"
      kicker="Lost the way in"
      headline="The mountain is still there."
      blurb="Only the way in is missing. Nothing about your money has changed."
      short
    >
      <h1 style={{ margin: '0 0 0.25rem', fontSize: '1.1875rem', fontWeight: 700, color: INK }}>
        Reset your password
      </h1>
      {/* Two sentences, and the second one is the point: a reset link that
          silently stops working is the most common support question this flow
          produces, and saying so up front costs one line. */}
      <p style={{ margin: '0 0 1.125rem', fontSize: '0.8125rem', color: SOFT, lineHeight: 1.6 }}>
        We will email you a link. The link works once.
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column' }}>
        <label htmlFor="forgot-email" style={{
          display: 'block',
          fontSize: '0.75rem',
          fontWeight: 600,
          color: FIELD_INK,
          marginBottom: '0.3125rem',
        }}>
          Email address
        </label>
        <input
          id="forgot-email"
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (error) setError('');
          }}
          placeholder="your.email@example.com"
          autoComplete="email"
          style={{
            width: '100%',
            padding: '0.6875rem 0.75rem',
            fontSize: '0.9375rem',
            color: INK,
            background: 'rgba(255, 255, 255, 0.05)',
            border: `1px solid ${error ? '#f87171' : '#517E60'}`,
            borderRadius: '10px',
            outline: 'none',
            transition: 'all 0.2s',
            boxSizing: 'border-box',
            marginBottom: '0.8125rem',
          }}
          onFocus={(e) => { e.target.style.borderColor = error ? '#f87171' : '#22c55e'; }}
          onBlur={(e) => {
            e.target.style.borderColor = error ? '#f87171' : '#517E60';
          }}
        />
        {error && (
          <p style={{ margin: '-0.375rem 0 0.8125rem', fontSize: '0.8125rem', color: '#f87171' }}>
            {error}
          </p>
        )}

        <button type="submit" disabled={isLoading} style={primaryButton('')}
          onMouseEnter={(e) => !isLoading && (e.currentTarget.style.background = '#166534')}
          onMouseLeave={(e) => !isLoading && (e.currentTarget.style.background = '#15803d')}>
          {isLoading ? 'Sending…' : 'Send reset link'}
        </button>

        <Link to="/login" style={backLink}
          onMouseEnter={(e) => { e.currentTarget.style.color = INK; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = SOFT; }}>
          Back to sign in
        </Link>
      </form>
    </AuthShell>,
  );
};

export default ForgotPassword;
