import React, { useState, useEffect } from 'react';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Wallet, CreditCard, PiggyBank, ChevronDown, ChevronUp, Loader2, ArrowRight } from 'lucide-react';
import { analyticsService } from '../services/analyticsService';
import { accountService } from '../services/accountService';
import { transactionService } from '../services/transactionService';
import { budgetService } from '../services/budgetService';
import { useToast } from '../contexts/ToastContext';
import { useAuthStore } from '../store/authStore';
import { getBranding } from '../config/branding';
import { useTheme } from '../contexts/ThemeContext';
import { CHART_COLORS } from '../config/theme';
import { StatCard } from '../components/StatCard';
import { SectionCard } from '../components/SectionCard';
import { flexRowGap8, flexRowGap12, flexRowBetween, flexColGap12, flexColGap16, flexColGap20, sectionHeaderStyle, pageContainerStyle, pageMaxWidthStyle, cardStyle, tableStyle } from '../styles/layoutStyles';

const tableCellMuted: React.CSSProperties = { padding: '8px', textAlign: 'left', color: 'var(--text-muted)', fontSize: '12px', fontWeight: '500' };
const tableCellSecondary: React.CSSProperties = { padding: '8px', color: 'var(--text-secondary)', fontSize: '12px' };
const tooltipBoxStyle: React.CSSProperties = { background: 'var(--tooltip-bg)', border: '1px solid var(--tooltip-border)', borderRadius: '8px', padding: '12px' };
const emptyStateStyle: React.CSSProperties = { textAlign: 'center', color: 'var(--text-secondary)', padding: '40px 0' };

const ViewAllBtn = ({ href }: { href: string }) => (
  <button
    onClick={() => window.location.href = href}
    style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      padding: '6px 12px',
      background: 'transparent',
      border: '1px solid var(--border-light)',
      borderRadius: '6px',
      color: 'var(--text-secondary)',
      fontSize: '13px',
      cursor: 'pointer',
      transition: 'all 0.2s',
      flexShrink: 0,
    }}
    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--border-medium)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-light)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
  >
    View all <ArrowRight size={13} />
  </button>
);

export const Dashboard = () => {
  const { showToast } = useToast();
  const { user } = useAuthStore();
  const branding = getBranding(user?.default_currency_code || 'USD');
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const chartColors = {
    tick:   isDark ? 'var(--text-secondary)' : 'var(--text-secondary)',
    grid:   isDark ? 'rgba(148, 163, 184, 0.12)' : '#e9eee5',
    cursor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
  };

  const [timeRange, setTimeRange] = useState('month');
  const [loading, setLoading] = useState(true);

  const [netWorth, setNetWorth] = useState(0);
  const [monthlyIncome, setMonthlyIncome] = useState(0);
  const [monthlyExpenses, setMonthlyExpenses] = useState(0);
  const [savingsRate, setSavingsRate] = useState(0);

  const [cashFlowData, setCashFlowData] = useState<any[]>([]);
  const [categoryData, setCategoryData] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<any[]>([]);
  const [budgets, setBudgets] = useState<any[]>([]);
  const [monthlyAggregation, setMonthlyAggregation] = useState<any[]>([]);
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());

  const COLORS = CHART_COLORS;

  useEffect(() => {
    loadDashboardData();
  }, [timeRange]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);

      const [dashboardData, accountsData, transactionsData, budgetsData] = await Promise.all([
        analyticsService.getDashboardData(),
        accountService.getAccounts(),
        transactionService.getTransactions({ per_page: 5 }),
        budgetService.getBudgets()
      ]);

      setNetWorth(dashboardData.net_worth || 0);
      setMonthlyIncome(dashboardData.total_income || 0);
      setMonthlyExpenses(Math.abs(dashboardData.total_expenses_only || 0));

      const income = dashboardData.total_income || 0;
      const expenses = Math.abs(dashboardData.total_expenses_only || 0);
      const savings = income - expenses;
      setSavingsRate(income > 0 ? Math.max(0, (savings / income) * 100) : 0);

      const now = new Date();
      const dataByPeriod: any = {};
      let cutoffDate = new Date();
      let groupByMonth = true;

      if (timeRange === 'week') {
        cutoffDate.setDate(now.getDate() - 7);
        groupByMonth = false;
      } else if (timeRange === 'month') {
        cutoffDate.setDate(now.getDate() - 30);
        groupByMonth = false;
      } else if (timeRange === 'year') {
        cutoffDate.setFullYear(now.getFullYear() - 1);
        groupByMonth = true;
      }

      (dashboardData.expenses || []).forEach((txn: any) => {
        const txnDate = new Date(txn.date);
        if (txnDate < cutoffDate) return;

        const periodKey = groupByMonth
          ? txn.date.substring(0, 7)
          : txn.date.substring(0, 10);

        if (!dataByPeriod[periodKey]) {
          dataByPeriod[periodKey] = { income: 0, expenses: 0 };
        }

        if (txn.transaction_type === 'income') {
          dataByPeriod[periodKey].income += txn.amount;
        } else if (txn.transaction_type === 'expense') {
          dataByPeriod[periodKey].expenses += Math.abs(txn.amount);
        }
      });

      const periods = Object.keys(dataByPeriod).sort();
      const formattedCashFlow = periods.map((periodKey: string) => {
        const label = groupByMonth
          ? new Date(periodKey + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
          : new Date(periodKey).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return {
          month: label,
          income: dataByPeriod[periodKey].income || 0,
          expenses: dataByPeriod[periodKey].expenses || 0
        };
      });
      setCashFlowData(formattedCashFlow);

      setCategoryData(
        (dashboardData.top_categories || []).map((cat: any, idx: number) => ({
          name: cat.name || cat.category_name,
          value: Math.abs(cat.amount),
          color: cat.color || COLORS[idx % COLORS.length]
        }))
      );

      setAccounts(
        (accountsData || []).slice(0, 3).map((acc: any) => ({
          id: acc.id,
          name: acc.name,
          balance: acc.balance || 0,
          type: acc.account_type || 'checking',
          trend: 2.3
        }))
      );

      setRecentTransactions(
        (transactionsData.transactions || []).slice(0, 5).map((txn: any) => ({
          id: txn.id,
          description: txn.description || 'Unknown',
          amount: txn.amount || 0,
          transaction_type: txn.transaction_type || 'expense',
          category: txn.category || 'Uncategorized',
          date: txn.date ? new Date(txn.date).toLocaleDateString() : 'Invalid Date',
          account: txn.account || 'Unknown'
        }))
      );

      setBudgets(
        (budgetsData.budgets || budgetsData || []).slice(0, 4).map((budget: any, idx: number) => ({
          category: budget.category?.name || budget.category_name || budget.name,
          spent: Math.abs(budget.spent || 0),
          budget: budget.amount || 0,
          color: COLORS[idx % COLORS.length]
        }))
      );

      const monthlyData: any = {};
      (dashboardData.expenses || []).forEach((txn: any) => {
        if (txn.transaction_type !== 'expense') return;

        const monthKey = txn.date.substring(0, 7);
        if (!monthlyData[monthKey]) {
          monthlyData[monthKey] = { month: monthKey, total: 0, categories: {}, accounts: {}, transactions: [] };
        }

        const amount = Math.abs(txn.amount);
        monthlyData[monthKey].total += amount;
        monthlyData[monthKey].transactions.push(txn);

        const categoryName = txn.category?.name || txn.category || 'Uncategorized';
        const categoryColor = txn.category?.color || 'var(--text-secondary)';
        if (!monthlyData[monthKey].categories[categoryName]) {
          monthlyData[monthKey].categories[categoryName] = { name: categoryName, color: categoryColor, total: 0, transactions: [] };
        }
        monthlyData[monthKey].categories[categoryName].total += amount;
        monthlyData[monthKey].categories[categoryName].transactions.push(txn);

        const accountName = txn.account?.name || txn.account || 'Unknown';
        const accountColor = txn.account?.color || 'var(--text-secondary)';
        if (!monthlyData[monthKey].accounts[accountName]) {
          monthlyData[monthKey].accounts[accountName] = { name: accountName, color: accountColor, total: 0, transactions: [] };
        }
        monthlyData[monthKey].accounts[accountName].total += amount;
        monthlyData[monthKey].accounts[accountName].transactions.push(txn);
      });

      setMonthlyAggregation(
        Object.values(monthlyData)
          .sort((a: any, b: any) => b.month.localeCompare(a.month))
          .slice(0, 6)
      );

    } catch (error: any) {
      showToast('Failed to load dashboard data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div style={tooltipBoxStyle}>
          <p style={{ color: 'var(--text-primary)', marginBottom: '8px', fontWeight: '600' }}>{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} style={{ color: entry.color, marginBottom: '4px' }}>
              {entry.name}: {formatCurrency(entry.value)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const toggleMonth = (monthKey: string) => {
    setExpandedMonths(prev => {
      const next = new Set(prev);
      if (next.has(monthKey)) { next.delete(monthKey); } else { next.add(monthKey); }
      return next;
    });
  };

  const formatMonthLabel = (monthKey: string) =>
    new Date(monthKey + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const getBudgetPercentage = (spent: number, budget: number) => Math.min((spent / budget) * 100, 100);

  const getBudgetColor = (spent: number, budget: number) => {
    const pct = (spent / budget) * 100;
    if (pct >= 100) return 'var(--accent-red)';
    if (pct >= 80) return 'var(--accent-yellow)';
    return 'var(--accent-green)';
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
          <Loader2 size={40} className="animate-spin" style={{ color: 'var(--brand-green-glow)' }} />
          <p style={{ color: 'var(--text-secondary)', fontSize: '16px' }}>Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div style={pageContainerStyle}>

        {/* Header */}
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 700, marginBottom: '4px', color: 'var(--text-primary)' }}>Dashboard</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Welcome back!</p>
        </div>

        {/* Stat Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '32px' }}>
          <StatCard
            label="Net Worth"
            value={formatCurrency(netWorth)}
            accentColor="#22c55e"
            icon={<Wallet size={24} color="#22c55e" />}
            subtitle={<><TrendingUp size={16} color="#22c55e" /><span style={{ color: 'var(--brand-green-glow)', fontSize: '14px' }}>Track your wealth</span></>}
          />
          <StatCard
            label="Monthly Income"
            value={formatCurrency(monthlyIncome)}
            accentColor="#3b82f6"
            icon={<TrendingUp size={24} color="#3b82f6" />}
            subtitle={<span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Current month earnings</span>}
          />
          <StatCard
            label="Monthly Expenses"
            value={formatCurrency(monthlyExpenses)}
            accentColor="#ef4444"
            icon={<TrendingDown size={24} color="#ef4444" />}
            subtitle={<><TrendingDown size={16} color="#ef4444" /><span style={{ color: 'var(--accent-red)', fontSize: '14px' }}>Current month spending</span></>}
          />
          <StatCard
            label="Savings Rate"
            value={`${savingsRate.toFixed(1)}%`}
            accentColor="#fbbf24"
            icon={<PiggyBank size={24} color="#fbbf24" />}
            subtitle={<span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Great job saving!</span>}
          />
        </div>

        {/* Charts Row */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px', marginBottom: '24px' }}>
          <SectionCard
            title="Cash Flow"
            action={
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value)}
                style={{ padding: '8px 12px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: '8px', color: 'var(--text-primary)', cursor: 'pointer' }}
              >
                <option value="week">Last 7 days</option>
                <option value="month">Last 30 days</option>
                <option value="year">Last year</option>
              </select>
            }
          >
            <ResponsiveContainer width="100%" height={280} key={`cashflow-${timeRange}`}>
              <BarChart data={cashFlowData}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                <XAxis dataKey="month" stroke={chartColors.tick} tick={{ fill: chartColors.tick, fontSize: 12 }} />
                <YAxis stroke={chartColors.tick} tick={{ fill: chartColors.tick, fontSize: 12 }} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: chartColors.cursor }} />
                <Legend wrapperStyle={{ color: chartColors.tick }} />
                <Bar dataKey="income" fill="#22c55e" radius={[8, 8, 0, 0]} />
                <Bar dataKey="expenses" fill="#ef4444" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </SectionCard>

          <SectionCard title="Spending by Category">
            {categoryData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={categoryData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={2} dataKey="value">
                      {categoryData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div style={tooltipBoxStyle}>
                              <p style={{ color: 'var(--text-primary)', marginBottom: '4px', fontWeight: '600' }}>{payload[0].name}</p>
                              <p style={{ color: payload[0].payload.color, margin: 0 }}>{formatCurrency(payload[0].value as number)}</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ marginTop: '16px' }}>
                  {categoryData.slice(0, 4).map((cat, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <div style={flexRowGap8}>
                        <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: cat.color }} />
                        <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>{cat.name}</span>
                      </div>
                      <span style={{ color: 'var(--text-primary)', fontWeight: '600', fontSize: '14px' }}>{formatCurrency(cat.value)}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div style={emptyStateStyle}>No spending data</div>
            )}
          </SectionCard>
        </div>

        {/* Budget + Accounts Row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
          <SectionCard title="Budget Progress" action={<ViewAllBtn href="/budgets" />}>
            {budgets.length > 0 ? budgets.map((budget, idx) => (
              <div
                key={idx}
                onClick={() => window.location.href = '/budgets'}
                style={{ marginBottom: '20px', cursor: 'pointer', transition: 'transform 0.2s' }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateX(4px)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateX(0)'; }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: '500' }}>{budget.category}</span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                    {formatCurrency(budget.spent)} of {formatCurrency(budget.budget)}
                  </span>
                </div>
                <div style={{ width: '100%', height: '8px', background: 'var(--progress-track)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{
                    width: `${getBudgetPercentage(budget.spent, budget.budget)}%`,
                    height: '100%',
                    background: getBudgetColor(budget.spent, budget.budget),
                    transition: 'width 0.3s ease',
                    borderRadius: '4px',
                  }} />
                </div>
              </div>
            )) : (
              <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '20px 0' }}>No budgets set</div>
            )}
          </SectionCard>

          <SectionCard title="Accounts" action={<ViewAllBtn href="/accounts" />}>
            {accounts.length > 0 ? accounts.map((account, idx) => (
              <div
                key={idx}
                onClick={() => window.location.href = '/accounts'}
                style={{ padding: '16px', background: 'var(--surface-hover)', borderRadius: '12px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', transition: 'all 0.2s' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--table-row-hover)';
                  e.currentTarget.style.transform = 'translateX(4px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--surface-hover)';
                  e.currentTarget.style.transform = 'translateX(0)';
                }}
              >
                <div style={flexRowGap12}>
                  <div style={{ width: '40px', height: '40px', background: 'rgba(59,130,246,0.2)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {account.type === 'savings' && <PiggyBank size={20} color="#22c55e" />}
                    {account.type === 'credit' && <CreditCard size={20} color="#ef4444" />}
                    {account.type !== 'savings' && account.type !== 'credit' && <Wallet size={20} color="#3b82f6" />}
                  </div>
                  <div>
                    <p style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: '500', marginBottom: '4px' }}>{account.name}</p>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '12px', textTransform: 'capitalize', marginBottom: 0 }}>{account.type}</p>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ color: 'var(--text-primary)', fontSize: '16px', fontWeight: '600', marginBottom: '4px' }}>{formatCurrency(Math.abs(account.balance))}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                    {account.trend > 0 ? <TrendingUp size={14} color="#22c55e" /> : <TrendingDown size={14} color="#ef4444" />}
                    <span style={{ color: account.trend > 0 ? 'var(--brand-green-glow)' : 'var(--accent-red)', fontSize: '12px' }}>
                      {Math.abs(account.trend)}%
                    </span>
                  </div>
                </div>
              </div>
            )) : (
              <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '20px 0' }}>No accounts found</div>
            )}
          </SectionCard>
        </div>

        {/* Recent Transactions */}
        <div style={{ marginBottom: '24px' }}>
          <SectionCard title="Recent Transactions" action={<ViewAllBtn href="/transactions" />}>
            {recentTransactions.length > 0 ? recentTransactions.map((txn, idx) => (
              <div
                key={txn.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 0',
                  borderBottom: idx < recentTransactions.length - 1 ? '1px solid var(--border-light)' : 'none',
                }}
              >
                <div style={flexRowGap12}>
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '10px', flexShrink: 0,
                    background: txn.transaction_type === 'income' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {txn.transaction_type === 'income'
                      ? <TrendingUp size={16} color="#22c55e" />
                      : <TrendingDown size={16} color="#ef4444" />}
                  </div>
                  <div>
                    <p style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: '500', marginBottom: '2px' }}>{txn.description}</p>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginBottom: 0 }}>{txn.category?.name || txn.category || 'Uncategorized'} · {txn.date}</p>
                  </div>
                </div>
                <span style={{
                  color: txn.transaction_type === 'income' ? 'var(--brand-green-glow)' : 'var(--accent-red)',
                  fontWeight: '600',
                  fontSize: '14px',
                  flexShrink: 0,
                }}>
                  {txn.transaction_type === 'income' ? '+' : '-'}{formatCurrency(Math.abs(txn.amount))}
                </span>
              </div>
            )) : (
              <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '20px 0' }}>No recent transactions</div>
            )}
          </SectionCard>
        </div>

        {/* Monthly Expense Breakdown */}
        <SectionCard title="Monthly Expense Breakdown" subtitle="View expenses grouped by month, category, and account">
          {monthlyAggregation.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={tableStyle}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-light)' }}>
                    <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600', fontSize: '14px', minWidth: '120px' }}>Month</th>
                    <th style={{ padding: '12px', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: '600', fontSize: '14px', minWidth: '120px' }}>Total</th>
                    <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600', fontSize: '14px', minWidth: '200px' }}>Categories</th>
                    <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600', fontSize: '14px', minWidth: '200px' }}>Accounts</th>
                    <th style={{ padding: '12px', textAlign: 'center', color: 'var(--text-secondary)', fontWeight: '600', fontSize: '14px', minWidth: '100px' }}>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyAggregation.map((month: any) => {
                    const isExpanded = expandedMonths.has(month.month);
                    const categories = Object.values(month.categories);
                    const monthAccounts = Object.values(month.accounts);

                    return (
                      <React.Fragment key={month.month}>
                        <tr style={{ borderBottom: '1px solid var(--surface-hover)' }}>
                          <td style={{ padding: '16px 12px', color: 'var(--text-primary)', fontWeight: '600', fontSize: '14px', verticalAlign: 'top' }}>
                            {formatMonthLabel(month.month)}
                          </td>
                          <td style={{ padding: '16px 12px', textAlign: 'right', color: 'var(--accent-red)', fontWeight: '700', fontSize: '16px', verticalAlign: 'top' }}>
                            {formatCurrency(month.total)}
                          </td>
                          <td style={{ padding: '16px 12px', verticalAlign: 'top' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              {categories.map((cat: any) => (
                                <div key={cat.name} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center' }}>
                                  <span style={{
                                    fontSize: '13px', fontWeight: '500', padding: '4px 10px', borderRadius: '6px',
                                    background: cat.color ? `${cat.color}20` : 'rgba(107,114,128,0.2)',
                                    color: cat.color || 'var(--text-secondary)',
                                    border: `1px solid ${cat.color || 'var(--text-secondary)'}40`,
                                    display: 'inline-block'
                                  }}>{cat.name}</span>
                                  <span style={{ color: 'var(--accent-red)', fontSize: '13px', fontWeight: '600', whiteSpace: 'nowrap' }}>{formatCurrency(cat.total)}</span>
                                </div>
                              ))}
                            </div>
                          </td>
                          <td style={{ padding: '16px 12px', verticalAlign: 'top' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              {monthAccounts.map((acc: any) => (
                                <div key={acc.name} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center' }}>
                                  <span style={{
                                    fontSize: '13px', fontWeight: '500', padding: '4px 10px', borderRadius: '6px',
                                    background: acc.color ? `${acc.color}20` : 'rgba(107,114,128,0.2)',
                                    color: acc.color || 'var(--text-secondary)',
                                    border: `1px solid ${acc.color || 'var(--text-secondary)'}40`,
                                    display: 'inline-block'
                                  }}>{acc.name}</span>
                                  <span style={{ color: 'var(--accent-red)', fontSize: '13px', fontWeight: '600', whiteSpace: 'nowrap' }}>{formatCurrency(acc.total)}</span>
                                </div>
                              ))}
                            </div>
                          </td>
                          <td style={{ padding: '16px 12px', textAlign: 'center', verticalAlign: 'top' }}>
                            <button
                              onClick={() => toggleMonth(month.month)}
                              style={{
                                padding: '6px 12px',
                                background: 'var(--surface-hover)',
                                border: '1px solid var(--border-medium)',
                                borderRadius: '6px',
                                color: 'var(--text-primary)',
                                cursor: 'pointer',
                                fontSize: '12px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                transition: 'all 0.2s',
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--table-row-hover)'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface-hover)'; }}
                            >
                              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                              {isExpanded ? 'Hide' : 'Show'} ({month.transactions.length})
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={5} style={{ padding: '0', background: 'var(--bg-primary)' }}>
                              <div style={{ padding: '16px', borderTop: '1px solid var(--border-light)' }}>
                                <h5 style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                                  Individual Transactions ({month.transactions.length})
                                </h5>
                                <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                                  <table style={tableStyle}>
                                    <thead>
                                      <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
                                        <th style={tableCellMuted}>Date</th>
                                        <th style={tableCellMuted}>Description</th>
                                        <th style={tableCellMuted}>Category</th>
                                        <th style={tableCellMuted}>Account</th>
                                        <th style={{ padding: '8px', textAlign: 'right', color: 'var(--text-muted)', fontSize: '12px', fontWeight: '500' }}>Amount</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {month.transactions.map((txn: any) => (
                                        <tr key={txn.id} style={{ borderBottom: '1px solid var(--surface-hover)' }}>
                                          <td style={tableCellSecondary}>
                                            {new Date(txn.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                          </td>
                                          <td style={{ padding: '8px', color: 'var(--text-primary)', fontSize: '13px' }}>{txn.description}</td>
                                          <td style={tableCellSecondary}>
                                            {txn.category?.name || txn.category || 'Uncategorized'}
                                          </td>
                                          <td style={tableCellSecondary}>
                                            {txn.account?.name || txn.account || 'Unknown'}
                                          </td>
                                          <td style={{ padding: '8px', textAlign: 'right', color: 'var(--accent-red)', fontWeight: '600', fontSize: '13px' }}>
                                            {formatCurrency(Math.abs(txn.amount))}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
              <button
                onClick={() => window.location.href = '/transactions'}
                style={{ marginTop: '16px', width: '100%', padding: '12px', background: 'var(--surface-hover)', border: '1px solid var(--border-light)', borderRadius: '8px', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '14px', transition: 'all 0.3s' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--table-row-hover)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface-hover)'; }}
              >
                View All Transactions
              </button>
            </div>
          ) : (
            <div style={emptyStateStyle}>No expense data found</div>
          )}
        </SectionCard>

      </div>

      {/* Footer */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '32px', borderTop: '1px solid var(--border-light)', marginTop: '40px' }}>
        <img src="/palStack.png" alt="palStack" style={{ height: '24px', width: 'auto', opacity: 0.7 }} />
        <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Part of the {branding.parentBrand} ecosystem</p>
      </div>
    </>
  );
};

export default Dashboard;
