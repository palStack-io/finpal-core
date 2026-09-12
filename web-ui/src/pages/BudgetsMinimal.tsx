import React, { useState, useEffect } from 'react';
import { Plus, ChevronDown, ChevronUp, Edit2, Trash2, Calendar, ChevronLeft, ChevronRight, Loader2, DollarSign, TrendingDown, TrendingUp } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { formatMoney, Money } from '../styles/money';
import { getBranding } from '../config/branding';
import type { BudgetPace, IncomeSection } from '../services/budgetService';
import { budgetService, type Budget } from '../services/budgetService';
import { transactionsApi, type Transaction } from '../services/api/transactions';
import { categoriesApi, type Category } from '../services/api/categories';
import { useToast } from '../contexts/ToastContext';
import { SlidePanel } from '../components/SlidePanel';
import { AddTransactionForm } from '../components/forms/AddTransactionForm';
import { StatCard } from '../components/StatCard';
import { apiErrorMessage } from '../utils/apiError';
import { categoryIcon } from '../utils/categoryIcon';
import { SpendingTypeControl } from '../components/budgets/SpendingTypeControl';
import { GROUP_LABELS, UNSORTED_LABEL, type SpendingType } from '../utils/spendingGroups';
import type { SpendingGroup, UnsortedSection } from '../services/budgetService';

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
  category_icon?: string;
  category_color?: string;
  transactions?: Transaction[];
}

const fieldLabelStyle: React.CSSProperties = { display: 'block', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: '500', marginBottom: '8px' };
const secondaryBgStyle: React.CSSProperties = { background: 'var(--bg-secondary)' };

const mutedSmallStyle: React.CSSProperties = { color: 'var(--text-muted)', fontSize: '13px' };
const secondaryBodyStyle: React.CSSProperties = { color: 'var(--text-secondary)', fontSize: '14px', margin: 0 };

/**
 * The three group sections and Unsorted share one shell.
 *
 * Inline rather than a named role class: this shell has exactly one consumer,
 * and a role class with a single caller is a rule nothing keeps right -- two of
 * the two measured so far had drifted from what the app renders. It becomes a
 * role class the moment mobile or another page needs the same shell.
 */
const groupSectionStyle: React.CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border-light)',
  borderRadius: '16px',
  padding: '16px 20px',
};

const groupHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '16px',
  width: '100%',
  background: 'transparent',
  border: 'none',
  padding: '4px',
  cursor: 'pointer',
  textAlign: 'left',
  color: 'var(--text-primary)',
  flexWrap: 'wrap',
};

const groupTitleStyle: React.CSSProperties = {
  fontSize: '18px',
  fontWeight: 600,
  color: 'var(--text-primary)',
  margin: 0,
};

const groupFigureStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  fontSize: '14px',
  color: 'var(--text-primary)',
};

const unsortedChipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '10px',
  padding: '8px 12px',
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border-light)',
  borderRadius: '10px',
  fontSize: '13px',
  color: 'var(--text-primary)',
  flexWrap: 'wrap',
};

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

  // *** THE SERVER OWNS THESE. *** They are stored exactly as received and
  // never re-summed here: two clients deriving the same subtotal is two chances
  // to disagree with each other and with the database (D-101).
  const [groups, setGroups] = useState<SpendingGroup[]>([]);
  /**
   * Today's position in the month, ONCE for the whole page. The server sends a
   * single figure because every row shares it — two clients working out "today"
   * independently would draw the mark in two places, and a phone in another
   * timezone would disagree with the browser beside it.
   */
  const [pace, setPace] = useState<BudgetPace | null>(null);
  /** Budgets on INCOME categories, kept out of the expense totals (D-189). */
  const [incomeSection, setIncomeSection] = useState<IncomeSection | null>(null);
  const [unsorted, setUnsorted] = useState<UnsortedSection>(
    { count: 0, actual: 0, categories: [], budget_count: 0, budgets: [] });
  const [totals, setTotals] = useState<{ planned: number; actual: number; remaining: number }>(
    { planned: 0, actual: 0, remaining: 0 });
  const [income, setIncome] = useState<number | null>(null);
  const [leftToBudget, setLeftToBudget] = useState<number | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<SpendingType[]>([]);

  const toggleGroup = (value: SpendingType) => setCollapsedGroups((current) => (
    current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
  ));

  // Was a local copy that used the user's currency with ZERO decimal places,
  // while every other page hardcoded USD with two — so a user set to EUR saw €
  // here and $ elsewhere, whole units here and cents elsewhere. One formatter
  // now, and it respects the user's currency everywhere.
  const currency = user?.default_currency_code || 'USD';
  const formatCurrency = (amount: number) => formatMoney(amount, { currency });

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
      const budgetsList = overview?.budgets || [];

      setGroups(overview?.groups || []);
      setPace(overview?.pace ?? null);
      setIncomeSection(overview?.income_section ?? null);
      setUnsorted(overview?.unsorted
        || { count: 0, actual: 0, categories: [], budget_count: 0, budgets: [] });
      // `?? null`, never `|| 0`: null means "nothing recorded this month" and
      // zero would be a claim that the user earned nothing.
      setTotals(overview?.totals || { planned: 0, actual: 0, remaining: 0 });
      setIncome(overview?.income ?? null);
      setLeftToBudget(overview?.left_to_budget ?? null);

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
      showToast(apiErrorMessage(error, 'Failed to save budget'), 'error');
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
          <Loader2 size={40} className="animate-spin" style={{ color: 'var(--status-ok)' }} />
          <p style={{ color: 'var(--text-secondary)', fontSize: '16px' }}>Loading budgets...</p>
        </div>
      </div>
    );
  }

  /**
   * One budget card.
   *
   * Extracted from an inline `budgets.map(...)` so the same card can be rendered
   * inside each of the three group sections and inside Unsorted, without four
   * copies of it drifting apart.
   */
  const renderBudgetCard = (budget: BudgetWithDetails, group: SpendingType | null = null) => {
                const percentage = budget.percentage;
                const remaining = budget.remaining;
                // *** FIXED IS REPORTED, NOT SCORED. *** Setting a target for
                // rent is theatre: it is usually the biggest line and it cannot
                // respond this month, and demanding a number for it is a large
                // part of why budgets get abandoned. So a committed category
                // shows what it costs and skips the progress bar, the
                // percentage and the OVER badge -- being "over" on a fixed cost
                // is not a thing the user did.
                const reported = group === 'fixed';
                const isOver = !reported && budget.spent > budget.amount;
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
                            {/* h2, not h3 — each budget row is a section under
                                the page's <h1> and there is no level between,
                                so h3 skipped one. Size is inline; nothing moves
                                on screen. Caught by the E2E heading check. */}
                            <h2 style={{ fontSize: '20px', fontWeight: '600', color: 'var(--text-primary)', margin: 0 }}>
                              {budgetTitle(budget)}
                            </h2>
                            {/* Edited in place, on the screen that shows the
                                classification -- spec §4: a default the user
                                cannot find is one they cannot correct. */}
                            {budget.category_id != null && (
                              <SpendingTypeControl
                                categoryId={budget.category_id}
                                value={group}
                                onChanged={loadData}
                              />
                            )}
                            {isOver && (
                              <span style={{
                                padding: '3px 10px',
                                /* The FILL is the wash and the CLAY is the border
                                   and the text. A red tint under clay measured
                                   3.87:1 for 11px bold — the badge that shouts
                                   loudest on the page was the least legible thing
                                   on it. Clay on the wash is 4.53. */
                                background: 'var(--kt-wash)',
                                border: '1px solid var(--status-over)',
                                borderRadius: '6px',
                                fontSize: '11px',
                                color: 'var(--status-over)',
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

                          {/* Progress Bar — omitted for a committed cost, which
                              has nothing to be a percentage OF. */}
                          {!reported && (
                          <div style={{ marginBottom: '8px' }}>
                            {/* *** `overflow: visible` SO THE PACE MARK CAN SIT
                                PROUD OF THE TRACK. *** The track used to clip,
                                which is right for the fill and wrong for a tick
                                that has to be findable at a glance. */}
                            <div style={{
                              position: 'relative',
                              width: '100%',
                              height: '8px',
                              background: 'var(--progress-track)',
                              borderRadius: '4px',
                            }}>
                              <div style={{
                                width: `${Math.min(percentage, 100)}%`,
                                height: '100%',
                                background: isOver
                                  ? 'var(--status-over)'
                                  : percentage >= 80
                                    ? 'var(--status-warn)'
                                    : budget.category_color || 'var(--status-ok)',
                                borderRadius: '4px',
                                transition: 'width 0.5s ease'
                              }}></div>
                              {/* *** THE PACE MARK: WHERE YOU SHOULD BE BY NOW.
                                  *** The one thing a budget is actually for —
                                  not "how much have I spent" but "am I burning
                                  this too fast". Drawn only where the server
                                  says it can be READ: `pace_applies` is false
                                  for a weekly or yearly budget, which has no
                                  day-of-month position, and for the
                                  `non_monthly` group, where an annual premium
                                  is not "behind" in March, it is not due.
                                  *** IT IS A MARK AND NEVER A COLOUR CHANGE.
                                  *** A bar that turned red past the tick would
                                  tell somebody with a big direct debit on the
                                  1st that they had failed, every month, on the
                                  day their rent left. That is voice rule 11
                                  inverted: finPal cannot tell "the ground is
                                  expensive" from "you lack discipline", so it
                                  must not imply the second. The tick states a
                                  fact; the user reads it. */}
                              {pace && budget.pace_applies && (
                                <span
                                  aria-hidden="true"
                                  title={`Today — day ${pace.day} of ${pace.days_in_month}`}
                                  style={{
                                    position: 'absolute',
                                    left: `${Math.min(100, pace.fraction * 100)}%`,
                                    top: '-3px',
                                    width: '2px',
                                    height: '14px',
                                    background: 'var(--text-primary)',
                                    borderRadius: '1px',
                                  }}
                                />
                              )}
                            </div>
                          </div>
                          )}

                          {/* *** WHERE THE MARK CANNOT BE READ, SAY SO IN WORDS.
                              *** A blank column reads as a bug; a sentence reads
                              as a decision. The two cases are different and both
                              are stated rather than left to be inferred:
                              a weekly or yearly budget has no day-of-MONTH
                              position at all, and a `non_monthly` group is
                              "resupply that is not monthly" by definition — an
                              annual premium is not behind in March, it is not
                              due. `pace_applies === false` is the server's
                              answer; `undefined` is an older backend and says
                              nothing at all. */}
                          {pace && budget.pace_applies === false && !reported && (
                            <p className="fp-hint" style={{ margin: '0 0 8px' }}>
                              {(budget.period || '').toLowerCase() !== 'monthly'
                                ? `No pace mark — this is a ${(budget.period || 'non-monthly').toLowerCase()} budget`
                                : 'No pace mark — not a monthly thing'}
                            </p>
                          )}

                          {/* Spent / Budget */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <p style={secondaryBodyStyle}>
                              <span style={{ color: 'var(--text-primary)', fontWeight: '600', fontSize: '16px' }}>
                                {formatCurrency(budget.spent)}
                              </span>
                              {reported ? ' committed' : ` of ${formatCurrency(budget.amount)}`}
                            </p>
                            <p style={{
                              color: isOver ? 'var(--status-over)' : 'var(--status-ok)',
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
  };

  return (
    <>
      <div style={{ minHeight: '100vh', padding: '24px' }}>
        <div className="page-container">

          {/* Simple Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
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
                  // WCAG 2 AA `button-name`, found by the E2E axe run. The label
                  // is a lucide icon, which renders an <svg> with no text, so the
                  // button is announced as "button" with no indication of what it
                  // does. Both month arrows had this.
                  aria-label="Previous month"
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
                  aria-label="Next month"
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
            // Status tokens, not raw accents: measured on the card, #22c55e was
            // 2.21:1 and #f59e0b 2.09:1 in light. `over` is the direction's clay,
            // which piece 5 reserved for exactly this — "clay ONLY for a broken
            // budget" — so the state finally wears the colour meant for it.
            const spentColor = spentPct >= 100 ? 'var(--status-over)' : spentPct >= 80 ? 'var(--status-warn)' : 'var(--status-ok)';
            const onTrack = budgets.filter(b => b.percentage < 80).length;
            const warning = budgets.filter(b => b.percentage >= 80 && b.spent <= b.amount).length;
            const over = budgets.filter(b => b.spent > b.amount).length;
            return (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '32px' }}>
                <StatCard
                  label="Total Budgeted"
                  scope="household"
                  value={formatCurrency(totalBudgeted)}
                  accentColor="#3b82f6"
                  icon={<DollarSign size={24} color="#3b82f6" />}
                  subtitle={<span style={mutedSmallStyle}>Across {budgets.length} categories</span>}
                />
                <StatCard
                  label="Total Spent"
                  scope="household"
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
                  scope="household"
                  value={formatCurrency(Math.abs(totalRemaining))}
                  accentColor={totalRemaining >= 0 ? 'var(--status-ok)' : 'var(--status-over)'}
                  icon={<TrendingUp size={24} color={totalRemaining >= 0 ? 'var(--status-ok)' : 'var(--status-over)'} />}
                  valueColor={totalRemaining >= 0 ? 'var(--status-ok)' : 'var(--status-over)'}
                  subtitle={<span style={mutedSmallStyle}>{daysLeftInMonth()} days left this month</span>}
                />
                <StatCard
                  label="Left to budget"
                  scope="household"
                  /* *** null IS NOT ZERO, AND THIS IS THE WHOLE POINT. *** No
                     income recorded this month means finPal does not know what
                     they earn; rendering that as 0 turns into "-$1,400 left to
                     budget" for somebody who has not been paid yet on the 10th.
                     Measured on the live demo, where total income is 9,950 and
                     this month's is nothing. */
                  value={leftToBudget === null ? '—' : formatCurrency(leftToBudget)}
                  accentColor={leftToBudget === null
                    ? 'var(--text-muted)'
                    : leftToBudget >= 0 ? 'var(--status-ok)' : 'var(--status-over)'}
                  valueColor={leftToBudget === null
                    ? 'var(--text-muted)'
                    : leftToBudget >= 0 ? 'var(--status-ok)' : 'var(--status-over)'}
                  icon={<DollarSign size={24} color={leftToBudget === null ? 'var(--text-muted)' : leftToBudget >= 0 ? 'var(--status-ok)' : 'var(--status-over)'} />}
                  subtitle={
                    <span style={mutedSmallStyle}>
                      {income === null
                        ? 'No income recorded this month yet'
                        : `${formatCurrency(income)} income − ${formatCurrency(totals.planned)} planned`}
                    </span>
                  }
                />
                {/* Budget Health — custom layout, not a simple stat */}
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: '16px', padding: '24px', boxShadow: 'var(--card-shadow)' }}>
                  <p className="fp-hint-block">Budget Health</p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '10px' }}>
                    <span style={{ color: 'var(--status-ok)' }}>{onTrack} on track</span>
                    <span style={{ color: 'var(--status-warn)' }}>{warning} at risk</span>
                    <span style={{ color: 'var(--status-over)' }}>{over} over</span>
                  </div>
                  <div style={{ display: 'flex', gap: '2px', height: '20px', borderRadius: '6px', overflow: 'hidden' }}>
                    <div style={{ flex: onTrack || 0.1, background: 'var(--status-ok)' }} />
                    <div style={{ flex: warning || 0.1, background: 'var(--status-warn)' }} />
                    <div style={{ flex: over || 0.1, background: 'var(--status-over)' }} />
                  </div>
                </div>
              </div>
            );
          })()}

{/* Budget list, grouped by spending type */}
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
              <>
                {/* *** INCOME IS ITS OWN SECTION, ABOVE THE EXPENSES, AND ITS
                    COLUMNS ARE NAMED DIFFERENTLY ON PURPOSE — D-189. *** Money
                    in and money out are arithmetically opposite, and they used
                    to render identically: a budget on an income category fell
                    into `unsorted` and was SUMMED AS PLANNED SPENDING, so the
                    page told the user they had £4,500 of unearned money left to
                    spend.

                    "Still to come" is not "remaining" with a different label.
                    On an expense, remaining is money you may still SPEND; on
                    income it is money that has not ARRIVED. One heading over
                    both is D-102's shape, the row where a caption said net
                    worth rose 43% while the line fell.

                    Rendered only when the section EXISTS and has something in
                    it: an empty income block on an account that has never
                    budgeted income is a heading with nothing under it, which is
                    the noise D-192's guard exists to catch. */}
                {incomeSection && incomeSection.budgets.length > 0 && (
                  <section style={groupSectionStyle}>
                    <div style={{ ...groupHeaderStyle, cursor: 'default' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <h2 style={groupTitleStyle}>Income</h2>
                        <span className="fp-hint">
                          {incomeSection.budgets.length}{' '}
                          {incomeSection.budgets.length === 1 ? 'source' : 'sources'}
                        </span>
                      </span>
                      <span style={{ display: 'flex', gap: '24px', alignItems: 'baseline' }}>
                        <span style={groupFigureStyle}>
                          <span className="fp-hint">Expected</span>
                          <Money amount={incomeSection.planned} currency={currency} />
                        </span>
                        <span style={groupFigureStyle}>
                          <span className="fp-hint">Received</span>
                          <Money amount={incomeSection.received} currency={currency} />
                        </span>
                        <span style={groupFigureStyle}>
                          <span className="fp-hint">Still to come</span>
                          <Money amount={incomeSection.still_to_come} currency={currency} />
                        </span>
                      </span>
                    </div>
                    {/* *** THE SOURCES ARE NAMED. *** A section reading "1
                        source" with nothing saying WHICH is D-192's shape —
                        four anonymous budgets — one section up. Deliberately a
                        plain list rather than the expense card: an income row
                        has no progress bar, no pace and no overspend, so
                        reusing that card would draw three things that mean
                        nothing here. */}
                    <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
                      {incomeSection.budgets.map((row) => (
                        <li
                          key={row.id}
                          style={{
                            display: 'flex', justifyContent: 'space-between',
                            gap: '12px', padding: '8px 4px',
                            borderTop: '1px solid var(--border-light)',
                          }}
                        >
                          <span style={{ color: 'var(--text-primary)' }}>
                            {budgetTitle(row)}
                          </span>
                          <span className="fp-hint">
                            <Money amount={row.spent} currency={currency} /> of{' '}
                            <Money amount={row.amount} currency={currency} /> received
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className="fp-hint" style={{ padding: '8px 4px 0' }}>
                      {/* *** NO PACE MARK ON INCOME, AND SAYING SO IS THE POINT.
                          *** For an expense, behind the mark is GOOD — you are
                          underspending. For income it is BAD — the money has not
                          arrived. The same phrase would reassure on one row and
                          alarm on the other. And income arrives in LUMPS: a
                          salary paid on the 26th is 0% on day 11 and that is not
                          "behind", it is not due. */}
                      Income has no pace mark — it arrives in lumps, not evenly
                      through the month.
                    </p>
                  </section>
                )}

                {/* *** ALL THREE GROUPS ALWAYS RENDER, EVEN EMPTY. *** A section
                    that vanishes when it has nothing in it makes the page jump
                    around between months, and an absent group reads as "you have
                    no fixed costs" rather than "you have not sorted them yet". */}
                {groups.map((group) => {
                  const collapsed = collapsedGroups.includes(group.spending_type);
                  return (
                    <section key={group.spending_type} style={groupSectionStyle}>
                      <button
                        onClick={() => toggleGroup(group.spending_type)}
                        aria-expanded={!collapsed}
                        style={groupHeaderStyle}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          {collapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
                          <h2 style={groupTitleStyle}>{group.label}</h2>
                          <span className="fp-hint">
                            {group.budgets.length} {group.budgets.length === 1 ? 'budget' : 'budgets'}
                          </span>
                        </span>
                        <span style={{ display: 'flex', gap: '24px', alignItems: 'baseline' }}>
                          <span style={groupFigureStyle}>
                            <span className="fp-hint">Planned</span>
                            <Money amount={group.planned} currency={currency} />
                          </span>
                          <span style={groupFigureStyle}>
                            <span className="fp-hint">Actual</span>
                            <Money amount={group.actual} currency={currency} />
                          </span>
                          <span style={groupFigureStyle}>
                            <span className="fp-hint">Remaining</span>
                            {/* Negative renders in clay and is NEVER clamped to
                                zero: an overspend shown as 0 is a lie the user
                                acts on. */}
                            <span style={{ color: group.remaining < 0 ? 'var(--status-over)' : 'var(--text-primary)', fontWeight: 600 }}>
                              {formatCurrency(group.remaining)}
                            </span>
                          </span>
                        </span>
                      </button>

                      {!collapsed && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
                          {group.budgets.length === 0 ? (
                            <p className="fp-hint" style={{ padding: '8px 4px' }}>
                              {/* *** THE FIXED GROUP DOES NOT ASK FOR A TARGET. ***
                                  Every other empty state on this page invites you
                                  to set one; demanding a number for rent is
                                  theatre, so this one reports and stops. */}
                              {group.spending_type === 'fixed'
                                ? 'Nothing here yet. Fixed costs are reported, not budgeted — sort a category into Fixed and it will show what it costs.'
                                : `No ${group.label.toLowerCase()} budgets yet.`}
                            </p>
                          ) : (
                            group.budgets.map((row) => renderBudgetCard(row as BudgetWithDetails, group.spending_type))
                          )}
                        </div>
                      )}
                    </section>
                  );
                })}

                {/* *** UNSORTED IS SHOWN ONLY WHEN IT HAS CONTENT. *** Unlike the
                    three groups, an empty Unsorted is not a state worth a heading:
                    it is a to-do list, and an empty to-do list is just noise. */}
                {(unsorted.count > 0 || unsorted.budgets.length > 0) && (
                  <section style={groupSectionStyle}>
                    <div style={groupHeaderStyle}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <h2 style={groupTitleStyle}>{UNSORTED_LABEL}</h2>
                        <span className="fp-hint">{unsorted.count}</span>
                      </span>
                      <span style={groupFigureStyle}>
                        <span className="fp-hint">Actual</span>
                        <Money amount={unsorted.actual} currency={currency} />
                      </span>
                    </div>
                    <p className="fp-hint" style={{ margin: '4px 4px 12px' }}>
                      Money left through these categories and they are not in a group
                      yet. These are starting points until you set them.
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                      {unsorted.categories.map((category) => (
                        <span key={category.id} style={unsortedChipStyle}>
                          <span style={{ fontWeight: 600 }}>{category.name}</span>
                          <Money amount={category.actual} currency={currency} />
                          <SpendingTypeControl
                            categoryId={category.id}
                            value={null}
                            onChanged={loadData}
                          />
                        </span>
                      ))}
                    </div>
                    {unsorted.budgets.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
                        {unsorted.budgets.map((row) => renderBudgetCard(row as BudgetWithDetails, null))}
                      </div>
                    )}
                  </section>
                )}
              </>
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
