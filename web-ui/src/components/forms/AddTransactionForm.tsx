import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { Calendar, Tag, FileText, AlertCircle, Check, Wallet, Users } from 'lucide-react';
import { transactionsApi, Transaction } from '../../services/api/transactions';
import { categoriesApi, Category } from '../../services/api/categories';
import { groupsApi, Group } from '../../services/api/groups';
import { accountService, Account } from '../../services/accountService';
import { teamService } from '../../services/teamService';
import { TeamMember } from '../../types/team';
import { useAuthStore } from '../../store/authStore';
import { splitRemainder, rowForRemainder } from '../../utils/splitRemainder';
import { errorTextStyle, formActionsStyle, iconInlineStyle, labelStyle } from '../../styles/formStyles';
import { flexRowGap8, flexRowGap12, flexRowBetween, flexColGap12, flexColGap16, flexColGap20, sectionHeaderStyle, pageContainerStyle, pageMaxWidthStyle, cardStyle, tableStyle } from '../../styles/layoutStyles';
import { apiErrorMessage } from '../../utils/apiError';
import { getBranding } from '../../config/branding';
import { parseMoneyInput } from '../../styles/money';

interface AddTransactionFormProps {
  transaction?: Transaction;
  onSuccess: () => void;
  onCancel: () => void;
}

interface TransactionFormValues {
  name: string;
  description: string;
  amount: string;
  date: string;
  category_id: string;
  type: 'income' | 'expense' | 'transfer';
  account_id: string;
  destination_account_id: string;
  group_id: string;
  split_method: string;
  split_value: string;
}

interface TransactionPayload {
  description: string;
  amount: number;
  date: string;
  transaction_type: string;
  currency_code: string;
  notes?: string;
  category_id?: number;
  account_id?: number;
  group_id?: number;
  split_method?: string;
  split_value?: number;
  destination_account_id?: number;
  category_splits?: Record<string, number>;
  has_category_splits?: boolean;
}

const bgPrimaryStyle: React.CSSProperties = { background: 'var(--bg-primary)' };
const hintTextStyle: React.CSSProperties = { color: 'var(--text-muted)', fontSize: '12px', marginTop: '8px' };

export const AddTransactionForm: React.FC<AddTransactionFormProps> = ({ transaction, onSuccess, onCancel }) => {
  // Cleared on unmount -- see the deferral below.
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (successTimer.current) clearTimeout(successTimer.current);
  }, []);

  const userCurrency = useAuthStore((s) => s.user?.default_currency_code ?? 'USD');
  /**
   * The symbol for the currency this form is actually working in — the selected account's
   * if one is chosen, otherwise the profile default. #126: the label was a hardcoded `$`.
   */
  const currencySymbol = getBranding(userCurrency).currencySymbol;
  /**
   * `Intl.NumberFormat` rather than a symbol table: this is a browser, so it is available and
   * correct for every code, and the line it replaces hardcoded `$` regardless of the user's
   * currency. `useMemo` because a formatter per keystroke is wasteful on a form that re-renders
   * on every character.
   */
  const money = useMemo(
    () => new Intl.NumberFormat(undefined, { style: 'currency', currency: userCurrency }),
    [userCurrency]
  );

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<TransactionFormValues>({
    defaultValues: {
      name: transaction?.description || '',
      description: transaction?.notes || '',
      amount: transaction?.amount?.toString() || '',
      date: transaction?.date?.split('T')[0] || new Date().toISOString().split('T')[0],
      category_id: transaction?.category_id?.toString() || '',
      type: (transaction?.transaction_type || 'expense') as 'income' | 'expense' | 'transfer',
      account_id: transaction?.account_id?.toString() || '',
      destination_account_id: transaction?.destination_account_id?.toString() || '',
      group_id: transaction?.group_id?.toString() || '',
      split_method: transaction?.split_method || 'equal',
      split_value: transaction?.split_value?.toString() || '',
    },
  });

  const watchType = watch('type');
  const watchAccountId = watch('account_id');
  const watchGroupId = watch('group_id');
  const watchSplitMethod = watch('split_method');
  const watchAmount = watch('amount');

  /**
   * **Prefilled from the row since AUDIT D-54.** This was unconditionally `[]`,
   * because nothing served a transaction's category splits back — so opening an
   * edit showed no splits on a row that had them, and the server's own refusal
   * ("its amount cannot change without restating the splits") was unanswerable
   * from this form. `TransactionSchema` serves `{category_id: amount}` now, in
   * exactly the shape the payload below sends.
   */
  /*
   * `percentage` used to be a third field here. It was declared, initialised in two places and
   * NEVER read, rendered or sent — the payload builds from `split.amount` alone — so it was dead
   * state that made every reader wonder whether a percentage mode existed. Removed 2026-08-10.
   * (Not to be confused with the GROUP `split_method === 'percentage'` below, which is live.)
   */
  const [categorySplits, setCategorySplits] = useState<Array<{ category_id: string; amount: string }>>(
    () => Object.entries(transaction?.category_splits ?? {}).map(([category_id, amount]) => ({
      category_id,
      // Not reformatted: re-serialising a number the user never touched is how an
      // untouched edit starts changing values.
      amount: String(amount),
    }))
  );
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [apiError, setApiError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoadingData(true);
        const [categoriesData, accountsData, groupsData, membersData] = await Promise.all([
          categoriesApi.getAll().catch(() => ({ categories: [] })),
          accountService.getAccounts().catch(() => []),
          groupsApi.getAll().catch(() => ({ groups: [] })),
          teamService.getMembers().catch(() => []),
        ]);
        setCategories(categoriesData.categories || []);
        setAccounts(accountsData || []);
        setGroups(groupsData.groups || []);
        setMembers(membersData || []);
      } finally {
        setLoadingData(false);
      }
    };
    loadData();
  }, []);

  /**
   * **This is item B of the D-18 build, and the item's own description is
   * misleading.** "Assign a transaction to a member" sounds like a new owner
   * picker on this form. Under the settled model (2026-08-06) attribution comes
   * from the ACCOUNT, so assigning a transaction to Bob means putting it on one of
   * Bob's accounts — and this form already collects `account_id`. A separate
   * per-transaction owner field would reintroduce the two-sources-of-truth problem
   * the model exists to remove, so B is that the picker says whose account each
   * option is, not that it grows a field.
   *
   * The owner goes in the option's text because an `<option>` renders no markup —
   * `OwnerBadge` cannot be used here, which is why this is a string and not a
   * component. Suppressed for a one-member household, matching the badge and the
   * filter: with one member every option would carry the same name.
   */
  const showOwners = members.length > 1;
  const accountLabel = (account: Account) => {
    const currency = account.currency_code || 'USD';
    const owner = showOwners && account.owner ? ` — ${account.owner.name}` : '';
    return `${account.name}${owner} (${currency})`;
  };

  const onSubmit = async (data: TransactionFormValues) => {
    setApiError(null);
    try {
      const payload: TransactionPayload = {
        description: data.name,
        amount: parseMoneyInput(data.amount),
        date: data.date,
        transaction_type: data.type,
        currency_code: accounts.find((a) => a.id === parseInt(data.account_id))?.currency_code ?? userCurrency,
        notes: data.description,
      };

      if (data.category_id) payload.category_id = parseInt(data.category_id);
      if (data.account_id) payload.account_id = parseInt(data.account_id);
      if (data.group_id) {
        payload.group_id = parseInt(data.group_id);
        payload.split_method = data.split_method;
        if (data.split_value && data.split_method !== 'equal') {
          payload.split_value = parseMoneyInput(data.split_value);
        }
      }
      if (data.type === 'transfer' && data.destination_account_id) {
        payload.destination_account_id = parseInt(data.destination_account_id);
      }
      /**
       * **Empty means two opposite things, and only the row tells them apart.**
       *
       * While the editor always opened blank (before D-54), an empty list could
       * only mean "I did not touch them", and omitting the key — which the server
       * reads as "leave them alone" — was right. Prefilled, an empty list on a row
       * that ARRIVED with splits is a deliberate deletion, and omitting would make
       * that deletion silently do nothing. `{}` is what clears them server-side.
       *
       * `has_category_splits` is NOT sent: `TransactionInput` declares it nowhere
       * and the server derives it, so the old line here was a no-op.
       */
      const validSplits = categorySplits.filter((s) => s.category_id && s.amount);
      if (validSplits.length > 0) {
        payload.category_splits = validSplits.reduce((acc, split) => {
          acc[split.category_id] = parseMoneyInput(split.amount);
          return acc;
        }, {} as Record<string, number>);
      } else if (transaction?.has_category_splits) {
        payload.category_splits = {};
      }

      if (transaction) {
        await transactionsApi.update(transaction.id, payload);
      } else {
        await transactionsApi.create(payload);
      }

      setSuccess(true);
      // Held in a ref and cleared on unmount. Without that, a user who navigates away
      // inside this one-second window gets `onSuccess` -- and therefore a setState --
      // on a tree that no longer exists. It also turned CI red on a run where every
      // test passed: the timer fired into a torn-down jsdom and React touched `window`.
      successTimer.current = setTimeout(() => { onSuccess(); }, 1000);
    } catch (err) {
      const e = err as { message?: string; response?: { data?: { error?: string } } };
      setApiError(apiErrorMessage(e, 'Failed to create transaction'));
    }
  };
if (loadingData) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
        Loading form data...
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} style={flexColGap20}>
      {/* Success Message */}
      {success && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', background: 'rgba(134, 239, 172, 0.1)', border: '1px solid rgba(134, 239, 172, 0.3)', borderRadius: '8px' }}>
          <div style={{ background: 'rgba(134, 239, 172, 0.2)', padding: '8px', borderRadius: '8px' }}>
            <Check size={20} style={{ color: 'var(--brand-light-green)' }} />
          </div>
          <p style={{ color: 'var(--brand-light-green)', fontWeight: '600', fontSize: '14px', margin: 0 }}>
            Transaction {transaction ? 'updated' : 'created'} successfully!
          </p>
        </div>
      )}

      {/* API Error */}
      {apiError && (
        <div className="fp-error-banner">
          <div style={{ background: 'rgba(239, 68, 68, 0.2)', padding: '8px', borderRadius: '8px' }}>
            <AlertCircle size={20} style={{ color: 'var(--accent-red)' }} />
          </div>
          <p className="fp-error-text">{apiError}</p>
        </div>
      )}

      {/* Transaction Type */}
      <div>
        <label style={labelStyle}>Transaction Type</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          {(['expense', 'income', 'transfer'] as const).map((t) => {
            const colors = { expense: '#dc2626', income: 'var(--brand-main-green)', transfer: 'var(--accent-blue)' };
            const isActive = watchType === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setValue('type', t)}
                style={{
                  flex: 1,
                  padding: '10px',
                  background: isActive ? `linear-gradient(135deg, ${colors[t]} 0%, ${colors[t]}cc 100%)` : 'var(--input-bg)',
                  border: `1px solid ${isActive ? `${colors[t]}80` : 'var(--input-border)'}`,
                  borderRadius: '8px',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.3s',
                  textTransform: 'capitalize',
                }}
              >
                {t}
              </button>
            );
          })}
        </div>
      </div>

      {/* Transaction Name */}
      <div>
        <label style={labelStyle}>
          <FileText size={16} style={iconInlineStyle} />
          Transaction Name *
        </label>
        <input
          type="text"
          placeholder="e.g., Grocery shopping"
          disabled={isSubmitting}
          className="fp-input"
          {...register('name', { required: 'Transaction name is required' })}
        />
        {errors.name && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
            <AlertCircle size={14} style={{ color: 'var(--accent-red)', flexShrink: 0 }} />
            <p style={errorTextStyle}>{errors.name.message}</p>
          </div>
        )}
      </div>

      {/* Amount */}
      <div>
        <label style={labelStyle}>
          {/* The user's currency symbol, not a dollar glyph. `DollarSign` (a lucide
              icon of a literal $) sat here regardless of the account currency, which is
              the "the icon is still $" half of #126 — the form already knows the currency
              two lines up, it just was not using it for the label. */}
          <span style={{ ...iconInlineStyle, fontWeight: 600 }} aria-hidden="true">
            {currencySymbol}
          </span>
          Amount *
        </label>
        <input
          type="number"
          placeholder="0.00"
          step="0.01"
          min="0"
          disabled={isSubmitting}
          className="fp-input"
          {...register('amount', {
            required: 'Amount is required',
            min: { value: 0.01, message: 'Amount must be greater than 0' },
          })}
        />
        {errors.amount && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
            <AlertCircle size={14} style={{ color: 'var(--accent-red)', flexShrink: 0 }} />
            <p style={errorTextStyle}>{errors.amount.message}</p>
          </div>
        )}
      </div>

      {/* Date */}
      <div>
        <label style={labelStyle}>
          <Calendar size={16} style={iconInlineStyle} />
          Date
        </label>
        <input
          type="date"
          disabled={isSubmitting}
          className="fp-input"
          {...register('date', { required: 'Date is required' })}
        />
        {errors.date && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
            <AlertCircle size={14} style={{ color: 'var(--accent-red)', flexShrink: 0 }} />
            <p style={errorTextStyle}>{errors.date.message}</p>
          </div>
        )}
      </div>

      {/* Category */}
      <div>
        <label style={labelStyle}>
          <Tag size={16} style={iconInlineStyle} />
          Category
        </label>
        <select disabled={isSubmitting} className="fp-input" style={{ cursor: 'pointer' }} {...register('category_id')}>
          <option value="" style={bgPrimaryStyle}>Select a category (optional)</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id} style={bgPrimaryStyle}>
              {category.name}
            </option>
          ))}
        </select>
      </div>

      {/* Account */}
      <div>
        <label style={labelStyle}>
          <Wallet size={16} style={iconInlineStyle} />
          {watchType === 'transfer' ? 'From Account *' : 'Account'}
        </label>
        <select
          disabled={isSubmitting}
          className="fp-input" style={{ cursor: 'pointer' }}
          {...register('account_id', { required: watchType === 'transfer' })}
        >
          <option value="" style={bgPrimaryStyle}>
            {watchType === 'transfer' ? 'Select source account' : 'Select an account (optional)'}
          </option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id} style={bgPrimaryStyle}>
              {accountLabel(account)}
            </option>
          ))}
        </select>
        {showOwners && (
          <p style={hintTextStyle}>
            The account decides whose transaction this is — pick one of theirs to
            record it against a housemate.
          </p>
        )}
      </div>

      {/* Destination Account (transfers only) */}
      {watchType === 'transfer' && (
        <div>
          <label style={labelStyle}>
            <Wallet size={16} style={iconInlineStyle} />
            To Account *
          </label>
          <select
            disabled={isSubmitting}
            className="fp-input" style={{ cursor: 'pointer' }}
            {...register('destination_account_id', { required: watchType === 'transfer' })}
          >
            <option value="" style={bgPrimaryStyle}>Select destination account</option>
            {accounts
              .filter((account) => account.id.toString() !== watchAccountId)
              .map((account) => (
                <option key={account.id} value={account.id} style={bgPrimaryStyle}>
                  {accountLabel(account)}
                </option>
              ))}
          </select>
          <p style={hintTextStyle}>
            Transfer money from one account to another
          </p>
        </div>
      )}

      {/* Group */}
      <div>
        <label style={labelStyle}>
          <Users size={16} style={iconInlineStyle} />
          Group (Split Expense)
        </label>
        <select disabled={isSubmitting} className="fp-input" style={{ cursor: 'pointer' }} {...register('group_id')}>
          <option value="" style={bgPrimaryStyle}>No group (personal expense)</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id} style={bgPrimaryStyle}>
              {group.name} ({group.members.length} members)
            </option>
          ))}
        </select>
      </div>

      {/* Split Method (when group selected) */}
      {watchGroupId && (
        <div>
          <label style={labelStyle}>Split Method</label>
          <select disabled={isSubmitting} className="fp-input" style={{ cursor: 'pointer' }} {...register('split_method')}>
            <option value="equal" style={bgPrimaryStyle}>Split Equally</option>
            <option value="percentage" style={bgPrimaryStyle}>By Percentage</option>
            <option value="custom" style={bgPrimaryStyle}>Custom Amounts</option>
          </select>
          {/* The hints say "you pay" rather than "specify for each member" on purpose: both
              methods collect ONE number — your own share — and divide the remainder equally.
              The old wording promised a per-member breakdown this form has never offered, which
              is what made "Custom Amounts" look broken when it was not (AUDIT D-90, withdrawn).
              "By Shares" is gone entirely: the backend has no shares branch, so it split to
              nobody (D-93). */}
          <p style={hintTextStyle}>
            {watchSplitMethod === 'equal' && 'Split equally among everyone in the group'}
            {watchSplitMethod === 'percentage' && 'You pay a percentage — the other members split the rest'}
            {watchSplitMethod === 'custom' && 'You pay a set amount — the other members split the rest'}
          </p>

          {watchSplitMethod === 'percentage' && (
            <div style={{ marginTop: '16px' }}>
              <label style={labelStyle}>Your Percentage (%)</label>
              <input
                type="number"
                placeholder="50"
                step="0.01"
                min="0"
                max="100"
                disabled={isSubmitting}
                className="fp-input"
                {...register('split_value')}
              />
              <p style={hintTextStyle}>
                Enter the percentage you want to pay (other members split the rest)
              </p>
            </div>
          )}

          {watchSplitMethod === 'custom' && (
            <div style={{ marginTop: '16px' }}>
              <label style={labelStyle}>Your Amount ({currencySymbol})</label>
              <input
                type="number"
                placeholder="0.00"
                step="0.01"
                min="0"
                disabled={isSubmitting}
                className="fp-input"
                {...register('split_value')}
              />
              <p style={hintTextStyle}>
                Enter the exact amount you want to pay (other members split the rest)
              </p>
            </div>
          )}
        </div>
      )}

      {/* Category Splits (when no group) */}
      {!watchGroupId && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <label style={labelStyle}>Split Across Categories</label>
            <button
              type="button"
              onClick={() => setCategorySplits([...categorySplits, { category_id: '', amount: '' }])}
              disabled={isSubmitting}
              style={{ padding: '6px 12px', background: 'rgba(21, 128, 61, 0.2)', border: '1px solid rgba(21, 128, 61, 0.5)', borderRadius: '6px', color: 'var(--brand-light-green)', fontSize: '12px', fontWeight: '600', cursor: isSubmitting ? 'not-allowed' : 'pointer' }}
            >
              + Add Category Split
            </button>
          </div>

          {categorySplits.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
              {categorySplits.map((split, index) => (
                <div key={index} style={{ display: 'flex', gap: '8px', padding: '12px', background: 'var(--input-bg)', border: '1px solid var(--border-light)', borderRadius: '8px' }}>
                  <select
                    value={split.category_id}
                    onChange={(e) => {
                      const updated = [...categorySplits];
                      updated[index].category_id = e.target.value;
                      setCategorySplits(updated);
                    }}
                    className="fp-input" style={{ flex: 2 }}
                  >
                    <option value="">Select category</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    placeholder="Amount"
                    value={split.amount}
                    onChange={(e) => {
                      const updated = [...categorySplits];
                      updated[index].amount = e.target.value;
                      setCategorySplits(updated);
                    }}
                    className="fp-input" style={{ flex: 1 }}
                    step="0.01"
                    min="0"
                  />
                  <button
                    type="button"
                    onClick={() => setCategorySplits(categorySplits.filter((_, i) => i !== index))}
                    style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.2)', border: '1px solid rgba(239, 68, 68, 0.5)', borderRadius: '6px', color: 'var(--accent-red)', fontSize: '12px', cursor: 'pointer' }}
                  >
                    ×
                  </button>
                </div>
              ))}
              {/* *** THE REMAINDER, NOT "TOTAL SPLIT X / Y". *** Owner request: the question at
                  this moment is "how much is left", and this line used to leave the subtraction
                  to the reader — and hardcoded `$` whatever the user's currency was. Clickable
                  while something is left AND a row is empty to take it; `splitTarget` is -1 when
                  every row already holds a number, which stops it overwriting a typed value. */}
              {(() => {
                const split = splitRemainder(watchAmount, categorySplits);
                const splitTarget = rowForRemainder(categorySplits);
                if (!split.shouldShow) return null;
                const canAssign = splitTarget >= 0 && !split.isBalanced && !split.isOver;
                const colour = split.isOver
                  ? 'var(--accent-red)'
                  : split.isBalanced
                    ? 'var(--brand-light-green)'
                    : 'var(--text-muted)';
                const text = split.isOver
                  ? `${money.format(Math.abs(split.remainder))} over`
                  : split.isBalanced
                    ? 'Fully split'
                    : `${money.format(split.remainder)} left to split${canAssign ? ' — click to assign' : ''}`;
                return canAssign ? (
                  <button
                    type="button"
                    data-testid="category-split-remainder"
                    onClick={() => {
                      const updated = [...categorySplits];
                      updated[splitTarget].amount = split.remainder.toFixed(2);
                      setCategorySplits(updated);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      font: 'inherit',
                      fontSize: '12px',
                      color: colour,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    {text}
                  </button>
                ) : (
                  <p data-testid="category-split-remainder" style={{ color: colour, fontSize: '12px' }}>
                    {text}
                  </p>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* Notes */}
      <div>
        <label style={labelStyle}>Notes</label>
        <textarea
          placeholder="Add any additional details..."
          rows={3}
          disabled={isSubmitting}
          className="fp-input" style={{ resize: 'vertical', fontFamily: 'inherit' }}
          {...register('description')}
        />
      </div>

      {/* Action Buttons */}
      <div style={formActionsStyle}>
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          style={{ flex: 1, padding: '14px 24px', background: 'rgba(71, 85, 105, 0.3)', border: '1px solid var(--border-light)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '15px', fontWeight: '600', cursor: isSubmitting ? 'not-allowed' : 'pointer', transition: 'all 0.3s', opacity: isSubmitting ? 0.5 : 1 }}
          onMouseEnter={(e) => { if (!isSubmitting) e.currentTarget.style.background = 'rgba(71, 85, 105, 0.5)'; }}
          onMouseLeave={(e) => { if (!isSubmitting) e.currentTarget.style.background = 'rgba(71, 85, 105, 0.3)'; }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          style={{ flex: 1, padding: '14px 24px', background: isSubmitting ? 'rgba(21, 128, 61, 0.5)' : 'linear-gradient(135deg, #15803d 0%, #166534 100%)', border: '1px solid rgba(21, 128, 61, 0.5)', borderRadius: '8px', color: 'white', fontSize: '15px', fontWeight: '600', cursor: isSubmitting ? 'not-allowed' : 'pointer', transition: 'all 0.3s', opacity: isSubmitting ? 0.7 : 1 }}
          onMouseEnter={(e) => { if (!isSubmitting) { e.currentTarget.style.transform = 'scale(1.02)'; e.currentTarget.style.boxShadow = '0 8px 16px rgba(21, 128, 61, 0.3)'; } }}
          onMouseLeave={(e) => { if (!isSubmitting) { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; } }}
        >
          {isSubmitting ? 'Saving...' : transaction ? 'Update Transaction' : 'Create Transaction'}
        </button>
      </div>
    </form>
  );
};
