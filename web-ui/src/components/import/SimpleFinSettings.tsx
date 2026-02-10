/**
 * SimpleFin Settings Component
 * Manages SimpleFin connection and settings in the Settings page
 */

import React, { useState, useEffect } from 'react';
import { Check, AlertCircle, Link2, Power, Settings } from 'lucide-react';
import { accountService } from '../../services/accountService';
import { userService } from '../../services/userService';

export const SimpleFinSettings: React.FC = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);
  const [globallyEnabled, setGloballyEnabled] = useState(true);
  const [accountCount, setAccountCount] = useState(0);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [accessUrl, setAccessUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showConnectForm, setShowConnectForm] = useState(false);

  // Load SimpleFin status on mount
  useEffect(() => {
    loadSimpleFinStatus();
    loadApiSettings();
  }, []);

  const loadSimpleFinStatus = async () => {
    try {
      const status = await accountService.getSimpleFinStatus();
      setIsConnected(status.connected);
      setAccountCount(status.accountCount || 0);
      setLastSync(status.lastSync);
    } catch (err) {
      console.error('Failed to load SimpleFin status:', err);
    }
  };

  const loadApiSettings = async () => {
    try {
      const settings = await userService.getApiSettings();
      setIsEnabled(settings.simplefinEnabled || false);
      setGloballyEnabled(settings.simplefinGloballyEnabled || false);
    } catch (err) {
      console.error('Failed to load API settings:', err);
    }
  };

  const handleConnect = async () => {
    if (!accessUrl.trim()) {
      setError('Please enter your SimpleFin access URL');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await accountService.connectSimpleFin(accessUrl);
      setSuccess('SimpleFin connected successfully!');
      setShowConnectForm(false);
      setAccessUrl('');

      // Reload status
      await loadSimpleFinStatus();

      // Auto-enable SimpleFin after connection
      await handleToggleEnabled(true);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to connect SimpleFin');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect SimpleFin? Your existing accounts and transactions will remain.')) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await accountService.disconnectSimpleFin();
      setSuccess('SimpleFin disconnected successfully');
      setIsConnected(false);
      setIsEnabled(false);
      await loadSimpleFinStatus();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to disconnect SimpleFin');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleEnabled = async (enabled: boolean) => {
    setIsLoading(true);
    setError(null);

    try {
      await userService.updateApiSettings({
        simplefinEnabled: enabled
      });
      setIsEnabled(enabled);
      setSuccess(enabled ? 'SimpleFin enabled' : 'SimpleFin disabled');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update settings');
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
              SimpleFin Not Available
            </p>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
              SimpleFin integration has been disabled by the administrator.
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

      {/* Connection Status */}
      <div style={{
        padding: '20px',
        background: 'var(--surface-hover)',
        border: '1px solid var(--border-light)',
        borderRadius: '8px',
        marginBottom: '20px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h3 style={{ color: 'var(--text-primary)', fontSize: '16px', fontWeight: '600', marginBottom: '4px' }}>
              Connection Status
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
              {isConnected ? `Connected • ${accountCount} account(s)` : 'Not connected'}
            </p>
          </div>
          <div style={{
            padding: '8px 16px',
            background: isConnected ? 'rgba(34, 197, 94, 0.2)' : 'rgba(148, 163, 184, 0.2)',
            border: `1px solid ${isConnected ? 'rgba(34, 197, 94, 0.3)' : 'rgba(148, 163, 184, 0.3)'}`,
            borderRadius: '6px',
            color: isConnected ? '#22c55e' : '#94a3b8',
            fontSize: '13px',
            fontWeight: '600'
          }}>
            {isConnected ? 'Connected' : 'Disconnected'}
          </div>
        </div>

        {lastSync && (
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
            Last synced: {new Date(lastSync).toLocaleString()}
          </p>
        )}
      </div>

      {/* Enable/Disable Toggle */}
      {isConnected && (
        <div style={{
          padding: '16px',
          background: 'var(--surface-hover)',
          border: '1px solid var(--border-light)',
          borderRadius: '8px',
          marginBottom: '20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <p style={{ color: 'var(--text-primary)', fontWeight: '500', fontSize: '14px', marginBottom: '4px' }}>
              Enable SimpleFin Sync
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
              Automatically sync transactions from connected accounts
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
              background: isEnabled ? '#15803d' : 'var(--surface-active)',
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
      )}

      {/* Connect Form */}
      {!isConnected && !showConnectForm && (
        <button
          onClick={() => setShowConnectForm(true)}
          style={{
            width: '100%',
            padding: '14px',
            background: '#15803d',
            border: 'none',
            borderRadius: '8px',
            color: 'var(--text-primary)',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'all 0.3s'
          }}
          onMouseEnter={(e) => ((e.target as HTMLButtonElement).style.background = '#166534')}
          onMouseLeave={(e) => ((e.target as HTMLButtonElement).style.background = '#15803d')}
        >
          <Link2 size={16} />
          Connect SimpleFin
        </button>
      )}

      {/* Connect Form - Expanded */}
      {!isConnected && showConnectForm && (
        <div style={{
          padding: '20px',
          background: 'var(--surface-hover)',
          border: '1px solid var(--border-light)',
          borderRadius: '8px'
        }}>
          <h4 style={{ color: 'var(--text-primary)', fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>
            Connect SimpleFin
          </h4>

          <div style={{
            padding: '12px',
            background: 'rgba(59, 130, 246, 0.1)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            borderRadius: '8px',
            marginBottom: '16px'
          }}>
            <p style={{ color: '#60a5fa', fontSize: '13px', lineHeight: '1.5' }}>
              Get your SimpleFin access URL from{' '}
              <a
                href="https://beta-bridge.simplefin.org/simplefin/claim"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#3b82f6', textDecoration: 'underline' }}
              >
                SimpleFin's setup page
              </a>
            </p>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
              SimpleFin Access URL
            </label>
            <input
              type="text"
              value={accessUrl}
              onChange={(e) => {
                setAccessUrl(e.target.value);
                setError(null);
              }}
              placeholder="https://..."
              disabled={isLoading}
              style={{
                width: '100%',
                padding: '12px',
                background: 'var(--input-bg)',
                border: '1px solid var(--input-border)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
                fontSize: '14px',
                outline: 'none'
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={() => {
                setShowConnectForm(false);
                setAccessUrl('');
                setError(null);
              }}
              disabled={isLoading}
              style={{
                flex: 1,
                padding: '12px',
                background: 'var(--btn-secondary-bg)',
                border: '1px solid var(--btn-secondary-border)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
                fontSize: '14px',
                fontWeight: '600',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                opacity: isLoading ? 0.5 : 1
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleConnect}
              disabled={isLoading || !accessUrl.trim()}
              style={{
                flex: 1,
                padding: '12px',
                background: (isLoading || !accessUrl.trim()) ? '#166534' : '#15803d',
                border: 'none',
                borderRadius: '8px',
                color: 'var(--text-primary)',
                fontSize: '14px',
                fontWeight: '600',
                cursor: (isLoading || !accessUrl.trim()) ? 'not-allowed' : 'pointer',
                opacity: (isLoading || !accessUrl.trim()) ? 0.7 : 1
              }}
            >
              {isLoading ? 'Connecting...' : 'Connect'}
            </button>
          </div>
        </div>
      )}

      {/* Disconnect Button */}
      {isConnected && (
        <button
          onClick={handleDisconnect}
          disabled={isLoading}
          style={{
            width: '100%',
            padding: '12px',
            background: 'rgba(239, 68, 68, 0.2)',
            border: '1px solid rgba(239, 68, 68, 0.5)',
            borderRadius: '8px',
            color: '#ef4444',
            fontSize: '14px',
            fontWeight: '600',
            cursor: isLoading ? 'not-allowed' : 'pointer',
            marginTop: '16px',
            opacity: isLoading ? 0.5 : 1
          }}
        >
          <Power size={16} style={{ display: 'inline', marginRight: '8px' }} />
          Disconnect SimpleFin
        </button>
      )}
    </div>
  );
};
