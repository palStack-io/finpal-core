/**
 * Budgets C (core, 2026-11-20): the row status chip.
 *
 * *** NO MONEY FIGURE AND NO DAY COUNT IS WORKED OUT HERE. *** The hero prints the server's `days_left` and `per_day`
 * as sent. The chip only classifies the server's own figures: over is `remaining < 0` (which includes rollover; spent
 * against the bare plan would call a rolled-over budget over), and the pace words compare `percentage` with
 * `pace.fraction` with a 5-point margin.
 */
import type { BudgetPace } from '../../services/budgetService';

/** Within this margin of the day's mark a row is "On pace". */
export const PACE_MARGIN = 0.05;
/** Spent this far below the day's mark reads as "Plenty left" rather than "On pace". */
export const PLENTY_GAP = 0.2;

export type RowStatus =
  | { kind: 'over'; amount: number }
  | { kind: 'ahead' }
  | { kind: 'onPace' }
  | { kind: 'plenty' }
  | { kind: 'within' };

export interface StatusRow {
  remaining: number;
  percentage: number;
  pace_applies?: boolean;
}

/** One row's chip. Over is the server's `remaining < 0`; pace words only where the server says the mark can be read. */
export function rowStatus(row: StatusRow, pace: BudgetPace | null | undefined): RowStatus {
  if (row.remaining < 0) return { kind: 'over', amount: -row.remaining };
  if (!pace || row.pace_applies !== true) return { kind: 'within' };
  const used = Math.min(row.percentage, 100) / 100;
  if (used > pace.fraction + PACE_MARGIN) return { kind: 'ahead' };
  if (used < pace.fraction - PLENTY_GAP) return { kind: 'plenty' };
  return { kind: 'onPace' };
}

/** The chip's words (voice.md, "Budgets C": over the plan is said in words, never by colour alone). */
export const statusText = (s: RowStatus, format: (n: number) => string): string => {
  switch (s.kind) {
    case 'over': return `Over by ${format(s.amount)}`;
    case 'ahead': return 'Ahead of the month';
    case 'onPace': return 'On pace';
    case 'plenty': return 'Plenty left';
    default: return 'Within the plan';
  }
};
