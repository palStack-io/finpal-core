import React, { useState } from 'react';
import { Link2, Check, AlertCircle, ArrowRight, RefreshCw, ExternalLink } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { getBranding } from '../config/branding';

export const SimpleFinSetup: React.FC = () => {
  const { user } = useAuthStore();
  const branding = getBranding(user?.default_currency_code || 'USD');
  const [setupToken, setSetupToken] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleConnect = async () => {
    if (!setupToken.trim()) {
      setConnectionStatus('error');
      setErrorMessage('Please enter a valid SimpleFIN Setup Token');
      return;
    }

    setIsConnecting(true);
    setConnectionStatus('idle');
    setErrorMessage('');

    try {
      // TODO: Implement actual API call to connect SimpleFin
      await new Promise(resolve => setTimeout(resolve, 2000));

      setConnectionStatus('success');
      setSetupToken('');
    } catch (error) {
      setConnectionStatus('error');
      setErrorMessage('Failed to connect to SimpleFIN. Please check your token and try again.');
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <>
      <div style={{ minHeight: '100vh', padding: '24px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          {/* Header */}
          <div style={{ marginBottom: '32px' }}>
            <h1 style={{ fontSize: '32px', fontWeight: 700, marginBottom: '8px', color: 'var(--text-primary)' }}>
              SimpleFIN Connection
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Connect your SimpleFIN account to import transactions automatically</p>
          </div>

          {/* Main Card */}
          <div
            style={{
              background: 'var(--bg-card)',
              backdropFilter: 'blur(12px)',
              border: '1px solid var(--border-light)',
              borderRadius: '12px',
              padding: '32px',
              marginBottom: '24px'
            }}
          >
            {/* SimpleFIN Logo/Icon */}
            <div style={{ textAlign: 'center', marginBottom: '32px' }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '80px',
                  height: '80px',
                  borderRadius: '16px',
                  background: 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
                  marginBottom: '16px'
                }}
              >
                <Link2 size={40} style={{ color: 'var(--text-primary)' }} />
              </div>
              <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '8px' }}>
                Connect SimpleFIN
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                Securely import your financial data
              </p>
            </div>

            {/* Status Messages */}
            {connectionStatus === 'success' && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '16px',
                  background: 'rgba(134, 239, 172, 0.1)',
                  border: '1px solid rgba(134, 239, 172, 0.3)',
                  borderRadius: '8px',
                  marginBottom: '24px'
                }}
              >
                <div style={{ background: 'rgba(134, 239, 172, 0.2)', padding: '8px', borderRadius: '8px' }}>
                  <Check size={20} style={{ color: '#86efac' }} />
                </div>
                <div>
                  <p style={{ color: '#86efac', fontWeight: '600', fontSize: '14px', marginBottom: '4px' }}>
                    Connection Successful!
                  </p>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                    Your SimpleFIN account has been connected. Transactions will sync automatically.
                  </p>
                </div>
              </div>
            )}

            {connectionStatus === 'error' && errorMessage && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '16px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '8px',
                  marginBottom: '24px'
                }}
              >
                <div style={{ background: 'rgba(239, 68, 68, 0.2)', padding: '8px', borderRadius: '8px' }}>
                  <AlertCircle size={20} style={{ color: '#ef4444' }} />
                </div>
                <div>
                  <p style={{ color: '#ef4444', fontWeight: '600', fontSize: '14px', marginBottom: '4px' }}>
                    Connection Failed
                  </p>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                    {errorMessage}
                  </p>
                </div>
              </div>
            )}

            {/* Setup Token Input */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', color: 'var(--text-primary)', fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>
                SimpleFIN Setup Token
              </label>
              <input
                type="text"
                placeholder="Enter your SimpleFIN Setup Token..."
                value={setupToken}
                onChange={(e) => setSetupToken(e.target.value)}
                disabled={isConnecting}
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  background: 'var(--input-bg)',
                  border: '1px solid var(--input-border)',
                  borderRadius: '8px',
                  color: 'var(--text-primary)',
                  fontSize: '14px',
                  fontFamily: 'monospace',
                  outline: 'none',
                  transition: 'all 0.3s',
                  opacity: isConnecting ? 0.6 : 1,
                  cursor: isConnecting ? 'not-allowed' : 'text'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(21, 128, 61, 0.5)';
                  e.currentTarget.style.background = 'var(--input-bg)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--input-border)';
                  e.currentTarget.style.background = 'var(--input-bg)';
                }}
              />
              <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '8px' }}>
                Your Setup Token is a long string that starts with "https://..."
              </p>
            </div>

            {/* Connect Button */}
            <button
              onClick={handleConnect}
              disabled={isConnecting}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '14px 24px',
                background: isConnecting ? 'rgba(21, 128, 61, 0.5)' : 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
                border: '1px solid rgba(21, 128, 61, 0.5)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
                fontSize: '15px',
                fontWeight: '600',
                cursor: isConnecting ? 'not-allowed' : 'pointer',
                transition: 'all 0.3s',
                opacity: isConnecting ? 0.7 : 1
              }}
              onMouseEnter={(e) => {
                if (!isConnecting) {
                  e.currentTarget.style.transform = 'scale(1.02)';
                  e.currentTarget.style.boxShadow = '0 8px 16px rgba(21, 128, 61, 0.3)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isConnecting) {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.boxShadow = 'none';
                }
              }}
            >
              {isConnecting ? (
                <>
                  <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite' }} />
                  Connecting...
                </>
              ) : (
                <>
                  <Link2 size={20} />
                  Connect SimpleFIN Account
                </>
              )}
            </button>
          </div>

          {/* Instructions Card */}
          <div
            style={{
              background: 'var(--bg-card)',
              backdropFilter: 'blur(12px)',
              border: '1px solid var(--border-light)',
              borderRadius: '12px',
              padding: '32px'
            }}
          >
            <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '16px' }}>
              How to get your SimpleFIN Setup Token
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Step 1 */}
              <div style={{ display: 'flex', gap: '16px' }}>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    fontWeight: 'bold'
                  }}
                >
                  1
                </div>
                <div>
                  <p style={{ color: 'var(--text-primary)', fontWeight: '600', fontSize: '14px', marginBottom: '4px' }}>
                    Create a SimpleFIN account
                  </p>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: '1.6' }}>
                    Visit{' '}
                    <a
                      href="https://bridge.simplefin.org"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: '#86efac',
                        textDecoration: 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      bridge.simplefin.org
                      <ExternalLink size={12} />
                    </a>
                    {' '}and create an account if you don't have one
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div style={{ display: 'flex', gap: '16px' }}>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    fontWeight: 'bold'
                  }}
                >
                  2
                </div>
                <div>
                  <p style={{ color: 'var(--text-primary)', fontWeight: '600', fontSize: '14px', marginBottom: '4px' }}>
                    Connect your financial institutions
                  </p>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: '1.6' }}>
                    Link your banks, credit cards, and other accounts through SimpleFIN Bridge
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div style={{ display: 'flex', gap: '16px' }}>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    fontWeight: 'bold'
                  }}
                >
                  3
                </div>
                <div>
                  <p style={{ color: 'var(--text-primary)', fontWeight: '600', fontSize: '14px', marginBottom: '4px' }}>
                    Generate a Setup Token
                  </p>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: '1.6' }}>
                    In SimpleFIN Bridge, create a new Setup Token for DollarPal and copy the generated URL
                  </p>
                </div>
              </div>

              {/* Step 4 */}
              <div style={{ display: 'flex', gap: '16px' }}>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    fontWeight: 'bold'
                  }}
                >
                  4
                </div>
                <div>
                  <p style={{ color: 'var(--text-primary)', fontWeight: '600', fontSize: '14px', marginBottom: '4px' }}>
                    Paste the token above
                  </p>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: '1.6' }}>
                    Copy the entire Setup Token URL and paste it into the field above, then click "Connect"
                  </p>
                </div>
              </div>
            </div>

            {/* Security Note */}
            <div
              style={{
                marginTop: '24px',
                padding: '16px',
                background: 'rgba(251, 191, 36, 0.1)',
                border: '1px solid rgba(251, 191, 36, 0.3)',
                borderRadius: '8px'
              }}
            >
              <div style={{ display: 'flex', gap: '12px' }}>
                <AlertCircle size={20} style={{ color: '#fbbf24', flexShrink: 0 }} />
                <div>
                  <p style={{ color: '#fbbf24', fontWeight: '600', fontSize: '13px', marginBottom: '4px' }}>
                    Security Note
                  </p>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '12px', lineHeight: '1.6' }}>
                    Your Setup Token is securely encrypted and stored. DollarPal never stores your bank credentials -
                    all authentication is handled securely through SimpleFIN's encrypted protocol.
                  </p>
                </div>
              </div>
            </div>
          </div>
          {/* Footer */}
          <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '13px', borderTop: '1px solid var(--border-light)', marginTop: '40px' }}>
            Part of {branding.parentBrand} ecosystem
          </div>
        </div>
      </div>

      {/* CSS for spinner animation */}
      <style>{`
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </>
  );
};
