import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Power, PowerOff, Zap, AlertCircle, Check, X, Play, BarChart3, RefreshCw } from 'lucide-react';
import { transactionRulesApi, TransactionRule, CreateRuleData } from '../services/api/transactionRules';
import { categoriesApi, Category } from '../services/api/categories';
import { accountService, Account } from '../services/accountService';
import { Modal } from './Modal';

export const TransactionRules: React.FC = () => {
  const [rules, setRules] = useState<TransactionRule[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [editingRule, setEditingRule] = useState<TransactionRule | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [applyingRules, setApplyingRules] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [rulesData, categoriesData, accountsData, statsData] = await Promise.all([
        transactionRulesApi.getAll(),
        categoriesApi.getAll().catch(() => ({ categories: [] })),
        accountService.getAccounts().catch(() => []),
        transactionRulesApi.getStats().catch(() => null)
      ]);

      setRules(rulesData.rules);
      setCategories(categoriesData.categories || []);
      setAccounts(accountsData || []);
      setStats(statsData?.stats || null);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load rules');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (rule: TransactionRule) => {
    try {
      await transactionRulesApi.update(rule.id, { active: !rule.active });
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to toggle rule');
    }
  };

  const handleDelete = async (ruleId: number) => {
    if (!confirm('Are you sure you want to delete this rule?')) return;

    try {
      await transactionRulesApi.delete(ruleId);
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete rule');
    }
  };

  const handleEdit = (rule: TransactionRule) => {
    setEditingRule(rule);
    setShowAddPanel(true);
  };

  const handleClosePanel = () => {
    setShowAddPanel(false);
    setEditingRule(null);
  };

  const handleSuccess = () => {
    handleClosePanel();
    loadData();
  };

  const handleBulkApply = async () => {
    if (!confirm('This will apply all active rules to your existing transactions. This may update categories for many transactions. Continue?')) {
      return;
    }

    try {
      setApplyingRules(true);
      setError(null);
      const result = await transactionRulesApi.bulkApply();

      if (result.success) {
        setSuccessMessage(`Successfully applied rules to ${result.transactions_updated} of ${result.transactions_processed} transactions`);
        setTimeout(() => setSuccessMessage(null), 5000);
        loadData(); // Reload to get updated match counts
      } else {
        setError(result.error || 'Failed to apply rules');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to apply rules');
    } finally {
      setApplyingRules(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
        Loading rules...
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Zap size={24} style={{ color: '#fbbf24' }} />
            Transaction Rules
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
            Automatically categorize and organize transactions based on patterns
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={handleBulkApply}
            disabled={applyingRules || rules.length === 0}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 24px',
              background: applyingRules ? 'rgba(251, 191, 36, 0.3)' : 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
              border: '1px solid rgba(251, 191, 36, 0.5)',
              borderRadius: '8px',
              color: 'var(--text-primary)',
              fontSize: '14px',
              fontWeight: '600',
              cursor: applyingRules || rules.length === 0 ? 'not-allowed' : 'pointer',
              transition: 'all 0.3s',
              opacity: applyingRules || rules.length === 0 ? 0.5 : 1
            }}
            onMouseEnter={(e) => {
              if (!applyingRules && rules.length > 0) {
                e.currentTarget.style.transform = 'scale(1.05)';
                e.currentTarget.style.boxShadow = '0 8px 16px rgba(251, 191, 36, 0.3)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            {applyingRules ? <RefreshCw size={20} className="animate-spin" /> : <Play size={20} />}
            {applyingRules ? 'Applying...' : 'Apply to All Transactions'}
          </button>
          <button
            onClick={() => setShowAddPanel(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 24px',
              background: 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
              border: '1px solid rgba(21, 128, 61, 0.5)',
              borderRadius: '8px',
              color: 'var(--text-primary)',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.3s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.05)';
              e.currentTarget.style.boxShadow = '0 8px 16px rgba(21, 128, 61, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <Plus size={20} />
            Add Rule
          </button>
        </div>
      </div>

      {/* Success Message */}
      {successMessage && (
        <div style={{ padding: '16px', background: 'rgba(134, 239, 172, 0.1)', border: '1px solid rgba(134, 239, 172, 0.3)', borderRadius: '8px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Check size={20} style={{ color: '#86efac' }} />
          <p style={{ color: '#86efac', margin: 0 }}>{successMessage}</p>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div style={{ padding: '16px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <AlertCircle size={20} style={{ color: '#ef4444' }} />
          <p style={{ color: '#ef4444', margin: 0 }}>{error}</p>
        </div>
      )}

      {/* Stats Dashboard */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          <div style={{ padding: '20px', background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid rgba(134, 239, 172, 0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <BarChart3 size={20} style={{ color: '#86efac' }} />
              <h3 style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0 }}>Total Rules</h3>
            </div>
            <p style={{ fontSize: '28px', fontWeight: 'bold', color: 'var(--text-primary)', margin: 0 }}>{stats.total_rules}</p>
          </div>
          <div style={{ padding: '20px', background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid rgba(251, 191, 36, 0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <Zap size={20} style={{ color: '#fbbf24' }} />
              <h3 style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0 }}>Active Rules</h3>
            </div>
            <p style={{ fontSize: '28px', fontWeight: 'bold', color: 'var(--text-primary)', margin: 0 }}>{stats.active_rules}</p>
          </div>
          <div style={{ padding: '20px', background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <Check size={20} style={{ color: '#3b82f6' }} />
              <h3 style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0 }}>Total Matches</h3>
            </div>
            <p style={{ fontSize: '28px', fontWeight: 'bold', color: 'var(--text-primary)', margin: 0 }}>{stats.total_matches}</p>
          </div>
        </div>
      )}

      {/* Rules List */}
      {rules.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
          <Zap size={48} style={{ color: 'var(--text-muted)', margin: '0 auto 16px', opacity: 0.5 }} />
          <p style={{ fontSize: '18px', marginBottom: '8px', color: 'var(--text-primary)' }}>No rules yet</p>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Create your first rule to automatically organize transactions</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {rules.map((rule) => (
            <div
              key={rule.id}
              style={{
                background: 'var(--bg-card)',
                backdropFilter: 'blur(12px)',
                border: `1px solid ${rule.active ? 'rgba(134, 239, 172, 0.2)' : 'var(--border-light)'}`,
                borderRadius: '12px',
                padding: '20px',
                transition: 'all 0.3s',
                opacity: rule.active ? 1 : 0.6
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  {/* Rule Name and Status */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--text-primary)', margin: 0 }}>
                      {rule.name}
                    </h3>
                    {rule.active ? (
                      <span style={{ padding: '4px 12px', background: 'rgba(134, 239, 172, 0.2)', border: '1px solid rgba(134, 239, 172, 0.3)', borderRadius: '12px', fontSize: '12px', color: '#86efac', fontWeight: '600' }}>
                        Active
                      </span>
                    ) : (
                      <span style={{ padding: '4px 12px', background: 'rgba(100, 116, 139, 0.2)', border: '1px solid rgba(100, 116, 139, 0.3)', borderRadius: '12px', fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600' }}>
                        Inactive
                      </span>
                    )}
                  </div>

                  {/* Pattern Info */}
                  <div style={{ marginBottom: '16px' }}>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '4px' }}>
                      <strong>Pattern:</strong> "{rule.pattern}" {rule.is_regex && '(regex)'} {!rule.case_sensitive && '(case insensitive)'}
                    </p>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '4px' }}>
                      <strong>Field:</strong> {rule.pattern_field}
                    </p>
                    {(rule.amount_min !== undefined || rule.amount_max !== undefined) && (
                      <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '4px' }}>
                        <strong>Amount:</strong>{' '}
                        {rule.amount_min !== undefined && `Min: $${rule.amount_min}`}
                        {rule.amount_min !== undefined && rule.amount_max !== undefined && ' - '}
                        {rule.amount_max !== undefined && `Max: $${rule.amount_max}`}
                      </p>
                    )}
                    {rule.transaction_type_filter && (
                      <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                        <strong>Type Filter:</strong> {rule.transaction_type_filter}
                      </p>
                    )}
                    {rule.is_system && (
                      <span style={{ padding: '4px 12px', background: 'rgba(59, 130, 246, 0.2)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '12px', fontSize: '12px', color: '#3b82f6', fontWeight: '600', marginTop: '8px', display: 'inline-block' }}>
                        Default Rule
                      </span>
                    )}
                  </div>

                  {/* Actions Applied */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                    {rule.auto_category && (
                      <span style={{ padding: '6px 12px', background: 'rgba(251, 191, 36, 0.2)', border: '1px solid rgba(251, 191, 36, 0.3)', borderRadius: '6px', fontSize: '13px', color: '#fbbf24' }}>
                        → Category: {rule.auto_category}
                      </span>
                    )}
                    {rule.auto_account && (
                      <span style={{ padding: '6px 12px', background: 'rgba(59, 130, 246, 0.2)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '6px', fontSize: '13px', color: '#3b82f6' }}>
                        → Account: {rule.auto_account}
                      </span>
                    )}
                    {rule.auto_transaction_type && (
                      <span style={{ padding: '6px 12px', background: 'rgba(139, 92, 246, 0.2)', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '6px', fontSize: '13px', color: '#8b5cf6' }}>
                        → Type: {rule.auto_transaction_type}
                      </span>
                    )}
                  </div>

                  {/* Stats */}
                  <div style={{ display: 'flex', gap: '16px', fontSize: '13px', color: 'var(--text-muted)' }}>
                    <span>Matched: {rule.match_count} times</span>
                    <span>Priority: {rule.priority}</span>
                    {rule.last_matched && <span>Last matched: {new Date(rule.last_matched).toLocaleDateString()}</span>}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '8px', marginLeft: '16px' }}>
                  <button
                    onClick={() => handleToggleActive(rule)}
                    style={{
                      padding: '8px',
                      background: rule.active ? 'rgba(239, 68, 68, 0.1)' : 'rgba(134, 239, 172, 0.1)',
                      border: rule.active ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(134, 239, 172, 0.3)',
                      borderRadius: '6px',
                      color: rule.active ? '#ef4444' : '#86efac',
                      cursor: 'pointer',
                      transition: 'all 0.3s',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                    title={rule.active ? 'Deactivate' : 'Activate'}
                  >
                    {rule.active ? <PowerOff size={16} /> : <Power size={16} />}
                  </button>
                  <button
                    onClick={() => handleEdit(rule)}
                    style={{
                      padding: '8px',
                      background: 'rgba(251, 191, 36, 0.1)',
                      border: '1px solid rgba(251, 191, 36, 0.3)',
                      borderRadius: '6px',
                      color: '#fbbf24',
                      cursor: 'pointer',
                      transition: 'all 0.3s',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                    title="Edit"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(rule.id)}
                    style={{
                      padding: '8px',
                      background: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      borderRadius: '6px',
                      color: '#ef4444',
                      cursor: 'pointer',
                      transition: 'all 0.3s',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                    title="Delete"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Rule Modal */}
      <Modal
        isOpen={showAddPanel}
        onClose={handleClosePanel}
        title={editingRule ? 'Edit Rule' : 'Add New Rule'}
        maxWidth="700px"
      >
        <RuleForm
          rule={editingRule}
          categories={categories}
          accounts={accounts}
          onSuccess={handleSuccess}
          onCancel={handleClosePanel}
        />
      </Modal>
    </div>
  );
};

// Rule Form Component
interface RuleFormProps {
  rule?: TransactionRule | null;
  categories: Category[];
  accounts: Account[];
  onSuccess: () => void;
  onCancel: () => void;
}

const RuleForm: React.FC<RuleFormProps> = ({ rule, categories, accounts, onSuccess, onCancel }) => {
  const [formData, setFormData] = useState<CreateRuleData>({
    name: rule?.name || '',
    pattern: rule?.pattern || '',
    pattern_field: rule?.pattern_field || 'description',
    is_regex: rule?.is_regex || false,
    case_sensitive: rule?.case_sensitive || false,
    amount_min: rule?.amount_min,
    amount_max: rule?.amount_max,
    transaction_type_filter: rule?.transaction_type_filter,
    auto_category_id: rule?.auto_category_id,
    auto_account_id: rule?.auto_account_id,
    auto_transaction_type: rule?.auto_transaction_type,
    auto_tags: rule?.auto_tags || [],
    auto_notes: rule?.auto_notes || '',
    priority: rule?.priority || 50,
    active: rule?.active !== undefined ? rule.active : true
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;

    let finalValue: any = value;
    if (type === 'checkbox') {
      finalValue = checked;
    } else if (type === 'number') {
      finalValue = value === '' ? undefined : parseFloat(value);
    } else if (value === '') {
      finalValue = undefined;
    }

    setFormData(prev => ({
      ...prev,
      [name]: finalValue
    }));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      if (!formData.name.trim()) {
        throw new Error('Rule name is required');
      }
      if (!formData.pattern.trim()) {
        throw new Error('Pattern is required');
      }

      if (rule) {
        await transactionRulesApi.update(rule.id, formData);
      } else {
        await transactionRulesApi.create(formData);
      }

      setSuccess(true);
      setTimeout(() => {
        onSuccess();
      }, 1000);
    } catch (err: any) {
      setError(err.message || err.response?.data?.error || 'Failed to save rule');
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 16px',
    background: 'var(--input-bg)',
    border: '1px solid var(--border-light)',
    borderRadius: '8px',
    color: 'var(--text-primary)',
    fontSize: '14px',
    outline: 'none',
    transition: 'all 0.3s'
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    color: 'var(--text-primary)',
    fontSize: '14px',
    fontWeight: '600',
    marginBottom: '8px'
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {success && (
        <div style={{ padding: '16px', background: 'rgba(134, 239, 172, 0.1)', border: '1px solid rgba(134, 239, 172, 0.3)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Check size={20} style={{ color: '#86efac' }} />
          <p style={{ color: '#86efac', margin: 0 }}>Rule saved successfully!</p>
        </div>
      )}

      {error && (
        <div style={{ padding: '16px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <AlertCircle size={20} style={{ color: '#ef4444' }} />
          <p style={{ color: '#ef4444', margin: 0 }}>{error}</p>
        </div>
      )}

      <div>
        <label style={labelStyle}>Rule Name *</label>
        <input
          type="text"
          name="name"
          value={formData.name}
          onChange={handleChange}
          placeholder="e.g., Netflix Auto-Categorization"
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

      <div>
        <label style={labelStyle}>Pattern to Match *</label>
        <input
          type="text"
          name="pattern"
          value={formData.pattern}
          onChange={handleChange}
          placeholder="e.g., starbucks, netflix, amazon"
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

      <div>
        <label style={labelStyle}>Match Field</label>
        <select
          name="pattern_field"
          value={formData.pattern_field}
          onChange={handleChange}
          disabled={isSubmitting}
          style={{ ...inputStyle, cursor: 'pointer' }}
        >
          <option value="description">Transaction Description/Name</option>
          <option value="amount">Amount</option>
        </select>
      </div>

      <div style={{ display: 'flex', gap: '16px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            name="is_regex"
            checked={formData.is_regex}
            onChange={handleChange}
            disabled={isSubmitting}
            style={{ width: '18px', height: '18px', cursor: 'pointer' }}
          />
          Use Regular Expression
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            name="case_sensitive"
            checked={formData.case_sensitive}
            onChange={handleChange}
            disabled={isSubmitting}
            style={{ width: '18px', height: '18px', cursor: 'pointer' }}
          />
          Case Sensitive
        </label>
      </div>

      <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '20px' }}>
        <h3 style={{ color: 'var(--text-primary)', fontSize: '16px', marginBottom: '16px' }}>Advanced Matching</h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
          <div>
            <label style={labelStyle}>Minimum Amount</label>
            <input
              type="number"
              step="0.01"
              name="amount_min"
              value={formData.amount_min || ''}
              onChange={handleChange}
              placeholder="e.g., 10.00"
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

          <div>
            <label style={labelStyle}>Maximum Amount</label>
            <input
              type="number"
              step="0.01"
              name="amount_max"
              value={formData.amount_max || ''}
              onChange={handleChange}
              placeholder="e.g., 100.00"
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
        </div>

        <div>
          <label style={labelStyle}>Transaction Type Filter</label>
          <select
            name="transaction_type_filter"
            value={formData.transaction_type_filter || ''}
            onChange={handleChange}
            disabled={isSubmitting}
            style={{ ...inputStyle, cursor: 'pointer' }}
          >
            <option value="">All Types</option>
            <option value="expense">Expense Only</option>
            <option value="income">Income Only</option>
            <option value="transfer">Transfer Only</option>
          </select>
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '20px' }}>
        <h3 style={{ color: 'var(--text-primary)', fontSize: '16px', marginBottom: '16px' }}>Actions to Apply</h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={labelStyle}>Auto-assign Category</label>
            <select
              name="auto_category_id"
              value={formData.auto_category_id || ''}
              onChange={handleChange}
              disabled={isSubmitting}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              <option value="">None</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Auto-assign Account</label>
            <select
              name="auto_account_id"
              value={formData.auto_account_id || ''}
              onChange={handleChange}
              disabled={isSubmitting}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              <option value="">None</option>
              {accounts.map(acc => (
                <option key={acc.id} value={acc.id}>{acc.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Auto-assign Type</label>
            <select
              name="auto_transaction_type"
              value={formData.auto_transaction_type || ''}
              onChange={handleChange}
              disabled={isSubmitting}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              <option value="">None</option>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
              <option value="transfer">Transfer</option>
            </select>
          </div>

          <div>
            <label style={labelStyle}>Priority (higher = runs first)</label>
            <input
              type="number"
              name="priority"
              value={formData.priority}
              onChange={handleChange}
              disabled={isSubmitting}
              style={inputStyle}
            />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              name="active"
              checked={formData.active}
              onChange={handleChange}
              disabled={isSubmitting}
              style={{ width: '18px', height: '18px', cursor: 'pointer' }}
            />
            Rule is Active
          </label>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
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
            color: 'var(--text-primary)',
            fontSize: '15px',
            fontWeight: '600',
            cursor: isSubmitting ? 'not-allowed' : 'pointer',
            transition: 'all 0.3s',
            opacity: isSubmitting ? 0.7 : 1
          }}
        >
          {isSubmitting ? 'Saving...' : (rule ? 'Update Rule' : 'Create Rule')}
        </button>
      </div>
    </form>
  );
};
