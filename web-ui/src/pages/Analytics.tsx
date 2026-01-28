import React, { useState, useEffect } from 'react';
import { Navigation } from '../components/Navigation';
import { useAuthStore } from '../store/authStore';
import { getBranding } from '../config/branding';
import analyticsService from '../services/analyticsService';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Calendar,
  Download,
  ArrowUpRight,
  ArrowDownRight,
  AlertCircle,
  CheckCircle2,
  Activity,
  Target,
  CreditCard,
  PieChart as PieChartIcon,
  BarChart3,
  Wallet
} from 'lucide-react';

// Tab types
type AnalyticsTab = 'overview' | 'cashflow' | 'spending' | 'health' | 'credit';

// Color palette for categories
const CATEGORY_COLORS = ['#3b82f6', '#a855f7', '#10b981', '#f97316', '#ec4899', '#06b6d4', '#f59e0b', '#84cc16'];

export const Analytics: React.FC = () => {
  const { user } = useAuthStore();
  const branding = getBranding(user?.default_currency_code);

  const [activeTab, setActiveTab] = useState<AnalyticsTab>('overview');
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'week' | 'month' | 'year'>('month');

  // Data state
  const [cashFlowMonthly, setCashFlowMonthly] = useState<Array<{
    month: string;
    income: number;
    expenses: number;
    savings: number;
  }>>([]);

  const [categorySpending, setCategorySpending] = useState<Array<{
    name: string;
    value: number;
    percentage: number;
    color: string;
  }>>([]);

  const [incomeSources, setIncomeSources] = useState<Array<{
    name: string;
    value: number;
    color: string;
  }>>([]);

  const [netWorthTrend, setNetWorthTrend] = useState<Array<{
    month: string;
    netWorth: number;
    assets: number;
    liabilities: number;
  }>>([]);

  const [currentMetrics, setCurrentMetrics] = useState({
    totalIncome: 0,
    totalExpenses: 0,
    netSavings: 0,
    savingsRate: 0,
    debtToIncome: 0,
    emergencyFundMonths: 0,
    liquidityRatio: 0,
    investmentReturn: 0
  });

  useEffect(() => {
    loadAnalytics();
  }, [timeRange]);

  const loadAnalytics = async () => {
    try {
      setLoading(true);

      // Determine months based on time range
      const months = timeRange === 'week' ? 1 : timeRange === 'year' ? 12 : 6;

      // Load all data in parallel
      const [cashflow, health, networth, topCategories] = await Promise.all([
        analyticsService.getCashFlowData(months),
        analyticsService.getFinancialHealth(),
        analyticsService.getNetWorthTrendData(12),
        analyticsService.getTopSpendingCategories(8)
      ]);

      // Set cash flow data
      setCashFlowMonthly(cashflow);

      // Set health metrics
      setCurrentMetrics(health);

      // Set net worth trend
      setNetWorthTrend(networth);

      // Process category spending data
      const totalCategorySpending = topCategories.reduce((sum, cat) => sum + cat.amount, 0);
      const categoriesWithPercentage = topCategories.map((cat, idx) => ({
        name: cat.category_name || cat.name || 'Uncategorized',
        value: cat.amount || 0,
        percentage: totalCategorySpending > 0 ? (cat.amount / totalCategorySpending) * 100 : 0,
        color: CATEGORY_COLORS[idx % CATEGORY_COLORS.length]
      }));
      console.log('Category spending data:', categoriesWithPercentage); // Debug log
      setCategorySpending(categoriesWithPercentage);

      // Set income sources (placeholder - could be enhanced with actual income source tracking)
      setIncomeSources([
        { name: 'Primary Income', value: health.totalIncome * 0.75, color: '#15803d' },
        { name: 'Secondary Income', value: health.totalIncome * 0.20, color: '#059669' },
        { name: 'Other', value: health.totalIncome * 0.05, color: '#10b981' },
      ]);

      setLoading(false);
    } catch (error) {
      console.error('Failed to load analytics:', error);
      setLoading(false);
    }
  };

  const handleExport = () => {
    alert('Export functionality coming soon');
  };

  if (loading) {
    return (
      <>
        <Navigation />
        <div style={{ minHeight: '100vh', background: 'linear-gradient(to bottom, #0f172a, #1e293b)', padding: '24px', paddingLeft: '80px' }}>
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <div style={{
              width: '48px',
              height: '48px',
              border: '4px solid rgba(139, 92, 246, 0.3)',
              borderTop: '4px solid #8b5cf6',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto'
            }} />
            <p style={{ color: '#94a3b8', marginTop: '16px' }}>Loading analytics...</p>
          </div>
        </div>
      </>
    );
  }

  const tabs = [
    { id: 'overview' as const, label: 'Overview', icon: <BarChart3 size={18} /> },
    { id: 'cashflow' as const, label: 'Cash Flow', icon: <Activity size={18} /> },
    { id: 'spending' as const, label: 'Spending Analysis', icon: <PieChartIcon size={18} /> },
    { id: 'health' as const, label: 'Financial Health', icon: <Target size={18} /> },
    { id: 'credit' as const, label: 'Credit Utilization', icon: <CreditCard size={18} /> }
  ];

  return (
    <>
      <Navigation />
      <div style={{ minHeight: '100vh', background: 'linear-gradient(to bottom, #0f172a, #1e293b)', padding: '24px', paddingLeft: '80px' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '32px',
          flexWrap: 'wrap',
          gap: '16px'
        }}>
          <div>
            <h1 style={{
              fontSize: '32px',
              fontWeight: '700',
              color: 'white',
              marginBottom: '8px'
            }}>
              Analytics Dashboard
            </h1>
            <p style={{ color: '#94a3b8', fontSize: '15px' }}>
              Comprehensive insights into your financial health
            </p>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              {(['week', 'month', 'year'] as const).map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  style={{
                    padding: '8px 16px',
                    background: timeRange === range ? 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)' : 'transparent',
                    border: timeRange === range ? 'none' : '1px solid rgba(139, 92, 246, 0.3)',
                    borderRadius: '8px',
                    color: 'white',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  {range.charAt(0).toUpperCase() + range.slice(1)}
                </button>
              ))}
            </div>
            <button
              onClick={handleExport}
              style={{
                padding: '8px 16px',
                background: 'transparent',
                border: '1px solid rgba(139, 92, 246, 0.3)',
                borderRadius: '8px',
                color: 'white',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s'
              }}
            >
              <Download size={16} />
              Export
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '32px',
          borderBottom: '1px solid rgba(148, 163, 184, 0.1)',
          paddingBottom: '4px'
        }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '12px 20px',
                background: activeTab === tab.id ? 'rgba(139, 92, 246, 0.1)' : 'transparent',
                border: 'none',
                borderBottom: activeTab === tab.id ? '2px solid #8b5cf6' : '2px solid transparent',
                color: activeTab === tab.id ? '#8b5cf6' : '#94a3b8',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s'
              }}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div>
            {/* Summary Cards */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
              gap: '24px',
              marginBottom: '32px'
            }}>
              <MetricCard
                title="Total Income"
                value={`${branding.currencySymbol}${currentMetrics.totalIncome.toLocaleString()}`}
                change="+12.5%"
                isPositive={true}
                icon={<TrendingUp size={24} />}
                color="#10b981"
              />
              <MetricCard
                title="Total Expenses"
                value={`${branding.currencySymbol}${currentMetrics.totalExpenses.toLocaleString()}`}
                change="+8.3%"
                isPositive={false}
                icon={<TrendingDown size={24} />}
                color="#ef4444"
              />
              <MetricCard
                title="Net Savings"
                value={`${branding.currencySymbol}${currentMetrics.netSavings.toLocaleString()}`}
                change="+15.2%"
                isPositive={true}
                icon={<DollarSign size={24} />}
                color="#3b82f6"
              />
              <MetricCard
                title="Savings Rate"
                value={`${currentMetrics.savingsRate}%`}
                change="+2.1%"
                isPositive={true}
                icon={<Target size={24} />}
                color="#a855f7"
              />
            </div>

            {/* Charts */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))',
              gap: '24px'
            }}>
              {/* Income vs Expenses */}
              <ChartCard title="Income vs Expenses" subtitle="Last 6 months">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={cashFlowMonthly}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.1)" />
                    <XAxis dataKey="month" stroke="#94a3b8" />
                    <YAxis stroke="#94a3b8" />
                    <Tooltip
                      contentStyle={{
                        background: '#1e293b',
                        border: '1px solid rgba(148, 163, 184, 0.2)',
                        borderRadius: '8px'
                      }}
                    />
                    <Legend />
                    <Bar dataKey="income" fill="#10b981" name="Income" radius={[8, 8, 0, 0]} />
                    <Bar dataKey="expenses" fill="#ef4444" name="Expenses" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              {/* Spending by Category */}
              <ChartCard title="Spending by Category" subtitle="Current period">
                {categorySpending.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie
                          data={categorySpending}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={2}
                          dataKey="value"
                        >
                          {categorySpending.map((entry, index) => (
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
                                    {branding.currencySymbol}{payload[0].value.toLocaleString()} ({payload[0].payload.percentage.toFixed(1)}%)
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
                      {categorySpending.slice(0, 5).map((cat, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                            <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: cat.color }}></div>
                            <span style={{ color: '#94a3b8', fontSize: '14px' }}>{cat.name || 'Unknown'}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{ color: 'white', fontWeight: '600', fontSize: '14px' }}>{branding.currencySymbol}{cat.value.toLocaleString()}</span>
                            <span style={{ color: '#64748b', fontSize: '13px' }}>({cat.percentage.toFixed(1)}%)</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div style={{ textAlign: 'center', color: '#94a3b8', padding: '40px 0' }}>No spending data</div>
                )}
              </ChartCard>
            </div>
          </div>
        )}

        {/* Cash Flow Tab */}
        {activeTab === 'cashflow' && (
          <div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: '24px',
              marginBottom: '32px'
            }}>
              <MetricCard
                title="Monthly Inflow"
                value={`${branding.currencySymbol}${currentMetrics.totalIncome.toLocaleString()}`}
                change="+5.2%"
                isPositive={true}
                icon={<ArrowUpRight size={24} />}
                color="#10b981"
              />
              <MetricCard
                title="Monthly Outflow"
                value={`${branding.currencySymbol}${currentMetrics.totalExpenses.toLocaleString()}`}
                change="+3.1%"
                isPositive={false}
                icon={<ArrowDownRight size={24} />}
                color="#ef4444"
              />
              <MetricCard
                title="Net Cash Flow"
                value={`${branding.currencySymbol}${currentMetrics.netSavings.toLocaleString()}`}
                change="+8.7%"
                isPositive={true}
                icon={<Activity size={24} />}
                color="#3b82f6"
              />
            </div>

            <ChartCard title="Cash Flow Trend" subtitle="Monthly breakdown over 6 months">
              <ResponsiveContainer width="100%" height={400}>
                <AreaChart data={cashFlowMonthly}>
                  <defs>
                    <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorSavings" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.1)" />
                  <XAxis dataKey="month" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip
                    contentStyle={{
                      background: '#1e293b',
                      border: '1px solid rgba(148, 163, 184, 0.2)',
                      borderRadius: '8px'
                    }}
                  />
                  <Legend />
                  <Area type="monotone" dataKey="income" stroke="#10b981" fillOpacity={1} fill="url(#colorIncome)" name="Income" />
                  <Area type="monotone" dataKey="expenses" stroke="#ef4444" fillOpacity={1} fill="url(#colorExpenses)" name="Expenses" />
                  <Area type="monotone" dataKey="savings" stroke="#3b82f6" fillOpacity={1} fill="url(#colorSavings)" name="Savings" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        )}

        {/* Spending Analysis Tab */}
        {activeTab === 'spending' && (
          <div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '24px',
              marginBottom: '32px'
            }}>
              <ChartCard title="Spending Distribution" subtitle="By category">
                {categorySpending.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={250}>
                      <PieChart>
                        <Pie
                          data={categorySpending}
                          cx="50%"
                          cy="50%"
                          innerRadius={70}
                          outerRadius={100}
                          paddingAngle={2}
                          dataKey="value"
                        >
                          {categorySpending.map((entry, index) => (
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
                                    {branding.currencySymbol}{payload[0].value.toLocaleString()} ({payload[0].payload.percentage.toFixed(1)}%)
                                  </p>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
                      {categorySpending.map((cat, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: cat.color }}></div>
                            <span style={{ color: '#94a3b8', fontSize: '13px' }}>{cat.name || 'Unknown'}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{ color: 'white', fontSize: '13px' }}>{branding.currencySymbol}{cat.value.toLocaleString()}</span>
                            <span style={{ color: '#64748b', fontSize: '13px', minWidth: '50px', textAlign: 'right' }}>{cat.percentage.toFixed(1)}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div style={{ textAlign: 'center', color: '#94a3b8', padding: '40px 0' }}>No spending data</div>
                )}
              </ChartCard>

              <ChartCard title="Income Sources" subtitle="Revenue breakdown">
                <ResponsiveContainer width="100%" height={350}>
                  <PieChart>
                    <Pie
                      data={incomeSources}
                      cx="50%"
                      cy="50%"
                      labelLine={true}
                      label={({ name, value }) => `${name}: ${branding.currencySymbol}${value}`}
                      outerRadius={120}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {incomeSources.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: '#1e293b',
                        border: '1px solid rgba(148, 163, 184, 0.2)',
                        borderRadius: '8px'
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            {/* Category Details */}
            <div style={{
              background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
              border: '1px solid rgba(148, 163, 184, 0.1)',
              borderRadius: '12px',
              padding: '24px'
            }}>
              <h2 style={{ fontSize: '20px', fontWeight: '600', color: 'white', marginBottom: '24px' }}>
                Category Breakdown
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {categorySpending.map((category, index) => (
                  <div key={index} style={{ paddingBottom: '16px', borderBottom: '1px solid rgba(148, 163, 184, 0.1)' }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '8px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                          width: '12px',
                          height: '12px',
                          borderRadius: '50%',
                          background: category.color
                        }} />
                        <span style={{ color: 'white', fontWeight: '500' }}>{category.name || 'Unknown Category'}</span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ color: 'white', fontWeight: '600', fontSize: '16px' }}>
                          {branding.currencySymbol}{category.value.toLocaleString()}
                        </p>
                        <p style={{ color: '#94a3b8', fontSize: '13px' }}>{category.percentage.toFixed(1)}%</p>
                      </div>
                    </div>
                    <div style={{
                      height: '8px',
                      background: '#1e293b',
                      borderRadius: '4px',
                      overflow: 'hidden'
                    }}>
                      <div style={{
                        height: '100%',
                        background: category.color,
                        width: `${category.percentage}%`,
                        transition: 'width 0.3s'
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Financial Health Tab */}
        {activeTab === 'health' && (
          <div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
              gap: '24px',
              marginBottom: '32px'
            }}>
              <HealthMetricCard
                title="Debt-to-Income Ratio"
                value={`${(currentMetrics.debtToIncome * 100).toFixed(1)}%`}
                status={currentMetrics.debtToIncome < 0.36 ? 'good' : currentMetrics.debtToIncome < 0.5 ? 'warning' : 'danger'}
                description="Percentage of income used for debt"
              />
              <HealthMetricCard
                title="Emergency Fund"
                value={`${currentMetrics.emergencyFundMonths} months`}
                status={currentMetrics.emergencyFundMonths >= 6 ? 'good' : currentMetrics.emergencyFundMonths >= 3 ? 'warning' : 'danger'}
                description="Months of expenses covered"
              />
              <HealthMetricCard
                title="Liquidity Ratio"
                value={currentMetrics.liquidityRatio.toFixed(1)}
                status={currentMetrics.liquidityRatio >= 2 ? 'good' : currentMetrics.liquidityRatio >= 1 ? 'warning' : 'danger'}
                description="Ability to cover short-term debts"
              />
              <HealthMetricCard
                title="Investment Return"
                value={`${currentMetrics.investmentReturn.toFixed(1)}%`}
                status={currentMetrics.investmentReturn >= 7 ? 'good' : currentMetrics.investmentReturn >= 4 ? 'warning' : 'danger'}
                description="Annual portfolio performance"
              />
            </div>

            {/* Net Worth Trend */}
            <ChartCard title="Net Worth Trend" subtitle="12-month progression">
              <ResponsiveContainer width="100%" height={400}>
                <AreaChart data={netWorthTrend}>
                  <defs>
                    <linearGradient id="colorNetWorth" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.1)" />
                  <XAxis dataKey="month" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip
                    contentStyle={{
                      background: '#1e293b',
                      border: '1px solid rgba(148, 163, 184, 0.2)',
                      borderRadius: '8px'
                    }}
                  />
                  <Legend />
                  <Area type="monotone" dataKey="netWorth" stroke="#8b5cf6" fillOpacity={1} fill="url(#colorNetWorth)" name="Net Worth" />
                  <Line type="monotone" dataKey="assets" stroke="#10b981" name="Assets" strokeWidth={2} />
                  <Line type="monotone" dataKey="liabilities" stroke="#ef4444" name="Liabilities" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Financial Insights */}
            <div style={{
              background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
              border: '1px solid rgba(148, 163, 184, 0.1)',
              borderRadius: '12px',
              padding: '24px',
              marginTop: '24px'
            }}>
              <h2 style={{ fontSize: '20px', fontWeight: '600', color: 'white', marginBottom: '16px' }}>
                Financial Health Insights
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <InsightItem
                  icon={<CheckCircle2 size={20} color="#10b981" />}
                  text="Your savings rate is above the recommended 20% threshold"
                  type="success"
                />
                <InsightItem
                  icon={<AlertCircle size={20} color="#f97316" />}
                  text="Consider diversifying your income sources to reduce dependency"
                  type="warning"
                />
                <InsightItem
                  icon={<CheckCircle2 size={20} color="#10b981" />}
                  text="Your debt-to-income ratio is healthy and below 36%"
                  type="success"
                />
                <InsightItem
                  icon={<AlertCircle size={20} color="#f97316" />}
                  text="Build your emergency fund to cover 6 months of expenses"
                  type="warning"
                />
              </div>
            </div>
          </div>
        )}

        {/* Credit Utilization Tab */}
        {activeTab === 'credit' && (
          <div>
            {/* Header Section */}
            <div style={{
              background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
              border: '1px solid rgba(148, 163, 184, 0.1)',
              borderRadius: '12px',
              padding: '32px',
              marginBottom: '24px',
              textAlign: 'center'
            }}>
              <CreditCard size={48} color="#8b5cf6" style={{ margin: '0 auto 16px' }} />
              <h2 style={{ fontSize: '24px', fontWeight: '600', color: 'white', marginBottom: '12px' }}>
                Maximize Every Dollar Spent
              </h2>
              <p style={{ color: '#94a3b8', fontSize: '16px', lineHeight: '1.6', maxWidth: '800px', margin: '0 auto' }}>
                Automatically track credit card rewards utilization and guide you to optimal card usage based on category spending limits, rotating bonuses, annual caps, and sign-up bonus progress.
              </p>
            </div>

            {/* Feature Cards */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '24px',
              marginBottom: '32px'
            }}>
              <div style={{
                background: 'rgba(17, 24, 39, 0.8)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '16px',
                padding: '24px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                  <Target size={24} color="#10b981" />
                  <h3 style={{ fontSize: '18px', fontWeight: '600', color: 'white', margin: 0 }}>Category Limits</h3>
                </div>
                <p style={{ color: '#94a3b8', fontSize: '14px', lineHeight: '1.6' }}>
                  Track spending limits for category bonuses like BofA's 3% on gas up to $2,500/quarter or Amex Gold's 4x points up to $25k on groceries.
                </p>
              </div>

              <div style={{
                background: 'rgba(17, 24, 39, 0.8)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '16px',
                padding: '24px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                  <Activity size={24} color="#3b82f6" />
                  <h3 style={{ fontSize: '18px', fontWeight: '600', color: 'white', margin: 0 }}>Rotating Bonuses</h3>
                </div>
                <p style={{ color: '#94a3b8', fontSize: '14px', lineHeight: '1.6' }}>
                  Stay on top of quarterly rotating categories like Chase Freedom's 5% bonuses and get reminders to activate them.
                </p>
              </div>

              <div style={{
                background: 'rgba(17, 24, 39, 0.8)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '16px',
                padding: '24px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                  <TrendingUp size={24} color="#f59e0b" />
                  <h3 style={{ fontSize: '18px', fontWeight: '600', color: 'white', margin: 0 }}>SUB Progress</h3>
                </div>
                <p style={{ color: '#94a3b8', fontSize: '14px', lineHeight: '1.6' }}>
                  Monitor your progress toward sign-up bonus requirements and get alerts when you're close to hitting minimum spend thresholds.
                </p>
              </div>

              <div style={{
                background: 'rgba(17, 24, 39, 0.8)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '16px',
                padding: '24px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                  <Wallet size={24} color="#8b5cf6" />
                  <h3 style={{ fontSize: '18px', fontWeight: '600', color: 'white', margin: 0 }}>Optimal Card Guide</h3>
                </div>
                <p style={{ color: '#94a3b8', fontSize: '14px', lineHeight: '1.6' }}>
                  Get real-time recommendations on which card to use for each transaction to maximize your rewards earnings.
                </p>
              </div>
            </div>

            {/* Coming Soon Banner */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(59, 130, 246, 0.1) 100%)',
              border: '1px solid rgba(139, 92, 246, 0.3)',
              borderRadius: '12px',
              padding: '24px',
              textAlign: 'center'
            }}>
              <h3 style={{ fontSize: '20px', fontWeight: '600', color: 'white', marginBottom: '8px' }}>
                Coming Soon
              </h3>
              <p style={{ color: '#94a3b8', fontSize: '14px' }}>
                This feature is currently in development. Stay tuned for updates!
              </p>
            </div>
          </div>
        )}
        </div>
      </div>
    </>
  );
};

// Reusable Components

const MetricCard: React.FC<{
  title: string;
  value: string;
  change: string;
  isPositive: boolean;
  icon: React.ReactNode;
  color: string;
}> = ({ title, value, change, isPositive, icon, color }) => (
  <div style={{
    background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
    border: '1px solid rgba(148, 163, 184, 0.1)',
    borderRadius: '12px',
    padding: '24px',
    position: 'relative',
    overflow: 'hidden',
    transition: 'transform 0.2s, border-color 0.2s',
    cursor: 'pointer'
  }}>
    <div style={{ position: 'relative', zIndex: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          background: `linear-gradient(135deg, ${color} 0%, ${color}dd 100%)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white'
        }}>
          {icon}
        </div>
        {isPositive ? <ArrowUpRight size={20} color={color} /> : <ArrowDownRight size={20} color={color} />}
      </div>
      <p style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '4px' }}>{title}</p>
      <p style={{ fontSize: '28px', fontWeight: '700', color: 'white', marginBottom: '8px' }}>
        {value}
      </p>
      <p style={{ color: isPositive ? '#10b981' : '#ef4444', fontSize: '13px' }}>{change} vs last period</p>
    </div>
  </div>
);

const ChartCard: React.FC<{
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}> = ({ title, subtitle, children }) => (
  <div style={{
    background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
    border: '1px solid rgba(148, 163, 184, 0.1)',
    borderRadius: '12px',
    padding: '24px'
  }}>
    <div style={{ marginBottom: '20px' }}>
      <h2 style={{ fontSize: '20px', fontWeight: '600', color: 'white', marginBottom: '4px' }}>
        {title}
      </h2>
      {subtitle && (
        <p style={{ color: '#94a3b8', fontSize: '13px' }}>{subtitle}</p>
      )}
    </div>
    {children}
  </div>
);

const HealthMetricCard: React.FC<{
  title: string;
  value: string;
  status: 'good' | 'warning' | 'danger';
  description: string;
}> = ({ title, value, status, description }) => {
  const colors = {
    good: { bg: '#10b981', light: 'rgba(16, 185, 129, 0.1)', border: 'rgba(16, 185, 129, 0.3)' },
    warning: { bg: '#f97316', light: 'rgba(249, 115, 22, 0.1)', border: 'rgba(249, 115, 22, 0.3)' },
    danger: { bg: '#ef4444', light: 'rgba(239, 68, 68, 0.1)', border: 'rgba(239, 68, 68, 0.3)' }
  };

  return (
    <div style={{
      background: colors[status].light,
      border: `1px solid ${colors[status].border}`,
      borderRadius: '12px',
      padding: '20px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        {status === 'good' && <CheckCircle2 size={20} color={colors[status].bg} />}
        {status !== 'good' && <AlertCircle size={20} color={colors[status].bg} />}
        <h3 style={{ color: 'white', fontWeight: '600', fontSize: '15px' }}>{title}</h3>
      </div>
      <p style={{
        fontSize: '32px',
        fontWeight: '700',
        color: colors[status].bg,
        marginBottom: '4px'
      }}>
        {value}
      </p>
      <p style={{ color: '#94a3b8', fontSize: '13px' }}>{description}</p>
    </div>
  );
};

const InsightItem: React.FC<{
  icon: React.ReactNode;
  text: string;
  type: 'success' | 'warning';
}> = ({ icon, text, type }) => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px',
    background: type === 'success' ? 'rgba(16, 185, 129, 0.05)' : 'rgba(249, 115, 22, 0.05)',
    border: `1px solid ${type === 'success' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(249, 115, 22, 0.2)'}`,
    borderRadius: '8px'
  }}>
    {icon}
    <p style={{ color: '#e2e8f0', fontSize: '14px' }}>{text}</p>
  </div>
);
