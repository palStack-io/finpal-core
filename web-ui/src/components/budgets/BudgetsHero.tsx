/**
 * Budgets C (Harun's pick, 2026-11-20), core edition: the Budgets page's content for the shared page hero
 * (`components/PageHero.tsx`). This file only fills its slots: title, the month pill, the one answer, and the action
 * (the frosted figures and New budget). The hero draws its default ridgeline along the bottom edge.
 *
 *   Budgets  [‹ November 2026 ›]                         ┌ Came in │ Not given a job yet ┐
 *   $769.74 left to spend, with 11 days to go            └─────────────────────────────┘
 *   That is about $69.98 a day for the rest of November. [ New budget ]  (?)
 *   [=========plan bar=========|====      ]  Day 20 of 30
 *   $2,630.26 spent of $3,400.00 planned · $85.44 more went to categories with no budget
 *
 * *** EVERY FIGURE IS THE SERVER'S, PRINTED AS SENT. *** The big number is `totals.remaining`; the days and the per-day
 * figure are the overview's `days_left` / `per_day` (one rule in `services/budget/pace.py`: today counts, the last day
 * is 1); the bar and its caption are `budgeted_actual` of `planned`, so bar, caption and big number agree. "Came in" is
 * `income` and "Not given a job yet" is `left_to_budget`; null is a dash and a sentence, never a zero. With no plan at
 * all (planned 0) the answer is the first step, and no bar is drawn.
 *
 * *** THE OVERVIEW IS ALWAYS THE SERVER'S CURRENT MONTH. *** Which month that is, and its name, come from `pace.as_of`
 * (the page passes them), never the browser clock. On another month the hero says whose figures these are.
 */
import React from 'react';
import { ChevronLeft, ChevronRight, CircleHelp, Plus } from 'lucide-react';
import { formatMoney } from '../../styles/money';
import type { BudgetPace, BudgetTotals } from '../../services/budgetService';
import { PageHero } from '../PageHero';

export interface BudgetsHeroProps {
  /** The household note, when the page is shared. */
  scopeNote?: string | null;
  monthLabel: string;
  /** The server's month name for sentences ("November"), from `pace.as_of`. */
  monthName: string;
  isCurrentMonth: boolean;
  totals: BudgetTotals;
  pace: BudgetPace | null;
  /** The server's `days_left` (today included) and `per_day`, printed as sent. */
  daysLeft: number | null;
  perDay: number | null;
  income: number | null;
  leftToBudget: number | null;
  currency: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onNewBudget: () => void;
  onHelp: () => void;
}

export const BudgetsHero: React.FC<BudgetsHeroProps> = ({
  scopeNote, monthLabel, monthName, isCurrentMonth, totals, pace, daysLeft, perDay, income, leftToBudget,
  currency, onPrev, onNext, onToday, onNewBudget, onHelp,
}) => {
  const money = (n: number) => formatMoney(n, { currency });
  const remaining = totals.remaining;
  const hasPlan = totals.planned > 0;
  const spentShare = hasPlan ? Math.min(Math.max((totals.budgeted_actual ?? 0) / totals.planned, 0), 1) : 0;
  const showDay = isCurrentMonth && !!pace;
  const lastDay = daysLeft === 1;

  const suffix = remaining < 0
    ? 'past the plan this month'
    : !isCurrentMonth || daysLeft == null
      ? `left to spend in ${monthName}`
      : lastDay
        ? 'left to spend, and today is the last day'
        : `left to spend, with ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} to go`;

  let line = '';
  if (!isCurrentMonth) line = `These figures are for ${monthName}, this month. The month you pick changes which transactions each budget lists.`;
  else if (remaining <= 0) line = `The plan for ${monthName} is used up. The rows below show where it went.`;
  else if (lastDay) line = `Today is the last day of ${monthName}.`;
  else if (perDay != null) line = `That is about ${money(perDay)} a day for the rest of ${monthName}.`;

  const pill = (
    <span className="fp-bc-pill">
      <span className="fp-bc-month" data-guide="budget-month">
        <button type="button" className="fp-bc-round fp-press" aria-label="Previous month" onClick={onPrev}>
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <span className="fp-bc-month-label">{monthLabel}</span>
        <button type="button" className="fp-bc-round fp-press" aria-label="Next month" onClick={onNext}>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </span>
      {!isCurrentMonth && <button type="button" className="fp-bc-today fp-press" onClick={onToday}>Today</button>}
    </span>
  );

  const answer = (
    <div data-guide="budget-totals" className="fp-bc-hero-figures">
      {/* The words cross-fade when the month changes (the figure itself is always this month's); never a count-up. */}
      <div key={monthLabel} className="fp-bc-answer fp-crossfade" data-testid="budgets-answer">
        {hasPlan ? (
          <>
            <p className="fp-bc-big">
              <span className="fp-bc-big-number" data-testid="budgets-big-number">{money(Math.abs(remaining))}</span>
              <span className="fp-bc-big-suffix">{suffix}</span>
            </p>
            {line && <p className="fp-bc-hero-line" data-testid="budgets-hero-line">{line}</p>}
          </>
        ) : (
          <p className="fp-bc-hero-line" data-testid="budgets-hero-line">
            No plan for {monthName} yet. Start with New budget: one category you'd like to keep an eye on.
          </p>
        )}
      </div>

      {hasPlan && (
        <div className="fp-bc-plan">
          <div className="fp-bc-plan-row">
            <div className="fp-bc-plan-track">
              <div className="fp-fill" data-testid="budgets-plan-fill" data-fill={spentShare.toFixed(3)}
                style={{ width: `${spentShare * 100}%`, background: 'var(--fp-bc-hero-fill)', borderRadius: 7 }} />
              {showDay && <span className="fp-bc-plan-mark fp-mark-in" aria-hidden="true" style={{ left: `${Math.min(100, pace!.fraction * 100)}%` }} />}
            </div>
            {showDay && <span className="fp-bc-plan-day">Day {pace!.day} of {pace!.days_in_month}</span>}
          </div>
          <p className="fp-bc-plan-caption">
            {money(totals.budgeted_actual ?? 0)} spent of {money(totals.planned)} planned
            {(totals.unbudgeted_actual ?? 0) > 0 && (
              <span>{' · '}{money(totals.unbudgeted_actual)} more went to categories with no budget</span>
            )}
          </p>
        </div>
      )}
    </div>
  );

  const action = (
    <div className="fp-bc-hero-side">
      <div className="fp-bc-panel">
        <div className="fp-bc-panel-cell">
          <span className="fp-bc-panel-label">Came in</span>
          <span className="fp-bc-panel-figure">{income === null ? '—' : money(income)}</span>
        </div>
        <div className="fp-bc-panel-cell">
          <span className="fp-bc-panel-label">Not given a job yet</span>
          <span className="fp-bc-panel-figure">{leftToBudget === null ? '—' : money(leftToBudget)}</span>
        </div>
        {income === null && <p className="fp-bc-panel-note">No income recorded this month. Add it when you have it.</p>}
      </div>
      <div className="fp-bc-hero-actions">
        <button type="button" className="fp-bc-primary fp-press" onClick={onNewBudget}>
          <Plus size={18} aria-hidden="true" /> New budget
        </button>
        {/* The guide's "?": the tips card opens only from here (PageGuide onDemand). Its id is where "Got it" sends
            focus back. */}
        <button type="button" id="guide-button-budgets" className="fp-bc-round fp-press" aria-label="About this page" onClick={onHelp}>
          <CircleHelp size={20} aria-hidden="true" />
        </button>
      </div>
      {scopeNote && <p className="fp-bc-hero-sub">{scopeNote}</p>}
    </div>
  );

  return <PageHero title="Budgets" titleId="budgets-title" data-testid="budgets-hero" pill={pill} answer={answer} action={action} />;
};

export default BudgetsHero;
