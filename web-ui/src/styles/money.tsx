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
 * The user's number-format preference (#132).
 *
 * A BCP-47 tag from `User.number_locale`, or null for the app default. Module-level state
 * rather than a prop or a context because this module IS the one formatter: every `<Money>`
 * and all eight importers pick the preference up without a signature change, and the pure
 * `formatMoney` stays usable from a test or an aria-label with no provider in scope.
 *
 * Set once when the user loads (see `applyUserNumberLocale`), cleared on logout.
 */
const DEFAULT_LOCALE = 'en-US';
let numberLocale: string = DEFAULT_LOCALE;

/** Apply a preference. Pass null/'' to return to the app default. */
export function setNumberLocale(locale: string | null | undefined): void {
  if (!locale) {
    numberLocale = DEFAULT_LOCALE;
    return;
  }
  // The backend validates the tag, but a value already sitting in a database — or a
  // runtime with narrower ICU data than the server assumed — must not be able to take
  // down every screen that renders money. `Intl` throws a RangeError on a tag it cannot
  // use, so it is asked here, once, rather than on every format call.
  try {
    new Intl.NumberFormat(locale);
    numberLocale = locale;
  } catch {
    numberLocale = DEFAULT_LOCALE;
  }
}

export function getNumberLocale(): string {
  return numberLocale;
}

/**
 * Read a number out of what a person typed into an amount field.
 *
 * *** `parseFloat` IS WRONG HERE AND WAS THE ACTUAL DEFECT. *** `parseFloat('1,50')` is
 * `1` — it stops at the separator — and `1` then satisfies every `> 0` and
 * `Number.isFinite` check a form makes. So a comma-using user got no error and a wrong
 * amount in their ledger. Once a user can ASK for comma formatting (#132) they will type
 * commas, which is why this ships with the display half rather than after it.
 *
 * Both conventions are accepted regardless of the chosen locale, because people paste and
 * because a preference is not a promise about keystrokes. Ambiguity is resolved by
 * POSITION, not by locale: the last separator is the decimal one when it is followed by
 * one or two digits, and a trailing group of exactly three is a thousands separator.
 *
 * Returns NaN for anything that is not a number, so the caller's validation still gets to
 * refuse it. It must never invent a value.
 */
export function parseMoneyInput(raw: string): number {
  if (typeof raw !== 'string') return NaN;
  // Strip everything that is not a digit, separator or sign: spaces, currency symbols,
  // and non-breaking spaces, all of which arrive by paste.
  const cleaned = raw.replace(/[^\d.,-]/g, '').trim();
  if (!cleaned) return NaN;

  const negative = cleaned.startsWith('-');
  const digitsAndSeparators = cleaned.replace(/-/g, '');
  if (!digitsAndSeparators) return NaN;

  const lastDot = digitsAndSeparators.lastIndexOf('.');
  const lastComma = digitsAndSeparators.lastIndexOf(',');
  const lastSeparator = Math.max(lastDot, lastComma);

  /**
   * Digits with well-formed grouping, or null. `'1,2,3,4'` must be REFUSED rather than
   * read as 123.4: collapsing separators without checking their spacing turns typing
   * noise into a plausible figure, which is the same class of harm as the parseFloat
   * truncation this function replaces.
   */
  const groupedDigits = (part: string): string | null => {
    if (!/^[\d.,]*$/.test(part)) return null;
    if (part === '') return '';
    if (!/[.,]/.test(part)) return /^\d+$/.test(part) ? part : null;
    // One separator character only — '1.234,567' style mixing inside the whole part is
    // not a convention anyone writes.
    const separators = new Set(part.match(/[.,]/g) as string[]);
    if (separators.size > 1) return null;
    const groups = part.split(/[.,]/);
    const [first, ...rest] = groups;
    if (!/^\d{1,3}$/.test(first)) return null;
    if (!rest.every((g) => /^\d{3}$/.test(g))) return null;
    return groups.join('');
  };

  let normalised: string;
  if (lastSeparator === -1) {
    normalised = digitsAndSeparators;
  } else {
    const decimals = digitsAndSeparators.length - lastSeparator - 1;
    if (decimals >= 1 && decimals <= 2) {
      // The last separator is the decimal point; everything before it is grouping — and
      // that grouping is validated, not merely stripped.
      const whole = groupedDigits(digitsAndSeparators.slice(0, lastSeparator));
      const fraction = digitsAndSeparators.slice(lastSeparator + 1);
      if (whole === null) return NaN;
      normalised = `${whole || '0'}.${fraction}`;
    } else {
      // No decimal part: every separator must be a well-formed thousands separator.
      const whole = groupedDigits(digitsAndSeparators);
      if (whole === null) return NaN;
      normalised = whole;
    }
  }

  // Only now decide it is a number. Anything with a stray separator ('1,2,3,4') has
  // collapsed into digits above, so the shape is re-checked rather than assumed.
  if (!/^\d+(\.\d{1,2})?$/.test(normalised)) return NaN;
  const value = Number(normalised);
  if (!Number.isFinite(value)) return NaN;
  return negative ? -value : value;
}


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

  // #132: was hardcoded 'en-US', so the one place that could honour a preference was
  // the one place that refused to.
  const parts = new Intl.NumberFormat(numberLocale, {
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
