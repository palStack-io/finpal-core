import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { authService } from '../services/authService';
import { demoService, DemoAccount, DemoStatus } from '../services/demoService';
import { useToast } from '../contexts/ToastContext';
import { Eye, EyeOff, Clock, User as UserIcon } from 'lucide-react';

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuthStore();
  const { showToast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  // Demo mode state
  const [demoStatus, setDemoStatus] = useState<DemoStatus | null>(null);
  const [demoAccounts, setDemoAccounts] = useState<DemoAccount[]>([]);
  const [isDemoLoading, setIsDemoLoading] = useState(true);

  // Check for demo session expiry message
  useEffect(() => {
    const state = location.state as { message?: string } | null;
    if (state?.message) {
      showToast(state.message, 'info');
      // Clear the state
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location, showToast, navigate]);

  // Fetch demo status on mount
  useEffect(() => {
    const fetchDemoStatus = async () => {
      try {
        const status = await demoService.getDemoStatus();
        setDemoStatus(status);

        if (status.enabled) {
          const accounts = await demoService.getDemoAccounts();
          setDemoAccounts(accounts);
        }
      } catch (error) {
        console.error('Failed to fetch demo status:', error);
      } finally {
        setIsDemoLoading(false);
      }
    };

    fetchDemoStatus();
  }, []);

  const validateForm = () => {
    const newErrors: { email?: string; password?: string } = {};

    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email is invalid';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);

    try {
      const response = await authService.login(formData);
      login(response.user, response.access_token, response.refresh_token, response.demo_expires_at);

      showToast('Login successful!', 'success');

      // Redirect based on onboarding status
      if (response.user.hasCompletedOnboarding) {
        navigate('/dashboard');
      } else {
        navigate('/onboarding');
      }
    } catch (error: any) {
      console.error('Login error:', error);
      showToast(
        error.response?.data?.message || 'Login failed. Please check your credentials.',
        'error'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoLogin = async (account: DemoAccount) => {
    setIsLoading(true);
    setFormData({ email: account.email, password: account.password });

    try {
      const response = await authService.login({
        email: account.email,
        password: account.password
      });
      login(response.user, response.access_token, response.refresh_token, response.demo_expires_at);

      showToast(`Welcome to the demo, ${account.name}!`, 'success');
      navigate('/dashboard');
    } catch (error: any) {
      console.error('Demo login error:', error);
      showToast(
        error.response?.data?.message || 'Demo login failed. Please try again.',
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

  const handleGoogleSignIn = () => {
    showToast('Google Sign-In coming soon!', 'info');
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Money Grid Background */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'grid',
        gridTemplateColumns: 'repeat(12, 1fr)',
        gap: '1rem',
        padding: '2rem',
        opacity: 0.03,
        pointerEvents: 'none',
        fontSize: '2rem',
        color: '#fbbf24'
      }}>
        {Array.from({ length: 96 }).map((_, i) => (
          <div key={i} style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: `pulse 3s ease-in-out infinite`,
            animationDelay: `${i * 0.05}s`
          }}>
          </div>
        ))}
      </div>

      {/* Back to Home Link */}
      <Link
        to="/"
        style={{
          position: 'absolute',
          top: '1rem',
          left: '1rem',
          zIndex: 20,
          color: '#94a3b8',
          textDecoration: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          transition: 'color 0.2s',
          fontSize: '0.875rem'
        }}
        onMouseEnter={(e) => e.currentTarget.style.color = '#ffffff'}
        onMouseLeave={(e) => e.currentTarget.style.color = '#94a3b8'}
      >
        <svg style={{ height: '1.25rem', width: '1.25rem' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Back to Home
      </Link>

      {/* Main Content - Two Column Layout when Demo Mode is enabled */}
      <div style={{
        display: 'flex',
        gap: '2rem',
        alignItems: 'flex-start',
        justifyContent: 'center',
        zIndex: 10,
        position: 'relative',
        flexWrap: 'wrap',
        maxWidth: demoStatus?.enabled ? '56rem' : '28rem',
        width: '100%',
      }}>
        {/* Demo Accounts Panel - Only show when demo mode is enabled */}
        {demoStatus?.enabled && !isDemoLoading && demoAccounts.length > 0 && (
          <div style={{
            width: '100%',
            maxWidth: '24rem',
            zIndex: 10,
          }}>
            <div style={{
              background: 'rgba(30, 41, 59, 0.8)',
              backdropFilter: 'blur(12px)',
              borderRadius: '1rem',
              padding: '1.5rem',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2)',
              border: '1px solid rgba(59, 130, 246, 0.3)'
            }}>
              {/* Demo Header */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                marginBottom: '1rem',
                paddingBottom: '1rem',
                borderBottom: '1px solid rgba(148, 163, 184, 0.1)'
              }}>
                <div style={{
                  width: '2.5rem',
                  height: '2.5rem',
                  borderRadius: '0.5rem',
                  background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <UserIcon size={20} color="#ffffff" />
                </div>
                <div>
                  <h2 style={{
                    color: '#ffffff',
                    fontSize: '1.125rem',
                    fontWeight: 600,
                    margin: 0
                  }}>
                    Demo Mode
                  </h2>
                  <p style={{
                    color: '#94a3b8',
                    fontSize: '0.75rem',
                    margin: 0
                  }}>
                    Try finPal with sample data
                  </p>
                </div>
              </div>

              {/* Time Limit Notice */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem',
                background: 'rgba(59, 130, 246, 0.1)',
                borderRadius: '0.5rem',
                marginBottom: '1rem',
                border: '1px solid rgba(59, 130, 246, 0.2)'
              }}>
                <Clock size={16} color="#60a5fa" />
                <span style={{ color: '#93c5fd', fontSize: '0.8125rem' }}>
                  {demoStatus.timeout_minutes} minute session limit
                </span>
              </div>

              {/* Demo Accounts List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {demoAccounts.map((account) => (
                  <button
                    key={account.email}
                    onClick={() => handleDemoLogin(account)}
                    disabled={isLoading}
                    style={{
                      width: '100%',
                      padding: '0.875rem 1rem',
                      borderRadius: '0.5rem',
                      border: '1px solid #334155',
                      background: 'rgba(15, 23, 42, 0.5)',
                      color: '#e2e8f0',
                      fontSize: '0.875rem',
                      cursor: isLoading ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s',
                      textAlign: 'left',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.25rem',
                    }}
                    onMouseEnter={(e) => {
                      if (!isLoading) {
                        e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)';
                        e.currentTarget.style.borderColor = '#3b82f6';
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(15, 23, 42, 0.5)';
                      e.currentTarget.style.borderColor = '#334155';
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      width: '100%'
                    }}>
                      <span style={{ fontWeight: 600 }}>{account.name}</span>
                      <span style={{
                        fontSize: '0.75rem',
                        color: '#64748b',
                        background: 'rgba(100, 116, 139, 0.2)',
                        padding: '0.125rem 0.5rem',
                        borderRadius: '9999px'
                      }}>
                        {account.currency}
                      </span>
                    </div>
                    <span style={{
                      color: '#94a3b8',
                      fontSize: '0.75rem'
                    }}>
                      {account.persona}
                    </span>
                  </button>
                ))}
              </div>

              {/* Restrictions Note */}
              <p style={{
                marginTop: '1rem',
                padding: '0.75rem',
                background: 'rgba(251, 191, 36, 0.1)',
                borderRadius: '0.5rem',
                border: '1px solid rgba(251, 191, 36, 0.2)',
                color: '#fcd34d',
                fontSize: '0.75rem',
                margin: '1rem 0 0 0'
              }}>
                Note: CSV import and API key settings are disabled in demo mode.
              </p>
            </div>
          </div>
        )}

        {/* Sign In Card */}
        <div style={{
          width: '100%',
          maxWidth: '28rem',
          zIndex: 10,
        }}>
          <div style={{
            background: 'rgba(30, 41, 59, 0.8)',
            backdropFilter: 'blur(12px)',
            borderRadius: '1rem',
            padding: '2.5rem',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2)',
            border: '1px solid rgba(148, 163, 184, 0.1)'
          }}>
            {/* Logo and Title */}
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <img
                src="/finPal.png"
                alt="finPal"
                style={{
                  height: '5rem',
                  width: 'auto',
                  marginBottom: '1rem'
                }}
              />
              <h1 style={{
                fontSize: '2rem',
                fontWeight: '700',
                background: 'linear-gradient(135deg, #15803d 0%, #fbbf24 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                marginBottom: '0.5rem'
              }}>
                Welcome Back
              </h1>
              <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>
                Sign in to finPal
              </p>
            </div>

            {/* Google Sign In Button */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              style={{
                width: '100%',
                padding: '0.875rem 1.5rem',
                borderRadius: '0.5rem',
                border: '1px solid #334155',
                background: 'transparent',
                color: '#ffffff',
                fontSize: '0.9375rem',
                fontWeight: '500',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.75rem',
                transition: 'all 0.2s',
                marginBottom: '1.5rem'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(51, 65, 85, 0.3)';
                e.currentTarget.style.borderColor = '#475569';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.borderColor = '#334155';
              }}
            >
              <svg width="18" height="18" viewBox="0 0 18 18">
                <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
                <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
                <path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.348 2.825.957 4.039l3.007-2.332z"/>
                <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
              </svg>
              Continue with Google
            </button>

            {/* Divider */}
            <div style={{ position: 'relative', margin: '1.5rem 0' }}>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center' }}>
                <div style={{ width: '100%', borderTop: '1px solid #334155' }}></div>
              </div>
              <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
                <span style={{ padding: '0 1rem', background: 'rgba(30, 41, 59, 0.8)', color: '#64748b', fontSize: '0.875rem' }}>
                  Or continue with email
                </span>
              </div>
            </div>

            {/* Login Form */}
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Email Input */}
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e2e8f0', fontSize: '0.875rem', fontWeight: '500' }}>
                  Email
                </label>
                <input
                  type="email"
                  name="email"
                  placeholder="you@example.com"
                  value={formData.email}
                  onChange={handleChange}
                  autoComplete="email"
                  style={{
                    width: '100%',
                    padding: '0.875rem 1rem',
                    borderRadius: '0.5rem',
                    border: errors.email ? '1px solid #ef4444' : '1px solid #334155',
                    background: 'rgba(15, 23, 42, 0.5)',
                    color: '#ffffff',
                    fontSize: '0.9375rem',
                    outline: 'none',
                    transition: 'all 0.2s'
                  }}
                  onFocus={(e) => {
                    if (!errors.email) {
                      e.currentTarget.style.borderColor = '#15803d';
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 128, 61, 0.1)';
                    }
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = errors.email ? '#ef4444' : '#334155';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
                {errors.email && (
                  <p style={{ marginTop: '0.375rem', color: '#ef4444', fontSize: '0.75rem' }}>
                    {errors.email}
                  </p>
                )}
              </div>

              {/* Password Input */}
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e2e8f0', fontSize: '0.875rem', fontWeight: '500' }}>
                  Password
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    placeholder="********"
                    value={formData.password}
                    onChange={handleChange}
                    autoComplete="current-password"
                    style={{
                      width: '100%',
                      padding: '0.875rem 1rem',
                      paddingRight: '3rem',
                      borderRadius: '0.5rem',
                      border: errors.password ? '1px solid #ef4444' : '1px solid #334155',
                      background: 'rgba(15, 23, 42, 0.5)',
                      color: '#ffffff',
                      fontSize: '0.9375rem',
                      outline: 'none',
                      transition: 'all 0.2s'
                    }}
                    onFocus={(e) => {
                      if (!errors.password) {
                        e.currentTarget.style.borderColor = '#15803d';
                        e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 128, 61, 0.1)';
                      }
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = errors.password ? '#ef4444' : '#334155';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: '1rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'transparent',
                      border: 'none',
                      color: '#64748b',
                      cursor: 'pointer',
                      padding: '0.25rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'color 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.color = '#94a3b8'}
                    onMouseLeave={(e) => e.currentTarget.style.color = '#64748b'}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {errors.password && (
                  <p style={{ marginTop: '0.375rem', color: '#ef4444', fontSize: '0.75rem' }}>
                    {errors.password}
                  </p>
                )}
              </div>

              {/* Remember Me & Forgot Password */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#94a3b8', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    style={{
                      width: '1rem',
                      height: '1rem',
                      borderRadius: '0.25rem',
                      border: '1px solid #334155',
                      cursor: 'pointer'
                    }}
                  />
                  <span>Remember me</span>
                </label>
                <Link
                  to="/forgot-password"
                  style={{
                    color: '#15803d',
                    textDecoration: 'none',
                    transition: 'color 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.color = '#166534'}
                  onMouseLeave={(e) => e.currentTarget.style.color = '#15803d'}
                >
                  Forgot password?
                </Link>
              </div>

              {/* Sign In Button */}
              <button
                type="submit"
                disabled={isLoading}
                style={{
                  width: '100%',
                  padding: '0.875rem 1.5rem',
                  borderRadius: '0.5rem',
                  border: 'none',
                  background: isLoading ? '#64748b' : 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
                  color: '#ffffff',
                  fontSize: '1rem',
                  fontWeight: '600',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
                }}
                onMouseEnter={(e) => {
                  if (!isLoading) {
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.2), 0 4px 6px -2px rgba(0, 0, 0, 0.1)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
                }}
              >
                {isLoading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>

            {/* Divider */}
            <div style={{ position: 'relative', margin: '1.5rem 0' }}>
              <div style={{
                position: 'absolute',
                inset: '0',
                display: 'flex',
                alignItems: 'center'
              }}>
                <div style={{
                  width: '100%',
                  borderTop: '1px solid #334155'
                }} />
              </div>
              <div style={{
                position: 'relative',
                display: 'flex',
                justifyContent: 'center',
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                <span style={{
                  background: '#1e293b',
                  padding: '0 0.75rem',
                  color: '#64748b'
                }}>
                  Or continue with
                </span>
              </div>
            </div>

            {/* OIDC Sign In Button */}
            <button
              type="button"
              onClick={() => {
                // Redirect to backend OIDC login endpoint
                window.location.href = '/api/login/oidc';
              }}
              style={{
                width: '100%',
                padding: '0.875rem 1.5rem',
                borderRadius: '0.5rem',
                border: '1px solid #334155',
                background: 'rgba(15, 23, 42, 0.5)',
                color: '#e2e8f0',
                fontSize: '0.9375rem',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.625rem'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(15, 23, 42, 0.8)';
                e.currentTarget.style.borderColor = '#15803d';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(15, 23, 42, 0.5)';
                e.currentTarget.style.borderColor = '#334155';
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 16v-4"/>
                <path d="M12 8h.01"/>
              </svg>
              Sign in with SSO
            </button>

            {/* Sign Up Link */}
            <p style={{ marginTop: '1.5rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.875rem' }}>
              Don't have an account?{' '}
              <Link
                to="/register"
                style={{
                  color: '#15803d',
                  textDecoration: 'none',
                  fontWeight: '500',
                  transition: 'color 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#166534'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#15803d'}
              >
                Sign up for free
              </Link>
            </p>
          </div>

          {/* Footer */}
          <p style={{
            textAlign: 'center',
            marginTop: '1.5rem',
            color: '#64748b',
            fontSize: '0.8125rem'
          }}>
            part of palStack ecosystem
          </p>
        </div>
      </div>
    </div>
  );
};
