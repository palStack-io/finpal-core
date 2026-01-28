import React, { useState, useEffect } from 'react';
import { Plus, Target, TrendingUp, AlertCircle, Edit2, Trash2, Calendar, X, Search, ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { Navigation } from '../components/Navigation';
import { useAuthStore } from '../store/authStore';
import { getBranding } from '../config/branding';
import { budgetService, type Budget } from '../services/budgetService';
import { categoriesApi, type Category } from '../services/api/categories';
import { transactionsApi, type Transaction } from '../services/api/transactions';
import { SlidePanel } from '../components/SlidePanel';
import { AddTransactionForm } from '../components/forms/AddTransactionForm';

interface BudgetWithProgress extends Budget {
  spent: number;
  remaining: number;
  percentage: number;
  category_name?: string;
  category_icon?: string;
  category_color?: string;
  transactions?: Transaction[];
}

interface BudgetFormProps {
  budget: Budget | null;
  categories: Category[];
  onSuccess: () => void;
  onCancel: () => void;
}

const BudgetForm: React.FC<BudgetFormProps> = ({ budget, categories, onSuccess, onCancel }) => {
  const [formData, setFormData] = useState({
    name: budget?.name || '',
    amount: budget?.amount?.toString() || '',
    period: budget?.period || 'monthly' as 'weekly' | 'monthly' | 'yearly',
    category_id: budget?.category_id ? budget.category_id.toString() : '',
    start_date: budget?.start_date ? budget.start_date.split('T')[0] : new Date().toISOString().split('T')[0],
    is_active: budget?.is_active !== undefined ? budget.is_active : true,
    rollover: budget?.rollover || false
  });

  // Update form data when budget prop changes
  useEffect(() => {
    if (budget) {
      setFormData({
        name: budget.name || '',
        amount: budget.amount?.toString() || '',
        period: budget.period || 'monthly',
        category_id: budget.category_id ? budget.category_id.toString() : '',
        start_date: budget.start_date ? budget.start_date.split('T')[0] : new Date().toISOString().split('T')[0],
        is_active: budget.is_active !== undefined ? budget.is_active : true,
        rollover: budget.rollover || false
      });
    }
  }, [budget]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      setFormData(prev => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.category_id) {
      setError('Please select a category');
      return;
    }

    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      setError('Please enter a valid budget amount');
      return;
    }

    try {
      const data: any = {
        name: formData.name || undefined,
        amount: parseFloat(formData.amount),
        period: formData.period,
        category_id: parseInt(formData.category_id),
        start_date: formData.start_date,
        is_active: formData.is_active,
        rollover: formData.rollover
      };

      if (budget?.id) {
        await budgetService.updateBudget(budget.id, data);
      } else {
        await budgetService.createBudget(data);
      }

      setSuccess(true);
      setTimeout(() => {
        onSuccess();
      }, 1000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save budget');
    }
  };

  // Get parent categories for dropdown
  const parentCategories = categories.filter(cat => !cat.parent_id);

  return (
    <form onSubmit={handleSubmit} style={{ padding: '24px' }}>
      <h2 style={{ fontSize: '24px', fontWeight: '600', color: 'white', marginBottom: '24px' }}>
        {budget?.id ? 'Edit Budget' : 'Create Budget'}
      </h2>

      {error && (
        <div style={{
          padding: '12px',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '8px',
          color: '#ef4444',
          marginBottom: '16px',
          fontSize: '14px'
        }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{
          padding: '12px',
          background: 'rgba(34, 197, 94, 0.1)',
          border: '1px solid rgba(34, 197, 94, 0.3)',
          borderRadius: '8px',
          color: '#22c55e',
          marginBottom: '16px',
          fontSize: '14px'
        }}>
          ✓ Budget {budget?.id ? 'updated' : 'created'} successfully!
        </div>
      )}

      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', color: '#94a3b8', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
          Category *
        </label>
        <select
          name="category_id"
          value={formData.category_id}
          onChange={handleChange}
          required
          style={{
            width: '100%',
            padding: '12px',
            background: 'rgba(0, 0, 0, 0.3)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '8px',
            color: 'white',
            fontSize: '14px',
            outline: 'none',
            cursor: 'pointer'
          }}
        >
          <option value="" style={{ background: '#1e293b' }}>Select a category</option>
          {parentCategories.map(cat => (
            <option key={cat.id} value={cat.id} style={{ background: '#1e293b' }}>
              {cat.icon} {cat.name}
            </option>
          ))}
        </select>
        <p style={{ color: '#64748b', fontSize: '12px', marginTop: '4px' }}>
          Budget will track expenses in this category and its subcategories
        </p>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', color: '#94a3b8', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
          Budget Name (optional)
        </label>
        <input
          type="text"
          name="name"
          value={formData.name}
          onChange={handleChange}
          placeholder="e.g., Monthly Food Budget"
          style={{
            width: '100%',
            padding: '12px',
            background: 'rgba(0, 0, 0, 0.3)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '8px',
            color: 'white',
            fontSize: '14px',
            outline: 'none'
          }}
        />
        <p style={{ color: '#64748b', fontSize: '12px', marginTop: '4px' }}>
          If not specified, the category name will be used
        </p>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', color: '#94a3b8', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
          Budget Amount *
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
          style={{
            width: '100%',
            padding: '12px',
            background: 'rgba(0, 0, 0, 0.3)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '8px',
            color: 'white',
            fontSize: '14px',
            outline: 'none'
          }}
        />
      </div>

      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', color: '#94a3b8', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
          Period *
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
          {(['weekly', 'monthly', 'yearly'] as const).map((period) => (
            <button
              key={period}
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, period }))}
              style={{
                padding: '12px',
                background: formData.period === period ? 'rgba(34, 197, 94, 0.2)' : 'rgba(0, 0, 0, 0.3)',
                border: formData.period === period ? '2px solid #22c55e' : '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                color: formData.period === period ? '#22c55e' : '#94a3b8',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.3s',
                textTransform: 'capitalize'
              }}
            >
              {period}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', color: '#94a3b8', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
          Start Date *
        </label>
        <input
          type="date"
          name="start_date"
          value={formData.start_date}
          onChange={handleChange}
          required
          style={{
            width: '100%',
            padding: '12px',
            background: 'rgba(0, 0, 0, 0.3)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '8px',
            color: 'white',
            fontSize: '14px',
            outline: 'none',
            colorScheme: 'dark'
          }}
        />
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            name="is_active"
            checked={formData.is_active}
            onChange={handleChange}
            style={{
              width: '20px',
              height: '20px',
              cursor: 'pointer',
              accentColor: '#22c55e'
            }}
          />
          <span style={{ color: '#94a3b8', fontSize: '14px' }}>Active budget</span>
        </label>
        <p style={{ color: '#64748b', fontSize: '12px', marginTop: '4px', marginLeft: '32px' }}>
          Inactive budgets won't be tracked
        </p>
      </div>

      <div style={{ marginBottom: '24px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            name="rollover"
            checked={formData.rollover || false}
            onChange={handleChange}
            style={{
              width: '20px',
              height: '20px',
              cursor: 'pointer',
              accentColor: '#3b82f6'
            }}
          />
          <span style={{ color: '#94a3b8', fontSize: '14px' }}>Rollover unused budget</span>
        </label>
        <p style={{ color: '#64748b', fontSize: '12px', marginTop: '4px', marginLeft: '32px' }}>
          Carry over unspent budget to the next period to notice debt/overspending
        </p>
      </div>

      <div style={{ display: 'flex', gap: '12px', paddingTop: '20px', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
        <button
          type="submit"
          style={{
            flex: 1,
            padding: '12px 24px',
            background: 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
            border: 'none',
            borderRadius: '8px',
            color: 'white',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.3s'
          }}
        >
          {budget?.id ? 'Update Budget' : 'Create Budget'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: '12px 24px',
            background: 'rgba(255, 255, 255, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '8px',
            color: 'white',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.3s'
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
};

export const Budgets: React.FC = () => {
  const { user } = useAuthStore();
  const branding = getBranding(user?.default_currency_code || 'USD');

  const [budgets, setBudgets] = useState<BudgetWithProgress[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState('month');
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedBudget, setExpandedBudget] = useState<number | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [showTransactionPanel, setShowTransactionPanel] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date());

  useEffect(() => {
    loadData();
  }, [selectedMonth]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [budgetsData, categoriesData, transactionsData] = await Promise.all([
        budgetService.getBudgets(),
        categoriesApi.getAll(),
        transactionsApi.getAll()
      ]);

      // Merge budget data with category data and transactions
      const budgetsWithDetails = budgetsData.map((budget: any) => {
        const category = categoriesData.categories.find(c => c.id === budget.category_id);

        // Get current period dates based on budget period and selected month
        const referenceDate = selectedMonth;
        let startDate: Date;
        let endDate: Date;

        if (budget.period === 'weekly') {
          startDate = new Date(referenceDate);
          startDate.setDate(referenceDate.getDate() - referenceDate.getDay());
          endDate = new Date(startDate);
          endDate.setDate(startDate.getDate() + 6);
        } else if (budget.period === 'yearly') {
          startDate = new Date(referenceDate.getFullYear(), 0, 1);
          endDate = new Date(referenceDate.getFullYear(), 11, 31);
        } else {
          // monthly (default)
          startDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
          endDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0);
        }

        // Filter transactions by category and date range (expense type only)
        const budgetTransactions = (transactionsData?.transactions || [])
          .filter((t: Transaction) => {
            const txDate = new Date(t.date);
            return (
              t.category_id === budget.category_id &&
              t.transaction_type === 'expense' &&
              txDate >= startDate &&
              txDate <= endDate
            );
          })
          .sort((a: Transaction, b: Transaction) => new Date(b.date).getTime() - new Date(a.date).getTime());

        return {
          ...budget,
          category_name: category?.name || 'Unknown',
          category_icon: category?.icon || '📁',
          category_color: category?.color || '#3b82f6',
          transactions: budgetTransactions
        };
      });

      setBudgets(budgetsWithDetails);
      setCategories(categoriesData.categories || []);
    } catch (error) {
      console.error('Failed to load budgets:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this budget?')) return;

    try {
      await budgetService.deleteBudget(id);
      await loadData();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to delete budget');
    }
  };

  const handleEdit = (budget: BudgetWithProgress) => {
    setEditingBudget(budget);
    setShowAddPanel(true);
  };

  const handleAddBudget = () => {
    setEditingBudget(null);
    setShowAddPanel(true);
  };

  const handleClosePanel = () => {
    setShowAddPanel(false);
    setEditingBudget(null);
  };

  const handleSuccess = () => {
    handleClosePanel();
    loadData();
  };

  const handleTransactionClick = (transaction: Transaction) => {
    setEditingTransaction(transaction);
    setShowTransactionPanel(true);
  };

  const handleCloseTransactionPanel = () => {
    setShowTransactionPanel(false);
    setEditingTransaction(null);
  };

  const handleTransactionSuccess = () => {
    handleCloseTransactionPanel();
    loadData();
  };

  const formatCurrency = (amount: number) => {
    return `${branding.currencySymbol}${Math.abs(amount).toFixed(2)}`;
  };

  const getBudgetStatus = (spent: number, budgeted: number) => {
    const percentage = (spent / budgeted) * 100;
    if (percentage >= 100) return { label: 'Over Budget', color: '#ef4444' };
    if (percentage >= 80) return { label: 'Warning', color: '#f59e0b' };
    return { label: 'On Track', color: '#22c55e' };
  };

  // Filter budgets by search term
  const filteredBudgets = budgets.filter(budget =>
    budget.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    budget.category_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalBudgeted = filteredBudgets.reduce((sum, b) => sum + b.amount, 0);
  const totalSpent = filteredBudgets.reduce((sum, b) => sum + b.spent, 0);
  const totalRemaining = totalBudgeted - totalSpent;
  const overallPercentage = totalBudgeted > 0 ? (totalSpent / totalBudgeted) * 100 : 0;

  const budgetsOverLimit = filteredBudgets.filter(b => b.spent > b.amount).length;
  const budgetsOnTrack = filteredBudgets.filter(b => {
    const pct = (b.spent / b.amount) * 100;
    return pct < 80;
  }).length;

  // Calculate days remaining in selected month
  const today = new Date();
  const isCurrentMonth = selectedMonth.getMonth() === today.getMonth() && selectedMonth.getFullYear() === today.getFullYear();
  const lastDayOfMonth = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0);
  const daysLeft = isCurrentMonth ? Math.max(0, lastDayOfMonth.getDate() - today.getDate()) : 0;

  // Helper functions for month navigation
  const goToPreviousMonth = () => {
    setSelectedMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setSelectedMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const goToCurrentMonth = () => {
    setSelectedMonth(new Date());
  };

  const formatMonthYear = (date: Date) => {
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  if (loading) {
    return (
      <>
        <Navigation />
        <div style={{ minHeight: '100vh', background: 'linear-gradient(to bottom, #0f172a, #1e293b)', padding: '24px', paddingLeft: '80px' }}>
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              border: '3px solid rgba(255, 255, 255, 0.1)',
              borderTop: '3px solid #22c55e',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto'
            }} />
            <p style={{ color: '#94a3b8', marginTop: '16px' }}>Loading budgets...</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Navigation />
      <div style={{ minHeight: '100vh', background: 'linear-gradient(to bottom, #0f172a, #1e293b)', padding: '24px', paddingLeft: '80px' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          {/* Header */}
          <div style={{ marginBottom: '32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h1 style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '8px', background: 'linear-gradient(to right, #86efac, #fbbf24)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
                  Budgets
                </h1>
                <p style={{ color: '#94a3b8', fontSize: '14px' }}>Track your spending against your budget goals</p>
              </div>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                {/* Compact Month Navigator */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'rgba(17, 24, 39, 0.6)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  padding: '6px 12px'
                }}>
                  <button
                    onClick={goToPreviousMonth}
                    style={{
                      padding: '4px',
                      background: 'transparent',
                      border: 'none',
                      color: 'white',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      transition: 'all 0.2s',
                      opacity: 0.7
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.7')}
                  >
                    <ChevronLeft size={16} />
                  </button>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: '140px', justifyContent: 'center' }}>
                    <Calendar size={14} color="#86efac" />
                    <span style={{ fontSize: '13px', fontWeight: '500', color: 'white' }}>
                      {formatMonthYear(selectedMonth)}
                    </span>
                  </div>

                  <button
                    onClick={goToNextMonth}
                    style={{
                      padding: '4px',
                      background: 'transparent',
                      border: 'none',
                      color: 'white',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      transition: 'all 0.2s',
                      opacity: 0.7
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.7')}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>

                {!isCurrentMonth && (
                  <button
                    onClick={goToCurrentMonth}
                    style={{
                      padding: '6px 12px',
                      background: 'rgba(134, 239, 172, 0.1)',
                      border: '1px solid rgba(134, 239, 172, 0.3)',
                      borderRadius: '6px',
                      color: '#86efac',
                      fontSize: '12px',
                      cursor: 'pointer',
                      transition: 'all 0.3s',
                      fontWeight: '500'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(134, 239, 172, 0.2)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(134, 239, 172, 0.1)')}
                  >
                    Today
                  </button>
                )}

                <button
                  onClick={handleAddBudget}
                  style={{ padding: '10px 20px', background: '#15803d', border: 'none', borderRadius: '8px', color: 'white', cursor: 'pointer', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.3s' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#166534')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = '#15803d')}
                >
                  <Plus size={16} /> Create Budget
                </button>
              </div>
            </div>
          </div>

          {/* Search */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{ position: 'relative' }}>
              <Search size={20} color="#64748b" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                placeholder="Search budgets..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 12px 12px 44px',
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  color: 'white',
                  fontSize: '14px',
                  outline: 'none'
                }}
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  <X size={20} color="#64748b" />
                </button>
              )}
            </div>
          </div>

          {/* Overall Summary */}
          <div style={{ background: 'rgba(17, 24, 39, 0.8)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '16px', padding: '32px', marginBottom: '32px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '24px', marginBottom: '32px' }}>
              <div>
                <p style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '8px' }}>Total Budgeted</p>
                <h3 style={{ fontSize: '28px', fontWeight: 'bold', color: 'white' }}>{formatCurrency(totalBudgeted)}</h3>
              </div>
              <div>
                <p style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '8px' }}>Total Spent</p>
                <h3 style={{ fontSize: '28px', fontWeight: 'bold', color: '#ef4444' }}>{formatCurrency(totalSpent)}</h3>
              </div>
              <div>
                <p style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '8px' }}>Remaining</p>
                <h3 style={{ fontSize: '28px', fontWeight: 'bold', color: totalRemaining >= 0 ? '#22c55e' : '#ef4444' }}>
                  {formatCurrency(totalRemaining)}
                </h3>
              </div>
              <div>
                <p style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '8px' }}>Overall Progress</p>
                <h3 style={{ fontSize: '28px', fontWeight: 'bold', color: overallPercentage >= 100 ? '#ef4444' : overallPercentage >= 80 ? '#f59e0b' : '#22c55e' }}>
                  {overallPercentage.toFixed(1)}%
                </h3>
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: '#cbd5e1', fontSize: '14px' }}>Overall Budget Progress</span>
                <span style={{ color: '#94a3b8', fontSize: '14px' }}>{formatCurrency(totalSpent)} of {formatCurrency(totalBudgeted)}</span>
              </div>
              <div style={{ width: '100%', height: '12px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '6px', overflow: 'hidden' }}>
                <div style={{
                  width: `${Math.min(overallPercentage, 100)}%`,
                  height: '100%',
                  background: overallPercentage >= 100 ? '#ef4444' : overallPercentage >= 80 ? '#f59e0b' : '#22c55e',
                  transition: 'width 0.3s ease',
                  borderRadius: '6px'
                }}></div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '12px', height: '12px', background: '#22c55e', borderRadius: '3px' }}></div>
                <span style={{ color: '#94a3b8', fontSize: '13px' }}>{budgetsOnTrack} On Track</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '12px', height: '12px', background: '#ef4444', borderRadius: '3px' }}></div>
                <span style={{ color: '#94a3b8', fontSize: '13px' }}>{budgetsOverLimit} Over Budget</span>
              </div>
              {isCurrentMonth && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Calendar size={14} color="#94a3b8" />
                  <span style={{ color: '#94a3b8', fontSize: '13px' }}>{daysLeft} days remaining this month</span>
                </div>
              )}
            </div>
          </div>

          {/* Budget Categories */}
          {filteredBudgets.length === 0 ? (
            <div style={{
              padding: '60px 20px',
              background: 'rgba(17, 24, 39, 0.8)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '12px',
              textAlign: 'center'
            }}>
              <Target size={64} color="#64748b" style={{ margin: '0 auto 16px' }} />
              <p style={{ color: '#94a3b8', fontSize: '16px', marginBottom: '20px' }}>
                {searchTerm ? 'No budgets match your search' : 'No budgets created yet'}
              </p>
              {!searchTerm && (
                <button
                  onClick={handleAddBudget}
                  style={{
                    padding: '12px 24px',
                    background: 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
                    border: 'none',
                    borderRadius: '8px',
                    color: 'white',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <Plus size={20} />
                  Create Your First Budget
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px' }}>
              {filteredBudgets.map((budget) => {
                const percentage = budget.percentage;
                const status = getBudgetStatus(budget.spent, budget.amount);
                const remaining = budget.remaining;
                const isOverBudget = budget.spent > budget.amount;

                const isExpanded = expandedBudget === budget.id;

                return (
                  <div
                    key={budget.id}
                    style={{
                      background: 'rgba(17, 24, 39, 0.8)',
                      backdropFilter: 'blur(8px)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '16px',
                      transition: 'all 0.3s'
                    }}
                  >
                    {/* Header */}
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'start',
                        marginBottom: '20px',
                        padding: '24px',
                        cursor: 'pointer',
                        transition: 'background 0.2s'
                      }}
                      onClick={() => setExpandedBudget(isExpanded ? null : budget.id)}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                        <div style={{
                          width: '48px',
                          height: '48px',
                          background: `${budget.category_color}20`,
                          borderRadius: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '24px',
                          flexShrink: 0
                        }}>
                          {budget.category_icon}
                        </div>
                        <div style={{ flex: 1 }}>
                          <h3 style={{ fontSize: '18px', fontWeight: '600', color: 'white', marginBottom: '4px' }}>
                            {budget.name || budget.category_name}
                          </h3>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{
                              padding: '2px 8px',
                              background: `${status.color}20`,
                              borderRadius: '6px',
                              fontSize: '11px',
                              color: status.color,
                              fontWeight: '600'
                            }}>
                              {status.label}
                            </span>
                            {budget.transactions && budget.transactions.length > 0 && (
                              <span style={{ color: '#64748b', fontSize: '12px' }}>
                                {budget.transactions.length} transaction{budget.transactions.length !== 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                        </div>
                        <div style={{ flexShrink: 0, color: '#64748b' }}>
                          {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '8px', flexShrink: 0, marginLeft: '12px' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEdit(budget);
                          }}
                          style={{
                            padding: '6px',
                            background: 'rgba(255, 255, 255, 0.1)',
                            border: 'none',
                            borderRadius: '6px',
                            color: 'white',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            transition: 'all 0.3s'
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)')}
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(budget.id);
                          }}
                          style={{
                            padding: '6px',
                            background: 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            borderRadius: '6px',
                            color: '#ef4444',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            transition: 'all 0.3s'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                            e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.5)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                            e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.3)';
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Content - Amount Display */}
                    <div style={{ padding: '0 24px', marginBottom: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                        <div>
                          <p style={{ color: '#64748b', fontSize: '12px', marginBottom: '4px' }}>Spent</p>
                          <p style={{ fontSize: '24px', fontWeight: '700', color: isOverBudget ? '#ef4444' : 'white' }}>
                            {formatCurrency(budget.spent)}
                          </p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <p style={{ color: '#64748b', fontSize: '12px', marginBottom: '4px' }}>Budget</p>
                          <p style={{ fontSize: '24px', fontWeight: '700', color: '#94a3b8' }}>
                            {formatCurrency(budget.amount)}
                          </p>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div style={{ marginBottom: '16px' }}>
                        <div style={{ width: '100%', height: '8px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{
                            width: `${Math.min(percentage, 100)}%`,
                            height: '100%',
                            background: isOverBudget ? '#ef4444' : percentage >= 80 ? '#f59e0b' : budget.category_color,
                            transition: 'width 0.3s ease',
                            borderRadius: '4px'
                          }}></div>
                        </div>
                      </div>

                      {/* Stats */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {isOverBudget ? (
                            <>
                              <AlertCircle size={16} color="#ef4444" />
                              <span style={{ color: '#ef4444', fontSize: '13px', fontWeight: '600' }}>
                                Over by {formatCurrency(Math.abs(remaining))}
                              </span>
                            </>
                          ) : (
                            <>
                              <Target size={16} color="#22c55e" />
                              <span style={{ color: '#22c55e', fontSize: '13px', fontWeight: '600' }}>
                                {formatCurrency(remaining)} left
                              </span>
                            </>
                          )}
                        </div>
                        <span style={{ color: '#64748b', fontSize: '13px' }}>
                          {percentage.toFixed(1)}% used
                        </span>
                      </div>

                      {/* Warning Message */}
                      {isOverBudget && (
                        <div style={{
                          marginTop: '16px',
                          padding: '12px',
                          background: 'rgba(239, 68, 68, 0.1)',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          borderRadius: '8px',
                          display: 'flex',
                          gap: '8px'
                        }}>
                          <AlertCircle size={16} color="#ef4444" style={{ flexShrink: 0, marginTop: '2px' }} />
                          <p style={{ color: '#fca5a5', fontSize: '12px', lineHeight: '1.5' }}>
                            You've exceeded your budget for this category. Consider adjusting your spending or increasing your budget.
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Transactions List - Only shown when expanded */}
                    {isExpanded && (
                      <div style={{
                        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                        padding: '20px 24px'
                      }}>
                        <h4 style={{ color: 'white', fontSize: '14px', fontWeight: '600', marginBottom: '12px' }}>
                          Recent Transactions ({budget.transactions?.length || 0})
                        </h4>
                        {budget.transactions && budget.transactions.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {budget.transactions.slice(0, 10).map((txn: Transaction) => (
                              <div
                                key={txn.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleTransactionClick(txn);
                                }}
                                style={{
                                  padding: '12px',
                                  background: 'rgba(255, 255, 255, 0.03)',
                                  border: '1px solid rgba(255, 255, 255, 0.06)',
                                  borderRadius: '8px',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  transition: 'all 0.2s',
                                  cursor: 'pointer'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                                  e.currentTarget.style.borderColor = `${budget.category_color}60`;
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.06)';
                                }}
                              >
                                <div style={{ flex: 1 }}>
                                  <p style={{ color: 'white', fontSize: '14px', fontWeight: '500', margin: 0, marginBottom: '4px' }}>
                                    {txn.description || txn.name || 'Unnamed Transaction'}
                                  </p>
                                  <p style={{ color: '#64748b', fontSize: '12px', margin: 0 }}>
                                    {new Date(txn.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                  </p>
                                </div>
                                <p style={{ fontSize: '15px', fontWeight: '600', color: 'white', margin: 0 }}>
                                  {formatCurrency(txn.amount)}
                                </p>
                              </div>
                            ))}
                            {budget.transactions.length > 10 && (
                              <p style={{ color: '#64748b', fontSize: '12px', textAlign: 'center', marginTop: '8px' }}>
                                Showing 10 of {budget.transactions.length} transactions
                              </p>
                            )}
                          </div>
                        ) : (
                          <p style={{ color: '#64748b', fontSize: '13px', textAlign: 'center', padding: '16px' }}>
                            No transactions yet in this category
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Tips Section */}
          <div style={{ marginTop: '32px', background: 'rgba(17, 24, 39, 0.8)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '16px', padding: '24px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', color: 'white', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <TrendingUp size={20} color="#22c55e" /> Budget Tips
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
              <div style={{ padding: '16px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '8px' }}>
                <p style={{ color: '#cbd5e1', fontSize: '14px', lineHeight: '1.6' }}>
                  💡 <strong style={{ color: 'white' }}>Set realistic goals:</strong> Base your budgets on your actual spending patterns from the past 3 months.
                </p>
              </div>
              <div style={{ padding: '16px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '8px' }}>
                <p style={{ color: '#cbd5e1', fontSize: '14px', lineHeight: '1.6' }}>
                  📊 <strong style={{ color: 'white' }}>Review regularly:</strong> Check your budget progress weekly to stay on track and make adjustments.
                </p>
              </div>
              <div style={{ padding: '16px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '8px' }}>
                <p style={{ color: '#cbd5e1', fontSize: '14px', lineHeight: '1.6' }}>
                  🎯 <strong style={{ color: 'white' }}>Start small:</strong> Focus on one or two categories first before creating comprehensive budgets.
                </p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div style={{ textAlign: 'center', padding: '24px', color: '#64748b', fontSize: '13px', borderTop: '1px solid rgba(255, 255, 255, 0.1)', marginTop: '40px' }}>
            Part of {branding.parentBrand} ecosystem
          </div>
        </div>
      </div>

      {/* Add/Edit Budget Panel */}
      <SlidePanel
        isOpen={showAddPanel}
        onClose={handleClosePanel}
        title={editingBudget?.id ? 'Edit Budget' : 'Create Budget'}
      >
        <BudgetForm
          budget={editingBudget}
          categories={categories}
          onSuccess={handleSuccess}
          onCancel={handleClosePanel}
        />
      </SlidePanel>

      {/* Edit Transaction Panel */}
      <SlidePanel
        isOpen={showTransactionPanel}
        onClose={handleCloseTransactionPanel}
        title={editingTransaction ? 'Edit Transaction' : 'Add Transaction'}
      >
        <AddTransactionForm
          transaction={editingTransaction || undefined}
          onSuccess={handleTransactionSuccess}
          onCancel={handleCloseTransactionPanel}
        />
      </SlidePanel>

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
};
