/**
 * This period against the one before it, one category per row.
 *
 * *** PAIRED BARS RATHER THAN A DIFFERENCE BAR, AND THE REASON IS WHAT A
 * READER CHECKS. *** A single signed bar per category shows the change and
 * hides the scale — "down £180" means something very different against £200
 * than against £4,000. Two bars share one axis, so the change is the gap
 * between them AND the size is still legible. The figures sit on the rows
 * because a length is not readable to the pound, which is D-102's lesson: the
 * number beside a bar comes from the same row the bar was drawn from, so there
 * is nothing for it to disagree with.
 *
 * The arithmetic is in `utils/periodComparison.ts` and proved by
 * `periodComparisonKeepsWhatStopped.test.ts` — including the case this chart
 * would otherwise make invisible, a category that stopped. This file turns
 * numbers into widths and must decide nothing.
 */

import React from 'react';
import type { ComparisonRow, PeriodComparison } from '../../utils/periodComparison';

interface PeriodCompareChartProps {
  comparison: PeriodComparison;
  /** Already-bound formatter, so this file owns no currency knowledge. */
  format: (amount: number) => string;
  /** e.g. "Last 30 days" / "the 30 days before" — the caller owns the words. */
  nowLabel: string;
  beforeLabel: string;
  /**
   * Whether an INCREASE is the welcome direction. `false` for spending, `true`
   * for income. Required rather than defaulted: a default would be silently
   * wrong for one of the two callers, which is the bug this prop exists to
   * prevent.
   */
  upIsGood: boolean;
}

/**
 * *** WHICH DIRECTION IS GOOD DEPENDS ON WHAT IS BEING COMPARED, AND THE FIRST
 * VERSION OF THIS GOT IT BACKWARDS ON HALF ITS CALLERS. ***
 *
 * It inked `delta > 0` red unconditionally, which is right for SPENDING and
 * exactly wrong for INCOME — the same component draws both cards, so the income
 * one would have shown a raise in red and a pay cut in green. The docstring
 * even claimed the component "takes no view", which was false: colouring up red
 * IS a view. Caught by rendering the spending card and then asking what the
 * income card would do with the same code.
 *
 * So the caller says. There is no sensible default and no way to infer it from
 * the numbers — "up" means nothing without knowing whether the rows are money
 * leaving or money arriving.
 */
const inkFor = (row: ComparisonRow, upIsGood: boolean) => {
  if (row.delta === 0) return 'var(--text-secondary)';
  const good = upIsGood ? row.delta > 0 : row.delta < 0;
  return good ? 'var(--g-ink)' : 'var(--re-ink)';
};

function deltaLabel(row: ComparisonRow, format: (n: number) => string): string {
  if (row.stopped) return `stopped · was ${format(row.before)}`;
  if (row.isNew) return `new · ${format(row.now)}`;
  if (row.delta === 0) return 'no change';
  const sign = row.delta > 0 ? '+' : '−';
  const pct = row.deltaPct === null ? '' : ` (${sign}${Math.abs(row.deltaPct).toFixed(0)}%)`;
  return `${sign}${format(Math.abs(row.delta))}${pct}`;
}

export const PeriodCompareChart: React.FC<PeriodCompareChartProps> = ({
  comparison, format, nowLabel, beforeLabel, upIsGood,
}) => {
  /* One scale for every bar on the chart, taken from the largest single figure
     in EITHER period. Per-row scaling would make a £60 row and a £5,400 row the
     same width, which is the one thing a bar chart must never do. */
  const peak = Math.max(
    1,
    ...comparison.rows.map((r) => Math.max(r.now, r.before)),
  );
  const width = (v: number) => `${Math.max(v > 0 ? 1.5 : 0, (v / peak) * 100)}%`;

  return (
    <div>
      {/* The key, said once. Two bars with no key is a chart that needs a
          caption to be read at all. */}
      <div style={{
        display: 'flex', gap: 18, alignItems: 'center',
        fontSize: '12px', color: 'var(--text-secondary)', marginBottom: 14,
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 22, height: 9, borderRadius: 3, background: 'var(--accent-primary-strong, var(--brand-main-green))' }} />
          {nowLabel}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 22, height: 9, borderRadius: 3, background: 'var(--border-medium)' }} />
          {beforeLabel}
        </span>
      </div>

      {comparison.rows.map((row) => (
        <div key={row.name} style={{ marginBottom: 16 }}>
          <div style={{
            display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 5,
          }}>
            <span style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
              {row.name}
            </span>
            <span style={{
              marginLeft: 'auto', fontSize: '12.5px', fontWeight: 600,
              color: inkFor(row, upIsGood), fontVariantNumeric: 'tabular-nums',
            }}>
              {deltaLabel(row, format)}
            </span>
          </div>

          {/* This period, then the one before, on the shared scale. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <div style={{ flex: 1, height: 11, background: 'var(--bg-secondary)', borderRadius: 4 }}>
              <div style={{
                width: width(row.now), height: '100%', borderRadius: 4,
                background: 'var(--brand-main-green)',
              }} />
            </div>
            <span style={barFigureStyle}>{format(row.now)}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, height: 11, background: 'var(--bg-secondary)', borderRadius: 4 }}>
              <div style={{
                width: width(row.before), height: '100%', borderRadius: 4,
                background: 'var(--border-medium)',
              }} />
            </div>
            <span style={{ ...barFigureStyle, color: 'var(--text-secondary)' }}>
              {format(row.before)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
};

const barFigureStyle: React.CSSProperties = {
  width: 90,
  textAlign: 'right',
  fontSize: '12px',
  fontVariantNumeric: 'tabular-nums',
  color: 'var(--text-primary)',
};

export default PeriodCompareChart;
