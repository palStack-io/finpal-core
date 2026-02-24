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
            Check Your Email
          </h2>
          <p style={{
            fontSize: '1rem',
            color: '#94a3b8',
            lineHeight: '1.75',
            marginBottom: '0.5rem'
          }}>
            We've sent password reset instructions to:
          </p>
          <p style={{
            fontSize: '1rem',
            fontWeight: '600',
            color: '#10b981',
            marginBottom: '1.5rem'
          }}>
            {email}
          </p>
          <p style={{
            fontSize: '0.875rem',
            color: '#64748b',
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
              background: isLoading ? '#6b7280' : '#10b981',
              border: 'none',
              borderRadius: '12px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              marginBottom: '0.75rem'
            }}
            onMouseEnter={(e) => !isLoading && (e.currentTarget.style.background = '#059669')}
            onMouseLeave={(e) => !isLoading && (e.currentTarget.style.background = '#10b981')}>
            {isLoading ? 'Sending...' : 'Resend Email'}
          </button>

          <Link to="/login" style={{ textDecoration: 'none' }}>
            <button style={{
              width: '100%',
              padding: '0.875rem 1.5rem',
              fontSize: '1rem',
              fontWeight: '600',
              color: '#94a3b8',
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
            <Mail size={32} style={{ color: '#10b981' }} />
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
            color: '#94a3b8',
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
              onFocus={(e) => e.target.style.borderColor = error ? '#ef4444' : '#10b981'}
              onBlur={(e) => e.target.style.borderColor = error ? '#ef4444' : 'rgba(255, 255, 255, 0.1)'}
            />
            {error && (
              <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#ef4444' }}>
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
              background: isLoading ? '#6b7280' : '#10b981',
              border: 'none',
              borderRadius: '12px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              marginTop: '0.5rem'
            }}
            onMouseEnter={(e) => !isLoading && (e.currentTarget.style.background = '#059669')}
            onMouseLeave={(e) => !isLoading && (e.currentTarget.style.background = '#10b981')}>
            {isLoading ? 'Sending...' : 'Send Reset Link'}
          </button>

          <Link to="/login" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
            <ArrowLeft size={16} style={{ color: '#94a3b8' }} />
            <span style={{
              fontSize: '1rem',
              fontWeight: '600',
              color: '#94a3b8',
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
