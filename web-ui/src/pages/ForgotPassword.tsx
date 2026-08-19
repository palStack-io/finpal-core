/*
 * PRE-AUTH BRAND PALETTE. Four things about the colours in this file:
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
 *    because the token is legible against the surface the theme THINKS it is on. Nobody
 *    reported it; it was found by resolving the token by hand while fixing the brand green.
 *    The dark-mode values are inlined, so the page's surface and its text can no longer
 *    disagree. `--accent-red` becomes #f87171 (the theme's own dark red ink, 6.61:1)
 *    rather than #EF4444, which is 4.29:1 on the card and would have been a fix that
 *    still failed.
 */
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { authService } from '../services/authService';
import { useToast } from '../contexts/ToastContext';
import { Mail, ArrowLeft, CheckCircle } from 'lucide-react';

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

  if (emailSent) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0E1711 0%, #16241A 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}>
        <div style={{
          maxWidth: '450px',
          width: '100%',
          background: 'rgba(255, 255, 255, 0.05)',
          backdropFilter: 'blur(10px)',
          borderRadius: '24px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          padding: '3rem 2rem',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          textAlign: 'center'
        }}>
          <div style={{
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            background: 'rgba(16, 185, 129, 0.2)',
            border: '3px solid #22c55e',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.5rem'
          }}>
            <CheckCircle size={48} style={{ color: '#22c55e' }} />
          </div>
          <h2 style={{
            fontSize: '1.875rem',
            fontWeight: '700',
            color: '#ffffff',
            marginBottom: '0.75rem'
          }}>
            Check Your Email
          </h2>
          <p style={{
            fontSize: '1rem',
            color: '#9CB3A3',
            lineHeight: '1.75',
            marginBottom: '0.5rem'
          }}>
            We've sent password reset instructions to:
          </p>
          <p style={{
            fontSize: '1rem',
            fontWeight: '600',
            color: '#22c55e',
            marginBottom: '1.5rem'
          }}>
            {email}
          </p>
          <p style={{
            fontSize: '0.875rem',
            color: '#9CB3A3',
            lineHeight: '1.5',
            marginBottom: '2rem'
          }}>
            If you don't see the email, check your spam folder or request a new one.
          </p>

          <button
            onClick={handleResend}
            disabled={isLoading}
            style={{
              width: '100%',
              padding: '0.875rem 1.5rem',
              fontSize: '1rem',
              fontWeight: '600',
              color: '#ffffff',
              background: isLoading ? '#6b7280' : '#15803d',
              border: 'none',
              borderRadius: '12px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              marginBottom: '0.75rem'
            }}
            onMouseEnter={(e) => !isLoading && (e.currentTarget.style.background = '#166534')}
            onMouseLeave={(e) => !isLoading && (e.currentTarget.style.background = '#15803d')}>
            {isLoading ? 'Sending...' : 'Resend Email'}
          </button>

          <Link to="/login" style={{ textDecoration: 'none' }}>
            <button style={{
              width: '100%',
              padding: '0.875rem 1.5rem',
              fontSize: '1rem',
              fontWeight: '600',
              color: '#9CB3A3',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#ffffff'}
            onMouseLeave={(e) => e.currentTarget.style.color = '#94a3b8'}>
              Back to Login
            </button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0E1711 0%, #16241A 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem',
    }}>
      <div style={{
        maxWidth: '450px',
        width: '100%',
        background: 'rgba(255, 255, 255, 0.05)',
        backdropFilter: 'blur(10px)',
        borderRadius: '24px',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        padding: '3rem 2rem',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{
            display: 'inline-flex',
            padding: '1rem',
            background: 'rgba(16, 185, 129, 0.1)',
            borderRadius: '16px',
            marginBottom: '1rem'
          }}>
            <Mail size={32} style={{ color: '#22c55e' }} />
          </div>
          <h2 style={{
            fontSize: '1.875rem',
            fontWeight: '700',
            color: '#ffffff',
            marginBottom: '0.5rem'
          }}>
            Forgot Password?
          </h2>
          <p style={{
            fontSize: '1rem',
            color: '#9CB3A3',
            lineHeight: '1.75'
          }}>
            Enter your email address and we'll send you instructions to reset your password.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label style={{
              display: 'block',
              fontSize: '0.875rem',
              fontWeight: '600',
              color: '#e2e8f0',
              marginBottom: '0.5rem'
            }}>
              Email Address
            </label>
            <input
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
                padding: '0.875rem',
                fontSize: '1rem',
                color: '#ffffff',
                background: 'rgba(255, 255, 255, 0.05)',
                border: `1px solid ${error ? '#ef4444' : 'rgba(255, 255, 255, 0.1)'}`,
                borderRadius: '12px',
                outline: 'none',
                transition: 'all 0.2s',
                boxSizing: 'border-box'
              }}
              onFocus={(e) => e.target.style.borderColor = error ? '#ef4444' : '#22c55e'}
              onBlur={(e) => e.target.style.borderColor = error ? '#ef4444' : 'rgba(255, 255, 255, 0.1)'}
            />
            {error && (
              <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#f87171' }}>
                {error}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            style={{
              width: '100%',
              padding: '0.875rem 1.5rem',
              fontSize: '1rem',
              fontWeight: '600',
              color: '#ffffff',
              background: isLoading ? '#6b7280' : '#15803d',
              border: 'none',
              borderRadius: '12px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              marginTop: '0.5rem'
            }}
            onMouseEnter={(e) => !isLoading && (e.currentTarget.style.background = '#166534')}
            onMouseLeave={(e) => !isLoading && (e.currentTarget.style.background = '#15803d')}>
            {isLoading ? 'Sending...' : 'Send Reset Link'}
          </button>

          <Link to="/login" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
            <ArrowLeft size={16} style={{ color: '#9CB3A3' }} />
            <span style={{
              fontSize: '1rem',
              fontWeight: '600',
              color: '#9CB3A3',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#ffffff'}
            onMouseLeave={(e) => e.currentTarget.style.color = '#94a3b8'}>
              Back to Login
            </span>
          </Link>
        </form>
      </div>
    </div>
  );
};
