import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Wallet, DollarSign, FileText, AlertCircle, Check, Palette, CreditCard } from 'lucide-react';
import { accountService } from '../../services/accountService';
import { useToast } from '../../contexts/ToastContext';
import { pointspalService, WalletCard } from '../../modules/pointspal/service';
import { errorTextStyle, formActionsStyle, iconInlineStyle, inputStyle, labelStyle } from '../../styles/formStyles';
import { flexRowGap8, flexRowGap12, flexRowBetween, flexColGap12, flexColGap16, flexColGap20, sectionHeaderStyle, pageContainerStyle, pageMaxWidthStyle, cardStyle, tableStyle } from '../../styles/layoutStyles';

interface AddAccountFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

interface AccountFormValues {
  name: string;
  type: string;
  balance: string;
  currency: string;
  description: string;
  color: string;
}

const ACCOUNT_COLORS = [
  { value: 'var(--accent-blue)', label: 'Blue' },
  { value: 'var(--brand-green-glow)', label: 'Green' },
  { value: 'var(--accent-red)', label: 'Red' },
  { value: '#8b5cf6', label: 'Purple' },
  { value: 'var(--accent-yellow)', label: 'Orange' },
  { value: '#ec4899', label: 'Pink' },
  { value: '#06b6d4', label: 'Cyan' },
  { value: '#eab308', label: 'Yellow' },
];

const getDefaultColorForType = (type: string): string => {
  switch (type) {
    case 'checking': return 'var(--accent-blue)';
    case 'savings': return 'var(--brand-green-glow)';
    case 'credit': return 'var(--accent-red)';
    case 'investment': return '#8b5cf6';
    case 'cash': return 'var(--accent-yellow)';
    default: return 'var(--accent-blue)';
  }
};

export const AddAccountForm: React.FC<AddAccountFormProps> = ({ onSuccess, onCancel }) => {
  const { showToast } = useToast();
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<AccountFormValues>({
    defaultValues: {
      name: '',
      type: 'checking',
      balance: '',
      currency: 'USD',
      description: '',
      color: 'var(--accent-blue)',
    },
  });

  const watchType = watch('type');
  const watchColor = watch('color');

  const [apiError, setApiError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [walletCards, setWalletCards] = useState<WalletCard[]>([]);
  const [selectedCardId, setSelectedCardId] = useState<number | ''>('');

  useEffect(() => {
    setValue('color', getDefaultColorForType(watchType));
  }, [watchType, setValue]);

  useEffect(() => {
    if (watchType === 'credit') {
      pointspalService.getCards().then(setWalletCards).catch(() => setWalletCards([]));
    }
  }, [watchType]);

  const onSubmit = async (data: AccountFormValues) => {
    setApiError(null);
    try {
      const newAccount = await accountService.createAccount({
        name: data.name,
        account_type: data.type,
        balance: parseFloat(data.balance),
        currency_code: data.currency,
        color: data.color,
      });

      if (data.type === 'credit' && selectedCardId && newAccount?.id) {
        const externalId = `manual-${newAccount.id}`;
        try {
          await accountService.updateAccount(newAccount.id, { external_id: externalId });
          await pointspalService.createCardLink({
            simplefin_account_id: externalId,
            user_card_id: selectedCardId as number,
            is_credit_card: true,
            simplefin_account_name: data.name,
          });
        } catch {
          showToast('Account created but pointsPal linking failed. Link it manually from pointsPal.', 'error');
        }
      }

      setSuccess(true);
      showToast('Account created successfully', 'success');
      setTimeout(() => { onSuccess(); }, 1000);
    } catch (err) {
      const msg = (err as { message?: string }).message || 'Failed to create account';
      setApiError(msg);
      showToast('Failed to create account', 'error');
    }
  };




  const focusHandlers = {
    onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      e.currentTarget.style.borderColor = 'var(--brand-main-green)';
      e.currentTarget.style.background = 'var(--input-bg-focus)';
    },
    onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      e.currentTarget.style.borderColor = 'var(--input-border)';
      e.currentTarget.style.background = 'var(--input-bg)';
    },
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} style={flexColGap20}>
      {/* Success Message */}
      {success && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '16px',
            background: 'rgba(134, 239, 172, 0.1)',
            border: '1px solid rgba(134, 239, 172, 0.3)',
            borderRadius: '8px',
          }}
        >
          <div style={{ background: 'rgba(134, 239, 172, 0.2)', padding: '8px', borderRadius: '8px' }}>
            <Check size={20} style={{ color: 'var(--brand-light-green)' }} />
          </div>
          <p style={{ color: 'var(--brand-light-green)', fontWeight: '600', fontSize: '14px', margin: 0 }}>
            Account created successfully!
          </p>
        </div>
      )}

      {/* API Error Message */}
      {apiError && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '16px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '8px',
          }}
        >
          <div style={{ background: 'rgba(239, 68, 68, 0.2)', padding: '8px', borderRadius: '8px' }}>
            <AlertCircle size={20} style={{ color: 'var(--accent-red)' }} />
          </div>
          <p style={{ color: 'var(--accent-red)', fontSize: '14px', margin: 0 }}>{apiError}</p>
        </div>
      )}

      {/* Account Name */}
      <div>
        <label style={labelStyle}>
          <Wallet size={16} style={iconInlineStyle} />
          Account Name *
        </label>
        <input
          type="text"
          placeholder="e.g., Main Checking Account"
          disabled={isSubmitting}
          style={inputStyle}
          {...focusHandlers}
          {...register('name', { required: 'Account name is required' })}
        />
        {errors.name && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
            <AlertCircle size={14} style={{ color: 'var(--accent-red)', flexShrink: 0 }} />
            <p style={errorTextStyle}>{errors.name.message}</p>
          </div>
        )}
      </div>

      {/* Account Type */}
      <div>
        <label style={labelStyle}>Account Type</label>
        <select
          disabled={isSubmitting}
          style={{ ...inputStyle, cursor: 'pointer' }}
          {...focusHandlers}
          {...register('type')}
        >
          <option value="checking" style={{ background: 'var(--bg-primary)' }}>Checking Account</option>
          <option value="savings" style={{ background: 'var(--bg-primary)' }}>Savings Account</option>
          <option value="credit" style={{ background: 'var(--bg-primary)' }}>Credit Card</option>
          <option value="cash" style={{ background: 'var(--bg-primary)' }}>Cash</option>
          <option value="investment" style={{ background: 'var(--bg-primary)' }}>Investment</option>
          <option value="loan" style={{ background: 'var(--bg-primary)' }}>Loan</option>
          <option value="other" style={{ background: 'var(--bg-primary)' }}>Other</option>
        </select>
      </div>

      {/* Initial Balance */}
      <div>
        <label style={labelStyle}>
          <DollarSign size={16} style={iconInlineStyle} />
          Initial Balance *
        </label>
        <input
          type="number"
          placeholder="0.00"
          step="0.01"
          disabled={isSubmitting}
          style={inputStyle}
          {...focusHandlers}
          {...register('balance', {
            required: 'Balance is required',
            min: { value: 0, message: 'Balance must be 0 or greater' },
          })}
        />
        {errors.balance && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
            <AlertCircle size={14} style={{ color: 'var(--accent-red)', flexShrink: 0 }} />
            <p style={errorTextStyle}>{errors.balance.message}</p>
          </div>
        )}
      </div>

      {/* Currency */}
      <div>
        <label style={labelStyle}>Currency</label>
        <select
          disabled={isSubmitting}
          style={{ ...inputStyle, cursor: 'pointer' }}
          {...focusHandlers}
          {...register('currency')}
        >
          <option value="USD" style={{ background: 'var(--bg-primary)' }}>USD ($)</option>
          <option value="EUR" style={{ background: 'var(--bg-primary)' }}>EUR (€)</option>
          <option value="GBP" style={{ background: 'var(--bg-primary)' }}>GBP (£)</option>
          <option value="INR" style={{ background: 'var(--bg-primary)' }}>INR (₹)</option>
          <option value="CAD" style={{ background: 'var(--bg-primary)' }}>CAD (C$)</option>
          <option value="AUD" style={{ background: 'var(--bg-primary)' }}>AUD (A$)</option>
        </select>
      </div>

      {/* pointsPal rewards card link (credit only) */}
      {watchType === 'credit' && (
        <div style={{ padding: '14px 16px', background: 'rgba(21,128,61,0.05)', border: '1px solid rgba(21,128,61,0.2)', borderRadius: '8px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '600', fontSize: '14px', color: 'var(--text-primary)', marginBottom: '8px' }}>
            <CreditCard size={16} style={{ color: 'var(--brand-main-green)' }} />
            Link to pointsPal Rewards Card
          </label>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 10px' }}>
            Linking lets pointsPal automatically track points earned on this account's transactions.
          </p>
          <select
            value={selectedCardId}
            onChange={(e) => setSelectedCardId(e.target.value === '' ? '' : parseInt(e.target.value))}
            disabled={isSubmitting}
            style={{ ...inputStyle, cursor: 'pointer' }}
          >
            <option value="">Don't link (set up later in pointsPal)</option>
            {walletCards.map((c) => (
              <option key={c.id} value={c.id}>
                {c.card_name}{c.last_four ? ` (···${c.last_four})` : ''}{c.program ? ` — ${c.program}` : ''}
              </option>
            ))}
          </select>
          {walletCards.length === 0 && (
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '6px 0 0' }}>
              No cards in your wallet yet — add cards in pointsPal first.
            </p>
          )}
        </div>
      )}

      {/* Color Picker */}
      <div>
        <label style={labelStyle}>
          <Palette size={16} style={iconInlineStyle} />
          Account Color
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
          {ACCOUNT_COLORS.map((color) => (
            <button
              key={color.value}
              type="button"
              onClick={() => setValue('color', color.value)}
              disabled={isSubmitting}
              style={{
                padding: '12px',
                background: color.value,
                border: watchColor === color.value ? '3px solid white' : '1px solid var(--border-medium)',
                borderRadius: '8px',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                transition: 'all 0.3s',
                position: 'relative',
                opacity: isSubmitting ? 0.5 : 1,
              }}
              onMouseEnter={(e) => {
                if (!isSubmitting && watchColor !== color.value) {
                  e.currentTarget.style.transform = 'scale(1.1)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isSubmitting) {
                  e.currentTarget.style.transform = 'scale(1)';
                }
              }}
            >
              {watchColor === color.value && (
                <Check size={20} style={{ color: 'white', position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Description */}
      <div>
        <label style={labelStyle}>
          <FileText size={16} style={iconInlineStyle} />
          Description
        </label>
        <textarea
          placeholder="Add notes about this account..."
          rows={3}
          disabled={isSubmitting}
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
          {...focusHandlers}
          {...register('description')}
        />
      </div>

      {/* Action Buttons */}
      <div style={formActionsStyle}>
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          style={{
            flex: 1,
            padding: '14px 24px',
            background: 'rgba(71, 85, 105, 0.3)',
            border: '1px solid var(--border-light)',
            borderRadius: '8px',
            color: 'var(--text-primary)',
            fontSize: '15px',
            fontWeight: '600',
            cursor: isSubmitting ? 'not-allowed' : 'pointer',
            transition: 'all 0.3s',
            opacity: isSubmitting ? 0.5 : 1,
          }}
          onMouseEnter={(e) => {
            if (!isSubmitting) e.currentTarget.style.background = 'rgba(71, 85, 105, 0.5)';
          }}
          onMouseLeave={(e) => {
            if (!isSubmitting) e.currentTarget.style.background = 'rgba(71, 85, 105, 0.3)';
          }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          style={{
            flex: 1,
            padding: '14px 24px',
            background: isSubmitting ? 'rgba(21, 128, 61, 0.5)' : 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
            border: '1px solid rgba(21, 128, 61, 0.5)',
            borderRadius: '8px',
            color: 'white',
            fontSize: '15px',
            fontWeight: '600',
            cursor: isSubmitting ? 'not-allowed' : 'pointer',
            transition: 'all 0.3s',
            opacity: isSubmitting ? 0.7 : 1,
          }}
          onMouseEnter={(e) => {
            if (!isSubmitting) {
              e.currentTarget.style.transform = 'scale(1.02)';
              e.currentTarget.style.boxShadow = '0 8px 16px rgba(21, 128, 61, 0.3)';
            }
          }}
          onMouseLeave={(e) => {
            if (!isSubmitting) {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = 'none';
            }
          }}
        >
          {isSubmitting ? 'Creating...' : 'Create Account'}
        </button>
      </div>
    </form>
  );
};
