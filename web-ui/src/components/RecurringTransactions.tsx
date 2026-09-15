import React, { useState, useEffect } from 'react';
import { Repeat, Plus, X, Check, AlertCircle, Sparkles, Eye, EyeOff, Trash2, Edit2 } from 'lucide-react';
import { recurringService, RecurringExpense, RecurringPattern } from '../services/recurringService';
import { flexRowGap8, flexRowGap12, flexRowBetween, flexColGap12, flexColGap16, flexColGap20, sectionHeaderStyle, pageContainerStyle, pageMaxWidthStyle, cardStyle, tableStyle } from '../styles/layoutStyles';
import { apiErrorMessage } from '../utils/apiError';
import { Modal } from './Modal';
import { formActionsStyle, labelStyle } from '../styles/formStyles';
import { useAuthStore } from '../store/authStore';
import { formatMoney } from '../styles/money';
import { PageHead } from './PageHead';
import { monthlyEquivalent, isConvertible, monthlyLabel } from '../utils/recurringMonthly';
import { groundHeight } from '../utils/mountainGeometry';

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

  /**
   * *** THIS SCREEN PRINTED A LITERAL `$` AND NOTHING ELSE ON IT DID. ***
   *
   * Both amount rows were JSX text of the form `Amount: <strong>${'$'}{x.toFixed(2)}
   * </strong>`, where the dollar is a plain character and only the braces
   * interpolate -- so it read as a template literal and was not one. A user set
   * to GBP saw `$450.00` here while every other figure in the app rendered in
   * pounds, which is the worst version of the bug: not obviously broken, just
   * quietly wrong about the unit.
   *
   * `formatMoney` rather than a local `toFixed`: it is the single formatter
   * (D-145 -- `formatCurrency` was once defined five times and the copies
   * disagreed on both the unit AND the number of decimals), and it already
   * follows the user's number locale.
   *
   * A SAVED recurring row carries its own `currency_code`, so that wins where it
   * is set -- a standing order in another currency is a real thing -- and the
   * profile default is the fallback.
   *
   * A DETECTED pattern does not, and the typecheck is what said so: it is derived
   * from transactions and has never been saved, and neither the detect endpoint
   * nor its model carries a currency. So detected rows take the profile default,
   * and that asymmetry is deliberate rather than an oversight. Checked against
   * the API, not just the interface -- the TypeScript here has disagreed with
   * what the server sends five times.
   */
  const user = useAuthStore((state) => state.user);
  const money = (amount: number, currencyCode?: string) =>
    formatMoney(amount, { currency: currencyCode || user?.default_currency_code || 'USD' });

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
      {/* The only band in the set with a base: a solid bar along the bottom,
          because this page IS the ground. `PageHead` also supplies the single
          h1 the outline needs — this page had none until the widened heading
          check found it. */}
      <PageHead
        band="recurring"
        title="Recurring"
        subtitle="What arrives every month before you decide anything. This is the ground you stand on."
        right={<>
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
        </button></>}
      />

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
            <Sparkles size={24} style={{ color: 'var(--au-ink)' }} />
            {/* h2, not h3. This sits directly under the page's single h1 with no
                section heading between, so an h3 here jumps a level and breaks
                the outline a screen reader navigates by. Found by widening
                `every-page.spec.ts`'s heading check from the six pages
                `standards.spec.ts` listed to all 21 derived routes — four pages
                were doing this and nothing said so. The size is inline, so the
                tag change is invisible on screen. */}
            <h2 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)', margin: 0 }}>
              Detected Patterns ({patterns.length})
            </h2>
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
                  {/* h3: one level under the "Detected Patterns" h2 above,
                      which moved from h3 to h2 in the same change. */}
                  <h3 style={{ color: 'var(--text-primary)', fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>
                    {pattern.description}
                  </h3>
                  <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                    <span style={metaTextStyle}>
                      {/* *** THE `$` HERE WAS A LITERAL CHARACTER IN JSX TEXT, NOT A
                          TEMPLATE. *** `${'{'}x{'}'}` reads like an interpolation and is not one:
                          the dollar was printed verbatim, so every detected pattern
                          showed `$450.00` to a user whose currency is anything else --
                          beside amounts the rest of the app had drawn correctly. */}
                      Amount: <strong style={{ color: 'var(--g-ink)' }}>{money(pattern.amount)}</strong>
                    </span>
                    <span style={metaTextStyle}>
                      Frequency: <strong style={{ color: 'var(--g-ink)' }}>{getFrequencyLabel(pattern.frequency)}</strong>
                    </span>
                    <span style={metaTextStyle}>
                      Occurrences: <strong style={{ color: 'var(--g-ink)' }}>{pattern.occurrences}</strong>
                    </span>
                    <span style={metaTextStyle}>
                      Confidence: <strong style={{ color: 'var(--g-ink)' }}>{(pattern.confidence * 100).toFixed(0)}%</strong>
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
                    /* White, not `--text-primary`: a filled green button's label sits on
                       the brand green in BOTH themes while `--text-primary` flips with the
                       page, so one theme always loses -- 2.83:1 light, 4.32:1 dark, against
                       4.5. White is 5.02:1 on the gradient's first stop. D-103. */
                    color: 'white',
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
          {/* *** "NOTHING HERE IS INCOME" IS THE ACT THIS PAGE IS FOR, AND THE
              PAGE NEVER SAID IT. *** demo1 has eight recurring rows and every
              one is an expense, so `has_recurring_income` is false — which
              makes this the only honest place to raise it. Every figure on this
              page is what leaves before any decision is made; without one
              income row there is nothing for it to be measured against.

              *** RENDERED ONLY WHEN IT IS TRUE, AND NEVER AS A SCOLD. *** Gated
              on there being rows but no income row: an empty page already has
              its own empty state, and someone who has recorded income must
              never see this. `POST /recurring` has accepted
              `transaction_type: 'income'` since #133 — see this file's header —
              so the thing it asks for is actually possible.

              No coin figure, unlike the mockup's "+200 coins": `/coins`
              returns coins EARNED, not a price for finishing, and promising a
              number nobody has committed to is the one thing these screens
              must not do. */}
          {recurring.length > 0
            && !recurring.some((item) => item.transaction_type === 'income') && (
            <div style={{
              padding: '14px 18px',
              background: 'var(--surface-hover)',
              border: '1px solid var(--border-light)',
              borderRadius: '12px',
              fontSize: '14px', color: 'var(--text-primary)', lineHeight: 1.6,
            }}>
              <strong>Nothing here is income.</strong> Everything on this page is
              what leaves before you decide anything. Add what arrives and every
              figure here gets something to be measured against.
            </div>
          )}
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
                  <Repeat size={20} style={{ color: item.active ? 'var(--g-ink)' : 'var(--text-muted)' }} />
                  {/* h2, not h3. This sits directly under the page's single h1 with no
                      section heading between, so an h3 here jumps a level and breaks
                      the outline a screen reader navigates by. Found by widening
                      `every-page.spec.ts`'s heading check from the six pages
                      `standards.spec.ts` listed to all 21 derived routes — four pages
                      were doing this and nothing said so. The size is inline, so the
                      tag change is invisible on screen. */}
                  <h2 style={{ color: 'var(--text-primary)', fontSize: '16px', fontWeight: '600', margin: 0 }}>
                    {item.description}
                  </h2>
                  {!item.active && (
                    <span style={{
                      padding: '2px 8px',
                      /* 0.3 -> 0.16: `--text-secondary` on the thicker
                         wash measured 3.77:1 (#56685d on #c8cfd2). The same
                         word on the page's own wash measures 4.51, so it was
                         the TINT that failed, not the token. D-103. */
                      background: 'rgba(100, 116, 139, 0.16)',
                      border: '1px solid rgba(100, 116, 139, 0.4)',
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
                    Amount: <strong style={{ color: 'var(--g-ink)' }}>{money(item.amount, item.currency_code)}</strong>
                  </span>
                  <span style={metaTextStyle}>
                    Frequency: <strong style={{ color: 'var(--g-ink)' }}>{getFrequencyLabel(item.frequency)}</strong>
                  </span>
                  {/* *** WHAT THIS ROW COSTS PER MONTH, WHICH IS NOT ALWAYS ITS
                      AMOUNT. *** The demo's £15 weekly shop is £65 a month and
                      its £132 yearly insurance is £11 — so a reader adding the
                      printed column up gets £1,659 against a true £1,588. The
                      figure is only shown when it DIFFERS: repeating "£1,200 /
                      mo" beside a monthly £1,200 is noise, and noise is what
                      stops the two rows that matter from standing out.

                      When finPal cannot convert the frequency it says so
                      rather than printing a number — `monthlyEquivalent`
                      returns null for anything outside the four values the
                      model documents, because defaulting an unknown to
                      "monthly" would put a wrong figure inside what a user
                      reads as their fixed cost. */}
                  {monthlyEquivalent(item.amount, item.frequency) !== item.amount && (
                    isConvertible(item.frequency) ? (
                      <span style={metaTextStyle}>
                        Per month: <strong style={{ color: 'var(--g-ink)' }}>
                          {monthlyLabel(item.amount, item.frequency,
                            (n) => money(n, item.currency_code))?.replace(' / mo', '')}
                        </strong>
                      </span>
                    ) : (
                      <span style={metaTextStyle}>
                        finPal cannot work out what “{item.frequency}” costs in a month
                      </span>
                    )
                  )}
                  <span style={metaTextStyle}>
                    Type: <strong style={{ color: 'var(--g-ink)' }}>{item.transaction_type}</strong>
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  onClick={() => handleToggleActive(item.id)}
                  style={{
                    padding: '8px 12px',
                    /* 0.2 -> 0.13. `--re-ink` on the 20% red wash measured
                       4.41:1 in dark (#f87171 on #453127) — nine hundredths
                       short of AA on a 13px bold label. Both halves move
                       together so the button does not change depth when it
                       toggles. */
                    background: item.active ? 'rgba(239, 68, 68, 0.13)' : 'rgba(34, 197, 94, 0.13)',
                    border: `1px solid ${item.active ? 'rgba(239, 68, 68, 0.5)' : 'rgba(34, 197, 94, 0.5)'}`,
                    borderRadius: '8px',
                    color: item.active ? 'var(--re-ink)' : 'var(--g-ink)',
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
                {/* *** THE ONLY ICON-ONLY CONTROL IN THIS LIST, AND axe COUNTED
                    ONE PER ROW. *** Every sibling carries visible text ("Pause",
                    "Activate"); this one is a bare trash glyph, so a screen
                    reader announced eight buttons called "button". Named per
                    item, because eight identical "Delete"s are barely better. */}
                <button
                  aria-label={`Delete ${item.description}`}
                  onClick={() => handleDelete(item.id)}
                  style={{
                    padding: '8px',
                    /* Matches the Pause button beside it — see above. */
                    background: 'rgba(239, 68, 68, 0.13)',
                    border: '1px solid rgba(239, 68, 68, 0.5)',
                    borderRadius: '8px',
                    color: 'var(--re-ink)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}

          {/* *** THE GROUND: WHAT LEAVES EVERY MONTH BEFORE ANY DECISION. ***
              The dashboard's range draws a ground line and this is the figure
              under it, so the two screens are telling one story — which is
              only true because the ADDING is done by `groundHeight()` in
              `mountainGeometry.ts` rather than by a second sum written here.
              That helper had a test file and NO production caller at all until
              now; a parallel total would have been D-101, two places computing
              one presentation, which is exactly how two screens drift apart.

              *** AND ROWS IT CANNOT CONVERT ARE NAMED, NOT SILENTLY DROPPED.
              *** `frequency` is an unconstrained column, so a fifth value can
              exist. Excluding one without saying so would print a ground that
              is quietly too low — a figure the user would have no way to
              question. */}
          {recurring.length > 0 && (() => {
            const convertible = recurring
              .filter((item) => item.active && item.transaction_type !== 'income')
              .map((item) => ({ item, monthly: monthlyEquivalent(item.amount, item.frequency) }));
            const known = convertible.filter((r) => r.monthly !== null);
            const unknown = convertible.filter((r) => r.monthly === null);
            if (!known.length) return null;
            const ground = groundHeight({ recurringMonthly: known.map((r) => r.monthly as number) });
            const currency = known[0].item.currency_code;

            return (
              <div style={{
                marginTop: '4px',
                padding: '20px 24px',
                background: 'var(--bg-card)',
                border: '1px solid var(--border-light)',
                borderRadius: '12px',
              }}>
                <div className="fp-hint" style={{
                  fontSize: '10.5px', letterSpacing: '0.1em', textTransform: 'uppercase',
                  fontWeight: 600, margin: 0,
                }}>
                  The ground
                </div>
                <div style={{
                  fontSize: '23px', fontWeight: 600, marginTop: '3px',
                  color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums',
                }}>
                  {money(ground, currency)}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  a month before you climb anything
                  {/* Only the rows that are ON count: an inactive row is not
                      leaving your account, and income is not ground. */}
                  {' · '}from {known.length} active {known.length === 1 ? 'row' : 'rows'}
                </div>
                {unknown.length > 0 && (
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px' }}>
                    Not counted, because finPal cannot turn their schedule into a
                    monthly figure: {unknown.map((r) => r.item.description).join(', ')}.
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};
