import React, { useState, useEffect } from 'react';
import { Repeat, Plus, X, Check, AlertCircle, Sparkles, Eye, EyeOff, Trash2, Edit2 } from 'lucide-react';
import { recurringService, RecurringExpense, RecurringPattern } from '../services/recurringService';
import { flexRowGap8, flexRowGap12, flexRowBetween, flexColGap12, flexColGap16, flexColGap20, sectionHeaderStyle, pageContainerStyle, pageMaxWidthStyle, cardStyle, tableStyle } from '../styles/layoutStyles';
import { apiErrorMessage } from '../utils/apiError';

const metaTextStyle: React.CSSProperties = { color: 'var(--text-secondary)', fontSize: '13px' };

export const RecurringTransactions: React.FC = () => {
  const [recurring, setRecurring] = useState<RecurringExpense[]>([]);
  const [patterns, setPatterns] = useState<RecurringPattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [detectingPatterns, setDetectingPatterns] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPatternsSection, setShowPatternsSection] = useState(false);

  useEffect(() => {
    loadRecurring();
  }, []);

  const loadRecurring = async () => {
    try {
      setLoading(true);
      const data = await recurringService.getRecurringExpenses();
      setRecurring(data);
      setError(null);
    } catch (err: any) {
      setError(apiErrorMessage(err, 'Failed to load recurring transactions'));
    } finally {
      setLoading(false);
    }
  };

  const handleDetectPatterns = async () => {
    try {
      setDetectingPatterns(true);
      setError(null);
      const detected = await recurringService.detectRecurringPatterns();
      setPatterns(detected);
      setShowPatternsSection(true);
      if (detected.length === 0) {
        setSuccess('No recurring patterns detected');
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (err: any) {
      setError(apiErrorMessage(err, 'Failed to detect patterns'));
    } finally {
      setDetectingPatterns(false);
    }
  };

  const handleToggleActive = async (id: number) => {
    try {
      const result = await recurringService.toggleRecurringExpense(id);
      setRecurring(recurring.map(r =>
        r.id === id ? { ...r, active: result.active } : r
      ));
      setSuccess('Status updated successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(apiErrorMessage(err, 'Failed to toggle status'));
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this recurring transaction?')) {
      return;
    }

    try {
      await recurringService.deleteRecurringExpense(id);
      setRecurring(recurring.filter(r => r.id !== id));
      setSuccess('Recurring transaction deleted successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(apiErrorMessage(err, 'Failed to delete recurring transaction'));
    }
  };

  const handleCreateFromPattern = async (patternKey: string) => {
    try {
      await recurringService.createFromPattern(patternKey);
      setPatterns(patterns.filter(p => p.pattern_key !== patternKey));
      await loadRecurring();
      setSuccess('Recurring transaction created from pattern!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(apiErrorMessage(err, 'Failed to create recurring transaction'));
    }
  };

  const handleIgnorePattern = async (patternKey: string) => {
    try {
      await recurringService.ignorePattern(patternKey);
      setPatterns(patterns.filter(p => p.pattern_key !== patternKey));
      setSuccess('Pattern ignored');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(apiErrorMessage(err, 'Failed to ignore pattern'));
    }
  };

  const getFrequencyLabel = (frequency: string) => {
    const labels: Record<string, string> = {
      'daily': 'Daily',
      'weekly': 'Weekly',
      'monthly': 'Monthly',
      'yearly': 'Yearly'
    };
    return labels[frequency] || frequency;
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
            Recurring Transactions
          </h2>
          <p className="fp-hint">
            Manage automatic recurring transactions and detect patterns
          </p>
        </div>
        <button
          onClick={handleDetectPatterns}
          disabled={detectingPatterns}
          style={{
            padding: '12px 20px',
            background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
            border: '1px solid rgba(251, 191, 36, 0.5)',
            borderRadius: '8px',
            color: '#0f172a',
            fontSize: '14px',
            fontWeight: '600',
            cursor: detectingPatterns ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            opacity: detectingPatterns ? 0.7 : 1
          }}
        >
          <Sparkles size={16} />
          {detectingPatterns ? 'Detecting...' : 'Detect Patterns'}
        </button>
      </div>

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
          <AlertCircle size={20} style={{ color: 'var(--accent-red)' }} />
          <p className="fp-error-text">{error}</p>
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
          <Check size={20} style={{ color: 'var(--brand-green-glow)' }} />
          <p style={{ color: 'var(--brand-green-glow)', fontSize: '14px', fontWeight: '600', margin: 0 }}>{success}</p>
        </div>
      )}

      {/* Detected Patterns */}
      {showPatternsSection && patterns.length > 0 && (
        <div style={{
          background: 'rgba(251, 191, 36, 0.1)',
          border: '1px solid rgba(251, 191, 36, 0.3)',
          borderRadius: '12px',
          padding: '20px',
          marginBottom: '24px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <Sparkles size={24} style={{ color: 'var(--brand-accent-gold)' }} />
            <h3 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)', margin: 0 }}>
              Detected Patterns ({patterns.length})
            </h3>
          </div>
          <p className="fp-hint-block">
            We found these recurring transaction patterns. Create automatic recurring transactions or ignore them.
          </p>

          {patterns.map((pattern, index) => (
            <div
              key={index}
              style={{
                background: 'var(--input-bg)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                padding: '16px',
                marginBottom: '12px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
                <div style={{ flex: 1 }}>
                  <h4 style={{ color: 'var(--text-primary)', fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>
                    {pattern.description}
                  </h4>
                  <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                    <span style={metaTextStyle}>
                      Amount: <strong style={{ color: 'var(--brand-light-green)' }}>${pattern.amount.toFixed(2)}</strong>
                    </span>
                    <span style={metaTextStyle}>
                      Frequency: <strong style={{ color: 'var(--brand-light-green)' }}>{getFrequencyLabel(pattern.frequency)}</strong>
                    </span>
                    <span style={metaTextStyle}>
                      Occurrences: <strong style={{ color: 'var(--brand-light-green)' }}>{pattern.occurrences}</strong>
                    </span>
                    <span style={metaTextStyle}>
                      Confidence: <strong style={{ color: 'var(--brand-light-green)' }}>{(pattern.confidence * 100).toFixed(0)}%</strong>
                    </span>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={() => handleCreateFromPattern(pattern.pattern_key)}
                  style={{
                    flex: 1,
                    padding: '10px',
                    background: 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
                    border: '1px solid rgba(21, 128, 61, 0.5)',
                    borderRadius: '8px',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  Create Recurring
                </button>
                <button
                  onClick={() => handleIgnorePattern(pattern.pattern_key)}
                  style={{
                    flex: 1,
                    padding: '10px',
                    background: 'rgba(71, 85, 105, 0.3)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  Ignore
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Recurring Transactions List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
          Loading recurring transactions...
        </div>
      ) : recurring.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '60px 20px',
          background: 'var(--surface-hover)',
          borderRadius: '12px',
          border: '1px dashed rgba(255, 255, 255, 0.2)'
        }}>
          <Repeat size={48} color="#64748b" style={{ margin: '0 auto 16px' }} />
          <p style={{ color: 'var(--text-secondary)', fontSize: '16px', marginBottom: '8px' }}>
            No recurring transactions yet
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
            Click "Detect Patterns" to find recurring transactions automatically
          </p>
        </div>
      ) : (
        <div style={flexColGap12}>
          {recurring.map((item) => (
            <div
              key={item.id}
              style={{
                background: 'var(--surface-hover)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '12px',
                padding: '16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                opacity: item.active ? 1 : 0.6
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                  <Repeat size={20} style={{ color: item.active ? 'var(--brand-light-green)' : 'var(--text-muted)' }} />
                  <h3 style={{ color: 'var(--text-primary)', fontSize: '16px', fontWeight: '600', margin: 0 }}>
                    {item.description}
                  </h3>
                  {!item.active && (
                    <span style={{
                      padding: '2px 8px',
                      background: 'rgba(100, 116, 139, 0.3)',
                      border: '1px solid rgba(100, 116, 139, 0.5)',
                      borderRadius: '4px',
                      color: 'var(--text-secondary)',
                      fontSize: '11px',
                      fontWeight: '600'
                    }}>
                      INACTIVE
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                  <span style={metaTextStyle}>
                    Amount: <strong style={{ color: 'var(--brand-light-green)' }}>${item.amount.toFixed(2)}</strong>
                  </span>
                  <span style={metaTextStyle}>
                    Frequency: <strong style={{ color: 'var(--brand-light-green)' }}>{getFrequencyLabel(item.frequency)}</strong>
                  </span>
                  <span style={metaTextStyle}>
                    Type: <strong style={{ color: 'var(--brand-light-green)' }}>{item.transaction_type}</strong>
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  onClick={() => handleToggleActive(item.id)}
                  style={{
                    padding: '8px 12px',
                    background: item.active ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)',
                    border: `1px solid ${item.active ? 'rgba(239, 68, 68, 0.5)' : 'rgba(34, 197, 94, 0.5)'}`,
                    borderRadius: '8px',
                    color: item.active ? '#fca5a5' : 'var(--brand-light-green)',
                    fontSize: '13px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  {item.active ? <EyeOff size={14} /> : <Eye size={14} />}
                  {item.active ? 'Pause' : 'Activate'}
                </button>
                <button
                  onClick={() => handleDelete(item.id)}
                  style={{
                    padding: '8px',
                    background: 'rgba(239, 68, 68, 0.2)',
                    border: '1px solid rgba(239, 68, 68, 0.5)',
                    borderRadius: '8px',
                    color: '#fca5a5',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
