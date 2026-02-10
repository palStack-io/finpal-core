import React, { useState, useEffect } from 'react';
import { X, AlertCircle, Check, Sparkles } from 'lucide-react';
import { transactionsApi, Transaction } from '../../services/api/transactions';
import { transactionRulesApi, CreateRuleData } from '../../services/api/transactionRules';
import { categoriesApi, Category } from '../../services/api/categories';
import { accountService, Account } from '../../services/accountService';
import { useToast } from '../../contexts/ToastContext';

interface EditTransactionModalProps {
  transaction: Transaction;
  onClose: () => void;
  onSuccess: () => void;
}

export const EditTransactionModal: React.FC<EditTransactionModalProps> = ({
  transaction,
  onClose,
  onSuccess
}) => {
  const { showToast } = useToast();
  const [formData, setFormData] = useState({
    description: transaction.description || '',
    amount: transaction.amount?.toString() || '',
    date: transaction.date?.split('T')[0] || new Date().toISOString().split('T')[0],
    category_id: transaction.category_id?.toString() || '',
    account_id: transaction.account_id?.toString() || '',
    transaction_type: transaction.transaction_type || 'expense',
    notes: transaction.notes || ''
  });

  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showRuleSuggestion, setShowRuleSuggestion] = useState(false);
  const [suggestedRule, setSuggestedRule] = useState<any>(null);
  const [isCreatingRule, setIsCreatingRule] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    // Check if there are changes
    const changed =
      formData.description !== (transaction.description || '') ||
      formData.amount !== (transaction.amount?.toString() || '') ||
      formData.category_id !== (transaction.category_id?.toString() || '') ||
      formData.account_id !== (transaction.account_id?.toString() || '') ||
      formData.transaction_type !== (transaction.transaction_type || 'expense');

    setHasChanges(changed);
  }, [formData, transaction]);

  const loadData = async () => {
    try {
      const [categoriesData, accountsData] = await Promise.all([
        categoriesApi.getAll().catch(() => ({ categories: [] })),
        accountService.getAccounts().catch(() => [])
      ]);

      setCategories(categoriesData.categories || []);
      setAccounts(accountsData || []);
    } catch (err) {
      console.error('Error loading form data:', err);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const updateData: any = {
        description: formData.description,
        amount: parseFloat(formData.amount),
        date: formData.date,
        transaction_type: formData.transaction_type,
        notes: formData.notes
      };

      if (formData.category_id) {
        updateData.category_id = parseInt(formData.category_id);
      }
      if (formData.account_id) {
        updateData.account_id = parseInt(formData.account_id);
      }

      await transactionsApi.update(transaction.id, updateData);
      setSuccess(true);

      // Show rule suggestion if category was changed
      if (hasChanges && formData.category_id && formData.category_id !== transaction.category_id?.toString()) {
        try {
          const suggestion = await transactionRulesApi.getSuggestion(
            transaction.id,
            parseInt(formData.category_id)
          );

          if (suggestion.success && suggestion.suggestion) {
            setSuggestedRule(suggestion.suggestion);
            setShowRuleSuggestion(true);
          } else {
            // No suggestion available, just close
            setTimeout(() => {
              onSuccess();
              onClose();
            }, 1000);
          }
        } catch (err) {
          console.error('Failed to get rule suggestion:', err);
          // Just close on error
          setTimeout(() => {
            onSuccess();
            onClose();
          }, 1000);
        }
      } else {
        setTimeout(() => {
          onSuccess();
          onClose();
        }, 1000);
      }
    } catch (err: any) {
      setError(err.message || err.response?.data?.error || 'Failed to update transaction');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateRule = async () => {
    setIsCreatingRule(true);
    try {
      const ruleData: CreateRuleData = suggestedRule || {
        name: `Auto-categorize "${formData.description}" as ${categories.find(c => c.id.toString() === formData.category_id)?.name}`,
        pattern: formData.description,
        pattern_field: 'description',
        is_regex: false,
        case_sensitive: false,
        auto_category_id: parseInt(formData.category_id),
        active: true,
        priority: 50
      };

      if (formData.account_id && !ruleData.auto_account_id) {
        ruleData.auto_account_id = parseInt(formData.account_id);
      }

      await transactionRulesApi.create(ruleData);

      showToast('Rule created successfully! Future transactions will be automatically categorized.', 'success', 5000);

      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1000);
    } catch (err: any) {
      setError('Failed to create rule: ' + (err.response?.data?.error || err.message));
      setIsCreatingRule(false);
    }
  };

  const handleSkipRule = () => {
    onSuccess();
    onClose();
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 16px',
    background: 'var(--input-bg)',
    border: '1px solid var(--input-border)',
    borderRadius: '8px',
    color: 'var(--text-primary)',
    fontSize: '14px',
    outline: 'none'
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    color: 'var(--text-primary)',
    fontSize: '14px',
    fontWeight: '600',
    marginBottom: '8px'
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'var(--overlay-bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px'
    }}>
      <div style={{
        background: 'var(--bg-card)',
        borderRadius: '16px',
        maxWidth: '600px',
        width: '100%',
        maxHeight: '90vh',
        overflow: 'auto',
        border: '1px solid var(--border-light)'
      }}>
        {/* Header */}
        <div style={{
          padding: '24px',
          borderBottom: '1px solid var(--border-light)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h2 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            Edit Transaction
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '8px'
            }}
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '24px' }}>
          {/* Success Message */}
          {success && !showRuleSuggestion && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '16px',
              background: 'rgba(134, 239, 172, 0.1)',
              border: '1px solid rgba(134, 239, 172, 0.3)',
              borderRadius: '8px',
              marginBottom: '20px'
            }}>
              <Check size={20} style={{ color: '#86efac' }} />
              <p style={{ color: '#86efac', fontWeight: '600', fontSize: '14px', margin: 0 }}>
                Transaction updated successfully!
              </p>
            </div>
          )}

          {/* Rule Suggestion */}
          {showRuleSuggestion && (
            <div style={{
              padding: '20px',
              background: 'rgba(251, 191, 36, 0.1)',
              border: '1px solid rgba(251, 191, 36, 0.3)',
              borderRadius: '12px',
              marginBottom: '20px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                <Sparkles size={24} style={{ color: '#fbbf24' }} />
                <h3 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)', margin: 0 }}>
                  Create a Rule?
                </h3>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '16px' }}>
                Would you like to automatically apply these changes to similar transactions in the future?
              </p>
              <div style={{
                background: 'var(--input-bg)',
                padding: '12px',
                borderRadius: '8px',
                marginBottom: '16px'
              }}>
                <p style={{ color: 'var(--text-primary)', fontSize: '13px', margin: 0 }}>
                  <strong>Pattern:</strong> "{formData.description}"
                </p>
                <p style={{ color: 'var(--text-primary)', fontSize: '13px', margin: '8px 0 0 0' }}>
                  <strong>Auto-assign:</strong> {categories.find(c => c.id.toString() === formData.category_id)?.name}
                  {formData.account_id && ` → ${accounts.find(a => a.id.toString() === formData.account_id)?.name}`}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={handleSkipRule}
                  disabled={isCreatingRule}
                  style={{
                    flex: 1,
                    padding: '12px',
                    background: 'var(--btn-secondary-bg)',
                    border: '1px solid var(--btn-secondary-border)',
                    borderRadius: '8px',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: isCreatingRule ? 'not-allowed' : 'pointer'
                  }}
                >
                  No, thanks
                </button>
                <button
                  onClick={handleCreateRule}
                  disabled={isCreatingRule}
                  style={{
                    flex: 1,
                    padding: '12px',
                    background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                    border: '1px solid rgba(251, 191, 36, 0.5)',
                    borderRadius: '8px',
                    color: '#0f172a',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: isCreatingRule ? 'not-allowed' : 'pointer'
                  }}
                >
                  {isCreatingRule ? 'Creating...' : 'Yes, create rule'}
                </button>
              </div>
            </div>
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
              <AlertCircle size={20} style={{ color: '#ef4444' }} />
              <p style={{ color: '#ef4444', fontSize: '14px', margin: 0 }}>{error}</p>
            </div>
          )}

          {!showRuleSuggestion && (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Description */}
              <div>
                <label style={labelStyle}>Description *</label>
                <input
                  type="text"
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  required
                  disabled={isSubmitting}
                  style={inputStyle}
                />
              </div>

              {/* Amount */}
              <div>
                <label style={labelStyle}>Amount *</label>
                <input
                  type="number"
                  name="amount"
                  value={formData.amount}
                  onChange={handleChange}
                  step="0.01"
                  min="0"
                  required
                  disabled={isSubmitting}
                  style={inputStyle}
                />
              </div>

              {/* Date */}
              <div>
                <label style={labelStyle}>Date</label>
                <input
                  type="date"
                  name="date"
                  value={formData.date}
                  onChange={handleChange}
                  disabled={isSubmitting}
                  style={inputStyle}
                />
              </div>

              {/* Category */}
              <div>
                <label style={labelStyle}>Category</label>
                <select
                  name="category_id"
                  value={formData.category_id}
                  onChange={handleChange}
                  disabled={isSubmitting}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                >
                  <option value="">Select a category (optional)</option>
                  {categories.map(category => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Account */}
              <div>
                <label style={labelStyle}>Account</label>
                <select
                  name="account_id"
                  value={formData.account_id}
                  onChange={handleChange}
                  disabled={isSubmitting}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                >
                  <option value="">Select an account (optional)</option>
                  {accounts.map(account => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Notes */}
              <div>
                <label style={labelStyle}>Notes</label>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleChange}
                  rows={3}
                  disabled={isSubmitting}
                  style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  style={{
                    flex: 1,
                    padding: '14px 24px',
                    background: 'var(--btn-secondary-bg)',
                    border: '1px solid var(--btn-secondary-border)',
                    borderRadius: '8px',
                    color: 'var(--text-primary)',
                    fontSize: '15px',
                    fontWeight: '600',
                    cursor: isSubmitting ? 'not-allowed' : 'pointer'
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
                    cursor: isSubmitting ? 'not-allowed' : 'pointer'
                  }}
                >
                  {isSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
