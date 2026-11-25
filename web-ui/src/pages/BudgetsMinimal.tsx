import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Trash2 } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { formatMoney, Money } from '../styles/money';
import type { BudgetPace, IncomeSection } from '../services/budgetService';
import { budgetService, type Budget } from '../services/budgetService';
import { transactionsApi, type Transaction } from '../services/api/transactions';
import { categoriesApi, type Category } from '../services/api/categories';
import { useToast } from '../contexts/ToastContext';
import { SlidePanel } from '../components/SlidePanel';
import { AddTransactionForm } from '../components/forms/AddTransactionForm';
import type { BudgetTotals } from '../services/budgetService';
import { teamService } from '../services/teamService';
import type { TeamMember } from '../types/team';
import { householdScopeNote } from '../utils/scope';
import { apiErrorMessage } from '../utils/apiError';
import { categoryIcon } from '../utils/categoryIcon';
import { SpendingTypeControl } from '../components/budgets/SpendingTypeControl';
import { GROUP_LABELS, UNSORTED_LABEL, type SpendingType } from '../utils/spendingGroups';
import type { SpendingGroup, UnsortedSection } from '../services/budgetService';
import { WhyCard } from '../modules/learnpal/WhyCard';
import { learnpalService } from '../modules/learnpal/service';
import type { ShortTry, WhyCard as WhyCardData } from '../types/learnpal';
import { HardMonthCard } from '../components/onboarding/HardMonthCard';
import { PageGuide } from '../components/guide/PageGuide';
import { useGuideStore } from '../store/guideStore';
import { useSurfaceCoins } from '../contexts/CoinAwardContext';
import { BudgetsHero } from '../components/budgets/BudgetsHero';
import { BudgetLine } from '../components/budgets/BudgetLine';
import { staggerStyle, useFirstVisitThisSession } from '../utils/entrance';

/**
 * The Budgets page, "Budgets C" (Harun's pick, 2026-11-20), core edition. Design brief: hero, lesson, content.
 *
 *   hero      the shared PageHero: "$769.74 left to spend, with 11 days to go", about $X a day, the plan bar, Came in /
 *             Not given a job yet, New budget (BudgetsHero.tsx)
 *   lesson    the Budgets Why card as ONE line (WhyCard variant="line"), directly under the hero
 *   content   Flexible rows in the wide column; Fixed, Non-monthly, Not budgeted, Unsorted and Income in the narrow one.
 *             Each row's group select, transactions, edit and delete sit behind its ⋯ (BudgetRowMenu.tsx).
 *
 * *** EVERY FIGURE IS THE SERVER'S. *** The big number is `totals.remaining`, days and per-day are the overview's
 * `days_left` / `per_day` (one rule, `services/budget/pace.py`), the plan bar is `budgeted_actual` of `planned`, "over"
 * is a row's `remaining < 0` (rollover included), and "this month" is `pace.as_of`. `GET /budgets/overview` has no
 * month, so another month says the figures are this month's.
 *
 * Removed: the page-head card (its "?" moved into the hero and the tips card opens only from it), the Budget Health bar
 * and the totals row (the hero carries the one answer).
 */

interface BudgetWithDetails extends Budget {
  spent: number;
  remaining: number;
  percentage: number;
  category_name?: string;
  /**
   * Whether a pace mark can be READ for this row. The server decides, because
   * the answer depends on the budget's period AND its spending group, and a
   * client re-deriving it would disagree with the tick's own position.
   * `undefined` means a backend older than the feature — render no mark, which
   * is the same shape as `peak` being absent from a goal.
   */
  pace_applies?: boolean;
  /**
   * A Non-Monthly budget carrying a YEARLY period is a sinking fund: the amount
   * is the whole bill and `monthly_set_aside` is the twelfth of it that this
   * month's totals actually count.
   *
   * *** BOTH FIGURES COME FROM THE SERVER AND NEITHER IS DERIVED HERE. *** The
   * group total already sums the set-aside, so a client dividing `amount` by
   * twelve for the caption would be two places computing one number — D-101,
   * where two clients deriving independently disagreed. `undefined` means a
   * backend older than the feature and the row renders as it always did.
   */
  is_sinking_fund?: boolean;
  monthly_set_aside?: number;
  category_icon?: string;
  category_color?: string;
  transactions?: Transaction[];
}

const fieldLabelStyle: React.CSSProperties = { display: 'block', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: '500', marginBottom: '8px' };
const secondaryBgStyle: React.CSSProperties = { background: 'var(--bg-secondary)' };

/**
 * The start and end of the period a budget covers, relative to a reference date.
 *
 * Extracted because the widest window across all budgets has to be known before
 * fetching, and each budget's own window is needed again when filtering. Two
 * copies of this arithmetic would drift, and the fetch would silently stop
 * covering what the filter looks for.
 */
const periodWindow = (period: string, reference: Date): { start: Date; end: Date } => {
  if (period === 'weekly') {
    const start = new Date(reference);
    start.setDate(reference.getDate() - reference.getDay());
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start, end };
  }
  if (period === 'yearly') {
    return {
      start: new Date(reference.getFullYear(), 0, 1),
      end: new Date(reference.getFullYear(), 11, 31),
    };
  }
  // monthly (default)
  return {
    start: new Date(reference.getFullYear(), reference.getMonth(), 1),
    end: new Date(reference.getFullYear(), reference.getMonth() + 1, 0),
  };
};

/** `YYYY-MM-DD` in local time — `toISOString()` shifts to UTC and can move the day. */
const toIsoDate = (date: Date): string => {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

/**
 * What to call a budget — D-192.
 *
 * *** THIS PAGE HAS TWO RENDERING PATHS AND THE KEY EXISTED ON ONLY ONE. ***
 * The flat list goes through `enrichedBudgets`, which BUILDS `category_name`.
 * The grouped view is handed `overview.groups` straight from the API, where the
 * name lives NESTED at `category.name` and `category_name` does not exist at
 * all. The heading printed `budget.category_name`, so every grouped budget
 * rendered an EMPTY `<h2>` — four anonymous budgets, and nothing on the page
 * saying which was which.
 *
 * It read as empty rather than as "Uncategorized" precisely because the mapper
 * never ran; that is what proved there were two paths rather than one broken
 * lookup.
 *
 * One helper, used by both, so a third convention cannot appear. `budget.name`
 * is the budget's OWN optional label and is checked first because a user who
 * named a budget meant it.
 */
export const budgetTitle = (budget: {
  name?: string | null;
  category_name?: string | null;
  category?: { name?: string | null } | null;
}): string =>
  budget.name?.trim()
  || budget.category_name?.trim()
  || budget.category?.name?.trim()
  || 'Uncategorized';


/** Show this many unbudgeted rows before folding the tail away. */
const UNBUDGETED_SHOWN = 5;
/**
 * Budgets C: one "Not budgeted" card for the categories money left through with no budget, across the three groups.
 *
 * *** NO PROGRESS BAR, BECAUSE THERE IS NO DENOMINATOR. *** Every budgeted row is a fraction of a limit somebody
 * chose; these have none, and an empty bar would read as "0% used" when the truth is "nothing caps this".
 *
 * *** THE TOTAL IS THE SERVER'S. *** `totals.unbudgeted_actual` is all spending outside a budget, which also counts the
 * Unsorted section's money; so it is printed here only when Unsorted is empty, where it is exactly the sum of these
 * rows. Folding past five rows never hides money: the folded line names the folded total.
 */
const NotBudgetedCard: React.FC<{
  groups: SpendingGroup[];
  total: number | null;
  currency: string;
  onBudget: (categoryId: number, spentSoFar: number) => void;
}> = ({ groups, total, currency, onBudget }) => {
  const [showAll, setShowAll] = useState(false);
  /* Defaulted, because a server can predate the field: reading `.length` off undefined once took the page down. */
  const rows = groups.flatMap((g) => g.unbudgeted_categories ?? []).sort((a, b) => b.actual - a.actual);
  if (rows.length === 0) return null;
  const shown = showAll ? rows : rows.slice(0, UNBUDGETED_SHOWN);
  const folded = rows.length - shown.length;
  const foldedTotal = rows.slice(shown.length).reduce((sum, row) => sum + row.actual, 0);
  return (
    <section className="fp-bc-card fp-rise" style={staggerStyle(3)} aria-labelledby="bc-not-budgeted" data-testid="not-budgeted">
      <div className="fp-bc-card-head">
        <h2 id="bc-not-budgeted" className="fp-bc-h2">Not budgeted</h2>
        {total !== null && <span className="fp-bc-card-sub"><Money amount={total} currency={currency} /></span>}
      </div>
      {shown.map((row) => (
        <div key={row.id} data-testid={`unbudgeted-${row.id}`} className="fp-bc-plain-row">
          <span className="fp-bc-plain-name" translate="no">{row.name}</span>
          <span className="fp-bc-figure"><Money amount={row.actual} currency={currency} /></span>
          <button type="button" className="fp-bc-link" onClick={() => onBudget(row.id, row.actual)}>Budget this</button>
        </div>
      ))}
      {folded > 0 && (
        <button type="button" className="fp-bc-fold" onClick={() => setShowAll(true)}>
          <ChevronDown size={14} aria-hidden="true" />
          {folded} more · <Money amount={foldedTotal} currency={currency} />
        </button>
      )}
    </section>
  );
};

const BudgetsMinimal = () => {
  // The page names its own surface and nothing more; the server owns which acts a `budgets` mutation can move.
  useSurfaceCoins('budgets');
  const { user } = useAuthStore();
  const { showToast } = useToast();
  const firstVisit = useFirstVisitThisSession('budgets');

  const [budgets, setBudgets] = useState<BudgetWithDetails[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedBudget, setExpandedBudget] = useState<number | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [editingBudget, setEditingBudget] = useState<BudgetWithDetails | null>(null);
  /* The household size, to say whose money this is; a failed lookup says nothing (an unverified scope claim is
     worse than none). */
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [budgetFormData, setBudgetFormData] = useState({
    category_id: '',
    amount: '',
    period: 'monthly' as 'weekly' | 'monthly' | 'yearly',
    start_date: new Date().toISOString().split('T')[0],
    rollover: false
  });
  const [selectedMonth, setSelectedMonth] = useState(new Date());

  // *** THE SERVER OWNS THESE. *** Stored exactly as received and never re-summed here (D-101).
  const [groups, setGroups] = useState<SpendingGroup[]>([]);
  /** Today's position in the month, ONCE for the whole page (one figure, so no two clients draw the mark apart). */
  const [pace, setPace] = useState<BudgetPace | null>(null);
  /** Budgets on INCOME categories, kept out of the expense totals (D-189). */
  const [incomeSection, setIncomeSection] = useState<IncomeSection | null>(null);
  const [unsorted, setUnsorted] = useState<UnsortedSection>(
    { count: 0, actual: 0, categories: [], budget_count: 0, budgets: [] });
  const [totals, setTotals] = useState<BudgetTotals>({
    planned: 0, actual: 0, remaining: 0,
    budgeted_actual: 0, unbudgeted_actual: 0,
  });
  const [income, setIncome] = useState<number | null>(null);
  const [leftToBudget, setLeftToBudget] = useState<number | null>(null);
  /** The overview's `days_left` / `per_day`, printed as sent. */
  const [daysLeft, setDaysLeft] = useState<number | null>(null);
  const [perDay, setPerDay] = useState<number | null>(null);
  /** The non-monthly lesson's own figures, for the empty Non-monthly card; only when that lesson applies. */
  const [sinking, setSinking] = useState<Extract<ShortTry, { kind: 'sinking' }> | null>(null);
  const sinkingAsked = useRef(false);
  /** The row's ⋯ that opened the edit panel or the delete dialog: focus goes back to it when that closes. */
  const focusBack = useRef<HTMLButtonElement | null>(null);
  const returnFocus = () => {
    const el = focusBack.current;
    focusBack.current = null;
    if (el) setTimeout(() => { if (el.isConnected) el.focus(); }, 0);
  };
  const firstLoad = useRef(true);

  const currency = user?.default_currency_code || 'USD';
  const formatCurrency = (amount: number) => formatMoney(amount, { currency });

  /* The first visit shows the loading state; a month change reloads QUIETLY, so the hero is not remounted (its words
     cross-fade) and no entrance replays. */
  useEffect(() => {
    if (firstLoad.current) { firstLoad.current = false; loadData(); } else loadData({ quiet: true });
  }, [selectedMonth]); // eslint-disable-line react-hooks/exhaustive-deps -- reload when the month changes

  /* Once, not per month: the household does not change when the user pages through the calendar. */
  useEffect(() => {
    teamService.getMembers().then(setMembers).catch(() => setMembers([]));
  }, []);

  // `quiet`: reload the figures without the loading state (a month change, a group change, a delete), so the hero is
  // not remounted and no entrance replays. An option object, so `onChanged={loadData}` callers cannot pass a boolean.
  const loadData = async (opts?: { quiet?: boolean }) => {
    const quiet = opts?.quiet === true;
    try {
      if (!quiet) setLoading(true);

      // Load categories - returns { categories: Category[] }
      const categoriesResponse = await categoriesApi.getAll();
      const categoriesData = categoriesResponse?.categories || [];
      setCategories(categoriesData);

      // Load budget overview
      const overview = await budgetService.getBudgetOverview();
      const budgetsList = overview?.budgets || [];

      setGroups(overview?.groups || []);
      setPace(overview?.pace ?? null);
      setIncomeSection(overview?.income_section ?? null);
      setUnsorted(overview?.unsorted
        || { count: 0, actual: 0, categories: [], budget_count: 0, budgets: [] });
      // `?? null`, never `|| 0`: null means "nothing recorded this month" and
      // zero would be a claim that the user earned nothing.
      setTotals(overview?.totals || {
        planned: 0, actual: 0, remaining: 0,
        budgeted_actual: 0, unbudgeted_actual: 0,
      });
      setIncome(overview?.income ?? null);
      setLeftToBudget(overview?.left_to_budget ?? null);
      setDaysLeft(overview?.days_left ?? null);
      setPerDay(overview?.per_day ?? null);

      /**
       * Only the window the budgets actually cover, and every page of it.
       *
       * This used to call `transactionsApi.getAll()` with no arguments and rely
       * on getting the entire history in one response. That endpoint paginates
       * now, so an unbounded call would quietly return the newest 50 rows and
       * every budget would under-report its spending — a wrong number rendered
       * as a right one. `getAllPages` follows `has_next` and reports whether it
       * reached the end.
       */
      const windows = budgetsList.map((budget) => periodWindow(budget.period, selectedMonth));
      const windowStart = windows.length
        ? new Date(Math.min(...windows.map((w) => w.start.getTime())))
        : selectedMonth;
      const windowEnd = windows.length
        ? new Date(Math.max(...windows.map((w) => w.end.getTime())))
        : selectedMonth;

      const { transactions: windowTransactions, complete } = budgetsList.length
        ? await transactionsApi.getAllPages({
            start_date: toIsoDate(windowStart),
            end_date: toIsoDate(windowEnd),
            type: 'expense',
          })
        : { transactions: [] as Transaction[], complete: true };

      if (!complete) {
        // Say so rather than show totals computed from part of the period.
        showToast('Showing partial spending — too many transactions in this period', 'error');
      }

      // Enrich budgets with category info and transactions
      const enrichedBudgets = budgetsList.map((budget) => {
        // API already returns nested category object; fall back to lookup by id
        const nestedCat = (budget as any).category as { name?: string; icon?: string; color?: string } | undefined;
        const category = nestedCat?.name ? nestedCat : categoriesData.find((c) => c.id === budget.category_id);

        const { start: startDate, end: endDate } = periodWindow(budget.period, selectedMonth);

        // Filter transactions by category and date range (expense type only)
        const budgetTransactions = windowTransactions
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
      showToast("We couldn't load your budgets. Try again in a moment.", 'error');
      setBudgets([]);
      setCategories([]);
    } finally {
      setLoading(false);
    }
  };

  const handleExpandBudget = (budgetId: number) => {
    setExpandedBudget((current) => (current === budgetId ? null : budgetId));
  };

  const handleTransactionClick = (transaction: Transaction) => {
    setEditingTransaction(transaction);
  };

  const handleTransactionSuccess = () => {
    setEditingTransaction(null);
    loadData({ quiet: true });
  };

  const handleCloseTransactionPanel = () => {
    setEditingTransaction(null);
  };

  const emptyForm = (period: 'weekly' | 'monthly' | 'yearly' = 'monthly', amount = '', category_id = '') => ({
    category_id, amount, period, start_date: new Date().toISOString().split('T')[0], rollover: false,
  });

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
      setBudgetFormData(emptyForm());
    }
    setShowBudgetModal(true);
  };

  /**
   * "Budget this", from an unbudgeted row: the amount is prefilled with what they actually spent (a starting point in
   * an editable field, not a target finPal chose).
   */
  const startBudgetFor = (categoryId: number, spentSoFar: number) => {
    setEditingBudget(null);
    setBudgetFormData(emptyForm('monthly', spentSoFar > 0 ? spentSoFar.toFixed(2) : '', String(categoryId)));
    setShowBudgetModal(true);
  };

  const handleCloseBudgetPanel = () => {
    setShowBudgetModal(false);
    setEditingBudget(null);
    returnFocus();
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
        await budgetService.updateBudget(editingBudget.id, {
          amount: parseFloat(budgetFormData.amount),
          period: budgetFormData.period,
          category_id: parseInt(budgetFormData.category_id),
          start_date: budgetFormData.start_date,
          is_active: true,
          rollover: budgetFormData.rollover,
        });
        showToast("Budget updated.", 'success');
      } else {
        await budgetService.createBudget({
          name: '', // Optional name
          amount: parseFloat(budgetFormData.amount),
          period: budgetFormData.period,
          category_id: parseInt(budgetFormData.category_id),
          start_date: budgetFormData.start_date,
          is_active: true,
          rollover: budgetFormData.rollover,
        });
        showToast("Budget added.", 'success');
      }

      setShowBudgetModal(false);
      setEditingBudget(null);
      setBudgetFormData(emptyForm());
      returnFocus();
      loadData({ quiet: true });
    } catch (error: any) {
      showToast(apiErrorMessage(error, "We couldn't save that budget. Try again in a moment."), 'error');
    }
  };

  const handleDeleteBudget = async (budgetId: number) => {
    if (!window.confirm("Delete this budget?")) {
      returnFocus();
      return;
    }

    try {
      await budgetService.deleteBudget(budgetId);
      showToast("Budget deleted.", 'success');
      setShowBudgetModal(false);
      setEditingBudget(null);
      focusBack.current = null;
      loadData({ quiet: true });
    } catch {
      returnFocus();
      showToast("We couldn't delete that budget. Try again in a moment.", 'error');
    }
  };

  /* *** "THIS MONTH" IS THE SERVER'S. *** The overview always answers for the server's current month (`pace.as_of`);
     the browser clock is only a fallback for an older backend that sends no pace. */
  const serverToday = (() => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(pace?.as_of ?? '');
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date();
  })();

  const goToPreviousMonth = () => setSelectedMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  const goToNextMonth = () => setSelectedMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  const goToCurrentMonth = () => setSelectedMonth(new Date(serverToday.getFullYear(), serverToday.getMonth(), 1));

  /* The first answer may name a different month from the browser's (a time zone either side of midnight on the 1st):
     the page follows the server's, once. */
  const snapped = useRef(false);
  useEffect(() => {
    if (snapped.current || !pace?.as_of) return;
    snapped.current = true;
    if (serverToday.getFullYear() !== selectedMonth.getFullYear() || serverToday.getMonth() !== selectedMonth.getMonth()) {
      setSelectedMonth(new Date(serverToday.getFullYear(), serverToday.getMonth(), 1));
    }
  }, [pace?.as_of]); // eslint-disable-line react-hooks/exhaustive-deps -- once, when the server first says which month

  /* The Why line reports every Budgets card; when the non-monthly lesson applies, its figures fill the empty
     Non-monthly card (`GET short/non-monthly`, no side effects). */
  const onWhyCards = (cards: WhyCardData[]) => {
    if (sinkingAsked.current || !cards.some((c) => c.id === 'non-monthly')) return;
    sinkingAsked.current = true;
    learnpalService.getShortLesson('non-monthly')
      .then((s) => setSinking(s.try && s.try.kind === 'sinking' ? s.try : null))
      .catch(() => setSinking(null));
  };

  const isCurrentMonth = selectedMonth.getMonth() === serverToday.getMonth()
    && selectedMonth.getFullYear() === serverToday.getFullYear();

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', padding: '24px' }}>
        <div className="page-container">
          <div className="fp-page-hero fp-page-hero--loading" role="status" aria-live="polite">
            <span className="sr-only">Loading budgets...</span>
          </div>
        </div>
      </div>
    );
  }

  const thisMonthName = serverToday.toLocaleDateString('en-US', { month: 'long' });
  const groupOf = (type: SpendingType) => groups.find((g) => g.spending_type === type);
  const fixedGroup = groupOf('fixed');
  const flexibleGroup = groupOf('flexible');
  const nonMonthlyGroup = groupOf('non_monthly');
  const unsortedHasContent = unsorted.count > 0 || unsorted.budgets.length > 0;

  // The "?" opens the tips card on demand (PageGuide onDemand): it never opens on its own on this page.
  const openGuide = () => useGuideStore.getState().reopen('budgets');

  /* "Plan it" on an empty Non-monthly card: the create panel as a yearly budget, prefilled with the non-monthly
     lesson's own yearly figure when that lesson applies (a starting point in an editable field, like "Budget this"). */
  const planNonMonthly = () => {
    const yearly = sinking ? Number(sinking.yearly) : NaN;
    setEditingBudget(null);
    setBudgetFormData(emptyForm('yearly', Number.isFinite(yearly) && yearly > 0 ? yearly.toFixed(2) : ''));
    setShowBudgetModal(true);
  };

  /**
   * One row. Grouped rows come from `overview.groups`, which carries no category name or transactions; those are on
   * the enriched `budgets` list, so they are joined by id (the old grouped cards never had them, which is why an
   * expanded grouped row always said it had no transactions).
   */
  const renderRow = (raw: BudgetWithDetails, group: SpendingType | null, variant: 'flexible' | 'compact', index: number) => {
    const enriched = budgets.find((b) => b.id === raw.id);
    const budget: BudgetWithDetails = {
      ...raw,
      category_name: raw.category_name ?? enriched?.category_name,
      transactions: raw.transactions ?? enriched?.transactions,
    };
    const title = budgetTitle(budget);
    return (
      <BudgetLine
        key={budget.id}
        row={budget}
        title={title}
        iconName={budget.category_name || title}
        variant={variant}
        pace={pace}
        format={formatCurrency}
        index={index}
        controls={budget.category_id != null ? (
          <div className="fp-bc-menu-field">
            <span aria-hidden="true">Spending group</span>
            <SpendingTypeControl categoryId={budget.category_id} value={group} onChanged={() => loadData({ quiet: true })} />
          </div>
        ) : null}
        expanded={expandedBudget === budget.id}
        onToggle={() => handleExpandBudget(budget.id)}
        onEdit={(opener) => { focusBack.current = opener; handleOpenBudgetModal(budget); }}
        onDelete={(opener) => { focusBack.current = opener; void handleDeleteBudget(budget.id); }}
        onTransaction={handleTransactionClick}
      />
    );
  };

  const emptyGroup = (group: SpendingGroup) => (
    <p className="fp-bc-note">No {(GROUP_LABELS[group.spending_type as SpendingType] ?? group.label).toLowerCase()} budgets yet.</p>
  );

  return (
    <>
      <div style={{ minHeight: '100vh', padding: '24px' }} className={firstVisit ? undefined : 'fp-quiet'}>
        <div className="page-container">
        <div className="fp-bc">
          <BudgetsHero
            scopeNote={householdScopeNote(members.length) ?? null}
            monthLabel={selectedMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            monthName={thisMonthName}
            isCurrentMonth={isCurrentMonth}
            totals={totals}
            pace={pace}
            daysLeft={daysLeft}
            perDay={perDay}
            income={income}
            leftToBudget={leftToBudget}
            currency={currency}
            onPrev={goToPreviousMonth}
            onNext={goToNextMonth}
            onToday={goToCurrentMonth}
            onNewBudget={() => handleOpenBudgetModal()}
            onHelp={openGuide}
          />
          {/* Hero, lesson, content: the lesson line sits directly under the hero. */}
          <WhyCard screen="budgets" variant="line" currency={currency} onCards={onWhyCards} />
          {/* The tips card only on request (the "?" in the hero); its tour still points at the hero. */}
          <PageGuide page="budgets" onDemand />
          {/* Phase 1e: one calm line after a hard month. */}
          <HardMonthCard />

          {budgets.length === 0 ? (
            <section className="fp-bc-card fp-bc-empty">
              <p>No budgets yet. Start with one category you'd like to keep an eye on.</p>
            </section>
          ) : (
            <div className="fp-bc-body-wrap">
            <div className="fp-bc-body">
              {/* Flexible first in the reading order (the part you can move); the grid draws it in the wide right
                  column on a laptop and first on a phone. */}
              {flexibleGroup && (
                <section className="fp-bc-card fp-bc-area-wide fp-rise" style={staggerStyle(0)} aria-labelledby="bc-flexible" data-testid="bc-flexible">
                  <div className="fp-bc-card-head">
                    <h2 id="bc-flexible" className="fp-bc-h2">{GROUP_LABELS.flexible}</h2>
                    <span className="fp-bc-card-sub">
                      {formatCurrency(flexibleGroup.actual)} of {formatCurrency(flexibleGroup.planned)} · the part you can move
                    </span>
                  </div>
                  {flexibleGroup.budgets.length === 0 ? emptyGroup(flexibleGroup) : (
                    <div className="fp-bc-rows">
                      {flexibleGroup.budgets.map((b, i) => renderRow(b as BudgetWithDetails, 'flexible', 'flexible', i))}
                    </div>
                  )}
                  {pace && flexibleGroup.budgets.some((b) => (b as BudgetWithDetails).pace_applies) && (
                    <p className="fp-bc-note fp-bc-foot">The line on each bar is where you would be by today.</p>
                  )}
                </section>
              )}

              <div className="fp-bc-area-narrow">
                {fixedGroup && (
                  <section className="fp-bc-card fp-rise" style={staggerStyle(1)} aria-labelledby="bc-fixed" data-testid="bc-fixed">
                    <div className="fp-bc-card-head">
                      <h2 id="bc-fixed" className="fp-bc-h2">{GROUP_LABELS.fixed}</h2>
                      <span className="fp-bc-card-sub">Already decided</span>
                    </div>
                    {fixedGroup.budgets.length === 0 ? emptyGroup(fixedGroup) : (
                      <div className="fp-bc-rows">
                        {fixedGroup.budgets.map((b, i) => renderRow(b as BudgetWithDetails, 'fixed', 'compact', i))}
                      </div>
                    )}
                  </section>
                )}

                {nonMonthlyGroup && (
                  <section className="fp-bc-card fp-rise" style={staggerStyle(2)} aria-labelledby="bc-non-monthly" data-testid="bc-non-monthly">
                    <div className="fp-bc-card-head">
                      <h2 id="bc-non-monthly" className="fp-bc-h2">{GROUP_LABELS.non_monthly}</h2>
                      <span className="fp-bc-card-sub">Set aside each month</span>
                    </div>
                    {/* A sinking fund's row is the YEAR and the group is the MONTH; said once, only when one is present. */}
                    {nonMonthlyGroup.budgets.some((b) => (b as BudgetWithDetails).is_sinking_fund) && (
                      <p className="fp-bc-note">These figures are this month's — a yearly budget counts one twelfth here.</p>
                    )}
                    {nonMonthlyGroup.budgets.length === 0 ? (
                      <>
                        <p className="fp-bc-body-text">
                          {sinking
                            ? `None yet. ${sinking.item} comes once a year: ${formatMoney(Number(sinking.monthly), { currency: sinking.currency || currency })} a month would cover it.`
                            : 'No non-monthly budgets yet.'}
                        </p>
                        <button type="button" className="fp-bc-secondary fp-press" onClick={planNonMonthly}>Plan it</button>
                      </>
                    ) : (
                      <div className="fp-bc-rows">
                        {nonMonthlyGroup.budgets.map((b, i) => renderRow(b as BudgetWithDetails, 'non_monthly', 'compact', i))}
                      </div>
                    )}
                  </section>
                )}

                <NotBudgetedCard
                  groups={groups}
                  total={(unsorted.actual ?? 0) === 0 ? (totals.unbudgeted_actual ?? null) : null}
                  currency={currency}
                  onBudget={startBudgetFor}
                />

                {/* Unsorted only when it has content: an empty to-do list is noise. */}
                {unsortedHasContent && (
                  <section className="fp-bc-card fp-rise" style={staggerStyle(4)} aria-labelledby="bc-unsorted" data-testid="bc-unsorted">
                    <div className="fp-bc-card-head">
                      <h2 id="bc-unsorted" className="fp-bc-h2">{UNSORTED_LABEL}</h2>
                      <span className="fp-bc-card-sub"><span>{unsorted.count}</span>{' · '}<Money amount={unsorted.actual} currency={currency} /></span>
                    </div>
                    <p className="fp-bc-note">
                      Money left through these categories and they are not in a group yet. These are starting points until you set them.
                    </p>
                    {unsorted.categories.map((category) => (
                      <div key={category.id} className="fp-bc-plain-row">
                        <span className="fp-bc-plain-name" translate="no">{category.name}</span>
                        <span className="fp-bc-figure"><Money amount={category.actual} currency={currency} /></span>
                        <SpendingTypeControl categoryId={category.id} value={null} onChanged={() => loadData({ quiet: true })} />
                      </div>
                    ))}
                    {unsorted.budgets.length > 0 && (
                      <div className="fp-bc-rows">
                        {unsorted.budgets.map((b, i) => renderRow(b as BudgetWithDetails, null, 'compact', i))}
                      </div>
                    )}
                  </section>
                )}

                {/* *** INCOME IS ITS OWN SECTION AND ITS COLUMNS ARE NAMED DIFFERENTLY ON PURPOSE (D-189). *** "Still
                    to come" is money that has not ARRIVED; an expense's remaining is money still to SPEND. */}
                {incomeSection && incomeSection.budgets.length > 0 && (
                  <section className="fp-bc-card fp-rise" style={staggerStyle(5)} aria-labelledby="bc-income">
                    <div className="fp-bc-card-head">
                      <h2 id="bc-income" className="fp-bc-h2">Income</h2>
                      <span className="fp-bc-card-sub">{incomeSection.budgets.length} {incomeSection.budgets.length === 1 ? 'source' : 'sources'}</span>
                    </div>
                    <div className="fp-bc-income-figures">
                      <span><span className="fp-bc-muted">Expected</span><Money amount={incomeSection.planned} currency={currency} /></span>
                      <span><span className="fp-bc-muted">Received</span><Money amount={incomeSection.received} currency={currency} /></span>
                      <span><span className="fp-bc-muted">Still to come</span><Money amount={incomeSection.still_to_come} currency={currency} /></span>
                    </div>
                    {incomeSection.budgets.map((row) => (
                      <div key={row.id} className="fp-bc-plain-row">
                        <span className="fp-bc-plain-name" translate="no">{budgetTitle(row)}</span>
                        <span className="fp-bc-muted">
                          <Money amount={row.spent} currency={currency} /> of <Money amount={row.amount} currency={currency} /> received
                        </span>
                      </div>
                    ))}
                    {/* No pace mark on income: it arrives in lumps, and "behind" would mean the opposite of an expense's. */}
                    <p className="fp-bc-note">Income has no pace mark — it arrives in lumps, not evenly through the month.</p>
                  </section>
                )}
              </div>
            </div>
            </div>
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
                        // Room for the chevron — see FINPAL-28.
                        paddingRight: '38px',
                        backgroundColor: 'var(--input-bg)',
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
                          {categoryIcon(cat.icon)} {cat.name}
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
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: '12px' }}>
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
                            color: budgetFormData.period === period ? 'var(--status-ok)' : 'var(--text-primary)',
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
                        accentColor: 'var(--status-ok)'
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
                        color: 'var(--status-over)',
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
