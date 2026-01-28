import React, { useState, useEffect } from 'react';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Wallet, CreditCard, PiggyBank, ChevronDown, ChevronUp } from 'lucide-react';
import { analyticsService } from '../services/analyticsService';
import { accountService } from '../services/accountService';
import { transactionService } from '../services/transactionService';
import { budgetService } from '../services/budgetService';
import { useToast } from '../contexts/ToastContext';
import { Navigation } from '../components/Navigation';
import { useAuthStore } from '../store/authStore';
import { getBranding } from '../config/branding';

export const Dashboard = () => {
  const { showToast } = useToast();
  const { user } = useAuthStore();
  const branding = getBranding(user?.default_currency_code || 'USD');

  const [timeRange, setTimeRange] = useState('month');
  const [selectedAccount, setSelectedAccount] = useState('all');
  const [loading, setLoading] = useState(true);

  // State for dashboard data
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

  // Category colors
  const COLORS = [
    '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6',
    '#ec4899', '#14b8a6', '#f43f5e', '#06b6d4'
  ];

  useEffect(() => {
    loadDashboardData();
  }, [timeRange]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);

      // Fetch dashboard data
      const [dashboardData, accountsData, transactionsData, budgetsData] = await Promise.all([
        analyticsService.getDashboardData(),
        accountService.getAccounts(),
        transactionService.getTransactions({ limit: 5 }),
        budgetService.getBudgets()
      ]);

      // Set metrics from actual API response
      setNetWorth(dashboardData.net_worth || 0);
      setMonthlyIncome(dashboardData.total_income || 0);
      setMonthlyExpenses(Math.abs(dashboardData.total_expenses_only || 0));

      // Calculate savings rate
      const income = dashboardData.total_income || 0;
      const expenses = Math.abs(dashboardData.total_expenses_only || 0);
      const savings = income - expenses;
      const rate = income > 0 ? (savings / income * 100) : 0;
      setSavingsRate(Math.max(0, rate));

      // Calculate income and expense breakdown based on time range
      const now = new Date();
      const dataByPeriod: any = {};

      // Determine date cutoff based on time range
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
        if (txnDate < cutoffDate) return; // Skip old transactions

        let periodKey: string;
        if (groupByMonth) {
          periodKey = txn.date.substring(0, 7); // 'YYYY-MM'
        } else {
          periodKey = txn.date.substring(0, 10); // 'YYYY-MM-DD'
        }

        if (!dataByPeriod[periodKey]) {
          dataByPeriod[periodKey] = { income: 0, expenses: 0 };
        }

        if (txn.transaction_type === 'income') {
          dataByPeriod[periodKey].income += txn.amount;
        } else if (txn.transaction_type === 'expense') {
          dataByPeriod[periodKey].expenses += Math.abs(txn.amount);
        }
      });

      // Format for display
      const periods = Object.keys(dataByPeriod).sort();
      const formattedCashFlow = periods.map((periodKey: string) => {
        let label: string;
        if (groupByMonth) {
          label = new Date(periodKey + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        } else {
          label = new Date(periodKey).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }

        return {
          month: label,
          income: dataByPeriod[periodKey].income || 0,
          expenses: dataByPeriod[periodKey].expenses || 0
        };
      });
      setCashFlowData(formattedCashFlow);

      // Format category data
      const formattedCategories = (dashboardData.top_categories || []).map((cat: any, idx: number) => ({
        name: cat.name || cat.category_name,
        value: Math.abs(cat.amount),
        color: cat.color || COLORS[idx % COLORS.length]
      }));
      setCategoryData(formattedCategories);

      // Format accounts data
      const formattedAccounts = (accountsData || []).slice(0, 3).map((acc: any) => ({
        id: acc.id,
        name: acc.name,
        balance: acc.balance || 0,
        type: acc.account_type || 'checking',
        trend: 2.3 // TODO: Calculate actual trend
      }));
      setAccounts(formattedAccounts);

      // Format transactions
      const formattedTransactions = (transactionsData.transactions || []).map((txn: any) => ({
        id: txn.id,
        description: txn.description || 'Unknown',
        amount: txn.amount || 0,
        transaction_type: txn.transaction_type || 'expense',
        category: txn.category || 'Uncategorized',
        date: txn.date ? new Date(txn.date).toLocaleDateString() : 'Invalid Date',
        account: txn.account || 'Unknown'
      }));
      setRecentTransactions(formattedTransactions);

      // Format budgets - use the API's pre-calculated spent values
      const formattedBudgets = (budgetsData.budgets || budgetsData || []).slice(0, 4).map((budget: any, idx: number) => ({
        category: budget.category?.name || budget.category_name || budget.name,
        spent: Math.abs(budget.spent || 0),
        budget: budget.amount || 0,
        color: COLORS[idx % COLORS.length]
      }));
      setBudgets(formattedBudgets);

      // Create monthly aggregation for expenses only
      const monthlyData: any = {};
      (dashboardData.expenses || []).forEach((txn: any) => {
        if (txn.transaction_type !== 'expense') return; // Only include expenses

        const monthKey = txn.date.substring(0, 7); // 'YYYY-MM'
        if (!monthlyData[monthKey]) {
          monthlyData[monthKey] = {
            month: monthKey,
            total: 0,
            categories: {},
            accounts: {},
            transactions: []
          };
        }

        const amount = Math.abs(txn.amount);
        monthlyData[monthKey].total += amount;
        monthlyData[monthKey].transactions.push(txn);

        // Group by category
        const categoryName = txn.category?.name || txn.category || 'Uncategorized';
        const categoryColor = txn.category?.color || '#6b7280'; // Default gray color
        if (!monthlyData[monthKey].categories[categoryName]) {
          monthlyData[monthKey].categories[categoryName] = {
            name: categoryName,
            color: categoryColor,
            total: 0,
            transactions: []
          };
        }
        monthlyData[monthKey].categories[categoryName].total += amount;
        monthlyData[monthKey].categories[categoryName].transactions.push(txn);

        // Group by account
        const accountName = txn.account?.name || txn.account || 'Unknown';
        const accountColor = txn.account?.color || '#6b7280'; // Default gray color
        if (!monthlyData[monthKey].accounts[accountName]) {
          monthlyData[monthKey].accounts[accountName] = {
            name: accountName,
            color: accountColor,
            total: 0,
            transactions: []
          };
        }
        monthlyData[monthKey].accounts[accountName].total += amount;
        monthlyData[monthKey].accounts[accountName].transactions.push(txn);
      });

      // Convert to array and sort by month (newest first)
      const aggregatedMonths = Object.values(monthlyData)
        .sort((a: any, b: any) => b.month.localeCompare(a.month))
        .slice(0, 6); // Show last 6 months

      setMonthlyAggregation(aggregatedMonths);

    } catch (error: any) {
      console.error('Failed to load dashboard data:', error);
      showToast('Failed to load dashboard data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  // Custom tooltip formatter for charts
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div style={{ background: '#1e293b', border: '1px solid rgba(255, 255, 255, 0.2)', borderRadius: '8px', padding: '12px' }}>
          <p style={{ color: 'white', marginBottom: '8px', fontWeight: '600' }}>{label}</p>
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
      const newSet = new Set(prev);
      if (newSet.has(monthKey)) {
        newSet.delete(monthKey);
      } else {
        newSet.add(monthKey);
      }
      return newSet;
    });
  };

  const formatMonthLabel = (monthKey: string) => {
    const date = new Date(monthKey + '-01');
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const getBudgetPercentage = (spent: number, budget: number) => {
    return Math.min((spent / budget * 100), 100);
  };

  const getBudgetColor = (spent: number, budget: number) => {
    const percentage = (spent / budget) * 100;
    if (percentage >= 100) return '#ef4444';
    if (percentage >= 80) return '#f59e0b';
    return '#10b981';
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(to bottom right, #0f172a, #1e293b)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'white', fontSize: '18px' }}>Loading dashboard...</div>
      </div>
    );
  }

  return (
    <>
      <Navigation />
      <div style={{ minHeight: '100vh', background: 'linear-gradient(to bottom right, #0f172a, #1e293b)', padding: '24px', paddingLeft: '80px' }}>
        {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '8px', background: 'linear-gradient(to right, #86efac, #fbbf24)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
            💰 {branding.appName}
          </h1>
          <p style={{ color: '#94a3b8', fontSize: '14px' }}>Welcome back! Here's your financial overview.</p>
        </div>
      </div>

      {/* Top Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '32px' }}>
        <div style={{ background: 'rgba(17, 24, 39, 0.8)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '16px', padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '16px' }}>
            <div>
              <p style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '8px' }}>Net Worth</p>
              <h3 style={{ fontSize: '28px', fontWeight: 'bold', color: 'white' }}>{formatCurrency(netWorth)}</h3>
            </div>
            <div style={{ width: '48px', height: '48px', background: 'rgba(34, 197, 94, 0.2)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Wallet size={24} color="#22c55e" />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <TrendingUp size={16} color="#22c55e" />
            <span style={{ color: '#22c55e', fontSize: '14px' }}>Track your wealth</span>
          </div>
        </div>

        <div style={{ background: 'rgba(17, 24, 39, 0.8)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '16px', padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '16px' }}>
            <div>
              <p style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '8px' }}>Monthly Income</p>
              <h3 style={{ fontSize: '28px', fontWeight: 'bold', color: 'white' }}>{formatCurrency(monthlyIncome)}</h3>
            </div>
            <div style={{ width: '48px', height: '48px', background: 'rgba(59, 130, 246, 0.2)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TrendingUp size={24} color="#3b82f6" />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: '#94a3b8', fontSize: '14px' }}>Current month earnings</span>
          </div>
        </div>

        <div style={{ background: 'rgba(17, 24, 39, 0.8)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '16px', padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '16px' }}>
            <div>
              <p style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '8px' }}>Monthly Expenses</p>
              <h3 style={{ fontSize: '28px', fontWeight: 'bold', color: 'white' }}>{formatCurrency(monthlyExpenses)}</h3>
            </div>
            <div style={{ width: '48px', height: '48px', background: 'rgba(239, 68, 68, 0.2)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TrendingDown size={24} color="#ef4444" />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <TrendingDown size={16} color="#ef4444" />
            <span style={{ color: '#ef4444', fontSize: '14px' }}>Current month spending</span>
          </div>
        </div>

        <div style={{ background: 'rgba(17, 24, 39, 0.8)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '16px', padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '16px' }}>
            <div>
              <p style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '8px' }}>Savings Rate</p>
              <h3 style={{ fontSize: '28px', fontWeight: 'bold', color: 'white' }}>{savingsRate.toFixed(1)}%</h3>
            </div>
            <div style={{ width: '48px', height: '48px', background: 'rgba(251, 191, 36, 0.2)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <PiggyBank size={24} color="#fbbf24" />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: '#94a3b8', fontSize: '14px' }}>Great job saving!</span>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px', marginBottom: '24px' }}>
        {/* Cash Flow Chart */}
        <div style={{ background: 'rgba(17, 24, 39, 0.8)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '16px', padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', color: 'white' }}>Cash Flow</h3>
            <select value={timeRange} onChange={(e) => setTimeRange(e.target.value)} style={{ padding: '8px 12px', background: 'rgba(255, 255, 255, 0.1)', border: '1px solid rgba(255, 255, 255, 0.2)', borderRadius: '8px', color: 'white', cursor: 'pointer' }}>
              <option value="week">Last 7 days</option>
              <option value="month">Last 30 days</option>
              <option value="year">Last year</option>
            </select>
          </div>
          <ResponsiveContainer width="100%" height={280} key={`cashflow-${timeRange}`}>
            <BarChart data={cashFlowData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
              <XAxis dataKey="month" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Bar dataKey="income" fill="#22c55e" radius={[8, 8, 0, 0]} />
              <Bar dataKey="expenses" fill="#ef4444" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Spending by Category */}
        <div style={{ background: 'rgba(17, 24, 39, 0.8)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '16px', padding: '24px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: 'white', marginBottom: '24px' }}>Spending by Category</h3>
          {categoryData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div style={{ background: '#1e293b', border: '1px solid rgba(255, 255, 255, 0.2)', borderRadius: '8px', padding: '12px' }}>
                            <p style={{ color: 'white', marginBottom: '4px', fontWeight: '600' }}>{payload[0].name}</p>
                            <p style={{ color: payload[0].payload.color, margin: 0 }}>
                              {formatCurrency(payload[0].value)}
                            </p>
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: cat.color }}></div>
                      <span style={{ color: '#94a3b8', fontSize: '14px' }}>{cat.name}</span>
                    </div>
                    <span style={{ color: 'white', fontWeight: '600', fontSize: '14px' }}>{formatCurrency(cat.value)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', color: '#94a3b8', padding: '40px 0' }}>No spending data</div>
          )}
        </div>
      </div>

      {/* Budgets and Accounts Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
        {/* Budget Progress */}
        <div style={{ background: 'rgba(17, 24, 39, 0.8)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '16px', padding: '24px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: 'white', marginBottom: '20px' }}>Budget Progress</h3>
          {budgets.length > 0 ? budgets.map((budget, idx) => (
            <div
              key={idx}
              onClick={() => window.location.href = '/budgets'}
              style={{ marginBottom: '20px', cursor: 'pointer', transition: 'transform 0.2s', ':hover': { transform: 'translateX(4px)' } }}
              onMouseEnter={(e) => e.currentTarget.style.transform = 'translateX(4px)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'translateX(0)'}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ color: 'white', fontSize: '14px', fontWeight: '500' }}>{budget.category}</span>
                <span style={{ color: '#94a3b8', fontSize: '14px' }}>
                  {formatCurrency(budget.spent)} of {formatCurrency(budget.budget)}
                </span>
              </div>
              <div style={{ width: '100%', height: '8px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{
                  width: `${getBudgetPercentage(budget.spent, budget.budget)}%`,
                  height: '100%',
                  background: getBudgetColor(budget.spent, budget.budget),
                  transition: 'width 0.3s ease',
                  borderRadius: '4px'
                }}></div>
              </div>
            </div>
          )) : (
            <div style={{ textAlign: 'center', color: '#94a3b8', padding: '20px 0' }}>No budgets set</div>
          )}
        </div>

        {/* Accounts Summary */}
        <div style={{ background: 'rgba(17, 24, 39, 0.8)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '16px', padding: '24px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: 'white', marginBottom: '20px' }}>Accounts</h3>
          {accounts.length > 0 ? accounts.map((account, idx) => (
            <div
              key={idx}
              onClick={() => window.location.href = '/accounts'}
              style={{ padding: '16px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '12px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', transition: 'all 0.2s' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.transform = 'translateX(4px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                e.currentTarget.style.transform = 'translateX(0)';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '40px', height: '40px', background: 'rgba(59, 130, 246, 0.2)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {account.type === 'checking' && <Wallet size={20} color="#3b82f6" />}
                  {account.type === 'savings' && <PiggyBank size={20} color="#22c55e" />}
                  {account.type === 'credit' && <CreditCard size={20} color="#ef4444" />}
                  {account.type !== 'checking' && account.type !== 'savings' && account.type !== 'credit' && <Wallet size={20} color="#3b82f6" />}
                </div>
                <div>
                  <p style={{ color: 'white', fontSize: '14px', fontWeight: '500', marginBottom: '4px' }}>{account.name}</p>
                  <p style={{ color: '#94a3b8', fontSize: '12px', textTransform: 'capitalize' }}>{account.type}</p>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ color: 'white', fontSize: '16px', fontWeight: '600', marginBottom: '4px' }}>{formatCurrency(Math.abs(account.balance))}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                  {account.trend > 0 ? <TrendingUp size={14} color="#22c55e" /> : <TrendingDown size={14} color="#ef4444" />}
                  <span style={{ color: account.trend > 0 ? '#22c55e' : '#ef4444', fontSize: '12px' }}>
                    {Math.abs(account.trend)}%
                  </span>
                </div>
              </div>
            </div>
          )) : (
            <div style={{ textAlign: 'center', color: '#94a3b8', padding: '20px 0' }}>No accounts found</div>
          )}
        </div>
      </div>

      {/* Monthly Expense Aggregation */}
      <div style={{ background: 'rgba(17, 24, 39, 0.8)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '16px', padding: '24px' }}>
        <div style={{ marginBottom: '20px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: 'white' }}>Monthly Expense Breakdown</h3>
          <p style={{ color: '#94a3b8', fontSize: '14px', marginTop: '4px' }}>View expenses grouped by month, category, and account</p>
        </div>
        {monthlyAggregation.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid rgba(255, 255, 255, 0.1)' }}>
                  <th style={{ padding: '12px', textAlign: 'left', color: '#94a3b8', fontWeight: '600', fontSize: '14px', minWidth: '100px' }}>Month</th>
                  <th style={{ padding: '12px', textAlign: 'right', color: '#94a3b8', fontWeight: '600', fontSize: '14px', minWidth: '120px' }}>Total</th>
                  <th style={{ padding: '12px', textAlign: 'left', color: '#94a3b8', fontWeight: '600', fontSize: '14px', minWidth: '200px' }}>Categories</th>
                  <th style={{ padding: '12px', textAlign: 'left', color: '#94a3b8', fontWeight: '600', fontSize: '14px', minWidth: '200px' }}>Accounts</th>
                  <th style={{ padding: '12px', textAlign: 'center', color: '#94a3b8', fontWeight: '600', fontSize: '14px', minWidth: '100px' }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {monthlyAggregation.map((month: any) => {
                  const isExpanded = expandedMonths.has(month.month);
                  const categories = Object.values(month.categories);
                  const accounts = Object.values(month.accounts);

                  return (
                    <React.Fragment key={month.month}>
                      <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                        <td style={{ padding: '16px 12px', color: 'white', fontWeight: '600', fontSize: '14px', verticalAlign: 'top' }}>
                          {month.month}
                        </td>
                        <td style={{ padding: '16px 12px', textAlign: 'right', color: '#ef4444', fontWeight: '700', fontSize: '16px', verticalAlign: 'top' }}>
                          {formatCurrency(month.total)}
                        </td>
                        <td style={{ padding: '16px 12px', verticalAlign: 'top' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {categories.map((cat: any) => (
                              <div key={cat.name} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center' }}>
                                <span style={{
                                  fontSize: '13px',
                                  fontWeight: '500',
                                  padding: '4px 10px',
                                  borderRadius: '6px',
                                  background: cat.color ? `${cat.color}20` : 'rgba(107, 114, 128, 0.2)',
                                  color: cat.color || '#6b7280',
                                  border: `1px solid ${cat.color || '#6b7280'}40`,
                                  display: 'inline-block'
                                }}>{cat.name}</span>
                                <span style={{ color: '#ef4444', fontSize: '13px', fontWeight: '600', whiteSpace: 'nowrap' }}>{formatCurrency(cat.total)}</span>
                              </div>
                            ))}
                          </div>
                        </td>
                        <td style={{ padding: '16px 12px', verticalAlign: 'top' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {accounts.map((acc: any) => (
                              <div key={acc.name} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center' }}>
                                <span style={{
                                  fontSize: '13px',
                                  fontWeight: '500',
                                  padding: '4px 10px',
                                  borderRadius: '6px',
                                  background: acc.color ? `${acc.color}20` : 'rgba(107, 114, 128, 0.2)',
                                  color: acc.color || '#6b7280',
                                  border: `1px solid ${acc.color || '#6b7280'}40`,
                                  display: 'inline-block'
                                }}>{acc.name}</span>
                                <span style={{ color: '#ef4444', fontSize: '13px', fontWeight: '600', whiteSpace: 'nowrap' }}>{formatCurrency(acc.total)}</span>
                              </div>
                            ))}
                          </div>
                        </td>
                        <td style={{ padding: '16px 12px', textAlign: 'center', verticalAlign: 'top' }}>
                          <button
                            onClick={() => toggleMonth(month.month)}
                            style={{
                              padding: '6px 12px',
                              background: 'rgba(255, 255, 255, 0.1)',
                              border: '1px solid rgba(255, 255, 255, 0.2)',
                              borderRadius: '6px',
                              color: 'white',
                              cursor: 'pointer',
                              fontSize: '12px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
                          >
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            {isExpanded ? 'Hide' : 'Show'} ({month.transactions.length})
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={5} style={{ padding: '0', background: 'rgba(0, 0, 0, 0.3)' }}>
                            <div style={{ padding: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
                              <h5 style={{ fontSize: '13px', fontWeight: '600', color: '#94a3b8', marginBottom: '12px' }}>
                                Individual Transactions ({month.transactions.length})
                              </h5>
                              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                  <thead>
                                    <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                                      <th style={{ padding: '8px', textAlign: 'left', color: '#64748b', fontSize: '12px', fontWeight: '500' }}>Date</th>
                                      <th style={{ padding: '8px', textAlign: 'left', color: '#64748b', fontSize: '12px', fontWeight: '500' }}>Description</th>
                                      <th style={{ padding: '8px', textAlign: 'left', color: '#64748b', fontSize: '12px', fontWeight: '500' }}>Category</th>
                                      <th style={{ padding: '8px', textAlign: 'left', color: '#64748b', fontSize: '12px', fontWeight: '500' }}>Account</th>
                                      <th style={{ padding: '8px', textAlign: 'right', color: '#64748b', fontSize: '12px', fontWeight: '500' }}>Amount</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {month.transactions.map((txn: any) => (
                                      <tr key={txn.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                                        <td style={{ padding: '8px', color: '#94a3b8', fontSize: '12px' }}>
                                          {new Date(txn.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                        </td>
                                        <td style={{ padding: '8px', color: 'white', fontSize: '13px' }}>{txn.description}</td>
                                        <td style={{ padding: '8px', color: '#94a3b8', fontSize: '12px' }}>
                                          {txn.category?.name || txn.category || 'Uncategorized'}
                                        </td>
                                        <td style={{ padding: '8px', color: '#94a3b8', fontSize: '12px' }}>
                                          {txn.account?.name || txn.account || 'Unknown'}
                                        </td>
                                        <td style={{ padding: '8px', textAlign: 'right', color: '#ef4444', fontWeight: '600', fontSize: '13px' }}>
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
            <button onClick={() => window.location.href = '/transactions'} style={{ marginTop: '16px', width: '100%', padding: '12px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px', color: 'white', cursor: 'pointer', fontSize: '14px', transition: 'all 0.3s' }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'}
            >
              View All Transactions
            </button>
          </div>
        ) : (
          <div style={{ textAlign: 'center', color: '#94a3b8', padding: '40px 0' }}>No expense data found</div>
        )}
      </div>
    </div>

    {/* Footer */}
    <div style={{ textAlign: 'center', padding: '24px', color: '#64748b', fontSize: '13px', borderTop: '1px solid rgba(255, 255, 255, 0.1)', marginTop: '40px' }}>
      Part of {branding.parentBrand} ecosystem
    </div>
    </>
  );
};

export default Dashboard;
