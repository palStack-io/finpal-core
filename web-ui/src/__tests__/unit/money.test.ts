/**
 * Money formatting and alignment.
 *
 * The behaviours here are the ones that were actually broken: no tabular
 * numerals anywhere in the app, five disagreeing copies of `formatCurrency`, and
 * a sign glued onto the formatted string.
 */
import { describe, expect, it } from 'vitest';
import { formatMoney, formatMoneyParts, moneyStyle, tabular } from '../../styles/money';

describe('tabular figures', () => {
  it('requests tabular lining numerals', () => {
    // Without this, a column of amounts cannot align — which is the whole job.
    expect(tabular.fontVariantNumeric).toContain('tabular-nums');
    expect(tabular.fontVariantNumeric).toContain('lining-nums');
  });

  it('also sets the raw OpenType feature, for fonts that only honour that', () => {
    expect(tabular.fontFeatureSettings).toContain('tnum');
  });

  it('carries the tabular settings into every amount style', () => {
    expect(moneyStyle().fontVariantNumeric).toContain('tabular-nums');
    expect(moneyStyle({ tone: 'expense' }).fontVariantNumeric).toContain('tabular-nums');
  });
});

describe('formatMoneyParts', () => {
  it('splits the symbol from the digits so they can be styled apart', () => {
    const { sign, symbol, digits } = formatMoneyParts(1234.5);
    expect(symbol).toBe('$');
    expect(digits).toBe('1,234.50');
    expect(sign).toBe('');
  });

  it('uses a real minus sign, not a hyphen', () => {
    // U+2212 is the same width as a digit in a tabular font; a hyphen is not, so
    // a negative row would sit a fraction out of line with the positives.
    const { sign } = formatMoneyParts(-40);
    expect(sign).toBe('−');
    expect(sign).not.toBe('-');
  });

  it('keeps the sign outside the digits, so the column still aligns', () => {
    const { digits } = formatMoneyParts(-40);
    expect(digits).toBe('40.00');
    expect(digits).not.toContain('-');
  });

  it('shows a plus only when asked', () => {
    expect(formatMoneyParts(40).sign).toBe('');
    expect(formatMoneyParts(40, { signed: true }).sign).toBe('+');
    expect(formatMoneyParts(0, { signed: true }).sign).toBe('');
  });

  it('honours the caller currency, which is the bug it replaces', () => {
    // BudgetsMinimal used the user's currency; every other page hardcoded USD.
    expect(formatMoneyParts(10, { currency: 'EUR' }).symbol).toBe('€');
    expect(formatMoneyParts(10, { currency: 'GBP' }).symbol).toBe('£');
  });

  it('always shows two decimals unless rounding is asked for', () => {
    // The other half of that bug: Budgets showed whole units, the rest cents.
    expect(formatMoneyParts(10).digits).toBe('10.00');
    expect(formatMoneyParts(10.5).digits).toBe('10.50');
    expect(formatMoneyParts(10.567).digits).toBe('10.57');
    expect(formatMoneyParts(10.5, { round: true }).digits).toBe('11');
  });

  it('renders zero without a sign', () => {
    const { sign, digits } = formatMoneyParts(0);
    expect(sign).toBe('');
    expect(digits).toBe('0.00');
  });

  it('does not produce NaN for a missing or bad amount', () => {
    // An API can return null for an unset balance; a ledger showing "$NaN" is
    // worse than one showing zero.
    expect(formatMoneyParts(NaN).digits).toBe('0.00');
    expect(formatMoneyParts(Infinity).digits).toBe('0.00');
    expect(formatMoney(undefined as unknown as number)).toBe('$0.00');
  });
});

describe('formatMoney', () => {
  it('reassembles into a plain string for labels and tooltips', () => {
    expect(formatMoney(1234.5)).toBe('$1,234.50');
    expect(formatMoney(-40)).toBe('−$40.00');
    expect(formatMoney(40, { signed: true })).toBe('+$40.00');
  });
});

describe('tone', () => {
  it('keeps semantic accents literal, per CLAUDE.md', () => {
    expect(moneyStyle({ tone: 'income' }).color).toBe('#22c55e');
    expect(moneyStyle({ tone: 'expense' }).color).toBe('#ef4444');
  });

  it('defaults to the theme foreground so neutral figures follow the theme', () => {
    expect(moneyStyle().color).toBe('var(--text-primary)');
  });

  it('weights a figure above its label by default', () => {
    expect(moneyStyle().fontWeight).toBe(600);
  });

  it('never wraps between the symbol and the digits', () => {
    expect(moneyStyle().whiteSpace).toBe('nowrap');
  });
});
