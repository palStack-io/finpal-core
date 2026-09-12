import React, { useState, useEffect } from 'react';
import { Repeat, Plus, X, Check, AlertCircle, Sparkles, Eye, EyeOff, Trash2, Edit2 } from 'lucide-react';
import { recurringService, RecurringExpense, RecurringPattern } from '../services/recurringService';
import { flexRowGap8, flexRowGap12, flexRowBetween, flexColGap12, flexColGap16, flexColGap20, sectionHeaderStyle, pageContainerStyle, pageMaxWidthStyle, cardStyle, tableStyle } from '../styles/layoutStyles';
import { apiErrorMessage } from '../utils/apiError';
import { Modal } from './Modal';
import { formActionsStyle, labelStyle } from '../styles/formStyles';

const metaTextStyle: React.CSSProperties = { color: 'var(--text-secondary)', fontSize: '13px' };

/**
 * What amount to send for a typed string.
 *
 * *** A TYPED MINUS IS A USER SAYING "OUT", NOT INVALID INPUT. *** Direction
 * lives in `transaction_type`, so `-1200` is somebody expressing it the other
 * way round; refusing it teaches a rule they cannot see, and normalising costs
 * nothing. One convention for direction, not two — the importer stores
 * `abs(amount)` for the same reason, and the transfer matcher pairs equal
 * amounts with opposite TYPES, so a negative stored here would stop it finding
 * them.
 *
 * Exported and unit-tested rather than exercised through the form: driving a
 * modal to assert one arithmetic rule was flaky across tests and proved less.
 */
export const recurringAmount = (typed: string): number => {
  const n = Number(typed);
  return Number.isFinite(n) ? Math.abs(n) : NaN;
};

/**
 * Create a recurring transaction by hand — D-193.
 *
 * *** THE TYPE SELECTOR IS THE POINT, NOT A FIELD AMONG FIELDS. *** The API has
 * accepted `transaction_type: 'income'` since #133 -- `POST /recurring` answers
 * 201 and stores it, verified against the live demo -- and no client has ever
 * offered the choice, so every recurring row on every instance is an expense.
 * The budget redesign's planned income is defined as *"the sum of ACTIVE
 * recurring rows with `transaction_type = 'income'`"*, which nobody could
 * produce. D-99's shape: an affordance missing from a client is not a
 * capability missing from the API.
 *
 * Deliberately SMALL. Category and account pickers are not here: the endpoint
 * takes them as optional, the detected-pattern path already fills them in, and
 * a form that asks for everything is a form people abandon. They can be added
 * when somebody asks.
 */
const AddRecurringModal: React.FC<{
  onClose: () => void;
  onCreated: () => void;
  onError: (message: string) => void;
}> = ({ onClose, onCreated, onError }) => {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] =
    useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('monthly');
  const [transactionType, setTransactionType] =
    useState<'expense' | 'income'>('expense');
  // Defaults to today rather than empty: `start_date` decides when the first
  // instance is written, and an empty date is not a question most people want.
  const [startDate, setStartDate] = useState(
    () => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const amountValue = recurringAmount(amount);
  const valid = description.trim().length > 0
    && Number.isFinite(amountValue) && amountValue > 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    try {
      await recurringService.createRecurringExpense({
        description: description.trim(),
        // *** THE AMOUNT IS ALWAYS POSITIVE AND THE DIRECTION IS THE TYPE. ***
        // The importer stores `abs(amount)` with the direction in
        // `transaction_type`, so a negative typed here would be a second
        // convention for the same fact.
        amount: amountValue,
        frequency,
        transaction_type: transactionType,
        start_date: startDate,
      });
      onCreated();
    } catch (err) {
      onError(apiErrorMessage(err, 'Could not create this recurring transaction.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="New recurring transaction">
      <form onSubmit={submit} style={flexColGap16}>
        <div>
          <label style={labelStyle} htmlFor="rec-desc">Description</label>
          <input
            id="rec-desc"
            aria-label="Description"
            className="fp-input"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Rent, salary, insurance…"
            autoFocus
          />
        </div>

        <div style={flexRowGap12}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle} htmlFor="rec-amount">Amount</label>
            <input
              id="rec-amount"
            aria-label="Amount"
              className="fp-input"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle} htmlFor="rec-type">Money in or out</label>
            {/* *** THE CONTROL D-193 EXISTS FOR. *** Without it every recurring
                row is an expense, and planned income has no source. */}
            <select
              id="rec-type"
            aria-label="Money in or out"
              className="fp-input"
              value={transactionType}
              onChange={(e) =>
                setTransactionType(e.target.value as 'expense' | 'income')}
            >
              <option value="expense">Money out — an expense</option>
              <option value="income">Money in — income</option>
            </select>
          </div>
        </div>

        <div style={flexRowGap12}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle} htmlFor="rec-freq">How often</label>
            <select
              id="rec-freq"
            aria-label="How often"
              className="fp-input"
              value={frequency}
              onChange={(e) => setFrequency(
                e.target.value as 'daily' | 'weekly' | 'monthly' | 'yearly')}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle} htmlFor="rec-start">Starts</label>
            <input
              id="rec-start"
            aria-label="Starts"
              className="fp-input"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
        </div>

        <div style={formActionsStyle}>
          {/* *** AN INLINE STYLE, NOT A CLASS NAME. *** My first version used
              `fp-btn-secondary`, which does not exist in any stylesheet — and a
              class with no rule renders silently unstyled, which is D-60.
              `cssClassesAreDefined.test.ts` caught it by name. */}
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '10px 20px',
              background: 'transparent',
              border: '1px solid var(--border-light)',
              borderRadius: '8px',
              color: 'var(--text-secondary)',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!valid || saving}
            style={{
              padding: '10px 20px',
              background: valid && !saving
                ? 'var(--brand-main-green)' : 'var(--surface-hover)',
              border: 'none',
              borderRadius: '8px',
              color: valid && !saving ? 'white' : 'var(--text-secondary)',
              fontWeight: 600,
              cursor: valid && !saving ? 'pointer' : 'not-allowed',
            }}
          >
            {saving ? 'Saving…' : 'Create'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

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
    /* *** THE SHARED PAGE SHELL, ON ONE ELEMENT. *** `pageContainerStyle` is the
       24px gutter and `pageMaxWidthStyle` the 1400px cap. Measured on the
       deployed demo at 1440px: this page's content began at 240px, flush against
       the side nav, while every page using the shell began at 264px -- the owner
       reported the padding looking wrong "on other pages too" after the same
       omission was fixed on Goals.
       Combined on a single div rather than nested as Dashboard does it, because
       the two differ only in whether the gutter sits inside or outside the cap,
       and with a 240px side nav the cap cannot bind below a 1640px viewport --
       so the rendered result is the same and there is no extra closing tag to
       get wrong.
       *** THIS FILE ALREADY IMPORTED `pageContainerStyle` AND NEVER USED IT. ***
       The import comes from a shared barrel, so a page can look like it adopted
       the shell while rendering a bare div. */
    <div style={{ ...pageContainerStyle, ...pageMaxWidthStyle }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' , flexWrap: 'wrap', gap: '12px' }}>
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
        {/* *** D-193: THIS SCREEN COULD NOT CREATE THE THING IT LISTS. *** Its
            only route in was "Detect Patterns", which finds a recurrence in
            transactions you ALREADY have — so a salary not yet imported, an
            irregular bill, or anything on a fresh instance could not be
            recorded. `showAddModal` had been declared since the file was
            written and appeared exactly once: the fossil of a form nobody
            finished. */}
        <button
          onClick={() => setShowAddModal(true)}
          style={{
            padding: '12px 20px',
            background: 'var(--brand-main-green)',
            border: 'none',
            borderRadius: '8px',
            color: 'white',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Plus size={16} />
          New Recurring
        </button>
      </div>

      {showAddModal && (
        <AddRecurringModal
          onClose={() => setShowAddModal(false)}
          onCreated={() => { setShowAddModal(false); loadRecurring(); }}
          onError={setError}
        />
      )}

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
