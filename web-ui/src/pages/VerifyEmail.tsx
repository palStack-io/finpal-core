import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { authService } from '../services/authService';
import { useToast } from '../contexts/ToastContext';
import { CheckCircle, XCircle, Loader, Mail } from 'lucide-react';

export const VerifyEmail: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { showToast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isVerified, setIsVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendLoading, setResendLoading] = useState(false);

  const token = searchParams.get('token');
  const email = searchParams.get('email');

  useEffect(() => {
    verifyEmail();
  }, [token]);

  const verifyEmail = async () => {
    if (!token) {
      setError('Invalid verification link');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await authService.verifyEmail(token);

      if (response.success) {
        setIsVerified(true);
        showToast('Email verified successfully!', 'success');
      } else {
        setError(response.message || 'Verification failed');
      }
    } catch (err: any) {
      console.error('Verify email error:', err);
      setError(err.response?.data?.message || 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!email) {
      showToast('Email address not found. Please try signing up again.', 'error');
      return;
    }

    setResendLoading(true);
    try {
      const response = await authService.resendVerification(email);

      if (response.success) {
        showToast('A new verification email has been sent to your inbox.', 'success');
      } else {
        showToast(response.message || 'Failed to send verification email', 'error');
      }
    } catch (err: any) {
      console.error('Resend verification error:', err);
      showToast('An unexpected error occurred', 'error');
    } finally {
      setResendLoading(false);
    }
  };

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
        {isLoading ? (
          <div style={{ textAlign: 'center' }}>
            <Loader size={64} style={{
              color: '#10b981',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 1.5rem'
            }} />
            <h2 style={{
              fontSize: '1.875rem',
              fontWeight: '700',
              color: '#ffffff',
              marginBottom: '0.75rem'
            }}>
              Verifying Your Email
            </h2>
            <p style={{
              fontSize: '1rem',
              color: '#94a3b8',
              lineHeight: '1.75'
            }}>
              Please wait while we verify your email address...
            </p>
          </div>
        ) : isVerified ? (
          <div style={{ textAlign: 'center' }}>
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
              Email Verified!
            </h2>
            <p style={{
              fontSize: '1rem',
              color: '#94a3b8',
              lineHeight: '1.75',
              marginBottom: '2rem'
            }}>
              Your email has been successfully verified. You can now sign in to your account.
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
        ) : (
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.2)',
              border: '3px solid #ef4444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.5rem'
            }}>
              <XCircle size={48} style={{ color: '#ef4444' }} />
            </div>
            <h2 style={{
              fontSize: '1.875rem',
              fontWeight: '700',
              color: '#ffffff',
              marginBottom: '0.75rem'
            }}>
              Verification Failed
            </h2>
            <p style={{
              fontSize: '1rem',
              color: '#94a3b8',
              lineHeight: '1.75',
              marginBottom: '1.5rem'
            }}>
              {error || 'The verification link is invalid or has expired.'}
            </p>

            {email && (
              <>
                <p style={{
                  fontSize: '0.875rem',
                  color: '#64748b',
                  marginBottom: '1.5rem'
                }}>
                  Would you like us to send a new verification link?
                </p>
                <button
                  onClick={handleResendVerification}
                  disabled={resendLoading}
                  style={{
                    width: '100%',
                    padding: '0.875rem 1.5rem',
                    fontSize: '1rem',
                    fontWeight: '600',
                    color: '#ffffff',
                    background: '#10b981',
                    border: 'none',
                    borderRadius: '12px',
                    cursor: resendLoading ? 'not-allowed' : 'pointer',
                    opacity: resendLoading ? 0.6 : 1,
                    transition: 'all 0.2s',
                    marginBottom: '0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem'
                  }}
                  onMouseEnter={(e) => !resendLoading && (e.currentTarget.style.background = '#059669')}
                  onMouseLeave={(e) => !resendLoading && (e.currentTarget.style.background = '#10b981')}>
                  {resendLoading ? (
                    <>
                      <Loader size={20} style={{ animation: 'spin 1s linear infinite' }} />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Mail size={20} />
                      Resend Verification Email
                    </>
                  )}
                </button>
              </>
            )}

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
        )}
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
