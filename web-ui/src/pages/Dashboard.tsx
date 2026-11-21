import React, { useState, useEffect } from 'react';
import { analyticsService } from '../services/analyticsService';
import { accountService } from '../services/accountService';
import { budgetService, type BudgetOverview } from '../services/budgetService';
import { useToast } from '../contexts/ToastContext';
import { useAuthStore } from '../store/authStore';
import { formatMoney } from '../styles/money';
import { getBranding } from '../config/branding';
import {
  spendingSummaryApi,
  currentMonthRange,
  type SpendingGroup,
} from '../services/api/spendingSummary';
import { HardMonthCardView } from '../components/onboarding/HardMonthCard';
import { useHardMonth } from '../components/onboarding/useHardMonth';
import { DashboardSlot } from '../components/home/DashboardSlot';
import { RecallCard, useRecall } from '../modules/learnpal/RecallCard';
import { ThisWeekCard, useThisWeek } from '../modules/learnpal/ThisWeekCard';
import { useSkillsProgress } from '../modules/learnpal/SkillsCard';
import { GoalRange } from '../components/dashboard/GoalRange';
import EmptyRange from '../components/dashboard/EmptyRange';
import { TotalsRow, type TotalsCell } from '../components/dashboard/TotalsRow';
import { PageHero } from '../components/PageHero';
import { greeting } from '../components/dashboard/greeting';
import {
  AccountsCard, BudgetsCard, GoalsCard, SkillsCompactCard, WhereMonthWentCard, budgetLines, goalLines,
  type AccountLine,
} from '../components/dashboard/DashboardCards';
import { goalService } from '../services/goalService';
import type { Goal } from '../types/goal';
import { MemberFilter } from '../components/MemberFilter';
import { teamService } from '../services/teamService';
import { TeamMember } from '../types/team';
import { ImportReviewBanner } from '../components/dashboard/ImportReviewBanner';
import { pageContainerStyle } from '../styles/layoutStyles';
import { useEverest } from '../contexts/CoinAwardContext';
import { GuideButton } from '../components/guide/GuideButton';
import { PageGuide } from '../components/guide/PageGuide';
import { staggerStyle, useFirstVisitThisSession } from '../utils/entrance';

/**
 * The Dashboard, "Dashboard C" (approved by Harun 2026-11-20: "love the update"), core edition.
 *
 * *** ONE HERO, THEN THE LESSON, THEN TWO ROWS OF CARDS (design brief: hero, lesson, content). *** The shared
 * `PageHero` holds the greeting with today's date as its pill, the four key figures as the page's one answer, and
 * Your range as the art bottom-right: Everest at the back with the climber at the person's altitude (from acts), their
 * goals stepping forward around it, each sized by the goal with a marker at its progress. Under it: whose figures these
 * are (scope line, "?", member filter), the one slot (hard month, recall, This week), then Where the month went and a
 * compact Your skills, then Budgets, Accounts and Goals.
 *
 * *** REMOVED, AND WHERE THEY WENT. *** The page-guide tips card (the "?" opens it on demand); the Cash Flow chart
 * (Analytics has its own Cash Flow tab); the Monthly Expense Breakdown table (Transactions lists every transaction,
 * and "See every transaction" links there). The full skills trail stays on the Learn page.
 *
 * *** THE FIGURES ARE THE SERVER'S. *** Net worth, income, expenses and the month's savings rate are read from
 * `/analytics/dashboard` (`current_month_savings_rate` since Dashboard C: no rate is worked out in the browser), with
 * the same labels as the old tiles.
 *
 * Motion is plain CSS (core has no motion kit): the hero settles, the cards rise in a short stagger and the range
 * draws once per browser session; after that `.fp-quiet` makes it a short fade, and reduced motion leaves it at rest.
 */
export const Dashboard = () => {
  const { showToast } = useToast();
  const { user } = useAuthStore();
  /* Everest is drawn INSIDE the range, so the page reads it and hands it down. Safe without a provider. */
  const everest = useEverest();
  const branding = getBranding(user?.default_currency_code || 'USD');

  /* The one slot: hard month first, then recall, then This week; only the first with something to say is drawn. */
  const hardMonth = useHardMonth();
  const recall = useRecall();
  const thisWeek = useThisWeek();
  const { skills } = useSkillsProgress();
  const firstVisit = useFirstVisitThisSession('dashboard');

  /* The loading state shows on the FIRST load only. A reload (the member filter) keeps the last figures on screen and
     cross-fades the answer, so the page does not replay its entrance and focus stays on the filter. */
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [netWorth, setNetWorth] = useState(0);
  const [monthlyIncome, setMonthlyIncome] = useState(0);
  const [monthlyExpenses, setMonthlyExpenses] = useState(0);
  /* null IS NOT ZERO: with no income recorded this month there is no rate to state. */
  const [savingsRate, setSavingsRate] = useState<number | null>(null);
  const [accounts, setAccounts] = useState<AccountLine[]>([]);
  const [overview, setOverview] = useState<BudgetOverview | null>(null);

  /** The household roster: the member filter, and the share bar's person axis. */
  const [members, setMembers] = useState<TeamMember[]>([]);
  useEffect(() => {
    teamService.getMembers().then(setMembers).catch(() => setMembers([]));
  }, []);

  /** D-18 item E: every figure follows one filter; `null` is the whole household. */
  const [memberId, setMemberId] = useState<string | null>(null);
  const selectedMember = members.find((m) => m.id === memberId) || null;

  /** The share bar's two readings; `byPerson` only when there is more than one member. */
  const [byCategory, setByCategory] = useState<SpendingGroup[]>([]);
  const [byPerson, setByPerson] = useState<SpendingGroup[]>([]);

  useEffect(() => {
    spendingSummaryApi
      .get({ ...currentMonthRange(), group_by: 'category' })
      .then((r) => setByCategory(r.groups))
      .catch(() => setByCategory([]));
  }, []);

  useEffect(() => {
    if (members.length <= 1) {
      setByPerson([]);
      return;
    }
    spendingSummaryApi
      .get({ ...currentMonthRange(), group_by: 'owner' })
      .then((r) => setByPerson(r.groups))
      .catch(() => setByPerson([]));
  }, [members.length]);

  useEffect(() => {
    loadDashboardData();
  }, [memberId]); // eslint-disable-line react-hooks/exhaustive-deps -- reload when whose figures changes

  const loadDashboardData = async () => {
    try {
      if (!loaded) setLoading(true);

      const [dashboardData, accountsData, overviewData, goalsData] = await Promise.all([
        // The member filter names the people for the whole page (D-51).
        analyticsService.getDashboardData(memberId),
        accountService.getAccounts(),
        /* The overview, not the plain list: it carries the pace mark (`pace`, and `pace_applies` per row) the
           Budgets card draws. A failure here leaves the card empty rather than taking the page down. */
        budgetService.getBudgetOverview().catch(() => null),
        /* The range needs the user's own goals, in the same wave so it does not appear a beat after the totals. */
        goalService.getGoals().catch(() => [] as Goal[]),
      ]);

      setGoals(goalsData || []);
      setNetWorth(dashboardData.net_worth || 0);
      // current_month_*, not total_* (year to date): these feed "Monthly Income" and "Monthly Expenses".
      setMonthlyIncome(dashboardData.current_month_income || 0);
      setMonthlyExpenses(Math.abs(dashboardData.current_month_expenses_only || 0));
      /* The server's month rate: negative when more went out, null when nothing came in. An older backend without it
         shows no rate rather than one worked out here. */
      setSavingsRate(dashboardData.current_month_savings_rate ?? null);

      setAccounts(
        (accountsData || []).slice(0, 3).map((acc: any) => ({
          id: acc.id,
          name: acc.name,
          balance: acc.balance || 0,
          currency: acc.currency_code || null,
          type: acc.account_type || 'checking',
        }))
      );
      setOverview(overviewData);
    } catch {
      showToast("We couldn't load dashboard data. Try again in a moment.", 'error');
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  };

  const currency = user?.default_currency_code || 'USD';
  const formatCurrency = (amount: number) => formatMoney(amount, { currency });

  /* EACH FIGURE NAMES ITS WINDOW. In the hero the pill says "November so far" once, so the two month notes are read to
     a screen reader only. The savings rate's note stays on screen when it carries meaning. */
  const monthName = new Date().toLocaleDateString('en-US', { month: 'long' });
  const monthSoFar = `${monthName} so far`;
  const totalsCells = [
    { label: 'Net Worth', value: formatCurrency(netWorth), note: 'Accounts and investments' },
    { label: 'Monthly Income', value: formatCurrency(monthlyIncome), note: monthSoFar, quietNote: true },
    // Ink, not clay (voice rule 1, "no red first"): the label says what the figure is.
    { label: 'Monthly Expenses', value: formatCurrency(monthlyExpenses), note: monthSoFar, quietNote: true },
    {
      label: 'Savings Rate',
      value: savingsRate === null ? '—' : `${Math.round(savingsRate)}%`,
      valueColor: savingsRate === null ? 'var(--text-muted)' : undefined,
      note: savingsRate === null
        ? 'No income recorded this month. Add it when you have it.'
        : savingsRate < 0 ? 'You spent more than you earned this month' : 'Of income, after expenses',
      quietNote: savingsRate !== null && savingsRate >= 0,
    },
  ] satisfies TotalsCell[];

  if (loading) {
    return (
      <div style={pageContainerStyle}>
        <div className="fp-page-hero fp-page-hero--loading" role="status" aria-live="polite">
          <span className="sr-only">Loading dashboard...</span>
        </div>
      </div>
    );
  }

  const firstName = user?.name ? String(user.name).split(' ')[0] : null;
  const today = new Date();

  return (
    <>
      <div style={pageContainerStyle} className={firstVisit ? undefined : 'fp-quiet'}>

        {/* THE PAGE HERO (one component on every page): the greeting with today's date as the context pill, the four
            figures as the page's one answer, and Your range as the art bottom-right. */}
        <PageHero
          data-testid="dashboard-hero"
          titleId="dashboard-greeting"
          title={greeting(today, firstName)}
          pill={`${today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} · ${monthSoFar}`}
          /* The answer cross-fades to the new figures when the member filter changes (keyed by whose figures they
             are); nothing else on the page replays. */
          answer={<div key={memberId ?? 'household'} className="fp-crossfade" data-guide="dashboard-totals">
            <TotalsRow cells={totalsCells} variant="hero" />
          </div>}
          /* Everest is in the range for everyone (owner, 2026-09-17), so a user with no goals still gets a range;
             `EmptyRange` carries the invitation only when there is neither a goal nor a climb. */
          art={<div data-guide="dashboard-range" style={{ height: '100%' }}>
            {(goals.length > 0 || everest) ? (
              <GoalRange goals={goals} currency={currency} everest={everest} />
            ) : (
              <EmptyRange />
            )}
          </div>}
        />

        {/* Whose money: one scope line instead of four per-card tags, and the filter beside it narrows the whole page.
            The "?" opens the page guide (its card no longer shows unasked). */}
        <div className="fp-dash-toolbar">
          <span>{selectedMember ? `${selectedMember.name}'s money` : 'Everyone sharing this finPal instance'}</span>
          <div className="fp-dash-toolbar__tools">
            <GuideButton page="dashboard" always />
            <MemberFilter members={members} value={memberId} onChange={setMemberId} label="Show figures for" />
          </div>
        </div>

        {/* The lesson sits directly BELOW the hero, never inside it. One card at a time (hard month, recall, This
            week); after a recall's Done or Not now the slot stays empty for the visit. */}
        <div className="fp-dash-lesson" data-testid="dashboard-lesson">
          <DashboardSlot entries={[
            { key: 'hard-month', state: hardMonth.state, render: () => <HardMonthCardView hardMonth={hardMonth} /> },
            { key: 'recall', state: recall.state, render: () => <RecallCard recall={recall} /> },
            { key: 'this-week', state: thisWeek.state, render: () => <ThisWeekCard week={thisWeek} /> },
          ]} />
        </div>

        {/* The tips card opens only from the "?" now (Dashboard C). */}
        <PageGuide page="dashboard" onDemand />

        {/* Flags an auto-import whose columns were guessed */}
        <ImportReviewBanner onReverted={loadDashboardData} />

        {/* The cards rise in a short stagger (CSS `.fp-rise`; a fade on a repeat visit, at rest when reduced). With Learn
            off there is no skills card, and Where the month went takes the whole row (no empty column). */}
        <div className={skills ? 'fp-dash-row fp-dash-row--main' : 'fp-dash-row fp-dash-row--main is-single'}>
          <div className="fp-rise" style={staggerStyle(0)} data-guide="dashboard-spend">
            <WhereMonthWentCard month={monthName} wentOut={monthlyExpenses} cameIn={monthlyIncome} currency={currency}
              memberCount={members.length} byCategory={byCategory} byPerson={byPerson} />
          </div>
          {skills && (
            <div className="fp-rise" style={staggerStyle(1)}>
              <SkillsCompactCard skills={skills} thisWeekSkill={thisWeek.lesson?.skill ?? null} />
            </div>
          )}
        </div>

        <div className="fp-dash-row fp-dash-row--three">
          <div className="fp-rise" style={staggerStyle(2)}>
            <BudgetsCard lines={budgetLines(overview)} pace={overview?.pace ?? null} currency={currency} />
          </div>
          <div className="fp-rise" style={staggerStyle(3)}><AccountsCard accounts={accounts} currency={currency} /></div>
          <div className="fp-rise" style={staggerStyle(4)}><GoalsCard goals={goalLines(goals)} currency={currency} /></div>
        </div>
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
