/**
 * Investment Tracking Settings Component
 * Manages investment tracking and FMP API key settings
 */

import React, { useState, useEffect } from 'react';
import { Check, AlertCircle, TrendingUp, Key } from 'lucide-react';
import { userService } from '../../services/userService';

export const InvestmentSettings: React.FC = () => {
  const [isEnabled, setIsEnabled] = useState(false);
  const [globallyEnabled, setGloballyEnabled] = useState(true);
  const [fmpApiKey, setFmpApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const settings = await userService.getApiSettings();
      setIsEnabled(settings.investmentTrackingEnabled || false);
      setGloballyEnabled(settings.investmentGloballyEnabled || false);
      setFmpApiKey(settings.fmpApiKey || '');
    } catch (err) {
      console.error('Failed to load investment settings:', err);
    }
  };

  const handleToggleEnabled = async (enabled: boolean) => {
    setIsLoading(true);
    setError(null);

    try {
      await userService.updateApiSettings({
        investmentTrackingEnabled: enabled
      });
      setIsEnabled(enabled);
      setSuccess(enabled ? 'Investment tracking enabled' : 'Investment tracking disabled');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update settings');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveApiKey = async () => {
    setIsLoading(true);
    setError(null);

    try {
      await userService.updateApiSettings({
        fmpApiKey: fmpApiKey || null
      });
      setSuccess('FMP API key saved successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save API key');
    } finally {
      setIsLoading(false);
    }
  };

  if (!globallyEnabled) {
    return (
      <div style={{
        padding: '16px',
        background: 'rgba(251, 191, 36, 0.1)',
        border: '1px solid rgba(251, 191, 36, 0.3)',
        borderRadius: '8px'
      }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <AlertCircle size={20} style={{ color: '#fbbf24' }} />
          <div>
            <p style={{ color: '#fbbf24', fontWeight: '600', fontSize: '14px', marginBottom: '4px' }}>
              Investment Tracking Not Available
            </p>
            <p style={{ color: '#94a3b8', fontSize: '13px' }}>
              Investment tracking has been disabled by the administrator.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Error Message */}
      {error && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '16px',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '8px',
          marginBottom: '20px'
        }}>
          <AlertCircle size={20} style={{ color: '#ef4444' }} />
          <p style={{ color: '#ef4444', fontSize: '14px', margin: 0 }}>{error}</p>
        </div>
      )}

      {/* Success Message */}
      {success && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '16px',
          background: 'rgba(34, 197, 94, 0.1)',
          border: '1px solid rgba(34, 197, 94, 0.3)',
          borderRadius: '8px',
          marginBottom: '20px'
        }}>
          <Check size={20} style={{ color: '#22c55e' }} />
          <p style={{ color: '#22c55e', fontSize: '14px', margin: 0 }}>{success}</p>
        </div>
      )}

      {/* Enable/Disable Toggle */}
      <div style={{
        padding: '16px',
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '8px',
        marginBottom: '20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <p style={{ color: 'white', fontWeight: '500', fontSize: '14px', marginBottom: '4px' }}>
            Enable Investment Tracking
          </p>
          <p style={{ color: '#64748b', fontSize: '12px' }}>
            Track stocks, ETFs, and other investments in your portfolio
          </p>
        </div>
        <label style={{ position: 'relative', display: 'inline-block', width: '48px', height: '24px' }}>
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={(e) => handleToggleEnabled(e.target.checked)}
            disabled={isLoading}
            style={{ opacity: 0, width: 0, height: 0 }}
          />
          <span style={{
            position: 'absolute',
            cursor: isLoading ? 'not-allowed' : 'pointer',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: isEnabled ? '#15803d' : 'rgba(255, 255, 255, 0.2)',
            borderRadius: '24px',
            transition: '0.3s',
            opacity: isLoading ? 0.5 : 1
          }}>
            <span style={{
              position: 'absolute',
              content: '',
              height: '18px',
              width: '18px',
              left: isEnabled ? '26px' : '3px',
              bottom: '3px',
              background: 'white',
              borderRadius: '50%',
              transition: '0.3s'
            }}></span>
          </span>
        </label>
      </div>

      {/* FMP API Key Section */}
      <div style={{
        padding: '20px',
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '8px'
      }}>
        <h4 style={{ color: 'white', fontSize: '16px', fontWeight: '600', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Key size={18} />
          Financial Modeling Prep API Key
        </h4>

        <div style={{
          padding: '12px',
          background: 'rgba(59, 130, 246, 0.1)',
          border: '1px solid rgba(59, 130, 246, 0.3)',
          borderRadius: '8px',
          marginBottom: '16px'
        }}>
          <p style={{ color: '#60a5fa', fontSize: '13px', lineHeight: '1.5' }}>
            Get your free API key from{' '}
            <a
              href="https://site.financialmodelingprep.com/developer/docs"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#3b82f6', textDecoration: 'underline' }}
            >
              Financial Modeling Prep
            </a>
            {' '}to enable real-time stock quotes and financial data.
          </p>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); handleSaveApiKey(); }}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', color: '#94a3b8', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
              FMP API Key (Optional)
            </label>
            <input
              type={showApiKey ? 'text' : 'password'}
              value={fmpApiKey}
              onChange={(e) => {
                setFmpApiKey(e.target.value);
                setError(null);
              }}
              placeholder="Enter your FMP API key"
              disabled={isLoading}
              style={{
                width: '100%',
                padding: '12px',
                background: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                color: 'white',
                fontSize: '14px',
                outline: 'none'
              }}
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              style={{
                marginTop: '8px',
                padding: '6px 12px',
                background: 'transparent',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '6px',
                color: '#94a3b8',
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              {showApiKey ? 'Hide' : 'Show'} API Key
            </button>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            style={{
              width: '100%',
              padding: '12px',
              background: isLoading ? '#166534' : '#15803d',
              border: 'none',
              borderRadius: '8px',
              color: 'white',
              fontSize: '14px',
              fontWeight: '600',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              opacity: isLoading ? 0.7 : 1
            }}
          >
            {isLoading ? 'Saving...' : 'Save API Key'}
          </button>
        </form>
      </div>
    </div>
  );
};
