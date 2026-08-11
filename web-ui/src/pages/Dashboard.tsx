import React, { useState, useEffect } from 'react';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Wallet, CreditCard, PiggyBank, ChevronDown, ChevronUp, Loader2, ArrowRight } from 'lucide-react';
import { analyticsService } from '../services/analyticsService';
import { accountService } from '../services/accountService';
import { transactionsApi } from '../services/api/transactions';
import { budgetService } from '../services/budgetService';
import { useToast } from '../contexts/ToastContext';
import { useAuthStore } from '../store/authStore';
import { formatMoney, Money, moneyStyle, tabular } from '../styles/money';
import { getBranding } from '../config/branding';
import { useTheme } from '../contexts/ThemeContext';
import { CHART_COLORS } from '../config/theme';
import { StatCard } from '../components/StatCard';
import { ShareBar } from '../components/dashboard/ShareBar';
import {
  spendingSummaryApi,
  currentMonthRange,
  type SpendingGroup,
} from '../services/api/spendingSummary';
import { SectionCard } from '../components/SectionCard';
import { MemberFilter } from '../components/MemberFilter';
import { OwnerBadge } from '../components/OwnerBadge';
import { teamService } from '../services/teamService';
import { TeamMember } from '../types/team';
import { ImportReviewBanner } from '../components/dashboard/ImportReviewBanner';
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
  /**
   * The household roster, for the owner badge on the Recent Transactions strip.
   *
   * That strip is built from `/api/v1/transactions/`, which became household-scoped
   * on 2026-08-06 — so it started showing housemates' rows. The rest of this page
   * is untouched by that change and keeps its per-figure scope tags until item E.
   */
  const [members, setMembers] = useState<TeamMember[]>([]);
  useEffect(() => {
    teamService.getMembers().then(setMembers).catch(() => setMembers([]));
  }, []);

  /**
   * **D-18 item E.** Every figure on this page now follows one filter, so the
   * per-figure scope tags are gone. That is the whole argument for the control:
   * a tag makes the user read four captions and reconcile them; a filter makes
   * the scope one answer they chose.
   *
   * `null` is the whole household, which is the default the owner specified.
   * Renders nothing for a one-member household — `MemberFilter` decides that, the
   * same way it does on the transactions page.
   */
  const [memberId, setMemberId] = useState<string | null>(null);
  const selectedMember = members.find((m) => m.id === memberId) || null;
  const [budgets, setBudgets] = useState<any[]>([]);

  /**
   * The share bar's two readings.
   *
   * `byPerson` is fetched ONLY when there is more than one member — not to save
   * a request, but because on a one-user instance the person axis does not vary
   * and the bar never offers it. Fetching it anyway would leave a payload lying
   * around that nothing may render, which is how a dead control starts.
   */
  const [byCategory, setByCategory] = useState<SpendingGroup[]>([]);
  const [byPerson, setByPerson] = useState<SpendingGroup[]>([]);

  useEffect(() => {
    const range = currentMonthRange();
    spendingSummaryApi
      .get({ ...range, group_by: 'category' })
      .then((r) => setByCategory(r.groups))
      .catch(() => setByCategory([]));
  }, []);

  useEffect(() => {
    if (members.length <= 1) {
      setByPerson([]);
      return;
    }
    const range = currentMonthRange();
    spendingSummaryApi
      .get({ ...range, group_by: 'owner' })
      .then((r) => setByPerson(r.groups))
      .catch(() => setByPerson([]));
  }, [members.length]);
  const [monthlyAggregation, setMonthlyAggregation] = useState<any[]>([]);
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());

  const COLORS = CHART_COLORS;

  useEffect(() => {
    loadDashboardData();
  }, [timeRange, memberId]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);

      const [dashboardData, accountsData, transactionsData, budgetsData] = await Promise.all([
        // BOTH of these move together, and that is the D-51 lesson applied
        // rather than repeated: #76 re-scoped the recent strip and left the
        // figures alone, which is how the page came to describe two different
        // sets of people at once. Whoever the filter names, it names for the
        // whole page.
        analyticsService.getDashboardData(memberId),
        accountService.getAccounts(),
        transactionsApi.getAll({ per_page: 5, member_id: memberId || undefined }),
        budgetService.getBudgets()
      ]);

      setNetWorth(dashboardData.net_worth || 0);

      // current_month_*, not total_*. These feed cards labelled "Monthly Income"
      // and "Monthly Expenses", and total_income/total_expenses_only are
      // year-to-date — so in December the "monthly" figures were roughly twelve
      // times the truth, and the savings rate below them was computed from the
      // same mismatch.
      setMonthlyIncome(dashboardData.current_month_income || 0);
      setMonthlyExpenses(Math.abs(dashboardData.current_month_expenses_only || 0));

      const income = dashboardData.current_month_income || 0;
      const expenses = Math.abs(dashboardData.current_month_expenses_only || 0);
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
          account: txn.account || 'Unknown',
          // Kept when flattening, because `/api/v1/transactions/` went
          // household-scoped on 2026-08-06 (D-18 items B+D) and this strip is
          // built from it. Without the owner the strip silently shows a
          // housemate's rows with nothing saying whose they are.
          owner: txn.account?.owner ?? null,
        }))
      );

      setBudgets(
        // `budgetService.getBudgets()` unwraps the envelope and returns the
        // array, so the old `budgetsData.budgets || …` fallback was reading a
        // key that is never present and relying on the second branch.
        (budgetsData || []).slice(0, 4).map((budget: any, idx: number) => ({
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

  // One formatter for the whole app, and it honours the user's currency rather
  // than hardcoding USD as this local copy did.
  const currency = user?.default_currency_code || 'USD';
  const formatCurrency = (amount: number) => formatMoney(amount, { currency });

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
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', marginBottom: '32px' }}>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: 700, marginBottom: '4px', color: 'var(--text-primary)' }}>Dashboard</h1>
            <p className="fp-hint">
              {selectedMember
                ? `${selectedMember.name}'s money`
                : 'Everyone sharing this finPal instance'}
            </p>
          </div>
          {/* Top of page, not beside the cards: this narrows the WHOLE page, and
              a control that sits next to one figure reads as belonging to it. */}
          <MemberFilter
            members={members}
            value={memberId}
            onChange={setMemberId}
          />
        </div>

        {/* Flags an auto-import whose columns were guessed */}
        <ImportReviewBanner onReverted={loadDashboardData} />

        {/* The share bar — "what is this month made of?".
            One user slices by category, two or more by person with a toggle,
            and a month with no spending renders NOTHING rather than an empty
            track. See ShareBar's own docstring for why that is not a detail. */}
        <ShareBar
          memberCount={members.length}
          byCategory={byCategory}
          byPerson={byPerson}
          currency={user?.default_currency_code || 'USD'}
        />

        {/* Stat Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '32px' }}>
          {/* **No per-figure scope tags any more — D-18 item E.** They existed
              because this one payload used to carry the caller's own net worth
              and expense share alongside the household's income, so no single
              caption was true for the page. Every figure now follows the member
              filter above together, which answers the question once instead of
              four times. `utils/scope.ts` keeps the vocabulary for the surfaces
              that still need it. */}
          <StatCard
            label="Net Worth"
            value={formatCurrency(netWorth)}
            accentColor="#22c55e"
            icon={<Wallet size={24} color="#22c55e" />}
            /* "Accounts and investments" and "Spending this month" are DESCRIPTIONS of
                what the figure is, not statuses. Colouring them was the same
                over-claim O1 retired on the ledger — and measured, the green was
                2.21:1 and the red 3.65:1 on the card, so they were illegible as
                well as wrong. The ICONS keep their colour; they are decorative
                and carry no text. */
            subtitle={<><TrendingUp size={16} color="#22c55e" /><span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Accounts and investments</span></>}
          />
          <StatCard
            label="Monthly Income"
            value={formatCurrency(monthlyIncome)}
            accentColor="#3b82f6"
            icon={<TrendingUp size={24} color="#3b82f6" />}
            subtitle={<span className="fp-hint">Current month earnings</span>}
          />
          <StatCard
            label="Monthly Expenses"
            value={formatCurrency(monthlyExpenses)}
            accentColor="#ef4444"
            icon={<TrendingDown size={24} color="#ef4444" />}
            subtitle={<><TrendingDown size={16} color="#ef4444" /><span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Spending this month</span></>}
          />
          {/* Still no congratulation. The subtitle used to read "Great job
              saving!" unconditionally — praise for a number that read 100% for a
              member who had entered nothing and 0% for someone with no income at
              all. The 100% case is fixed (D-18 item E: both terms now describe
              the same people), the 0%-without-income case is not, and an
              unconditional compliment is wrong either way. */}
          <StatCard
            label="Savings Rate"
            value={`${savingsRate.toFixed(1)}%`}
            accentColor="#fbbf24"
            icon={<PiggyBank size={24} color="#fbbf24" />}
            subtitle={<span className="fp-hint">Of income, after expenses</span>}
          />
        </div>

        {/* Charts Row */}
        <div className="fp-main-aside" style={{ marginBottom: '24px' }}>
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
            {cashFlowData.length === 0 ? (
              /* Was rendering 280px of empty axes, which reads as a broken chart
                 rather than an empty one — the Spending by Category card beside it
                 already handled this. An empty state should point at the next
                 action, so it names the thing to do. */
              <div style={{ ...emptyStateStyle, padding: '72px 0' }}>
                <p style={{ margin: 0, fontWeight: 500, color: 'var(--text-primary)' }}>
                  No activity in this period
                </p>
                <p style={{ margin: '6px 0 0', fontSize: '14px' }}>
                  Add a transaction or import a CSV to see money moving in and out.
                </p>
              </div>
            ) : (
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
            )}
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
                        <span className="fp-hint">{cat.name}</span>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px', marginBottom: '24px' }}>
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
                  <span className="fp-hint">
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
                  <div style={{ width: '40px', height: '40px', background: 'var(--kt-line)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
                  {/* The green "▲ 2.3%" that used to sit under each balance came
                      from a literal, identical on every account. There is no
                      per-account balance history to compute a trend from. */}
                  <p style={{ color: 'var(--text-primary)', fontSize: '16px', fontWeight: '600', marginBottom: 0, ...tabular }}>{formatCurrency(Math.abs(account.balance))}</p>
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginBottom: 0 }}>{txn.category?.name || txn.category || 'Uncategorized'} · {txn.date}</p>
                      <OwnerBadge owner={txn.owner} memberCount={members.length} size="sm" />
                    </div>
                  </div>
                </div>
                {/* Same rule as the Transactions ledger — O1, owner decision
                    2026-08-09. A transaction's amount is not painted by whether
                    it is an expense; red is kept for figures that are over or
                    negative, which on this page is the budget bar above. Both
                    surfaces have to agree or the colour means one thing on the
                    dashboard and another one screen over. */}
                <span style={{
                  color: txn.transaction_type === 'income' ? 'var(--amount-income)' : 'var(--text-primary)',
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
        <p className="fp-meta">Part of the {branding.parentBrand} ecosystem</p>
      </div>
    </>
  );
};

export default Dashboard;
