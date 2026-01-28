import React, { useState, useEffect } from 'react';
import { DollarSign, Calendar, Tag, FileText, AlertCircle, Check, Wallet, Users } from 'lucide-react';
import { transactionsApi, Transaction } from '../../services/api/transactions';
import { categoriesApi, Category } from '../../services/api/categories';
import { groupsApi, Group } from '../../services/api/groups';
import { accountService, Account } from '../../services/accountService';

interface AddTransactionFormProps {
  transaction?: Transaction; // Optional transaction for editing
  onSuccess: () => void;
  onCancel: () => void;
}

export const AddTransactionForm: React.FC<AddTransactionFormProps> = ({ transaction, onSuccess, onCancel }) => {
  const [formData, setFormData] = useState({
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
    notes: transaction?.notes || '',
    split_value: transaction?.split_value?.toString() || ''
  });

  const [categorySplits, setCategorySplits] = useState<Array<{category_id: string, amount: string, percentage: string}>>([]);
  const [memberSplits, setMemberSplits] = useState<{[key: string]: string}>({});

  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loadingData, setLoadingData] = useState(true);

  // Load categories, accounts, and groups on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoadingData(true);
        const [categoriesData, accountsData, groupsData] = await Promise.all([
          categoriesApi.getAll().catch(() => ({ categories: [] })),
          accountService.getAccounts().catch(() => []),
          groupsApi.getAll().catch(() => ({ groups: [] }))
        ]);

        setCategories(categoriesData.categories || []);
        setAccounts(accountsData || []);
        setGroups(groupsData.groups || []);
      } catch (err) {
        console.error('Error loading form data:', err);
      } finally {
        setLoadingData(false);
      }
    };

    loadData();
  }, []);

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
      // Validation
      if (!formData.name.trim()) {
        throw new Error('Transaction name is required');
      }
      if (!formData.amount || parseFloat(formData.amount) <= 0) {
        throw new Error('Amount must be greater than 0');
      }

      // Prepare data for API
      const transactionData: any = {
        description: formData.name,
        amount: parseFloat(formData.amount),
        date: formData.date,
        transaction_type: formData.type,
        currency_code: 'USD', // TODO: Get from user settings or account
        notes: formData.notes || formData.description
      };

      // Add optional fields if provided
      if (formData.category_id) {
        transactionData.category_id = parseInt(formData.category_id);
      }
      if (formData.account_id) {
        transactionData.account_id = parseInt(formData.account_id);
      }
      if (formData.group_id) {
        transactionData.group_id = parseInt(formData.group_id);
        transactionData.split_method = formData.split_method;

        // Add split_value for non-equal splits
        if (formData.split_value && formData.split_method !== 'equal') {
          transactionData.split_value = parseFloat(formData.split_value);
        }
      }

      // Add destination account for transfers
      if (formData.type === 'transfer' && formData.destination_account_id) {
        transactionData.destination_account_id = parseInt(formData.destination_account_id);
      }

      // Add category splits if present
      if (categorySplits.length > 0) {
        const validSplits = categorySplits.filter(s => s.category_id && s.amount);
        if (validSplits.length > 0) {
          transactionData.category_splits = validSplits.reduce((acc, split) => {
            acc[split.category_id] = parseFloat(split.amount);
            return acc;
          }, {} as {[key: string]: number});
          transactionData.has_category_splits = true;
        }
      }

      // Update or create based on whether transaction prop exists
      if (transaction) {
        await transactionsApi.update(transaction.id, transactionData);
      } else {
        await transactionsApi.create(transactionData);
      }
      setSuccess(true);

      // Wait a moment to show success message, then close
      setTimeout(() => {
        onSuccess();
      }, 1000);
    } catch (err: any) {
      setError(err.message || err.response?.data?.error || 'Failed to create transaction');
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 16px',
    background: 'rgba(15, 23, 42, 0.5)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '8px',
    color: 'white',
    fontSize: '14px',
    outline: 'none',
    transition: 'all 0.3s'
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    color: 'white',
    fontSize: '14px',
    fontWeight: '600',
    marginBottom: '8px'
  };

  if (loadingData) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
        Loading form data...
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
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
            <Check size={20} style={{ color: '#86efac' }} />
          </div>
          <p style={{ color: '#86efac', fontWeight: '600', fontSize: '14px', margin: 0 }}>
            Transaction created successfully!
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
            <AlertCircle size={20} style={{ color: '#ef4444' }} />
          </div>
          <p style={{ color: '#ef4444', fontSize: '14px', margin: 0 }}>{error}</p>
        </div>
      )}

      {/* Transaction Type */}
      <div>
        <label style={labelStyle}>Transaction Type</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={() => setFormData(prev => ({ ...prev, type: 'expense' }))}
            style={{
              flex: 1,
              padding: '10px',
              background: formData.type === 'expense' ? 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)' : 'rgba(15, 23, 42, 0.5)',
              border: `1px solid ${formData.type === 'expense' ? 'rgba(220, 38, 38, 0.5)' : 'rgba(255, 255, 255, 0.1)'}`,
              borderRadius: '8px',
              color: 'white',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.3s'
            }}
          >
            Expense
          </button>
          <button
            type="button"
            onClick={() => setFormData(prev => ({ ...prev, type: 'income' }))}
            style={{
              flex: 1,
              padding: '10px',
              background: formData.type === 'income' ? 'linear-gradient(135deg, #15803d 0%, #166534 100%)' : 'rgba(15, 23, 42, 0.5)',
              border: `1px solid ${formData.type === 'income' ? 'rgba(21, 128, 61, 0.5)' : 'rgba(255, 255, 255, 0.1)'}`,
              borderRadius: '8px',
              color: 'white',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.3s'
            }}
          >
            Income
          </button>
          <button
            type="button"
            onClick={() => setFormData(prev => ({ ...prev, type: 'transfer' }))}
            style={{
              flex: 1,
              padding: '10px',
              background: formData.type === 'transfer' ? 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)' : 'rgba(15, 23, 42, 0.5)',
              border: `1px solid ${formData.type === 'transfer' ? 'rgba(59, 130, 246, 0.5)' : 'rgba(255, 255, 255, 0.1)'}`,
              borderRadius: '8px',
              color: 'white',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.3s'
            }}
          >
            Transfer
          </button>
        </div>
      </div>

      {/* Transaction Name */}
      <div>
        <label style={labelStyle}>
          <FileText size={16} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle' }} />
          Transaction Name *
        </label>
        <input
          type="text"
          name="name"
          value={formData.name}
          onChange={handleChange}
          placeholder="e.g., Grocery shopping"
          required
          disabled={isSubmitting}
          style={inputStyle}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'rgba(21, 128, 61, 0.5)';
            e.currentTarget.style.background = 'rgba(15, 23, 42, 0.8)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
            e.currentTarget.style.background = 'rgba(15, 23, 42, 0.5)';
          }}
        />
      </div>

      {/* Amount */}
      <div>
        <label style={labelStyle}>
          <DollarSign size={16} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle' }} />
          Amount *
        </label>
        <input
          type="number"
          name="amount"
          value={formData.amount}
          onChange={handleChange}
          placeholder="0.00"
          step="0.01"
          min="0"
          required
          disabled={isSubmitting}
          style={inputStyle}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'rgba(21, 128, 61, 0.5)';
            e.currentTarget.style.background = 'rgba(15, 23, 42, 0.8)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
            e.currentTarget.style.background = 'rgba(15, 23, 42, 0.5)';
          }}
        />
      </div>

      {/* Date */}
      <div>
        <label style={labelStyle}>
          <Calendar size={16} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle' }} />
          Date
        </label>
        <input
          type="date"
          name="date"
          value={formData.date}
          onChange={handleChange}
          disabled={isSubmitting}
          style={inputStyle}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'rgba(21, 128, 61, 0.5)';
            e.currentTarget.style.background = 'rgba(15, 23, 42, 0.8)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
            e.currentTarget.style.background = 'rgba(15, 23, 42, 0.5)';
          }}
        />
      </div>

      {/* Category */}
      <div>
        <label style={labelStyle}>
          <Tag size={16} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle' }} />
          Category
        </label>
        <select
          name="category_id"
          value={formData.category_id}
          onChange={handleChange}
          disabled={isSubmitting}
          style={{
            ...inputStyle,
            cursor: 'pointer'
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'rgba(21, 128, 61, 0.5)';
            e.currentTarget.style.background = 'rgba(15, 23, 42, 0.8)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
            e.currentTarget.style.background = 'rgba(15, 23, 42, 0.5)';
          }}
        >
          <option value="" style={{ background: '#0f172a' }}>Select a category (optional)</option>
          {categories.map(category => (
            <option key={category.id} value={category.id} style={{ background: '#0f172a' }}>
              {category.name}
            </option>
          ))}
        </select>
      </div>

      {/* Account */}
      <div>
        <label style={labelStyle}>
          <Wallet size={16} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle' }} />
          {formData.type === 'transfer' ? 'From Account *' : 'Account'}
        </label>
        <select
          name="account_id"
          value={formData.account_id}
          onChange={handleChange}
          disabled={isSubmitting}
          required={formData.type === 'transfer'}
          style={{
            ...inputStyle,
            cursor: 'pointer'
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'rgba(21, 128, 61, 0.5)';
            e.currentTarget.style.background = 'rgba(15, 23, 42, 0.8)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
            e.currentTarget.style.background = 'rgba(15, 23, 42, 0.5)';
          }}
        >
          <option value="" style={{ background: '#0f172a' }}>
            {formData.type === 'transfer' ? 'Select source account' : 'Select an account (optional)'}
          </option>
          {accounts.map(account => (
            <option key={account.id} value={account.id} style={{ background: '#0f172a' }}>
              {account.name} ({account.currency_code || 'USD'})
            </option>
          ))}
        </select>
      </div>

      {/* Destination Account (for transfers only) */}
      {formData.type === 'transfer' && (
        <div>
          <label style={labelStyle}>
            <Wallet size={16} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle' }} />
            To Account *
          </label>
          <select
            name="destination_account_id"
            value={formData.destination_account_id}
            onChange={handleChange}
            disabled={isSubmitting}
            required
            style={{
              ...inputStyle,
              cursor: 'pointer'
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.5)';
              e.currentTarget.style.background = 'rgba(15, 23, 42, 0.8)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.background = 'rgba(15, 23, 42, 0.5)';
            }}
          >
            <option value="" style={{ background: '#0f172a' }}>Select destination account</option>
            {accounts
              .filter(account => account.id.toString() !== formData.account_id)
              .map(account => (
                <option key={account.id} value={account.id} style={{ background: '#0f172a' }}>
                  {account.name} ({account.currency_code || 'USD'})
                </option>
              ))}
          </select>
          <p style={{ color: '#64748b', fontSize: '12px', marginTop: '8px' }}>
            Transfer money from one account to another
          </p>
        </div>
      )}

      {/* Group (for split expenses) */}
      <div>
        <label style={labelStyle}>
          <Users size={16} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle' }} />
          Group (Split Expense)
        </label>
        <select
          name="group_id"
          value={formData.group_id}
          onChange={handleChange}
          disabled={isSubmitting}
          style={{
            ...inputStyle,
            cursor: 'pointer'
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'rgba(21, 128, 61, 0.5)';
            e.currentTarget.style.background = 'rgba(15, 23, 42, 0.8)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
            e.currentTarget.style.background = 'rgba(15, 23, 42, 0.5)';
          }}
        >
          <option value="" style={{ background: '#0f172a' }}>No group (personal expense)</option>
          {groups.map(group => (
            <option key={group.id} value={group.id} style={{ background: '#0f172a' }}>
              {group.name} ({group.members.length} members)
            </option>
          ))}
        </select>
      </div>

      {/* Split Method (shown only if group is selected) */}
      {formData.group_id && (
        <div>
          <label style={labelStyle}>Split Method</label>
          <select
            name="split_method"
            value={formData.split_method}
            onChange={handleChange}
            disabled={isSubmitting}
            style={{
              ...inputStyle,
              cursor: 'pointer'
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'rgba(21, 128, 61, 0.5)';
              e.currentTarget.style.background = 'rgba(15, 23, 42, 0.8)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.background = 'rgba(15, 23, 42, 0.5)';
            }}
          >
            <option value="equal" style={{ background: '#0f172a' }}>Split Equally</option>
            <option value="percentage" style={{ background: '#0f172a' }}>By Percentage</option>
            <option value="custom" style={{ background: '#0f172a' }}>Custom Amounts</option>
            <option value="shares" style={{ background: '#0f172a' }}>By Shares</option>
          </select>
          <p style={{ color: '#64748b', fontSize: '12px', marginTop: '8px' }}>
            {formData.split_method === 'equal' && 'Expense will be split equally among all group members'}
            {formData.split_method === 'percentage' && 'Specify percentage for each member'}
            {formData.split_method === 'custom' && 'Specify exact amount for each member'}
            {formData.split_method === 'shares' && 'Specify shares for each member (e.g., 1:2:3)'}
          </p>

          {/* Split Value Input (for percentage, custom, shares) */}
          {(formData.split_method === 'percentage' || formData.split_method === 'shares') && (
            <div style={{ marginTop: '16px' }}>
              <label style={labelStyle}>
                {formData.split_method === 'percentage' ? 'Your Percentage (%)' : 'Your Shares'}
              </label>
              <input
                type="number"
                name="split_value"
                value={formData.split_value}
                onChange={handleChange}
                placeholder={formData.split_method === 'percentage' ? '50' : '1'}
                step={formData.split_method === 'percentage' ? '0.01' : '1'}
                min="0"
                max={formData.split_method === 'percentage' ? '100' : undefined}
                disabled={isSubmitting}
                style={inputStyle}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(21, 128, 61, 0.5)';
                  e.currentTarget.style.background = 'rgba(15, 23, 42, 0.8)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                  e.currentTarget.style.background = 'rgba(15, 23, 42, 0.5)';
                }}
              />
              <p style={{ color: '#64748b', fontSize: '12px', marginTop: '8px' }}>
                {formData.split_method === 'percentage'
                  ? 'Enter the percentage you want to pay (other members split the rest)'
                  : 'Enter number of shares (e.g., if you enter 2 and others have 1, you pay double)'}
              </p>
            </div>
          )}

          {formData.split_method === 'custom' && (
            <div style={{ marginTop: '16px' }}>
              <label style={labelStyle}>Your Amount ($)</label>
              <input
                type="number"
                name="split_value"
                value={formData.split_value}
                onChange={handleChange}
                placeholder="0.00"
                step="0.01"
                min="0"
                disabled={isSubmitting}
                style={inputStyle}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(21, 128, 61, 0.5)';
                  e.currentTarget.style.background = 'rgba(15, 23, 42, 0.8)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                  e.currentTarget.style.background = 'rgba(15, 23, 42, 0.5)';
                }}
              />
              <p style={{ color: '#64748b', fontSize: '12px', marginTop: '8px' }}>
                Enter the exact amount you want to pay (other members split the rest)
              </p>
            </div>
          )}
        </div>
      )}

      {/* Category Splits Section */}
      {!formData.group_id && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <label style={labelStyle}>Split Across Categories</label>
            <button
              type="button"
              onClick={() => setCategorySplits([...categorySplits, { category_id: '', amount: '', percentage: '' }])}
              disabled={isSubmitting}
              style={{
                padding: '6px 12px',
                background: 'rgba(21, 128, 61, 0.2)',
                border: '1px solid rgba(21, 128, 61, 0.5)',
                borderRadius: '6px',
                color: '#86efac',
                fontSize: '12px',
                fontWeight: '600',
                cursor: isSubmitting ? 'not-allowed' : 'pointer'
              }}
            >
              + Add Category Split
            </button>
          </div>

          {categorySplits.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
              {categorySplits.map((split, index) => (
                <div key={index} style={{
                  display: 'flex',
                  gap: '8px',
                  padding: '12px',
                  background: 'rgba(15, 23, 42, 0.5)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px'
                }}>
                  <select
                    value={split.category_id}
                    onChange={(e) => {
                      const newSplits = [...categorySplits];
                      newSplits[index].category_id = e.target.value;
                      setCategorySplits(newSplits);
                    }}
                    style={{ ...inputStyle, flex: 2 }}
                  >
                    <option value="">Select category</option>
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    placeholder="Amount"
                    value={split.amount}
                    onChange={(e) => {
                      const newSplits = [...categorySplits];
                      newSplits[index].amount = e.target.value;
                      setCategorySplits(newSplits);
                    }}
                    style={{ ...inputStyle, flex: 1 }}
                    step="0.01"
                    min="0"
                  />
                  <button
                    type="button"
                    onClick={() => setCategorySplits(categorySplits.filter((_, i) => i !== index))}
                    style={{
                      padding: '8px 12px',
                      background: 'rgba(239, 68, 68, 0.2)',
                      border: '1px solid rgba(239, 68, 68, 0.5)',
                      borderRadius: '6px',
                      color: '#ef4444',
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
              <p style={{ color: '#64748b', fontSize: '12px' }}>
                Total split: ${categorySplits.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0).toFixed(2)}
                {formData.amount && ` / $${parseFloat(formData.amount).toFixed(2)}`}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Description/Notes */}
      <div>
        <label style={labelStyle}>Notes</label>
        <textarea
          name="description"
          value={formData.description}
          onChange={handleChange}
          placeholder="Add any additional details..."
          rows={3}
          disabled={isSubmitting}
          style={{
            ...inputStyle,
            resize: 'vertical',
            fontFamily: 'inherit'
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'rgba(21, 128, 61, 0.5)';
            e.currentTarget.style.background = 'rgba(15, 23, 42, 0.8)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
            e.currentTarget.style.background = 'rgba(15, 23, 42, 0.5)';
          }}
        />
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          style={{
            flex: 1,
            padding: '14px 24px',
            background: 'rgba(71, 85, 105, 0.3)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '8px',
            color: 'white',
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
          {isSubmitting ? 'Creating...' : 'Create Transaction'}
        </button>
      </div>
    </form>
  );
};
