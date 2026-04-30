import React, { useState, useEffect } from 'react';
import { Plus, ChevronDown, ChevronUp, Edit2, Trash2, Calendar, ChevronLeft, ChevronRight, Loader2, DollarSign, TrendingDown, TrendingUp } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { getBranding } from '../config/branding';
import { budgetService, type Budget } from '../services/budgetService';
import { transactionsApi, type Transaction } from '../services/api/transactions';
import { categoriesApi, type Category } from '../services/api/categories';
import { useToast } from '../contexts/ToastContext';
import { SlidePanel } from '../components/SlidePanel';
import { AddTransactionForm } from '../components/forms/AddTransactionForm';
import { StatCard } from '../components/StatCard';

interface BudgetWithDetails extends Budget {
  spent: number;
  remaining: number;
  percentage: number;
  category_name?: string;
  category_icon?: string;
  category_color?: string;
  transactions?: Transaction[];
}

const fieldLabelStyle: React.CSSProperties = { display: 'block', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: '500', marginBottom: '8px' };
const secondaryBgStyle: React.CSSProperties = { background: 'var(--bg-secondary)' };

const mutedSmallStyle: React.CSSProperties = { color: 'var(--text-muted)', fontSize: '13px' };
const secondaryBodyStyle: React.CSSProperties = { color: 'var(--text-secondary)', fontSize: '14px', margin: 0 };

const BudgetsMinimal = () => {
  const { user } = useAuthStore();
  const branding = getBranding(user?.default_currency_code || 'USD');
  const { showToast } = useToast();

  const [budgets, setBudgets] = useState<BudgetWithDetails[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedBudget, setExpandedBudget] = useState<number | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [editingBudget, setEditingBudget] = useState<BudgetWithDetails | null>(null);
  const [budgetFormData, setBudgetFormData] = useState({
    category_id: '',
    amount: '',
    period: 'monthly' as 'weekly' | 'monthly' | 'yearly',
    start_date: new Date().toISOString().split('T')[0],
    rollover: false
  });
  const [selectedMonth, setSelectedMonth] = useState(new Date());

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: user?.default_currency_code || 'USD',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  useEffect(() => {
    loadData();
  }, [selectedMonth]);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load categories - returns { categories: Category[] }
      const categoriesResponse = await categoriesApi.getAll();
      const categoriesData = categoriesResponse?.categories || [];
      setCategories(categoriesData);

      // Load budget overview
      const overview = await budgetService.getBudgetOverview();

      // Load all transactions to match with budgets
      const transactionsData = await transactionsApi.getAll();

      // Enrich budgets with category info and transactions
      const budgetsList = overview?.budgets || [];
      const enrichedBudgets = budgetsList.map((budget) => {
        // API already returns nested category object; fall back to lookup by id
        const nestedCat = (budget as any).category as { name?: string; icon?: string; color?: string } | undefined;
        const category = nestedCat?.name ? nestedCat : categoriesData.find((c) => c.id === budget.category_id);

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
          .filter((t) => {
            const txDate = new Date(t.date);
            return (
              t.category_id === budget.category_id &&
              t.transaction_type === 'expense' &&
              txDate >= startDate &&
              txDate <= endDate
            );
          })
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        return {
          ...budget,
          category_name: category?.name || 'Uncategorized',
          category_icon: category?.icon || '',
          category_color: category?.color || '#6366f1',
          transactions: budgetTransactions,
        };
      });

      setBudgets(enrichedBudgets);
    } catch (error: any) {
      showToast('Failed to load budgets', 'error');
      setBudgets([]);
      setCategories([]);
    } finally {
      setLoading(false);
    }
  };

  const handleExpandBudget = async (budgetId: number) => {
    if (expandedBudget === budgetId) {
      setExpandedBudget(null);
    } else {
      setExpandedBudget(budgetId);
    }
  };

  const handleTransactionClick = (transaction: Transaction) => {
    setEditingTransaction(transaction);
  };

  const handleTransactionSuccess = () => {
    setEditingTransaction(null);
    loadData(); // Refresh budgets
  };

  const handleCloseTransactionPanel = () => {
    setEditingTransaction(null);
  };

  const handleOpenBudgetModal = (budget?: BudgetWithDetails) => {
    if (budget) {
      setEditingBudget(budget);
      setBudgetFormData({
        category_id: budget.category_id?.toString() || '',
        amount: budget.amount.toString(),
        period: budget.period,
        start_date: budget.start_date ? budget.start_date.split('T')[0] : new Date().toISOString().split('T')[0],
        rollover: budget.rollover || false
      });
    } else {
      setEditingBudget(null);
      setBudgetFormData({
        category_id: '',
        amount: '',
        period: 'monthly',
        start_date: new Date().toISOString().split('T')[0],
        rollover: false
      });
    }
    setShowBudgetModal(true);
  };

  const handleCloseBudgetPanel = () => {
    setShowBudgetModal(false);
    setEditingBudget(null);
  };

  const handleCreateBudget = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!budgetFormData.category_id) {
      showToast('Please select a category', 'error');
      return;
    }

    if (!budgetFormData.amount || parseFloat(budgetFormData.amount) <= 0) {
      showToast('Please enter a valid budget amount', 'error');
      return;
    }

    try {
      if (editingBudget) {
        // Update existing budget
        await budgetService.updateBudget(editingBudget.id, {
          amount: parseFloat(budgetFormData.amount),
          period: budgetFormData.period,
          category_id: parseInt(budgetFormData.category_id),
          start_date: budgetFormData.start_date,
          is_active: true,
          rollover: budgetFormData.rollover,
        });
        showToast('Budget updated successfully', 'success');
      } else {
        // Create new budget
        await budgetService.createBudget({
          name: '', // Optional name
          amount: parseFloat(budgetFormData.amount),
          period: budgetFormData.period,
          category_id: parseInt(budgetFormData.category_id),
          start_date: budgetFormData.start_date,
          is_active: true,
          rollover: budgetFormData.rollover,
        });
        showToast('Budget created successfully', 'success');
      }

      setShowBudgetModal(false);
      setEditingBudget(null);
      setBudgetFormData({
        category_id: '',
        amount: '',
        period: 'monthly',
        start_date: new Date().toISOString().split('T')[0],
        rollover: false
      });
      loadData(); // Refresh budgets
    } catch (error: any) {
      showToast((error as any).response?.data?.error || 'Failed to save budget', 'error');
    }
  };

  const handleDeleteBudget = async (budgetId: number) => {
    if (!window.confirm('Are you sure you want to delete this budget?')) {
      return;
    }

    try {
      await budgetService.deleteBudget(budgetId);
      showToast('Budget deleted successfully', 'success');
      setShowBudgetModal(false);
      setEditingBudget(null);
      loadData();
    } catch (error: any) {
      showToast('Failed to delete budget', 'error');
    }
  };

  const totalBudgeted = budgets.reduce((sum, b) => sum + b.amount, 0);
  const totalSpent = budgets.reduce((sum, b) => sum + b.spent, 0);
  const totalRemaining = totalBudgeted - totalSpent;

  const daysLeftInMonth = () => {
    const now = new Date();
    const isCurrentMonth = selectedMonth.getMonth() === now.getMonth() && selectedMonth.getFullYear() === now.getFullYear();
    if (!isCurrentMonth) return 0;
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return Math.max(0, lastDay.getDate() - now.getDate());
  };

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

  const isCurrentMonth = () => {
    const now = new Date();
    return selectedMonth.getMonth() === now.getMonth() && selectedMonth.getFullYear() === now.getFullYear();
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
          <Loader2 size={40} className="animate-spin" style={{ color: 'var(--brand-green-glow)' }} />
          <p style={{ color: 'var(--text-secondary)', fontSize: '16px' }}>Loading budgets...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div style={{ minHeight: '100vh', padding: '24px' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>

          {/* Simple Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
            <div>
              <h1 style={{
                fontSize: '32px',
                fontWeight: 700,
                marginBottom: '8px',
                color: 'var(--text-primary)'
              }}>
                Budgets
              </h1>
              <p style={secondaryBodyStyle}>
                Track your spending against your budgets
              </p>
            </div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              {/* Compact Month Navigator */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'var(--bg-card)',
                border: '1px solid var(--border-light)',
                borderRadius: '8px',
                padding: '6px 12px'
              }}>
                <button
                  onClick={goToPreviousMonth}
                  style={{
                    padding: '4px',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-primary)',
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
                  <span style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-primary)' }}>
                    {formatMonthYear(selectedMonth)}
                  </span>
                </div>

                <button
                  onClick={goToNextMonth}
                  style={{
                    padding: '4px',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-primary)',
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

              {!isCurrentMonth() && (
                <button
                  onClick={goToCurrentMonth}
                  style={{
                    padding: '6px 12px',
                    background: 'rgba(134, 239, 172, 0.1)',
                    border: '1px solid rgba(134, 239, 172, 0.3)',
                    borderRadius: '6px',
                    color: 'var(--brand-light-green)',
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
                onClick={() => handleOpenBudgetModal()}
                style={{
                  padding: '10px 20px',
                  background: 'var(--brand-main-green)',
                  border: 'none',
                  borderRadius: '10px',
                  color: 'white',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '15px',
                  transition: 'all 0.3s'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--brand-dark-green)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--brand-main-green)')}
              >
                <Plus size={18} /> New Budget
              </button>
            </div>
          </div>

          {/* Top Stats */}
          {(() => {
            const spentPct = totalBudgeted > 0 ? (totalSpent / totalBudgeted) * 100 : 0;
            const spentColor = spentPct >= 100 ? 'var(--accent-red)' : spentPct >= 80 ? 'var(--accent-yellow)' : 'var(--brand-green-glow)';
            const onTrack = budgets.filter(b => b.percentage < 80).length;
            const warning = budgets.filter(b => b.percentage >= 80 && b.spent <= b.amount).length;
            const over = budgets.filter(b => b.spent > b.amount).length;
            return (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '32px' }}>
                <StatCard
                  label="Total Budgeted"
                  value={formatCurrency(totalBudgeted)}
                  accentColor="#3b82f6"
                  icon={<DollarSign size={24} color="#3b82f6" />}
                  subtitle={<span style={mutedSmallStyle}>Across {budgets.length} categories</span>}
                />
                <StatCard
                  label="Total Spent"
                  value={formatCurrency(totalSpent)}
                  accentColor={spentColor}
                  icon={<TrendingDown size={24} color={spentColor} />}
                  subtitle={
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
                      <div style={{ flex: 1, height: '6px', background: 'var(--progress-track)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(spentPct, 100)}%`, height: '100%', background: spentColor, borderRadius: '3px' }} />
                      </div>
                      <span style={{ color: spentColor, fontSize: '13px', fontWeight: '600', whiteSpace: 'nowrap' }}>
                        {spentPct.toFixed(0)}%
                      </span>
                    </div>
                  }
                />
                <StatCard
                  label="Remaining"
                  value={formatCurrency(Math.abs(totalRemaining))}
                  accentColor={totalRemaining >= 0 ? 'var(--brand-green-glow)' : 'var(--accent-red)'}
                  icon={<TrendingUp size={24} color={totalRemaining >= 0 ? 'var(--brand-green-glow)' : 'var(--accent-red)'} />}
                  valueColor={totalRemaining >= 0 ? 'var(--brand-green-glow)' : 'var(--accent-red)'}
                  subtitle={<span style={mutedSmallStyle}>{daysLeftInMonth()} days left this month</span>}
                />
                {/* Budget Health — custom layout, not a simple stat */}
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: '16px', padding: '24px', boxShadow: 'var(--card-shadow)' }}>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '16px' }}>Budget Health</p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '10px' }}>
                    <span style={{ color: 'var(--brand-green-glow)' }}>{onTrack} on track</span>
                    <span style={{ color: 'var(--accent-yellow)' }}>{warning} at risk</span>
                    <span style={{ color: 'var(--accent-red)' }}>{over} over</span>
                  </div>
                  <div style={{ display: 'flex', gap: '2px', height: '20px', borderRadius: '6px', overflow: 'hidden' }}>
                    <div style={{ flex: onTrack || 0.1, background: 'var(--brand-green-glow)' }} />
                    <div style={{ flex: warning || 0.1, background: 'var(--accent-yellow)' }} />
                    <div style={{ flex: over || 0.1, background: 'var(--accent-red)' }} />
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Clean Budget List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {budgets.length === 0 ? (
              <div style={{
                background: 'var(--bg-card)',
                backdropFilter: 'blur(8px)',
                border: '1px solid var(--border-light)',
                borderRadius: '16px',
                padding: '48px',
                textAlign: 'center'
              }}>
                <p style={{ color: 'var(--text-secondary)', fontSize: '16px' }}>No budgets yet. Create your first budget to start tracking!</p>
              </div>
            ) : (
              budgets.map((budget) => {
                const percentage = budget.percentage;
                const remaining = budget.remaining;
                const isOver = budget.spent > budget.amount;
                const isExpanded = expandedBudget === budget.id;

                return (
                  <div
                    key={budget.id}
                    style={{
                      background: 'var(--bg-card)',
                      backdropFilter: 'blur(8px)',
                      border: '1px solid var(--border-light)',
                      borderRadius: '16px',
                      overflow: 'hidden',
                      transition: 'all 0.3s'
                    }}
                  >
                    {/* Budget Header - Clickable */}
                    <div
                      style={{
                        padding: '24px',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      onClick={() => handleExpandBudget(budget.id)}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'var(--surface-hover)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                        {/* Icon */}
                        <div style={{ fontSize: '36px', flexShrink: 0 }}>
                          {budget.category_icon}
                        </div>

                        {/* Category & Progress */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                            <h3 style={{ fontSize: '20px', fontWeight: '600', color: 'var(--text-primary)', margin: 0 }}>
                              {budget.category_name}
                            </h3>
                            {isOver && (
                              <span style={{
                                padding: '3px 10px',
                                background: 'rgba(239, 68, 68, 0.2)',
                                border: '1px solid rgba(239, 68, 68, 0.4)',
                                borderRadius: '6px',
                                fontSize: '11px',
                                color: 'var(--accent-red)',
                                fontWeight: '700'
                              }}>
                                OVER
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenBudgetModal(budget);
                              }}
                              aria-label="Edit budget"
                              style={{
                                marginLeft: 'auto',
                                padding: '6px',
                                background: 'var(--border-light)',
                                border: '1px solid var(--border-medium)',
                                borderRadius: '6px',
                                color: 'var(--text-primary)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'all 0.2s'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'var(--border-medium)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'var(--border-light)';
                              }}
                            >
                              <Edit2 size={16} />
                            </button>
                          </div>

                          {/* Progress Bar */}
                          <div style={{ marginBottom: '8px' }}>
                            <div style={{
                              width: '100%',
                              height: '8px',
                              background: 'var(--progress-track)',
                              borderRadius: '4px',
                              overflow: 'hidden'
                            }}>
                              <div style={{
                                width: `${Math.min(percentage, 100)}%`,
                                height: '100%',
                                background: isOver
                                  ? 'var(--accent-red)'
                                  : percentage >= 80
                                    ? 'var(--accent-yellow)'
                                    : budget.category_color || 'var(--brand-green-glow)',
                                borderRadius: '4px',
                                transition: 'width 0.5s ease'
                              }}></div>
                            </div>
                          </div>

                          {/* Spent / Budget */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <p style={secondaryBodyStyle}>
                              <span style={{ color: 'var(--text-primary)', fontWeight: '600', fontSize: '16px' }}>
                                {formatCurrency(budget.spent)}
                              </span>
                              {' '}of {formatCurrency(budget.amount)}
                            </p>
                            <p style={{
                              color: isOver ? 'var(--accent-red)' : 'var(--brand-green-glow)',
                              fontSize: '14px',
                              fontWeight: '600',
                              margin: 0
                            }}>
                              {isOver
                                ? `+${formatCurrency(Math.abs(remaining))}`
                                : formatCurrency(remaining)
                              }
                            </p>
                          </div>
                        </div>

                        {/* Expand Icon */}
                        <div style={{ flexShrink: 0, color: 'var(--text-muted)' }}>
                          {isExpanded ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
                        </div>
                      </div>
                    </div>

                    {/* Expanded Transactions */}
                    {isExpanded && (
                      <div style={{
                        padding: '0 24px 24px 24px',
                        borderTop: '1px solid var(--border-light)',
                        paddingTop: '16px'
                      }}>
                        {budget.transactions && budget.transactions.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {budget.transactions.slice(0, 10).map((txn) => (
                              <div
                                key={txn.id}
                                style={{
                                  padding: '14px 16px',
                                  background: 'var(--surface-hover)',
                                  border: '1px solid var(--border-light)',
                                  borderRadius: '10px',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s'
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleTransactionClick(txn);
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = 'var(--border-light)';
                                  e.currentTarget.style.borderColor = `${budget.category_color}60`;
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = 'var(--surface-hover)';
                                  e.currentTarget.style.borderColor = 'var(--border-light)';
                                }}
                              >
                                <div style={{ flex: 1 }}>
                                  <p style={{ color: 'var(--text-primary)', fontSize: '15px', fontWeight: '500', margin: 0, marginBottom: '4px' }}>
                                    {txn.description || txn.name || 'Unnamed Transaction'}
                                  </p>
                                  <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0 }}>
                                    {new Date(txn.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                  </p>
                                </div>
                                <p style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)', margin: 0 }}>
                                  {formatCurrency(txn.amount)}
                                </p>
                              </div>
                            ))}
                            {budget.transactions.length > 10 && (
                              <p style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', marginTop: '8px' }}>
                                Showing 10 of {budget.transactions.length} transactions
                              </p>
                            )}
                          </div>
                        ) : (
                          <p style={{ color: 'var(--text-muted)', fontSize: '14px', textAlign: 'center', padding: '16px' }}>
                            No transactions yet in this category
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Edit Transaction Panel */}
          <SlidePanel
            isOpen={!!editingTransaction}
            onClose={handleCloseTransactionPanel}
            title="Edit Transaction"
          >
            <AddTransactionForm
              transaction={editingTransaction || undefined}
              onSuccess={handleTransactionSuccess}
              onCancel={handleCloseTransactionPanel}
            />
          </SlidePanel>

          {/* Create Budget Panel */}
          <SlidePanel
            isOpen={showBudgetModal}
            onClose={handleCloseBudgetPanel}
            title={editingBudget ? 'Edit Budget' : 'Create Budget'}
          >
            <form onSubmit={handleCreateBudget} style={{ padding: '24px' }}>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div>
                    <label style={fieldLabelStyle}>
                      Category *
                    </label>
                    <select
                      value={budgetFormData.category_id}
                      onChange={(e) => setBudgetFormData(prev => ({ ...prev, category_id: e.target.value }))}
                      required
                      style={{
                        width: '100%',
                        padding: '12px',
                        background: 'var(--input-bg)',
                        border: '1px solid var(--input-border)',
                        borderRadius: '8px',
                        color: 'var(--text-primary)',
                        fontSize: '15px',
                        outline: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="" style={secondaryBgStyle}>Select a category</option>
                      {categories.filter(cat => !cat.parent_id).map(cat => (
                        <option key={cat.id} value={cat.id} style={secondaryBgStyle}>
                          {cat.icon} {cat.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={fieldLabelStyle}>
                      Budget Amount *
                    </label>
                    <input
                      type="number"
                      value={budgetFormData.amount}
                      onChange={(e) => setBudgetFormData(prev => ({ ...prev, amount: e.target.value }))}
                      placeholder="0.00"
                      step="0.01"
                      min="0"
                      required
                      style={{
                        width: '100%',
                        padding: '12px',
                        background: 'var(--input-bg)',
                        border: '1px solid var(--input-border)',
                        borderRadius: '8px',
                        color: 'var(--text-primary)',
                        fontSize: '15px',
                        outline: 'none'
                      }}
                    />
                  </div>

                  <div>
                    <label style={fieldLabelStyle}>
                      Period *
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                      {['weekly', 'monthly', 'yearly'].map((period) => (
                        <button
                          key={period}
                          type="button"
                          onClick={() => setBudgetFormData(prev => ({ ...prev, period: period as 'weekly' | 'monthly' | 'yearly' }))}
                          style={{
                            padding: '12px',
                            background: budgetFormData.period === period ? 'rgba(34, 197, 94, 0.2)' : 'var(--input-bg)',
                            border: `1px solid ${budgetFormData.period === period ? 'rgba(34, 197, 94, 0.4)' : 'var(--input-border)'}`,
                            borderRadius: '8px',
                            color: budgetFormData.period === period ? 'var(--brand-green-glow)' : 'var(--text-primary)',
                            fontSize: '14px',
                            cursor: 'pointer',
                            fontWeight: '500',
                            textTransform: 'capitalize'
                          }}
                        >
                          {period}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label style={fieldLabelStyle}>
                      Start Date *
                    </label>
                    <input
                      type="date"
                      value={budgetFormData.start_date}
                      onChange={(e) => setBudgetFormData(prev => ({ ...prev, start_date: e.target.value }))}
                      required
                      style={{
                        width: '100%',
                        padding: '12px',
                        background: 'var(--input-bg)',
                        border: '1px solid var(--input-border)',
                        borderRadius: '8px',
                        color: 'var(--text-primary)',
                        fontSize: '15px',
                        outline: 'none'
                      }}
                    />
                  </div>

                  {/* Rollover Option */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px',
                    background: 'var(--input-bg)',
                    border: '1px solid var(--input-border)',
                    borderRadius: '8px'
                  }}>
                    <input
                      type="checkbox"
                      id="rollover"
                      checked={budgetFormData.rollover}
                      onChange={(e) => setBudgetFormData(prev => ({ ...prev, rollover: e.target.checked }))}
                      style={{
                        width: '18px',
                        height: '18px',
                        cursor: 'pointer',
                        accentColor: 'var(--brand-green-glow)'
                      }}
                    />
                    <label
                      htmlFor="rollover"
                      style={{
                        color: 'var(--text-secondary)',
                        fontSize: '14px',
                        fontWeight: '500',
                        cursor: 'pointer',
                        flex: 1
                      }}
                    >
                      Rollover unused budget to next period
                    </label>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                  {editingBudget && (
                    <button
                      type="button"
                      onClick={() => handleDeleteBudget(editingBudget.id)}
                      style={{
                        padding: '14px',
                        background: 'rgba(239, 68, 68, 0.2)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: '8px',
                        color: 'var(--accent-red)',
                        fontSize: '15px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px'
                      }}
                    >
                      <Trash2 size={18} />
                      Delete
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleCloseBudgetPanel}
                    style={{
                      flex: 1,
                      padding: '14px',
                      background: 'var(--border-light)',
                      border: '1px solid var(--border-medium)',
                      borderRadius: '8px',
                      color: 'var(--text-primary)',
                      fontSize: '15px',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    style={{
                      flex: 1,
                      padding: '14px',
                      background: 'var(--brand-main-green)',
                      border: 'none',
                      borderRadius: '8px',
                      color: 'var(--text-primary)',
                      fontSize: '15px',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    {editingBudget ? 'Save Changes' : 'Create Budget'}
                  </button>
                </div>
            </form>
          </SlidePanel>
        </div>
      </div>
    </>
  );
};

export default BudgetsMinimal;
