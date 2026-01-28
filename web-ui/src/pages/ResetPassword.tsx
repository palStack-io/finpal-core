import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { authService } from '../services/authService';
import { useToast } from '../contexts/ToastContext';
import { Eye, EyeOff, Lock, CheckCircle } from 'lucide-react';

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
        error.response?.data?.message || 'An unexpected error occurred. Please try again.',
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
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
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
            border: '3px solid #10b981',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.5rem'
          }}>
            <CheckCircle size={48} style={{ color: '#10b981' }} />
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
            color: '#94a3b8',
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
              background: '#10b981',
              border: 'none',
              borderRadius: '12px',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#059669'}
            onMouseLeave={(e) => e.currentTarget.style.background = '#10b981'}>
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
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
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
            <Lock size={32} style={{ color: '#10b981' }} />
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
            color: '#94a3b8',
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
              <span style={{ color: '#10b981', fontSize: '0.875rem', fontWeight: '600' }}>{email}</span>
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
                onFocus={(e) => e.target.style.borderColor = errors.password ? '#ef4444' : '#10b981'}
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
                  color: '#94a3b8'
                }}>
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
            {errors.password && (
              <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#ef4444' }}>
                {errors.password}
              </p>
            )}
            <p style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#64748b' }}>
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
                onFocus={(e) => e.target.style.borderColor = errors.confirmPassword ? '#ef4444' : '#10b981'}
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
                  color: '#94a3b8'
                }}>
                {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
            {errors.confirmPassword && (
              <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#ef4444' }}>
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
              background: isLoading ? '#6b7280' : '#10b981',
              border: 'none',
              borderRadius: '12px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              marginTop: '0.5rem'
            }}
            onMouseEnter={(e) => !isLoading && (e.currentTarget.style.background = '#059669')}
            onMouseLeave={(e) => !isLoading && (e.currentTarget.style.background = '#10b981')}>
            {isLoading ? 'Resetting Password...' : 'Reset Password'}
          </button>

          <Link to="/login" style={{ textDecoration: 'none', textAlign: 'center' }}>
            <button type="button" style={{
              fontSize: '1rem',
              fontWeight: '600',
              color: '#94a3b8',
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
