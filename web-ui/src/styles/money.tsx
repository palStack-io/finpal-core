/**
 * Money as a typographic object.
 *
 * finPal is a ledger, and the vernacular of a ledger is the aligned column. That
 * is not decoration: when digits do not align you cannot scan a column of
 * amounts, and scanning a column of amounts is the whole job.
 *
 * Three things this fixes, all of which were real:
 *
 * 1. **No tabular numerals anywhere in the app.** Proportional digits mean
 *    `$1,234.56` and `$99.00` take different widths, so no two rows line up and a
 *    column of figures reads as a ragged edge.
 * 2. **`formatCurrency` was defined five times** — Transactions, Dashboard,
 *    BudgetsMinimal, Investments, StockDetailModal — and the copies disagreed.
 *    Budgets used the user's own currency with **zero** decimal places while the
 *    others hardcoded USD with two, so a user set to EUR saw € on one page and $
 *    on the rest, whole units on one and cents on the others.
 * 3. **Sign was a `+`/`-` glued onto the formatted string**, which put it outside
 *    the tabular run and knocked the column out of alignment again.
 *
 * The one deliberate flourish: the currency symbol sits lighter and slightly
 * smaller than the digits. A ledger puts the unit at the head of the column, not
 * on every row; we cannot drop it per-row without losing clarity in a
 * multi-currency account, so instead it recedes and the digits carry. Everything
 * else here is restraint.
 */
import React from 'react';

export type MoneyTone = 'neutral' | 'income' | 'expense';

/**
 * Digits that align. Apply to any element holding a figure — amounts, counts,
 * dates, percentages — so columns of them line up.
 *
 * `tabular-nums` gives every digit the same advance width; `lining-nums` stops a
 * font substituting old-style figures that sit below the baseline.
 */
export const tabular: React.CSSProperties = {
  fontVariantNumeric: 'tabular-nums lining-nums',
  // Belt and braces: some system fonts only honour the raw OpenType feature.
  fontFeatureSettings: '"tnum" 1, "lnum" 1',
};

/**
 * Semantic accents stay literal per CLAUDE.md — they read correctly on both
 * themes, which is exactly why they were never variablised.
 */
const TONE_COLOR: Record<MoneyTone, string> = {
  neutral: 'var(--text-primary)',
  income: '#22c55e',
  expense: '#ef4444',
};

export interface MoneyStyleOptions {
  tone?: MoneyTone;
  /** Font size in px. Omit to inherit. */
  size?: number;
  /** 600 by default: a figure should out-weigh its label. */
  weight?: number;
}

/** Style for an amount. Use via `<Money>`, or apply directly to a cell. */
export function moneyStyle(options: MoneyStyleOptions = {}): React.CSSProperties {
  const { tone = 'neutral', size, weight = 600 } = options;
  return {
    ...tabular,
    color: TONE_COLOR[tone],
    fontWeight: weight,
    fontSize: size ? `${size}px` : undefined,
    // Stops a long amount wrapping between the symbol and its digits.
    whiteSpace: 'nowrap',
  };
}

export interface FormatMoneyOptions {
  currency?: string;
  /** Show a leading + on positive values. Off by default. */
  signed?: boolean;
  /** Drop the minor units. For summary figures, never for a ledger row. */
  round?: boolean;
}

/**
 * The one money formatter. Returns parts so the symbol can be styled separately
 * from the digits — `Intl.NumberFormat.formatToParts` is what makes that possible
 * without string surgery.
 */
export function formatMoneyParts(
  amount: number,
  options: FormatMoneyOptions = {},
): { sign: string; symbol: string; digits: string } {
  const { currency = 'USD', signed = false, round = false } = options;
  const value = Number.isFinite(amount) ? amount : 0;

  const parts = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: round ? 0 : 2,
    maximumFractionDigits: round ? 0 : 2,
  }).formatToParts(Math.abs(value));

  const symbol = parts
    .filter((p) => p.type === 'currency')
    .map((p) => p.value)
    .join('');
  const digits = parts
    .filter((p) => p.type !== 'currency' && p.type !== 'literal')
    .map((p) => p.value)
    .join('');

  let sign = '';
  // U+2212 MINUS SIGN, not a hyphen: it is the same width as a digit in a
  // tabular font, so a negative row still aligns with the positives above it.
  if (value < 0) sign = '−';
  else if (signed && value > 0) sign = '+';

  return { sign, symbol, digits };
}

/** Plain string, for aria-labels, titles and chart tooltips. */
export function formatMoney(amount: number, options: FormatMoneyOptions = {}): string {
  const { sign, symbol, digits } = formatMoneyParts(amount, options);
  return `${sign}${symbol}${digits}`;
}

export interface MoneyProps extends MoneyStyleOptions, FormatMoneyOptions {
  amount: number;
  /**
   * Take the tone from the sign rather than stating it. For a ledger column that
   * holds both income and expense.
   */
  autoTone?: boolean;
}

/**
 * An amount. The currency symbol recedes so the digits carry the column.
 *
 * Screen readers get the plain string via `aria-label`, because the styled form
 * splits the value across elements and would otherwise be read out in pieces.
 */
export const Money: React.FC<MoneyProps> = ({
  amount,
  tone,
  autoTone = false,
  size,
  weight,
  currency,
  signed,
  round,
}) => {
  const { sign, symbol, digits } = formatMoneyParts(amount, { currency, signed, round });
  const resolvedTone: MoneyTone = tone
    ?? (autoTone
      ? (amount < 0 ? 'expense' : amount > 0 ? 'income' : 'neutral')
      : 'neutral');

  return (
    <span
      style={moneyStyle({ tone: resolvedTone, size, weight })}
      aria-label={formatMoney(amount, { currency, signed, round })}
    >
      {sign}
      <span style={{ fontWeight: 400, fontSize: '0.85em', opacity: 0.7 }}>{symbol}</span>
      {digits}
    </span>
  );
};
