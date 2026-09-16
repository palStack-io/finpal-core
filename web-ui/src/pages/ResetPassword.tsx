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
import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { authService } from '../services/authService';
import { useToast } from '../contexts/ToastContext';
import { Eye, EyeOff } from 'lucide-react';
import { apiErrorMessage } from '../utils/apiError';
import AuthShell from '../components/auth/AuthShell';

const PAGE = 'linear-gradient(135deg, #0E1711 0%, #16241A 100%)';
const INK = '#ffffff';
const SOFT = '#9CB3A3';
const FIELD_INK = '#e2e8f0';
const RED = '#f87171';
const FIELD_LINE = '#517E60';

export const ResetPassword: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { showToast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  const token = searchParams.get('token');
  const email = searchParams.get('email');

  const [formData, setFormData] = useState({
    password: '',
    confirmPassword: '',
  });

  const [errors, setErrors] = useState<{ password?: string; confirmPassword?: string }>({});

  useEffect(() => {
    if (!token || !email) {
      showToast('Invalid password reset link. Please request a new one.', 'error');
      navigate('/login');
    }
  }, [token, email]);

  const validatePassword = (pass: string): string | null => {
    if (pass.length < 8) {
      return 'Password must be at least 8 characters long';
    }
    if (!/[A-Z]/.test(pass)) {
      return 'Password must contain at least one uppercase letter';
    }
    if (!/[a-z]/.test(pass)) {
      return 'Password must contain at least one lowercase letter';
    }
    if (!/[0-9]/.test(pass)) {
      return 'Password must contain at least one number';
    }
    return null;
  };

  const validateForm = () => {
    const newErrors: { password?: string; confirmPassword?: string } = {};

    const passwordError = validatePassword(formData.password);
    if (passwordError) {
      newErrors.password = passwordError;
    }

    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm() || !token) {
      return;
    }

    setIsLoading(true);

    try {
      const response = await authService.resetPassword(token, formData.password);

      if (response.success) {
        setResetSuccess(true);
        showToast('Password reset successfully!', 'success');
      } else {
        showToast(response.message || 'Failed to reset password. The link may have expired.', 'error');
      }
    } catch (error: any) {
      console.error('Reset password error:', error);
      showToast(
        apiErrorMessage(error, 'An unexpected error occurred. Please try again.'),
        'error'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    // Clear error when user starts typing
    if (errors[name as keyof typeof errors]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
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

  const primaryButton: React.CSSProperties = {
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
    marginTop: '0.25rem',
  };

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

  const fieldStyle = (bad: boolean): React.CSSProperties => ({
    width: '100%',
    padding: '0.6875rem 2.25rem 0.6875rem 0.75rem',
    fontSize: '0.9375rem',
    color: INK,
    background: 'rgba(255, 255, 255, 0.05)',
    border: `1px solid ${bad ? RED : FIELD_LINE}`,
    borderRadius: '10px',
    outline: 'none',
    transition: 'all 0.2s',
    boxSizing: 'border-box',
  });

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.75rem',
    fontWeight: 600,
    color: FIELD_INK,
    marginBottom: '0.3125rem',
  };

  const revealStyle: React.CSSProperties = {
    position: 'absolute',
    right: '0.625rem',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '0.25rem',
    color: SOFT,
    display: 'flex',
  };

  if (resetSuccess) {
    return page(
      <AuthShell
        art="rejoined"
        kicker="Back on the trail"
        headline="You are back in."
        blurb="The trail joins up again. Your figures are exactly where you left them."
        short
      >
        <h1 style={{ margin: '0 0 0.25rem', fontSize: '1.1875rem', fontWeight: 700, color: INK }}>
          Your password is set
        </h1>
        <p style={{ margin: '0 0 1.125rem', fontSize: '0.8125rem', color: SOFT, lineHeight: 1.6 }}>
          Sign in with the new one. The link you just used is now spent — a further
          change would be a fresh request.
        </p>
        <Link to="/login" style={{ textDecoration: 'none' }}>
          <button type="button" style={primaryButton}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#166534'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#15803d'; }}>
            Continue to sign in
          </button>
        </Link>
      </AuthShell>,
    );
  }

  return page(
    <AuthShell
      art="rejoined"
      kicker="Back on the trail"
      headline="Pick a new one and keep climbing."
      blurb="This link is now used up. The next one would be a fresh request."
    >
      {/* *** AN h1, WHERE BOTH STATES OF THIS PAGE OPENED AT h2 AND HAD NO h1.
          *** `every-page.spec.ts` asserts exactly one h1 per route but skips the
          signed-out pages by name, so this outline was never measured. */}
      <h1 style={{ margin: '0 0 0.25rem', fontSize: '1.1875rem', fontWeight: 700, color: INK }}>
        Choose a new password
      </h1>
      <p style={{ margin: '0 0 1.125rem', fontSize: '0.8125rem', color: SOFT, lineHeight: 1.6 }}>
        {/* The address comes from the link, so saying it back is a check the
            reader can make: a link for somebody else's account is visible here
            rather than after the password has been changed. */}
        For <span style={{ color: FIELD_INK, fontWeight: 600 }}>{email}</span>
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column' }}>
        <label htmlFor="reset-password" style={labelStyle}>New password</label>
        <div style={{ position: 'relative' }}>
          <input
            id="reset-password"
            type={showPassword ? 'text' : 'password'}
            name="password"
            value={formData.password}
            onChange={handleChange}
            placeholder="Enter new password"
            autoComplete="new-password"
            style={fieldStyle(Boolean(errors.password))}
            onFocus={(e) => { e.target.style.borderColor = errors.password ? RED : '#22c55e'; }}
            onBlur={(e) => { e.target.style.borderColor = errors.password ? RED : FIELD_LINE; }}
          />
          <button
            type="button"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            onClick={() => setShowPassword(!showPassword)}
            style={revealStyle}>
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        {errors.password && (
          <p style={{ margin: '0.4375rem 0 0', fontSize: '0.8125rem', color: RED }}>
            {errors.password}
          </p>
        )}
        <p style={{ margin: '0.4375rem 0 0.8125rem', fontSize: '0.71875rem', color: SOFT }}>
          At least 8 characters, with an uppercase letter, a lowercase letter and a number.
        </p>

        <label htmlFor="reset-confirm" style={labelStyle}>Confirm</label>
        <div style={{ position: 'relative' }}>
          <input
            id="reset-confirm"
            type={showConfirmPassword ? 'text' : 'password'}
            name="confirmPassword"
            value={formData.confirmPassword}
            onChange={handleChange}
            placeholder="Confirm new password"
            autoComplete="new-password"
            style={fieldStyle(Boolean(errors.confirmPassword))}
            onFocus={(e) => {
              e.target.style.borderColor = errors.confirmPassword ? RED : '#22c55e';
            }}
            onBlur={(e) => {
              e.target.style.borderColor = errors.confirmPassword ? RED : FIELD_LINE;
            }}
          />
          <button
            type="button"
            aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            style={revealStyle}>
            {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        {errors.confirmPassword && (
          <p style={{ margin: '0.4375rem 0 0', fontSize: '0.8125rem', color: RED }}>
            {errors.confirmPassword}
          </p>
        )}

        <button type="submit" disabled={isLoading} style={{ ...primaryButton, marginTop: '0.875rem' }}
          onMouseEnter={(e) => !isLoading && (e.currentTarget.style.background = '#166534')}
          onMouseLeave={(e) => !isLoading && (e.currentTarget.style.background = '#15803d')}>
          {isLoading ? 'Setting password…' : 'Set password and sign in'}
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

export default ResetPassword;
