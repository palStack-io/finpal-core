import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Wallet, CreditCard, PiggyBank, ChevronDown, ChevronUp, Loader2, ArrowRight } from 'lucide-react';
import { analyticsService } from '../services/analyticsService';
import { accountService } from '../services/accountService';
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
import { GoalRange } from '../components/dashboard/GoalRange';
import { goalService } from '../services/goalService';
import type { Goal } from '../types/goal';
import { monthLabelLong, monthLabelShort } from '../utils/monthKeys';
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

  const [goals, setGoals] = useState<Goal[]>([]);
  const [netWorth, setNetWorth] = useState(0);
  const [monthlyIncome, setMonthlyIncome] = useState(0);
  const [monthlyExpenses, setMonthlyExpenses] = useState(0);
  /* *** null IS NOT ZERO, AND THE DIFFERENCE IS THE WHOLE CARD. *** With no
     income recorded this month there is no rate to state — a ratio needs a
     denominator the user actually has. Same treatment as Budgets' "Left to
     budget", which learned this first. */
  const [savingsRate, setSavingsRate] = useState<number | null>(null);

  const [cashFlowData, setCashFlowData] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
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

      const [dashboardData, accountsData, budgetsData, goalsData] = await Promise.all([
        // BOTH of these move together, and that is the D-51 lesson applied
        // rather than repeated: #76 re-scoped the recent strip and left the
        // figures alone, which is how the page came to describe two different
        // sets of people at once. Whoever the filter names, it names for the
        // whole page.
        analyticsService.getDashboardData(memberId),
        accountService.getAccounts(),
        budgetService.getBudgets(),
        /* The range needs the user's own goals. Fetched in the same wave rather
           than in a second effect: a range that appears a beat after the totals
           is a page that moves under the reader. A failure here must not take
           the dashboard down with it, so it resolves to an empty list. */
        goalService.getGoals().catch(() => [] as Goal[])
      ]);

      setGoals(goalsData || []);

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
      /* *** THE CLAMP WAS THE DEFECT. *** `Math.max(0, ...)` turned every
         overspent month into a flat "0.0%". Measured on the live demo: $250.00
         income against $2,359.72 out is **−843.9%**, and the card said 0.0% —
         a figure finPal invented, in the most prominent row of its most
         visited page. Spending eight times what you earned is the single most
         useful thing that page could tell someone, and it was rounded away to
         look like a quiet month. */
      setSavingsRate(income > 0 ? (savings / income) * 100 : null);

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
        // D-206: `new Date('2026-09-01')` is UTC midnight, i.e. 31 August west of
        // UTC, so this axis named every month one early. The daily branch is
        // untouched and correct — `periodKey` there is a full date-TIME with no
        // offset, which the spec parses as local.
        const label = groupByMonth
          ? monthLabelShort(periodKey)
          : new Date(periodKey).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return {
          month: label,
          income: dataByPeriod[periodKey].income || 0,
          expenses: dataByPeriod[periodKey].expenses || 0
        };
      });
      setCashFlowData(formattedCashFlow);

      setAccounts(
        (accountsData || []).slice(0, 3).map((acc: any) => ({
          id: acc.id,
          name: acc.name,
          balance: acc.balance || 0,
          type: acc.account_type || 'checking',
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

  // D-206. This is the one a user actually noticed: the strip at the top of
  // this page called $2,359.72 "this month" while the breakdown below called
  // the identical figure "August 2026" — two names for one number, on one
  // screen. See `utils/monthKeys.ts` for why the `T00:00:00` is the whole fix.
  const formatMonthLabel = monthLabelLong;

  /**
   * A bar's corner radius, which must never exceed half its width.
   *
   * Beyond about a dozen periods the bars are too narrow for a decorative
   * corner, and recharts answers an impossible radius with an empty path rather
   * than a clamped one — so this returns a shape it can actually draw. Exported
   * shape kept simple on purpose: two values, one threshold, no measurement of
   * the container, because a wrong guess here degrades a corner and the old
   * behaviour deleted the entire series.
   */
  const cashFlowBarRadius: [number, number, number, number] =
    cashFlowData.length > 12 ? [2, 2, 0, 0] : [8, 8, 0, 0];

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
            /* Figures, not transactions: the recent-transactions strip this
               used to narrow is gone, and `/analytics/dashboard` is now the
               only read on this page that takes `member_id` at all — accounts,
               budgets and goals accept no member filter, which is a limit of
               those endpoints rather than of this control. */
            label="Show figures for"
          />
        </div>

        {/* Flags an auto-import whose columns were guessed */}
        <ImportReviewBanner onReverted={loadDashboardData} />

        {/* *** THE RANGE EARNS THE TOP OF THE PAGE — spec variant B. *** The
            user's own goals, drawn at their real named elevations, above the
            totals rather than below them. A dashboard that opens with four
            figures opens the same way every money app does; this one opens with
            the thing that belongs to the person reading it.

            Renders nothing at all when there are no goals with peaks, which is
            deliberate: an empty frame here would be decoration standing in for
            a fact, and the "you have nothing yet" case belongs to base camp. */}
        {goals.length > 0 && (
          <SectionCard title="Your range" subtitle="What you are climbing, and the ground you stand on while you climb.">
            <GoalRange goals={goals} currency={user?.default_currency_code || 'USD'} />
          </SectionCard>
        )}

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
          {(() => {
            // Colour follows the fact, not the brand: money going the wrong way
            // wears the direction's clay, the same token an over-budget row uses.
            const rateColor = savingsRate === null
              ? 'var(--text-muted)'
              : savingsRate < 0 ? 'var(--status-over)' : '#fbbf24';
            return (
              <StatCard
                label="Savings Rate"
                value={savingsRate === null ? '—' : `${savingsRate.toFixed(1)}%`}
                accentColor={rateColor}
                valueColor={rateColor}
                icon={<PiggyBank size={24} color={rateColor} />}
                subtitle={
                  <span className="fp-hint">
                    {savingsRate === null
                      ? 'No income recorded this month yet'
                      : savingsRate < 0
                        ? 'You spent more than you earned this month'
                        : 'Of income, after expenses'}
                  </span>
                }
              />
            );
          })()}
        </div>

        {/* *** ONE CARD IN A TWO-COLUMN GRID LEAVES HALF THE ROW EMPTY. ***
            Removing the duplicate category donut left Cash Flow alone in an
            `auto-fit` grid, so it rendered at ~60% width with dead space beside
            it — the same shape as the Budgets five-card row, caused by me in
            the same session. A single full-width card needs no grid at all. */}
        {/* Cash flow, full width. `fp-main-aside` is `2fr 1fr` and the aside
            was the duplicate category donut; with one child left it took two
            thirds of the row and left a third blank. */}
        <div style={{ marginBottom: '24px' }}>
          <SectionCard
            title="Cash Flow"
            action={
              <select
                // WCAG 2 AA `select-name`, found by the E2E axe run. A control
                // with no accessible name is announced as "combo box" and
                // nothing else, so a screen-reader user cannot tell what it
                // changes. `MemberFilter.tsx` already does this correctly and is
                // the pattern to copy; the visible label here is the section
                // heading, which is not programmatically associated.
                aria-label="Cash flow time range"
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
                {/* *** A CORNER RADIUS WIDER THAN THE BAR DRAWS NOTHING AT
                    ALL. *** The default view is "Last 30 days", which groups by
                    DAY: ~20 periods × 2 series across 702px leaves each bar
                    about 10px wide, and `radius={[8, 8, 0, 0]}` asks for 16px
                    of corner on it. recharts' rounded-rect path generator
                    cannot build that shape and emits an empty group, so the
                    chart rendered axes, gridlines, a legend and no data.

                    Measured on the deployed page rather than inferred: all 40
                    `.recharts-bar-rectangle` groups were literally
                    `<g class="recharts-layer recharts-bar-rectangle"></g>` —
                    present, and containing no path. The monthly view has wide
                    enough bars to survive, which is why this never looked like
                    a chart bug: switch to "Last year" and it draws.

                    The radius now follows the bar, so it cannot outgrow it. */}
                <Bar dataKey="income" fill="#22c55e" radius={cashFlowBarRadius} />
                <Bar dataKey="expenses" fill="#ef4444" radius={cashFlowBarRadius} />
              </BarChart>
            </ResponsiveContainer>
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
                  {/* *** `Math.abs()` HERE SHOWED A DEBT AS AN ASSET. *** The
                      API sends the Visa as `-800.0`; this rendered "$800.00",
                      indistinguishable from the $5,000 checking and $3,000
                      savings listed directly above it. Three positive numbers
                      in a column invite adding them up: $8,800 against a real
                      net of $7,200. Measured on the demo.

                      The sign is the fact, so the sign is printed, and a
                      negative balance wears the direction's clay — the same
                      token an over-budget row uses, so "money the wrong way"
                      looks the same everywhere on this page. */}
                  <p style={{
                    color: account.balance < 0 ? 'var(--status-over)' : 'var(--text-primary)',
                    fontSize: '16px', fontWeight: '600', marginBottom: 0, ...tabular,
                  }}>
                    {account.balance < 0 ? '−' : ''}{formatCurrency(Math.abs(account.balance))}
                  </p>
                </div>
              </div>
            )) : (
              <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '20px 0' }}>No accounts found</div>
            )}
          </SectionCard>
        </div>

        {/* *** RECENT TRANSACTIONS IS GONE — owner call, and the reason is
            duplication. *** Monthly Expense Breakdown sits directly below it,
            opens on the current month, and lists every transaction in it behind
            "Show (13)". A five-row preview of the same rows, 400px above the
            full list, is the shape this page had three times over: one fact,
            two places. The strip's own "View all" went to /transactions, which
            is where somebody who wants the ledger should be. */}
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
                                    background: cat.color ? `color-mix(in srgb, ${cat.color} 12.5%, transparent)` : 'rgba(107,114,128,0.2)',
                                    color: cat.color || 'var(--text-secondary)',
                                    border: `1px solid color-mix(in srgb, ${cat.color || 'var(--text-secondary)'} 25%, transparent)`,
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
                                    background: acc.color ? `color-mix(in srgb, ${acc.color} 12.5%, transparent)` : 'rgba(107,114,128,0.2)',
                                    color: acc.color || 'var(--text-secondary)',
                                    border: `1px solid color-mix(in srgb, ${acc.color || 'var(--text-secondary)'} 25%, transparent)`,
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
                                {/* h4, not h5: the nearest heading above this
                                    is SectionCard's h3, and skipping a level
                                    breaks the outline a screen reader navigates
                                    by. The size is inline, so the tag change is
                                    invisible on screen. */}
                                <h4 style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                                  Individual Transactions ({month.transactions.length})
                                </h4>
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
