import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { authService } from '../services/authService';
import { useToast } from '../contexts/ToastContext';
import { getBranding, supportedCurrencies, type Currency } from '../config/branding';
import type { OnboardingData } from '../types/user';
import { DollarSign, Globe, Bell, ChevronRight, ChevronLeft } from 'lucide-react';

const timezones = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Dubai',
  'Australia/Sydney',
  'Pacific/Auckland',
];

export const Onboarding: React.FC = () => {
  const navigate = useNavigate();
  const { updateUser } = useAuthStore();
  const { showToast } = useToast();
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState<OnboardingData>({
    default_currency_code: 'USD',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York',
    notifications: {
      email: true,
      push: true,
      budgetAlerts: true,
      transactionAlerts: true,
    },
  });

  const branding = getBranding(formData.default_currency_code);

  const handleCurrencySelect = (currency: Currency) => {
    setFormData((prev) => ({ ...prev, default_currency_code: currency }));
  };

  const handleTimezoneSelect = (timezone: string) => {
    setFormData((prev) => ({ ...prev, timezone }));
  };

  const handleNotificationToggle = (key: keyof typeof formData.notifications) => {
    setFormData((prev) => ({
      ...prev,
      notifications: {
        ...prev.notifications,
        [key]: !prev.notifications[key],
      },
    }));
  };

  const handleNext = () => {
    if (step < 3) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleComplete = async () => {
    setIsLoading(true);

    try {
      const updatedUser = await authService.completeOnboarding(formData);
      updateUser({
        ...updatedUser,
        hasCompletedOnboarding: true,
      });

      showToast('Welcome to ' + branding.appName + '!', 'success');
      navigate('/dashboard');
    } catch (error: any) {
      console.error('Onboarding error:', error);
      showToast(
        error.response?.data?.message || 'Failed to complete onboarding. Please try again.',
        'error'
      );
    } finally {
      setIsLoading(false);
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
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Money Grid Background */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'grid',
        gridTemplateColumns: 'repeat(8, 1fr)',
        gap: '2rem',
        padding: '2rem',
        opacity: 0.05,
        pointerEvents: 'none',
        fontSize: '3rem',
        color: '#fbbf24'
      }}>
        {Array.from({ length: 64 }).map((_, i) => (
          <div key={i} style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: `pulse 3s ease-in-out infinite`,
            animationDelay: `${i * 0.1}s`
          }}>
            {branding.currencySymbol}
          </div>
        ))}
      </div>

      <div style={{ width: '100%', maxWidth: '48rem', position: 'relative', zIndex: 10 }}>
        <div style={{
          background: 'rgba(30, 41, 59, 0.8)',
          backdropFilter: 'blur(12px)',
          borderRadius: '1rem',
          padding: '2.5rem',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2)',
          border: '1px solid rgba(148, 163, 184, 0.1)'
        }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: '2rem', position: 'relative' }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>{branding.currencySymbol}</div>
            <h1 style={{
              fontSize: '2rem',
              fontWeight: '700',
              background: 'linear-gradient(135deg, #15803d 0%, #fbbf24 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              marginBottom: '0.5rem'
            }}>
              Welcome to {branding.appName}
            </h1>
            <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>
              Let's get you set up in just a few steps
            </p>

            {/* Skip Button */}
            <button
              onClick={async () => {
                if (confirm('Skip onboarding? You can always configure these settings later in Settings.')) {
                  try {
                    // Mark onboarding as complete even when skipping
                    const updatedUser = await authService.completeOnboarding({
                      default_currency_code: formData.default_currency_code,
                      timezone: formData.timezone,
                      notifications: formData.notifications
                    });
                    updateUser({
                      ...updatedUser,
                      hasCompletedOnboarding: true,
                    });
                    navigate('/dashboard');
                  } catch (error) {
                    console.error('Skip onboarding error:', error);
                    // Still navigate to dashboard even if the API call fails
                    navigate('/dashboard');
                  }
                }
              }}
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                padding: '0.5rem 1rem',
                background: 'transparent',
                border: '1px solid rgba(148, 163, 184, 0.3)',
                borderRadius: '0.5rem',
                color: '#94a3b8',
                fontSize: '0.875rem',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#94a3b8';
                e.currentTarget.style.color = '#ffffff';
                e.currentTarget.style.background = 'rgba(148, 163, 184, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(148, 163, 184, 0.3)';
                e.currentTarget.style.color = '#94a3b8';
                e.currentTarget.style.background = 'transparent';
              }}
            >
              Skip for now
            </button>
          </div>

          {/* Progress Bar */}
          <div style={{ marginBottom: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.875rem', color: '#94a3b8' }}>Step {step} of 3</span>
              <span style={{ fontSize: '0.875rem', color: '#94a3b8' }}>{Math.round((step / 3) * 100)}%</span>
            </div>
            <div style={{
              height: '0.5rem',
              background: 'rgba(51, 65, 85, 0.5)',
              borderRadius: '9999px',
              overflow: 'hidden'
            }}>
              <div style={{
                height: '100%',
                background: 'linear-gradient(to right, #15803d, #fbbf24)',
                width: `${(step / 3) * 100}%`,
                transition: 'width 0.3s ease'
              }}></div>
            </div>
          </div>

          {/* Step Content */}
          <div style={{ minHeight: '400px' }}>
            {/* Step 1: Currency Selection */}
            {step === 1 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                  <div style={{
                    height: '3rem',
                    width: '3rem',
                    borderRadius: '9999px',
                    background: 'linear-gradient(135deg, #15803d 0%, #fbbf24 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <DollarSign size={24} color="#ffffff" />
                  </div>
                  <div>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#ffffff', marginBottom: '0.25rem' }}>
                      Choose Your Currency
                    </h2>
                    <p style={{ fontSize: '0.875rem', color: '#94a3b8', margin: 0 }}>
                      This will personalize your experience
                    </p>
                  </div>
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                  gap: '1rem'
                }}>
                  {supportedCurrencies.map((currency) => {
                    const currencyBranding = getBranding(currency);
                    const isSelected = formData.default_currency_code === currency;
                    return (
                      <button
                        key={currency}
                        onClick={() => handleCurrencySelect(currency)}
                        style={{
                          padding: '1.5rem',
                          borderRadius: '0.75rem',
                          border: isSelected ? '2px solid #15803d' : '2px solid #334155',
                          background: isSelected ? 'rgba(21, 128, 61, 0.1)' : 'rgba(15, 23, 42, 0.5)',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          boxShadow: isSelected ? '0 4px 6px -1px rgba(21, 128, 61, 0.3)' : 'none'
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.borderColor = '#475569';
                            e.currentTarget.style.background = 'rgba(15, 23, 42, 0.7)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.borderColor = '#334155';
                            e.currentTarget.style.background = 'rgba(15, 23, 42, 0.5)';
                          }
                        }}
                      >
                        <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{currencyBranding.currencySymbol}</div>
                        <div style={{ color: '#ffffff', fontWeight: '600', marginBottom: '0.25rem' }}>{currency}</div>
                        <div style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{currencyBranding.appName}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Step 2: Timezone Selection */}
            {step === 2 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                  <div style={{
                    height: '3rem',
                    width: '3rem',
                    borderRadius: '9999px',
                    background: 'linear-gradient(135deg, #15803d 0%, #fbbf24 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <Globe size={24} color="#ffffff" />
                  </div>
                  <div>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#ffffff', marginBottom: '0.25rem' }}>
                      Select Your Timezone
                    </h2>
                    <p style={{ fontSize: '0.875rem', color: '#94a3b8', margin: 0 }}>
                      For accurate transaction timing
                    </p>
                  </div>
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '0.75rem'
                }}>
                  {timezones.map((timezone) => {
                    const isSelected = formData.timezone === timezone;
                    return (
                      <button
                        key={timezone}
                        onClick={() => handleTimezoneSelect(timezone)}
                        style={{
                          padding: '1rem',
                          borderRadius: '0.5rem',
                          border: isSelected ? '2px solid #15803d' : '2px solid #334155',
                          background: isSelected ? 'rgba(21, 128, 61, 0.1)' : 'rgba(15, 23, 42, 0.5)',
                          cursor: 'pointer',
                          textAlign: 'left',
                          transition: 'all 0.2s',
                          boxShadow: isSelected ? '0 4px 6px -1px rgba(21, 128, 61, 0.3)' : 'none'
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.borderColor = '#475569';
                            e.currentTarget.style.background = 'rgba(15, 23, 42, 0.7)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.borderColor = '#334155';
                            e.currentTarget.style.background = 'rgba(15, 23, 42, 0.5)';
                          }
                        }}
                      >
                        <div style={{ color: '#ffffff', fontWeight: '500' }}>{timezone}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Step 3: Notification Preferences */}
            {step === 3 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                  <div style={{
                    height: '3rem',
                    width: '3rem',
                    borderRadius: '9999px',
                    background: 'linear-gradient(135deg, #15803d 0%, #fbbf24 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <Bell size={24} color="#ffffff" />
                  </div>
                  <div>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#ffffff', marginBottom: '0.25rem' }}>
                      Notification Preferences
                    </h2>
                    <p style={{ fontSize: '0.875rem', color: '#94a3b8', margin: 0 }}>
                      Stay updated with what matters to you
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {[
                    { key: 'email' as const, label: 'Email Notifications', description: 'Receive updates via email' },
                    { key: 'push' as const, label: 'Push Notifications', description: 'Get instant alerts on your device' },
                    { key: 'budgetAlerts' as const, label: 'Budget Alerts', description: 'Notify when approaching budget limits' },
                    { key: 'transactionAlerts' as const, label: 'Transaction Alerts', description: 'Alert for new transactions' },
                  ].map((item) => (
                    <button
                      key={item.key}
                      onClick={() => handleNotificationToggle(item.key)}
                      style={{
                        width: '100%',
                        padding: '1rem',
                        borderRadius: '0.5rem',
                        border: '2px solid #334155',
                        background: 'rgba(15, 23, 42, 0.5)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = '#475569';
                        e.currentTarget.style.background = 'rgba(15, 23, 42, 0.7)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = '#334155';
                        e.currentTarget.style.background = 'rgba(15, 23, 42, 0.5)';
                      }}
                    >
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ color: '#ffffff', fontWeight: '500', marginBottom: '0.25rem' }}>{item.label}</div>
                        <div style={{ color: '#94a3b8', fontSize: '0.875rem' }}>{item.description}</div>
                      </div>
                      <div style={{
                        height: '1.5rem',
                        width: '2.75rem',
                        borderRadius: '9999px',
                        background: formData.notifications[item.key] ? '#15803d' : '#475569',
                        transition: 'background 0.2s',
                        position: 'relative',
                        flexShrink: 0
                      }}>
                        <div style={{
                          height: '1.25rem',
                          width: '1.25rem',
                          borderRadius: '9999px',
                          background: '#ffffff',
                          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.3)',
                          transform: formData.notifications[item.key] ? 'translateX(1.25rem)' : 'translateX(0.125rem)',
                          transition: 'transform 0.2s',
                          marginTop: '0.125rem'
                        }}></div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Navigation Buttons */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: '2rem',
            paddingTop: '1.5rem',
            borderTop: '1px solid #334155'
          }}>
            <button
              onClick={handleBack}
              disabled={step === 1}
              style={{
                padding: '0.75rem 1.5rem',
                borderRadius: '0.5rem',
                border: '1px solid #334155',
                background: 'transparent',
                color: step === 1 ? '#64748b' : '#ffffff',
                fontSize: '0.9375rem',
                fontWeight: '500',
                cursor: step === 1 ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                transition: 'all 0.2s',
                opacity: step === 1 ? 0.5 : 1
              }}
              onMouseEnter={(e) => {
                if (step !== 1) {
                  e.currentTarget.style.background = 'rgba(51, 65, 85, 0.3)';
                  e.currentTarget.style.borderColor = '#475569';
                }
              }}
              onMouseLeave={(e) => {
                if (step !== 1) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.borderColor = '#334155';
                }
              }}
            >
              <ChevronLeft size={16} />
              Back
            </button>

            {step < 3 ? (
              <button
                onClick={handleNext}
                style={{
                  padding: '0.75rem 1.5rem',
                  borderRadius: '0.5rem',
                  border: 'none',
                  background: 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
                  color: '#ffffff',
                  fontSize: '0.9375rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  transition: 'all 0.2s',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
                }}
              >
                Next
                <ChevronRight size={16} />
              </button>
            ) : (
              <button
                onClick={handleComplete}
                disabled={isLoading}
                style={{
                  padding: '0.75rem 1.5rem',
                  borderRadius: '0.5rem',
                  border: 'none',
                  background: isLoading ? '#64748b' : 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
                  color: '#ffffff',
                  fontSize: '0.9375rem',
                  fontWeight: '600',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                }}
                onMouseEnter={(e) => {
                  if (!isLoading) {
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.2)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
                }}
              >
                {isLoading ? 'Completing Setup...' : 'Complete Setup'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
