import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { getBranding } from '../config/branding';
import analyticsService from '../services/analyticsService';
import { flexRowGap8, flexRowGap12, flexRowBetween, flexColGap12, flexColGap16, flexColGap20, sectionHeaderStyle, pageContainerStyle, pageMaxWidthStyle, cardStyle, tableStyle } from '../styles/layoutStyles';
import { formatMoney, tabular } from '../styles/money';
import { ScopeTag } from '../components/ScopeTag';
import type { Scope } from '../utils/scope';
import {
  Line, BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Download,
  ArrowUpRight,
  ArrowDownRight,
  AlertCircle,
  CheckCircle2,
  Activity,
  Target,
  PieChart as PieChartIcon,
  BarChart3,
} from 'lucide-react';

// Tab types
type AnalyticsTab = 'overview' | 'cashflow' | 'spending' | 'health';

// Color palette for categories
const CATEGORY_COLORS = ['var(--accent-blue)', '#a855f7', 'var(--accent-green)', '#f97316', '#ec4899', '#06b6d4', 'var(--accent-yellow)', '#84cc16'];

const metaTextStyle: React.CSSProperties = { color: 'var(--text-secondary)', fontSize: '13px' };
const tooltipBoxStyle: React.CSSProperties = { background: 'var(--tooltip-bg)', border: '1px solid var(--tooltip-border)', borderRadius: '8px', padding: '12px' };
const emptyStateStyle: React.CSSProperties = { textAlign: 'center', color: 'var(--text-secondary)', padding: '40px 0' };

const tooltipLabelStyle: React.CSSProperties = { color: 'var(--text-primary)', marginBottom: '4px', fontWeight: '600' };

export const Analytics: React.FC = () => {
  const { user } = useAuthStore();
  const branding = getBranding(user?.default_currency_code);
  const currency = user?.default_currency_code || 'USD';

  const [activeTab, setActiveTab] = useState<AnalyticsTab>('overview');
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'week' | 'month' | 'year'>('month');
  const rangeLabel = timeRange === 'week' ? 'Last 7 days' : timeRange === 'year' ? 'Last 12 months' : 'This month';

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

  // Balance-sheet ratios. These are not scoped to timeRange — they describe a
  // position, not a period — so the Financial Health tab says so rather than
  // borrowing the range label.
  const [health, setHealth] = useState({
    debtToIncome: 0,
    emergencyFundMonths: 0,
    liquidityRatio: 0,
    investmentReturn: null as number | null,
  });

  // Totals for the selected range, and for the equal-length range before it.
  // `previous` is what makes a "vs last period" figure possible; the four cards
  // used to display the string literals "+12.5%", "+8.3%", "+15.2%" and "+2.1%"
  // regardless of the data, so a brand-new account with £0 of everything was
  // told its income was up 12.5%.
  const [totals, setTotals] = useState({
    income: 0,
    expenses: 0,
    netSavings: 0,
    savingsRate: 0,
  });
  const [previous, setPrevious] = useState<{
    income: number;
    expenses: number;
    netSavings: number;
    savingsRate: number;
  } | null>(null);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAnalytics();
  }, [timeRange]);

  const toISO = (d: Date) => d.toISOString().split('T')[0];

  /**
   * The selected range and the equal-length range immediately before it.
   *
   * Equal-length rather than calendar-aligned: comparing the first four days of
   * this month against a full previous month would understate every figure, and
   * that error would look like real news.
   */
  const windowsFor = (range: 'week' | 'month' | 'year') => {
    const now = new Date();
    const days = range === 'week' ? 7 : range === 'year' ? 365 : 30;

    const currentStart = new Date(now);
    currentStart.setDate(now.getDate() - days);
    const previousStart = new Date(now);
    previousStart.setDate(now.getDate() - days * 2);
    const previousEnd = new Date(currentStart);
    previousEnd.setDate(currentStart.getDate() - 1);

    return {
      months: range === 'year' ? 12 : range === 'week' ? 1 : 2,
      current: { start: toISO(currentStart), end: toISO(now) },
      previous: { start: toISO(previousStart), end: toISO(previousEnd) },
    };
  };

  const sumAmounts = (rows: Array<{ amount?: number }>) =>
    rows.reduce((sum, row) => sum + (row.amount || 0), 0);

  const summarise = (income: number, expenses: number) => ({
    income,
    expenses,
    netSavings: income - expenses,
    savingsRate: income > 0
      ? Math.round(((income - expenses) / income) * 1000) / 10
      : 0,
  });

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      setError(null);

      const { months, current, previous: prior } = windowsFor(timeRange);

      // Expense and income totals are fetched per window. limit=50 rather than 8
      // because these sums must cover every category, not just the ones large
      // enough to chart.
      const [
        cashflow, healthData, networth,
        currentExpenses, currentIncome, priorExpenses, priorIncome,
      ] = await Promise.all([
        analyticsService.getCashFlowData(months),
        analyticsService.getFinancialHealth(),
        analyticsService.getNetWorthTrendData(12),
        analyticsService.getTopSpendingCategories(50, current.start, current.end, 'expense'),
        analyticsService.getTopSpendingCategories(50, current.start, current.end, 'income'),
        analyticsService.getTopSpendingCategories(50, prior.start, prior.end, 'expense'),
        analyticsService.getTopSpendingCategories(50, prior.start, prior.end, 'income'),
      ]);

      setCashFlowMonthly(cashflow);
      setNetWorthTrend(networth);
      setHealth({
        debtToIncome: healthData.debtToIncome,
        emergencyFundMonths: healthData.emergencyFundMonths,
        liquidityRatio: healthData.liquidityRatio,
        investmentReturn: healthData.investmentReturn,
      });

      setTotals(summarise(sumAmounts(currentIncome), sumAmounts(currentExpenses)));
      setPrevious(summarise(sumAmounts(priorIncome), sumAmounts(priorExpenses)));

      const expenseTotal = sumAmounts(currentExpenses);
      setCategorySpending(currentExpenses.slice(0, 8).map((cat, idx) => ({
        name: cat.name || 'Uncategorised',
        value: cat.amount || 0,
        percentage: expenseTotal > 0 ? ((cat.amount || 0) / expenseTotal) * 100 : 0,
        color: CATEGORY_COLORS[idx % CATEGORY_COLORS.length],
      })));

      // Real categories now. This was a 75/20/5 split of total income across
      // invented "Primary"/"Secondary"/"Other" labels — a fabricated breakdown
      // of someone's actual earnings.
      setIncomeSources(currentIncome.slice(0, 8).map((cat, idx) => ({
        name: cat.name || 'Uncategorised',
        value: cat.amount || 0,
        color: CATEGORY_COLORS[idx % CATEGORY_COLORS.length],
      })));

      setLoading(false);
    } catch (err) {
      // Was console.error only, leaving every metric at its initial 0. A total
      // backend outage rendered as a calm dashboard of zeroes with the health
      // ratios reporting "good" — the most misleading possible failure mode.
      console.error('Failed to load analytics:', err);
      setError('Could not load analytics. Check your connection and try again.');
      setLoading(false);
    }
  };

  /**
   * Percentage change, or undefined when there is no baseline to compare with.
   * Undefined renders nothing at all: a missing comparison is not "+0.0%".
   */
  const pctChange = (current: number, prior: number): number | undefined => {
    if (prior === 0) return undefined;
    return ((current - prior) / Math.abs(prior)) * 100;
  };

  /**
   * Observations that follow from the numbers on screen.
   *
   * Every entry is guarded by the data it describes, so a metric with no inputs
   * produces no claim about itself. An empty list is a valid outcome and the tab
   * says so — better than four sentences that happen to be wrong.
   */
  const insights: Array<{ text: string; type: 'success' | 'warning' }> = [];
  if (totals.income > 0) {
    insights.push(totals.savingsRate >= 20
      ? {
        text: `You saved ${totals.savingsRate.toFixed(1)}% of your income this period, above the commonly recommended 20%.`,
        type: 'success',
      }
      : totals.savingsRate >= 0
        ? {
          text: `You saved ${totals.savingsRate.toFixed(1)}% of your income this period. 20% is a common target.`,
          type: 'warning',
        }
        : {
          text: `You spent ${formatMoney(Math.abs(totals.netSavings), { currency })} more than you earned this period.`,
          type: 'warning',
        });
  }
  if (totals.income > 0 && health.debtToIncome > 0) {
    insights.push(health.debtToIncome < 0.36
      ? {
        text: `Your debt-to-income ratio is ${(health.debtToIncome * 100).toFixed(1)}%, below the 36% guideline.`,
        type: 'success',
      }
      : {
        text: `Your debt-to-income ratio is ${(health.debtToIncome * 100).toFixed(1)}%, above the 36% guideline.`,
        type: 'warning',
      });
  }
  if (totals.expenses > 0) {
    insights.push(health.emergencyFundMonths >= 6
      ? {
        text: `Your liquid assets cover about ${health.emergencyFundMonths} months of expenses.`,
        type: 'success',
      }
      : {
        text: `Your liquid assets cover about ${health.emergencyFundMonths} months of expenses. Six months is a common target.`,
        type: 'warning',
      });
  }
  if (incomeSources.length === 1 && totals.income > 0) {
    insights.push({
      text: `All of your recorded income came from one category (${incomeSources[0].name}).`,
      type: 'warning',
    });
  }

  const handleExport = () => {
    // Exports what is on screen, from data already loaded. There is no export
    // endpoint; this button used to call alert('Export functionality coming
    // soon'), which is also a modal dialog we would rather not open.
    const rows: string[][] = [
      ['finPal analytics export'],
      ['Range', rangeLabel],
      ['Generated', new Date().toISOString()],
      [],
      ['Metric', 'Value'],
      ['Total income', totals.income.toFixed(2)],
      ['Total expenses', totals.expenses.toFixed(2)],
      ['Net savings', totals.netSavings.toFixed(2)],
      ['Savings rate (%)', totals.savingsRate.toFixed(1)],
      [],
      ['Spending by category', 'Amount', 'Share (%)'],
      ...categorySpending.map(c => [c.name, c.value.toFixed(2), c.percentage.toFixed(1)]),
      [],
      ['Income by category', 'Amount'],
      ...incomeSources.map(c => [c.name, c.value.toFixed(2)]),
    ];

    const escape = (cell: string) =>
      /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
    const csv = rows.map(row => row.map(escape).join(',')).join('\n');

    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `finpal-analytics-${toISO(new Date())}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <>
        <div style={pageContainerStyle}>
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <div style={{
              width: '48px',
              height: '48px',
              border: '4px solid var(--border-medium)',
              borderTop: '4px solid var(--brand-main-green)',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto'
            }} />
            <p style={{ color: 'var(--text-secondary)', marginTop: '16px' }}>Loading analytics...</p>
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
  ];

  return (
    <>
      <div style={pageContainerStyle}>
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
              fontWeight: 700,
              color: 'var(--text-primary)',
              marginBottom: '8px'
            }}>
              Analytics Dashboard
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>
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
                    background: timeRange === range ? 'var(--brand-main-green)' : 'transparent',
                    border: timeRange === range ? 'none' : '1px solid var(--border-medium)',
                    borderRadius: '8px',
                    color: 'var(--text-primary)',
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
                border: '1px solid var(--border-medium)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
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

        {/* A failed load used to be console.error only, leaving every figure at
            its initial 0 while the health ratios reported "good" — an outage that
            looked like a clean bill of health. */}
        {error && (
          <div
            role="alert"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '14px 16px',
              marginBottom: '24px',
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '8px',
            }}
          >
            <AlertCircle size={20} color="#ef4444" />
            <span style={{ color: 'var(--text-primary)', fontSize: '14px', flex: 1 }}>
              {error}
            </span>
            <button
              onClick={loadAnalytics}
              style={{
                padding: '6px 14px',
                background: 'transparent',
                border: '1px solid var(--border-medium)',
                borderRadius: '6px',
                color: 'var(--text-primary)',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Retry
            </button>
          </div>
        )}

        {/* Tabs */}
        <div style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '32px',
          borderBottom: '1px solid var(--border-light)',
          paddingBottom: '4px'
        }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '12px 20px',
                background: activeTab === tab.id ? 'var(--surface-hover)' : 'transparent',
                border: 'none',
                borderBottom: activeTab === tab.id ? '2px solid var(--brand-main-green)' : '2px solid transparent',
                color: activeTab === tab.id ? 'var(--brand-main-green)' : 'var(--text-secondary)',
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
              {/* Every figure on this page is the household's, and consistently
                  so — unlike the Dashboard, where the income card is the
                  household's but the expense card is the caller's own share.
                  These four come from /analytics/categories/top, whose
                  `get_top_categories` sums full amounts over the household query
                  for both directions, so the savings rate here divides like with
                  like. Tagged rather than reconciled: the two pages are allowed
                  to differ as long as each says what it is. */}
              <MetricCard
                title="Total Income"
                scope="household"
                value={formatMoney(totals.income, { currency })}
                change={previous && pctChange(totals.income, previous.income)}
                icon={<TrendingUp size={24} />}
                color="#10b981"
              />
              <MetricCard
                title="Total Expenses"
                scope="household"
                value={formatMoney(totals.expenses, { currency })}
                change={previous && pctChange(totals.expenses, previous.expenses)}
                higherIsBetter={false}
                icon={<TrendingDown size={24} />}
                color="#ef4444"
              />
              <MetricCard
                title="Net Savings"
                scope="household"
                value={formatMoney(totals.netSavings, { currency })}
                change={previous && pctChange(totals.netSavings, previous.netSavings)}
                icon={<DollarSign size={24} />}
                color="#3b82f6"
              />
              <MetricCard
                title="Savings Rate"
                scope="household"
                value={`${totals.savingsRate.toFixed(1)}%`}
                change={previous && pctChange(totals.savingsRate, previous.savingsRate)}
                icon={<Target size={24} />}
                color="var(--brand-main-green)"
              />
            </div>

            {/* Charts */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))',
              gap: '24px'
            }}>
              {/* Income vs Expenses */}
              <ChartCard title="Income vs Expenses" subtitle={rangeLabel}>
                {cashFlowMonthly.length === 0 ? (
                  <div style={{ ...emptyStateStyle, padding: '90px 0' }}>
                    <p style={{ margin: 0, fontWeight: 500, color: 'var(--text-primary)' }}>
                      Nothing to chart yet
                    </p>
                    <p style={{ margin: '6px 0 0', fontSize: '14px' }}>
                      Add a transaction or import a CSV to compare money in and out.
                    </p>
                  </div>
                ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={cashFlowMonthly}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" />
                    <XAxis dataKey="month" stroke="var(--text-secondary)" />
                    <YAxis stroke="var(--text-secondary)" />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--tooltip-bg)',
                        border: '1px solid var(--tooltip-border)',
                        borderRadius: '8px'
                      }}
                    />
                    <Legend />
                    <Bar dataKey="income" fill="#10b981" name="Income" radius={[8, 8, 0, 0]} />
                    <Bar dataKey="expenses" fill="#ef4444" name="Expenses" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                )}
              </ChartCard>

              {/* Spending by Category */}
              <ChartCard title="Spending by Category" subtitle={rangeLabel}>
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
                                <div style={tooltipBoxStyle}>
                                  <p style={tooltipLabelStyle}>{payload[0].name}</p>
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
                            <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>{cat.name || 'Unknown'}</span>
                          </div>
                          <div style={flexRowGap12}>
                            <span style={{ color: 'var(--text-primary)', fontWeight: '600', fontSize: '14px' }}>{branding.currencySymbol}{cat.value.toLocaleString()}</span>
                            <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>({cat.percentage.toFixed(1)}%)</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div style={emptyStateStyle}>No spending data</div>
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
              {/* "Monthly" was wrong whenever the range was Week or Year, and the
                  figures are the same ones the Overview tab shows. */}
              <MetricCard
                title="Inflow"
                value={formatMoney(totals.income, { currency })}
                change={previous && pctChange(totals.income, previous.income)}
                icon={<ArrowUpRight size={24} />}
                color="#10b981"
              />
              <MetricCard
                title="Outflow"
                value={formatMoney(totals.expenses, { currency })}
                change={previous && pctChange(totals.expenses, previous.expenses)}
                higherIsBetter={false}
                icon={<ArrowDownRight size={24} />}
                color="#ef4444"
              />
              <MetricCard
                title="Net Cash Flow"
                value={formatMoney(totals.netSavings, { currency })}
                change={previous && pctChange(totals.netSavings, previous.netSavings)}
                icon={<Activity size={24} />}
                color="#3b82f6"
              />
            </div>

            <ChartCard title="Cash Flow Trend" subtitle={rangeLabel}>
              {cashFlowMonthly.length === 0 ? (
                <div style={{ ...emptyStateStyle, padding: '140px 0' }}>
                  <p style={{ margin: 0, fontWeight: 500, color: 'var(--text-primary)' }}>
                    No cash flow to show
                  </p>
                  <p style={{ margin: '6px 0 0', fontSize: '14px' }}>
                    Add a transaction or import a CSV to see income, expenses and savings over time.
                  </p>
                </div>
              ) : (
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
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" />
                  <XAxis dataKey="month" stroke="var(--text-secondary)" />
                  <YAxis stroke="var(--text-secondary)" />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--tooltip-bg)',
                      border: '1px solid var(--tooltip-border)',
                      borderRadius: '8px'
                    }}
                  />
                  <Legend />
                  <Area type="monotone" dataKey="income" stroke="#10b981" fillOpacity={1} fill="url(#colorIncome)" name="Income" />
                  <Area type="monotone" dataKey="expenses" stroke="#ef4444" fillOpacity={1} fill="url(#colorExpenses)" name="Expenses" />
                  <Area type="monotone" dataKey="savings" stroke="#3b82f6" fillOpacity={1} fill="url(#colorSavings)" name="Savings" />
                </AreaChart>
              </ResponsiveContainer>
              )}
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
                                <div style={tooltipBoxStyle}>
                                  <p style={tooltipLabelStyle}>{payload[0].name}</p>
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
                          <div style={flexRowGap8}>
                            <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: cat.color }}></div>
                            <span style={metaTextStyle}>{cat.name || 'Unknown'}</span>
                          </div>
                          <div style={flexRowGap12}>
                            <span style={{ color: 'var(--text-primary)', fontSize: '13px' }}>{branding.currencySymbol}{cat.value.toLocaleString()}</span>
                            <span style={{ color: 'var(--text-muted)', fontSize: '13px', minWidth: '50px', textAlign: 'right' }}>{cat.percentage.toFixed(1)}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div style={emptyStateStyle}>No spending data</div>
                )}
              </ChartCard>

              <ChartCard title="Income Sources" subtitle="By category">
                {incomeSources.length === 0 ? (
                  <div style={{ ...emptyStateStyle, padding: '120px 0' }}>
                    <p style={{ margin: 0, fontWeight: 500, color: 'var(--text-primary)' }}>
                      No income recorded
                    </p>
                    <p style={{ margin: '6px 0 0', fontSize: '14px' }}>
                      Add a transaction marked as income to see where your money comes from.
                    </p>
                  </div>
                ) : (
                <ResponsiveContainer width="100%" height={350}>
                  <PieChart>
                    <Pie
                      data={incomeSources}
                      cx="50%"
                      cy="50%"
                      labelLine={true}
                      label={({ name, value }) => `${name}: ${formatMoney(value as number, { currency, round: true })}`}
                      outerRadius={120}
                      dataKey="value"
                    >
                      {incomeSources.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number, name: string) => [formatMoney(value, { currency }), name]}
                      contentStyle={{
                        background: 'var(--tooltip-bg)',
                        border: '1px solid var(--tooltip-border)',
                        borderRadius: '8px'
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                )}
              </ChartCard>
            </div>

            {/* Category Details */}
            <div style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-light)',
              borderRadius: '12px',
              padding: '24px'
            }}>
              <h2 style={{ fontSize: '20px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '24px' }}>
                Category Breakdown
              </h2>
              <div style={flexColGap16}>
                {categorySpending.map((category, index) => (
                  <div key={index} style={{ paddingBottom: '16px', borderBottom: '1px solid var(--border-light)' }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '8px'
                    }}>
                      <div style={flexRowGap12}>
                        <div style={{
                          width: '12px',
                          height: '12px',
                          borderRadius: '50%',
                          background: category.color
                        }} />
                        <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>{category.name || 'Unknown Category'}</span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ color: 'var(--text-primary)', fontWeight: '600', fontSize: '16px' }}>
                          {branding.currencySymbol}{category.value.toLocaleString()}
                        </p>
                        <p style={metaTextStyle}>{category.percentage.toFixed(1)}%</p>
                      </div>
                    </div>
                    <div style={{
                      height: '8px',
                      background: 'var(--progress-track)',
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
              {/* Each card reports "unknown" rather than a colour when its input
                  is missing. Previously a ratio that collapsed to 0 for lack of
                  income rendered as a green "good" — an account with debt and no
                  recorded income was congratulated on its debt-to-income. */}
              <HealthMetricCard
                title="Debt-to-Income Ratio"
                value={totals.income > 0
                  ? `${(health.debtToIncome * 100).toFixed(1)}%`
                  : null}
                status={health.debtToIncome < 0.36 ? 'good' : health.debtToIncome < 0.5 ? 'warning' : 'danger'}
                description="Share of income going to debt payments"
                unknownReason="Add income transactions to calculate this"
              />
              <HealthMetricCard
                title="Emergency Fund"
                value={totals.expenses > 0
                  ? `${health.emergencyFundMonths} months`
                  : null}
                status={health.emergencyFundMonths >= 6 ? 'good' : health.emergencyFundMonths >= 3 ? 'warning' : 'danger'}
                description="Months of expenses your liquid assets cover"
                unknownReason="Add expenses to calculate this"
              />
              <HealthMetricCard
                title="Liquidity Ratio"
                value={health.liquidityRatio.toFixed(1)}
                status={health.liquidityRatio >= 2 ? 'good' : health.liquidityRatio >= 1 ? 'warning' : 'danger'}
                description="Ability to cover short-term debts"
              />
              <HealthMetricCard
                title="Investment Return"
                value={health.investmentReturn === null
                  ? null
                  : `${health.investmentReturn.toFixed(1)}%`}
                status={(health.investmentReturn ?? 0) >= 7 ? 'good' : (health.investmentReturn ?? 0) >= 4 ? 'warning' : 'danger'}
                description="Weighted return across your holdings"
                unknownReason="Add holdings with prices to calculate this"
              />
            </div>

            {/* Net Worth Trend. ComposedChart, not AreaChart: this mixes an Area
                with two Lines, and ComposedChart is the container that supports
                that combination. The subtitle reports how many months of data
                actually came back rather than promising 12. */}
            <ChartCard
              title="Net Worth Trend"
              subtitle={netWorthTrend.length > 0
                ? `${netWorthTrend.length} ${netWorthTrend.length === 1 ? 'month' : 'months'} of history`
                : undefined}
            >
              {netWorthTrend.length === 0 ? (
                <div style={emptyStateStyle}>
                  <p style={{ margin: 0, fontWeight: 500, color: 'var(--text-primary)' }}>
                    No net worth history yet
                  </p>
                  <p style={{ margin: '6px 0 0', fontSize: '14px' }}>
                    Add accounts with balances to start tracking assets and liabilities over time.
                  </p>
                </div>
              ) : (
              <ResponsiveContainer width="100%" height={400}>
                <ComposedChart data={netWorthTrend}>
                  <defs>
                    <linearGradient id="colorNetWorth" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--brand-main-green)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--brand-main-green)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" />
                  <XAxis dataKey="month" stroke="var(--text-secondary)" />
                  <YAxis stroke="var(--text-secondary)" />
                  <Tooltip
                    formatter={(value: number, name: string) => [formatMoney(value, { currency }), name]}
                    contentStyle={{
                      background: 'var(--tooltip-bg)',
                      border: '1px solid var(--tooltip-border)',
                      borderRadius: '8px'
                    }}
                  />
                  <Legend />
                  <Area type="monotone" dataKey="netWorth" stroke="var(--brand-main-green)" fillOpacity={1} fill="url(#colorNetWorth)" name="Net Worth" />
                  <Line type="monotone" dataKey="assets" stroke="#10b981" name="Assets" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="liabilities" stroke="#ef4444" name="Liabilities" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
              )}
            </ChartCard>

            {/* Financial Insights */}
            <div style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-light)',
              borderRadius: '12px',
              padding: '24px',
              marginTop: '24px'
            }}>
              <h2 style={{ fontSize: '20px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '16px' }}>
                Financial Health Insights
              </h2>
              {/* Derived from the metrics above. These were four fixed strings,
                  so the first one asserted "your savings rate is above the
                  recommended 20% threshold" to every user, including one whose
                  savings rate was 0% and net savings negative. */}
              <div style={flexColGap12}>
                {insights.length === 0 ? (
                  <p style={metaTextStyle}>
                    Add income and expenses to see insights about your finances.
                  </p>
                ) : insights.map((insight, idx) => (
                  <InsightItem
                    key={idx}
                    icon={insight.type === 'success'
                      ? <CheckCircle2 size={20} color="#10b981" />
                      : <AlertCircle size={20} color="#f97316" />}
                    text={insight.text}
                    type={insight.type}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        </div>
      </div>
    </>
  );
};

// Reusable Components

/**
 * `change` is a number of percent, not a string, and it is optional.
 *
 * That is deliberate. It used to be a required string and every one of the seven
 * call sites passed a literal — "+12.5%", "+8.3%", "+15.2%", "+2.1%", "+5.2%",
 * "+3.1%", "+8.7%" — so the cards showed movement that had never been computed.
 * A number cannot be hand-written convincingly, and `undefined` (no baseline to
 * compare against) renders no comparison line rather than a fake zero.
 *
 * `higherIsBetter` decides the colour: income rising is good, expenses rising is
 * not, and the old `isPositive` prop conflated "went up" with "good news".
 */
const MetricCard: React.FC<{
  title: string;
  value: string;
  change?: number;
  higherIsBetter?: boolean;
  icon: React.ReactNode;
  color: string;
  /** Whose money this figure covers (AUDIT.md D-01). */
  scope?: Scope;
}> = ({ title, value, change, higherIsBetter = true, icon, color, scope }) => {
  const rose = change !== undefined && change > 0;
  const good = change === undefined || change === 0
    ? true
    : rose === higherIsBetter;

  return (
  <div style={{
    background: 'var(--bg-card)',
    border: '1px solid var(--border-light)',
    borderRadius: '12px',
    padding: '24px',
    position: 'relative',
    overflow: 'hidden',
    transition: 'transform 0.2s, border-color 0.2s',
    cursor: 'pointer',
    boxShadow: 'var(--card-shadow)'
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
          // White, not var(--text-primary): the circle behind it is a saturated
          // brand colour, and in the light theme --text-primary is #111827, which
          // rendered these icons near-black on green.
          color: 'white'
        }}>
          {icon}
        </div>
        {change !== undefined && (
          rose
            ? <ArrowUpRight size={20} color={color} />
            : <ArrowDownRight size={20} color={color} />
        )}
      </div>
      <p style={{
        color: 'var(--text-secondary)',
        fontSize: '13px',
        marginBottom: '4px',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        flexWrap: 'wrap',
      }}>
        {title}
        {scope && <ScopeTag scope={scope} />}
      </p>
      <p style={{ fontSize: '28px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px', ...tabular }}>
        {value}
      </p>
      {change === undefined ? (
        // No comparable previous period. Saying so beats inventing a number.
        <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
          No previous period to compare
        </p>
      ) : (
        <p style={{
          color: good ? 'var(--accent-green)' : 'var(--accent-red)',
          fontSize: '13px',
          ...tabular,
        }}>
          {change > 0 ? '+' : change < 0 ? '−' : ''}
          {Math.abs(change).toFixed(1)}% vs last period
        </p>
      )}
    </div>
  </div>
  );
};

const ChartCard: React.FC<{
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}> = ({ title, subtitle, children }) => (
  <div style={{
    background: 'var(--bg-card)',
    border: '1px solid var(--border-light)',
    borderRadius: '12px',
    padding: '24px',
    boxShadow: 'var(--card-shadow)'
  }}>
    <div style={{ marginBottom: '20px' }}>
      <h2 style={{ fontSize: '20px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '4px' }}>
        {title}
      </h2>
      {subtitle && (
        <p style={metaTextStyle}>{subtitle}</p>
      )}
    </div>
    {children}
  </div>
);

/**
 * A ratio, or an explicit "not enough data".
 *
 * `value === null` means the inputs for this ratio are missing, and the card then
 * shows neutral styling and says what to add. It must not fall back to a status
 * colour: several of these ratios collapse to 0 when a denominator is absent, and
 * 0 sits on the "good" side of every threshold here, so a user with no data was
 * shown a wall of green ticks.
 */
const HealthMetricCard: React.FC<{
  title: string;
  value: string | null;
  status: 'good' | 'warning' | 'danger';
  description: string;
  unknownReason?: string;
}> = ({ title, value, status, description, unknownReason }) => {
  const colors = {
    good: { bg: 'var(--accent-green)', light: 'rgba(16, 185, 129, 0.1)', border: 'rgba(16, 185, 129, 0.3)' },
    warning: { bg: '#f97316', light: 'rgba(249, 115, 22, 0.1)', border: 'rgba(249, 115, 22, 0.3)' },
    danger: { bg: 'var(--accent-red)', light: 'rgba(239, 68, 68, 0.1)', border: 'rgba(239, 68, 68, 0.3)' }
  };
  const unknown = value === null;
  const tone = unknown
    ? { bg: 'var(--text-muted)', light: 'var(--bg-secondary)', border: 'var(--border-light)' }
    : colors[status];

  return (
    <div style={{
      background: tone.light,
      border: `1px solid ${tone.border}`,
      borderRadius: '12px',
      padding: '20px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        {unknown
          ? <AlertCircle size={20} color={tone.bg} />
          : status === 'good'
            ? <CheckCircle2 size={20} color={tone.bg} />
            : <AlertCircle size={20} color={tone.bg} />}
        <h3 style={{ color: 'var(--text-primary)', fontWeight: '600', fontSize: '15px' }}>{title}</h3>
      </div>
      <p style={{
        fontSize: unknown ? '20px' : '32px',
        fontWeight: '700',
        color: tone.bg,
        marginBottom: '4px',
        ...(unknown ? {} : tabular),
      }}>
        {unknown ? 'Not enough data' : value}
      </p>
      <p style={metaTextStyle}>
        {unknown ? (unknownReason || description) : description}
      </p>
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
    <p style={{ color: 'var(--text-primary)', fontSize: '14px' }}>{text}</p>
  </div>
);
