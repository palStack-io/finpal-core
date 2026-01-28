import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { authService } from '../services/authService';
import { useToast } from '../contexts/ToastContext';
import { Eye, EyeOff, Check, X } from 'lucide-react';

export const Register: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const { showToast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState<{
    username?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
  }>({});

  // Password strength validation
  const getPasswordStrength = (password: string) => {
    const checks = {
      length: password.length >= 8,
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
      number: /[0-9]/.test(password),
      special: /[^A-Za-z0-9]/.test(password)
    };

    const strength = Object.values(checks).filter(Boolean).length;
    return { checks, strength };
  };

  const passwordStrength = getPasswordStrength(formData.password);

  const validateForm = () => {
    const newErrors: any = {};

    if (!formData.username) {
      newErrors.username = 'Name is required';
    } else if (formData.username.length < 2) {
      newErrors.username = 'Name must be at least 2 characters';
    }

    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email is invalid';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
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
      const response = await authService.register({
        email: formData.email,
        password: formData.password,
        username: formData.username,
      });

      login(response.user, response.access_token, response.refresh_token);

      showToast('Account created successfully!', 'success');
      navigate('/onboarding');
    } catch (error: any) {
      console.error('Registration error:', error);
      showToast(
        error.response?.data?.message || 'Registration failed. Please try again.',
        'error'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name as keyof typeof errors]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const handleGoogleSignUp = () => {
    showToast('Google Sign-Up coming soon!', 'info');
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
            💲
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

      {/* Sign Up Card */}
      <div style={{
        width: '100%',
        maxWidth: '28rem',
        zIndex: 10,
        position: 'relative'
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
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '5rem',
              height: '5rem',
              borderRadius: '9999px',
              background: 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
              marginBottom: '1rem',
              fontSize: '2rem'
            }}>
              💲
            </div>
            <h1 style={{
              fontSize: '2rem',
              fontWeight: '700',
              background: 'linear-gradient(135deg, #15803d 0%, #fbbf24 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              marginBottom: '0.5rem'
            }}>
              Create Account
            </h1>
            <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>
              Join DollarPal today
            </p>
          </div>

          {/* Google Sign Up Button */}
          <button
            type="button"
            onClick={handleGoogleSignUp}
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

          {/* Register Form */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Full Name Input */}
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e2e8f0', fontSize: '0.875rem', fontWeight: '500' }}>
                Full Name
              </label>
              <input
                type="text"
                name="username"
                placeholder="John Doe"
                value={formData.username}
                onChange={handleChange}
                autoComplete="name"
                style={{
                  width: '100%',
                  padding: '0.875rem 1rem',
                  borderRadius: '0.5rem',
                  border: errors.username ? '1px solid #ef4444' : '1px solid #334155',
                  background: 'rgba(15, 23, 42, 0.5)',
                  color: '#ffffff',
                  fontSize: '0.9375rem',
                  outline: 'none',
                  transition: 'all 0.2s'
                }}
                onFocus={(e) => {
                  if (!errors.username) {
                    e.currentTarget.style.borderColor = '#15803d';
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 128, 61, 0.1)';
                  }
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = errors.username ? '#ef4444' : '#334155';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
              {errors.username && (
                <p style={{ marginTop: '0.375rem', color: '#ef4444', fontSize: '0.75rem' }}>
                  {errors.username}
                </p>
              )}
            </div>

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
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={handleChange}
                  autoComplete="new-password"
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

              {/* Password Strength Indicator */}
              {formData.password && (
                <div style={{ marginTop: '0.75rem' }}>
                  <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.5rem' }}>
                    {[1, 2, 3, 4, 5].map((level) => (
                      <div
                        key={level}
                        style={{
                          flex: 1,
                          height: '0.25rem',
                          borderRadius: '0.125rem',
                          background: passwordStrength.strength >= level
                            ? passwordStrength.strength <= 2 ? '#ef4444'
                            : passwordStrength.strength <= 3 ? '#fbbf24'
                            : '#22c55e'
                            : '#334155',
                          transition: 'background 0.2s'
                        }}
                      />
                    ))}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    {[
                      { key: 'length', label: 'At least 8 characters' },
                      { key: 'uppercase', label: 'One uppercase letter' },
                      { key: 'lowercase', label: 'One lowercase letter' },
                      { key: 'number', label: 'One number' },
                      { key: 'special', label: 'One special character' }
                    ].map(({ key, label }) => (
                      <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem' }}>
                        {passwordStrength.checks[key as keyof typeof passwordStrength.checks] ? (
                          <Check size={12} color="#22c55e" />
                        ) : (
                          <X size={12} color="#64748b" />
                        )}
                        <span style={{ color: passwordStrength.checks[key as keyof typeof passwordStrength.checks] ? '#94a3b8' : '#64748b' }}>
                          {label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Confirm Password Input */}
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: '#e2e8f0', fontSize: '0.875rem', fontWeight: '500' }}>
                Confirm Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  name="confirmPassword"
                  placeholder="••••••••"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  autoComplete="new-password"
                  style={{
                    width: '100%',
                    padding: '0.875rem 1rem',
                    paddingRight: '3rem',
                    borderRadius: '0.5rem',
                    border: errors.confirmPassword ? '1px solid #ef4444' : '1px solid #334155',
                    background: 'rgba(15, 23, 42, 0.5)',
                    color: '#ffffff',
                    fontSize: '0.9375rem',
                    outline: 'none',
                    transition: 'all 0.2s'
                  }}
                  onFocus={(e) => {
                    if (!errors.confirmPassword) {
                      e.currentTarget.style.borderColor = '#15803d';
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 128, 61, 0.1)';
                    }
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = errors.confirmPassword ? '#ef4444' : '#334155';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
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
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {errors.confirmPassword && (
                <p style={{ marginTop: '0.375rem', color: '#ef4444', fontSize: '0.75rem' }}>
                  {errors.confirmPassword}
                </p>
              )}
            </div>

            {/* Terms */}
            <p style={{ fontSize: '0.75rem', color: '#64748b', margin: 0 }}>
              By creating an account, you agree to our{' '}
              <a href="/terms" style={{ color: '#15803d', textDecoration: 'none' }}>Terms of Service</a>
              {' '}and{' '}
              <a href="/privacy" style={{ color: '#15803d', textDecoration: 'none' }}>Privacy Policy</a>.
            </p>

            {/* Create Account Button */}
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
              {isLoading ? 'Creating Account...' : 'Create Account'}
            </button>
          </form>

          {/* Sign In Link */}
          <p style={{ marginTop: '1.5rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.875rem' }}>
            Already have an account?{' '}
            <Link
              to="/login"
              style={{
                color: '#15803d',
                textDecoration: 'none',
                fontWeight: '500',
                transition: 'color 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#166534'}
              onMouseLeave={(e) => e.currentTarget.style.color = '#15803d'}
            >
              Sign in
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
  );
};
