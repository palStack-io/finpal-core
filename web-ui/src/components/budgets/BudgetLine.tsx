/**
 * Budgets C (core): one budget row. Two shapes from one component, so they cannot drift apart:
 *
 *   `flexible`  icon · name and bar (with the pace mark) · "$X of $Y" · status chip · ⋯
 *   `compact`   name and "$X of $Y" · ⋯, then the bar and its notes (Fixed, Non-monthly, Unsorted, in the narrow column)
 *
 * Every figure is the server's (`spent`, `remaining`, `percentage`, `monthly_set_aside`, `pace`). Over is the server's
 * `remaining < 0` and the bar fills to its `percentage`, both of which include rollover; the plan is printed as the
 * plan, and a carry-over is said beside it. Over the plan is said in words in rust, never by colour alone. Motion is
 * CSS: the row rises (`.fp-rise`), the bar grows once (`.fp-fill`), the pace mark fades in after (`.fp-mark-in`).
 */
import React from 'react';
import type { BudgetPace } from '../../services/budgetService';
import type { Transaction } from '../../services/api/transactions';
import { staggerStyle } from '../../utils/entrance';
import { rowStatus, statusText } from './budgetFigures';
import { budgetLineIcon } from './budgetLineIcon';
import { BudgetRowMenu } from './BudgetRowMenu';

export interface BudgetLineRow {
  id: number;
  amount: number;
  spent: number;
  remaining: number;
  percentage: number;
  rollover?: boolean;
  rollover_amount?: number;
  period?: string;
  pace_applies?: boolean;
  is_sinking_fund?: boolean;
  monthly_set_aside?: number;
  transactions?: Transaction[];
}

export interface BudgetLineProps {
  row: BudgetLineRow;
  title: string;
  /** The name used for the line icon (the category's, falling back to the title). */
  iconName?: string;
  variant: 'flexible' | 'compact';
  pace: BudgetPace | null;
  format: (n: number) => string;
  /** Spending group select, rendered inside the ⋯. */
  controls: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  onEdit: (opener: HTMLButtonElement | null) => void;
  onDelete: (opener: HTMLButtonElement | null) => void;
  onTransaction: (tx: Transaction) => void;
  index?: number;
}

export const BudgetLine: React.FC<BudgetLineProps> = ({
  row, title, iconName, variant, pace, format, controls, expanded, onToggle, onEdit, onDelete, onTransaction, index = 0,
}) => {
  const over = row.remaining < 0;
  const status = rowStatus(row, pace);
  const carried = row.rollover && (row.rollover_amount ?? 0) > 0 ? row.rollover_amount! : 0;
  const fill = Math.min(Math.max(row.percentage, 0), 100) / 100;
  // The mark is read on the Flexible rows only: a fixed cost paid on the 1st is not "ahead" on the 2nd.
  const showMark = variant === 'flexible' && !!pace && row.pace_applies === true;
  const Icon = budgetLineIcon(iconName ?? title);

  const figure = (
    <span className="fp-bc-figure">
      {format(row.spent)}
      <span className="fp-bc-muted">{row.is_sinking_fund ? ` of ${format(row.amount)} for the year` : ` of ${format(row.amount)}`}</span>
    </span>
  );

  const bar = (
    <div className={`fp-bc-track${over ? ' is-over' : ''}`} data-testid={`budget-bar-${row.id}`} data-fill={fill.toFixed(3)}>
      <div className="fp-bc-track-fill">
        <div className="fp-fill" style={staggerStyle(index, { width: `${fill * 100}%`, background: over ? 'var(--fp-bc-rust)' : 'var(--fp-bc-fill)' })} />
      </div>
      {showMark && (
        <span className="fp-bc-mark fp-mark-in" aria-hidden="true" title={`Today — day ${pace!.day} of ${pace!.days_in_month}`}
          style={staggerStyle(index, { left: `${Math.min(100, pace!.fraction * 100)}%` })} />
      )}
    </div>
  );

  const notes = (
    <>
      {carried > 0 && <p className="fp-bc-note">plus {format(carried)} carried over</p>}
      {pace && row.pace_applies === false && variant === 'flexible' && (
        <p className="fp-bc-note">
          {(row.period || '').toLowerCase() !== 'monthly'
            ? `No pace mark — this is a ${(row.period || 'non-monthly').toLowerCase()} budget`
            : 'No pace mark — not a monthly thing'}
        </p>
      )}
      {row.is_sinking_fund && row.monthly_set_aside != null && (
        <p className="fp-bc-note">Set aside {format(row.monthly_set_aside)} a month</p>
      )}
    </>
  );

  const name = (
    <h3 className="fp-bc-name">
      <button type="button" className="fp-bc-name-btn" aria-expanded={expanded} onClick={onToggle}>
        <span translate="no">{title}</span>
      </button>
    </h3>
  );

  const menu = (
    <BudgetRowMenu budgetId={row.id} name={title} controls={controls} onEdit={onEdit} onDelete={onDelete}
      expanded={expanded} onToggleTransactions={onToggle} />
  );

  return (
    <div className="fp-bc-row fp-rise" data-testid={`budget-row-${row.id}`} style={staggerStyle(index)}>
      {variant === 'flexible' ? (
        <div className="fp-bc-flex">
          <span className="fp-bc-icon" aria-hidden="true"><Icon size={20} strokeWidth={1.75} /></span>
          <div className="fp-bc-flex-main">
            {name}
            {bar}
          </div>
          <span className="fp-bc-flex-meta">
            <span className="fp-bc-flex-figure">{figure}</span>
            <span className="fp-bc-chip" data-status={status.kind} data-testid={`budget-chip-${row.id}`}>{statusText(status, format)}</span>
          </span>
          <span className="fp-bc-flex-menu">{menu}</span>
          <div className="fp-bc-flex-notes">{notes}</div>
        </div>
      ) : (
        <div className="fp-bc-compact">
          <div className="fp-bc-compact-top">
            {name}
            {figure}
            {menu}
          </div>
          {bar}
          {over && <p className="fp-bc-over">{format(Math.abs(row.remaining))} over the plan</p>}
          {notes}
        </div>
      )}

      {expanded && (
        <div className="fp-bc-tx">
          {row.transactions && row.transactions.length > 0 ? (
            <>
              {row.transactions.slice(0, 10).map((txn) => (
                <button key={txn.id} type="button" className="fp-bc-tx-row fp-press" onClick={() => onTransaction(txn)}>
                  <span className="fp-bc-tx-text">
                    <span className="fp-bc-tx-name">{txn.description || txn.name || 'Unnamed Transaction'}</span>
                    <span className="fp-bc-muted">{new Date(txn.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  </span>
                  <span className="fp-bc-figure">{format(txn.amount)}</span>
                </button>
              ))}
              {row.transactions.length > 10 && (
                <p className="fp-bc-note">Showing 10 of {row.transactions.length} transactions</p>
              )}
            </>
          ) : (
            <p className="fp-bc-note">Nothing recorded in this category yet. Transactions you put here will appear in this list.</p>
          )}
        </div>
      )}
    </div>
  );
};

export default BudgetLine;
