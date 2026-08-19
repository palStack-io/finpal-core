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
import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { authService } from '../services/authService';
import { useToast } from '../contexts/ToastContext';
import { Eye, EyeOff, Lock, CheckCircle } from 'lucide-react';
import { apiErrorMessage } from '../utils/apiError';

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

  if (resetSuccess) {
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
            Password Reset Successful!
          </h2>
          <p style={{
            fontSize: '1rem',
            color: '#9CB3A3',
            lineHeight: '1.75',
            marginBottom: '2rem'
          }}>
            Your password has been reset successfully. You can now sign in with your new password.
          </p>
          <Link to="/login" style={{ textDecoration: 'none' }}>
            <button style={{
              width: '100%',
              padding: '0.875rem 1.5rem',
              fontSize: '1rem',
              fontWeight: '600',
              color: '#ffffff',
              background: '#15803d',
              border: 'none',
              borderRadius: '12px',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#166534'}
            onMouseLeave={(e) => e.currentTarget.style.background = '#15803d'}>
              Continue to Login
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
            <Lock size={32} style={{ color: '#22c55e' }} />
          </div>
          <h2 style={{
            fontSize: '1.875rem',
            fontWeight: '700',
            color: '#ffffff',
            marginBottom: '0.5rem'
          }}>
            Reset Password
          </h2>
          <p style={{
            fontSize: '1rem',
            color: '#9CB3A3',
            lineHeight: '1.75'
          }}>
            Enter a new password for your account
          </p>
          {email && (
            <div style={{
              marginTop: '1rem',
              padding: '0.5rem 0.75rem',
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: '8px',
              display: 'inline-block'
            }}>
              <span style={{ color: '#22c55e', fontSize: '0.875rem', fontWeight: '600' }}>{email}</span>
            </div>
          )}
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
              New Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="Enter new password"
                style={{
                  width: '100%',
                  padding: '0.875rem 2.5rem 0.875rem 0.875rem',
                  fontSize: '1rem',
                  color: '#ffffff',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: `1px solid ${errors.password ? '#ef4444' : 'rgba(255, 255, 255, 0.1)'}`,
                  borderRadius: '12px',
                  outline: 'none',
                  transition: 'all 0.2s',
                  boxSizing: 'border-box'
                }}
                onFocus={(e) => e.target.style.borderColor = errors.password ? '#ef4444' : '#22c55e'}
                onBlur={(e) => e.target.style.borderColor = errors.password ? '#ef4444' : 'rgba(255, 255, 255, 0.1)'}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '0.75rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '0.25rem',
                  color: '#9CB3A3'
                }}>
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
            {errors.password && (
              <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#f87171' }}>
                {errors.password}
              </p>
            )}
            <p style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#9CB3A3' }}>
              Must be at least 8 characters with uppercase, lowercase, and number
            </p>
          </div>

          <div>
            <label style={{
              display: 'block',
              fontSize: '0.875rem',
              fontWeight: '600',
              color: '#e2e8f0',
              marginBottom: '0.5rem'
            }}>
              Confirm Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                placeholder="Confirm new password"
                style={{
                  width: '100%',
                  padding: '0.875rem 2.5rem 0.875rem 0.875rem',
                  fontSize: '1rem',
                  color: '#ffffff',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: `1px solid ${errors.confirmPassword ? '#ef4444' : 'rgba(255, 255, 255, 0.1)'}`,
                  borderRadius: '12px',
                  outline: 'none',
                  transition: 'all 0.2s',
                  boxSizing: 'border-box'
                }}
                onFocus={(e) => e.target.style.borderColor = errors.confirmPassword ? '#ef4444' : '#22c55e'}
                onBlur={(e) => e.target.style.borderColor = errors.confirmPassword ? '#ef4444' : 'rgba(255, 255, 255, 0.1)'}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                style={{
                  position: 'absolute',
                  right: '0.75rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '0.25rem',
                  color: '#9CB3A3'
                }}>
                {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
            {errors.confirmPassword && (
              <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#f87171' }}>
                {errors.confirmPassword}
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
            {isLoading ? 'Resetting Password...' : 'Reset Password'}
          </button>

          <Link to="/login" style={{ textDecoration: 'none', textAlign: 'center' }}>
            <button type="button" style={{
              fontSize: '1rem',
              fontWeight: '600',
              color: '#9CB3A3',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.2s',
              padding: '0.5rem'
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#ffffff'}
            onMouseLeave={(e) => e.currentTarget.style.color = '#94a3b8'}>
              Back to Login
            </button>
          </Link>
        </form>
      </div>
    </div>
  );
};
