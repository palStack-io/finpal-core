import React, { useState, useEffect } from 'react';
import { Wallet, DollarSign, FileText, AlertCircle, Check, Palette } from 'lucide-react';
import { accountService } from '../../services/accountService';
import { useToast } from '../../contexts/ToastContext';
import { teamService } from '../../services/teamService';
import { TeamMember } from '../../types/team';
import { formActionsStyle, iconInlineStyle, inputStyle, labelStyle } from '../../styles/formStyles';
import { flexRowGap8, flexRowGap12, flexRowBetween, flexColGap12, flexColGap16, flexColGap20, sectionHeaderStyle, pageContainerStyle, pageMaxWidthStyle, cardStyle, tableStyle } from '../../styles/layoutStyles';
import { apiErrorMessage } from '../../utils/apiError';

interface EditAccountFormProps {
  account: any;
  onSuccess: () => void;
  onCancel: () => void;
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
  switch(type) {
    case 'checking': return 'var(--accent-blue)';
    case 'savings': return 'var(--brand-green-glow)';
    case 'credit': return 'var(--accent-red)';
    case 'investment': return '#8b5cf6';
    case 'cash': return 'var(--accent-yellow)';
    default: return 'var(--accent-blue)';
  }
};

export const EditAccountForm: React.FC<EditAccountFormProps> = ({ account, onSuccess, onCancel }) => {
  const { showToast } = useToast();
  const [formData, setFormData] = useState({
    name: account.name || '',
    type: account.type || 'checking',
    balance: account.balance?.toString() || '0',
    currency: account.currency || 'USD',
    institution: account.institution || '',
    accountNumber: account.accountNumber || '',
    description: '',
    color: account.color || getDefaultColorForType(account.type || 'checking'),
    // Prefilled from the row so the control opens showing the current owner rather
    // than defaulting to the signed-in user, which would silently reassign the
    // account on any unrelated edit.
    ownerId: account.ownerId || ''
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [members, setMembers] = useState<TeamMember[]>([]);

  useEffect(() => {
    teamService.getMembers().then(setMembers).catch(() => setMembers([]));
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    const updates: any = { [name]: value };

    // Auto-update color when account type changes
    if (name === 'type') {
      updates.color = getDefaultColorForType(value);
    }

    setFormData(prev => ({ ...prev, ...updates }));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      // Validation
      if (!formData.name.trim()) {
        throw new Error('Account name is required');
      }

      // Call API to update account
      await accountService.updateAccount(account.id, {
        name: formData.name,
        account_type: formData.type,
        balance: parseFloat(formData.balance),
        currency_code: formData.currency,
        institution: formData.institution,
        account_number: formData.accountNumber,
        color: formData.color,
        // Only sent when it names someone, so an edit made while the members list is
        // still loading cannot blank the owner.
        ...(formData.ownerId ? { owner_id: formData.ownerId } : {})
      });

      setSuccess(true);
      showToast('Account updated successfully', 'success');

      // Wait a moment to show success message, then close
      setTimeout(() => {
        onSuccess();
      }, 1000);
    } catch (err: any) {
      // Server's reason first — reassigning an account to a non-member is a
      // reachable 400, and axios's own message is only ever the status code.
      const msg = apiErrorMessage(err, 'Failed to update account');
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };



  return (
    <form onSubmit={handleSubmit} style={flexColGap20}>
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
            borderRadius: '8px'
          }}
        >
          <div style={{ background: 'rgba(134, 239, 172, 0.2)', padding: '8px', borderRadius: '8px' }}>
            <Check size={20} style={{ color: 'var(--brand-light-green)' }} />
          </div>
          <p style={{ color: 'var(--brand-light-green)', fontWeight: '600', fontSize: '14px', margin: 0 }}>
            Account updated successfully!
          </p>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '16px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '8px'
          }}
        >
          <div style={{ background: 'rgba(239, 68, 68, 0.2)', padding: '8px', borderRadius: '8px' }}>
            <AlertCircle size={20} style={{ color: 'var(--accent-red)' }} />
          </div>
          <p className="fp-error-text">{error}</p>
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
          name="name"
          value={formData.name}
          onChange={handleChange}
          placeholder="e.g., Main Checking Account"
          required
          disabled={isSubmitting}
          style={inputStyle}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'var(--brand-main-green)';
            e.currentTarget.style.background = 'var(--input-bg-focus)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'var(--input-border)';
            e.currentTarget.style.background = 'var(--input-bg)';
          }}
        />
      </div>

      {/* Account Type */}
      <div>
        <label style={labelStyle}>Account Type</label>
        <select
          name="type"
          value={formData.type}
          onChange={handleChange}
          disabled={isSubmitting}
          style={{
            ...inputStyle,
            cursor: 'pointer'
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'var(--brand-main-green)';
            e.currentTarget.style.background = 'var(--input-bg-focus)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'var(--input-border)';
            e.currentTarget.style.background = 'var(--input-bg)';
          }}
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

      {/* Balance */}
      <div>
        <label style={labelStyle}>
          <DollarSign size={16} style={iconInlineStyle} />
          Balance *
        </label>
        <input
          type="number"
          name="balance"
          value={formData.balance}
          onChange={handleChange}
          placeholder="0.00"
          step="0.01"
          required
          disabled={isSubmitting}
          style={inputStyle}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'var(--brand-main-green)';
            e.currentTarget.style.background = 'var(--input-bg-focus)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'var(--input-border)';
            e.currentTarget.style.background = 'var(--input-bg)';
          }}
        />
      </div>

      {/* Institution */}
      <div>
        <label style={labelStyle}>Institution</label>
        <input
          type="text"
          name="institution"
          value={formData.institution}
          onChange={handleChange}
          placeholder="e.g., Chase Bank"
          disabled={isSubmitting}
          style={inputStyle}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'var(--brand-main-green)';
            e.currentTarget.style.background = 'var(--input-bg-focus)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'var(--input-border)';
            e.currentTarget.style.background = 'var(--input-bg)';
          }}
        />
      </div>

      {/* Account Number */}
      <div>
        <label style={labelStyle}>Account Number (last 4 digits)</label>
        <input
          type="text"
          name="accountNumber"
          value={formData.accountNumber}
          onChange={handleChange}
          placeholder="e.g., 1234"
          maxLength={4}
          disabled={isSubmitting}
          style={inputStyle}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'var(--brand-main-green)';
            e.currentTarget.style.background = 'var(--input-bg-focus)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'var(--input-border)';
            e.currentTarget.style.background = 'var(--input-bg)';
          }}
        />
      </div>

      {/* Currency */}
      <div>
        <label style={labelStyle}>Currency</label>
        <select
          name="currency"
          value={formData.currency}
          onChange={handleChange}
          disabled={isSubmitting}
          style={{
            ...inputStyle,
            cursor: 'pointer'
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'var(--brand-main-green)';
            e.currentTarget.style.background = 'var(--input-bg-focus)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'var(--input-border)';
            e.currentTarget.style.background = 'var(--input-bg)';
          }}
        >
          <option value="USD" style={{ background: 'var(--bg-primary)' }}>USD ($)</option>
          <option value="EUR" style={{ background: 'var(--bg-primary)' }}>EUR (€)</option>
          <option value="GBP" style={{ background: 'var(--bg-primary)' }}>GBP (£)</option>
          <option value="INR" style={{ background: 'var(--bg-primary)' }}>INR (₹)</option>
          <option value="CAD" style={{ background: 'var(--bg-primary)' }}>CAD (C$)</option>
          <option value="AUD" style={{ background: 'var(--bg-primary)' }}>AUD (A$)</option>
        </select>
      </div>

      {/*
        Owner. Reassigning an account moves every transaction on it to the new member
        for attribution purposes, which is why the caption says so rather than leaving
        it to be discovered from a changed dashboard figure.
      */}
      {members.length > 1 && (
        <div>
          <label htmlFor="edit-account-owner" style={labelStyle}>Belongs to</label>
          <select
            id="edit-account-owner"
            name="ownerId"
            value={formData.ownerId}
            onChange={handleChange}
            disabled={isSubmitting}
            style={{ ...inputStyle, cursor: 'pointer' }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'var(--brand-main-green)';
              e.currentTarget.style.background = 'var(--input-bg-focus)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--input-border)';
              e.currentTarget.style.background = 'var(--input-bg)';
            }}
          >
            {members.map((member) => (
              <option key={member.id} value={member.id}
                      style={{ background: 'var(--bg-primary)' }}>
                {member.name}
              </option>
            ))}
          </select>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
            Moving this account also moves its transactions to that person.
          </p>
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
              onClick={() => setFormData(prev => ({ ...prev, color: color.value }))}
              disabled={isSubmitting}
              style={{
                padding: '12px',
                background: color.value,
                border: formData.color === color.value ? '3px solid white' : '1px solid var(--border-medium)',
                borderRadius: '8px',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                transition: 'all 0.3s',
                position: 'relative',
                opacity: isSubmitting ? 0.5 : 1
              }}
              onMouseEnter={(e) => {
                if (!isSubmitting && formData.color !== color.value) {
                  e.currentTarget.style.transform = 'scale(1.1)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isSubmitting) {
                  e.currentTarget.style.transform = 'scale(1)';
                }
              }}
            >
              {formData.color === color.value && (
                <Check size={20} style={{ color: 'white', position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />
              )}
            </button>
          ))}
        </div>
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
            opacity: isSubmitting ? 0.5 : 1
          }}
          onMouseEnter={(e) => {
            if (!isSubmitting) {
              e.currentTarget.style.background = 'rgba(71, 85, 105, 0.5)';
            }
          }}
          onMouseLeave={(e) => {
            if (!isSubmitting) {
              e.currentTarget.style.background = 'rgba(71, 85, 105, 0.3)';
            }
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
            opacity: isSubmitting ? 0.7 : 1
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
          {isSubmitting ? 'Updating...' : 'Update Account'}
        </button>
      </div>
    </form>
  );
};
