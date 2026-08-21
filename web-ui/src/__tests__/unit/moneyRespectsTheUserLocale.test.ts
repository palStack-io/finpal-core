/**
 * #132 — figures were formatted `en-US` for everyone, and comma input was truncated.
 *
 * Reported as `palStack-io/finpal-core#132`: *"in Europe we prefer the use of ',' (comma)
 * for numbers and not '.' (dot)"*.
 *
 * Two halves, and only one of them is cosmetic.
 *
 * **Display.** `styles/money.tsx` calls itself "the one money formatter" and it is: it
 * exists because `formatCurrency` had been defined five times and the copies disagreed.
 * But it hardcoded `Intl.NumberFormat('en-US', ...)`, so the one place that could have
 * honoured a preference was the one place that refused to.
 *
 * **Input.** `parseFloat('1,50')` is `1` — it stops at the comma, and `1` then passes
 * every `> 0` and `Number.isFinite` check a form makes. So a comma-using user does not
 * get an error; they get a silently wrong amount in their ledger. That is the more
 * serious half and it is why this is not filed as a cosmetic change. (On web the amount
 * input is `type="number"`, which limits the exposure; mobile's is a plain `TextInput`
 * with `keyboardType="decimal-pad"`, where it is wide open. The parse is shared logic
 * either way, and once a user can ASK for comma formatting they will type commas.)
 *
 * The locale is an explicit user preference (`User.number_locale`), by owner decision,
 * set during onboarding beside currency and timezone. Not sniffed from the browser: a
 * user on a US machine who wants EU formatting would have no lever. It is module-level
 * state here rather than a prop, so the eight existing `styles/money` importers and every
 * `<Money>` in the app pick it up without a signature change.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  formatMoney,
  setNumberLocale,
  getNumberLocale,
  parseMoneyInput,
} from '../../styles/money';

afterEach(() => setNumberLocale(null));

describe('#132 display follows the user\'s number locale', () => {
  it('defaults to en-US, so nothing changes for an untouched account', () => {
    // `User.number_locale` is nullable with no default precisely so that deploying this
    // does not silently re-shape every existing user's figures.
    expect(getNumberLocale()).toBe('en-US');
    expect(formatMoney(1234.5, { currency: 'USD' })).toBe('$1,234.50');
  });

  it('formats German style when the user asked for de-DE', () => {
    setNumberLocale('de-DE');
    const out = formatMoney(1234.5, { currency: 'EUR' });
    // The point of the whole issue: comma for decimals, dot for thousands.
    expect(out).toContain('1.234,50');
  });

  it('keeps the minus sign that keeps a column aligned', () => {
    setNumberLocale('de-DE');
    // U+2212, not a hyphen — the existing behaviour, which must survive the change.
    expect(formatMoney(-5, { currency: 'EUR' })).toContain('−');
  });

  it('falls back rather than throwing on a locale Intl rejects', () => {
    // The backend validates the tag, but a value already in a database, or a runtime
    // with narrower ICU data, must not take down every screen that renders money.
    setNumberLocale('zz-ZZ-nonsense-!!');
    expect(() => formatMoney(1, { currency: 'USD' })).not.toThrow();
  });

  it('clearing the preference returns to en-US', () => {
    setNumberLocale('de-DE');
    setNumberLocale(null);
    expect(formatMoney(1234.5, { currency: 'USD' })).toBe('$1,234.50');
  });
});

describe('#132 input parsing does not silently truncate a comma', () => {
  it('is the premise: parseFloat truncates and the result looks valid', () => {
    // Pins WHY this is a defect and not a nicety. Both assertions matter: the wrong
    // number, and the fact that it passes the checks a form makes.
    expect(parseFloat('1,50')).toBe(1);
    expect(Number.isFinite(parseFloat('1,50'))).toBe(true);
    expect(parseFloat('1,50') > 0).toBe(true);
  });

  it('reads a comma decimal as the number the user meant', () => {
    expect(parseMoneyInput('1,50')).toBe(1.5);
    expect(parseMoneyInput('1234,56')).toBe(1234.56);
  });

  it('still reads a dot decimal, for everyone who already types one', () => {
    expect(parseMoneyInput('1.50')).toBe(1.5);
    expect(parseMoneyInput('1234.56')).toBe(1234.56);
    expect(parseMoneyInput('42')).toBe(42);
  });

  it('handles thousands separators in both conventions', () => {
    // The genuinely ambiguous cases, resolved by position: the LAST separator is the
    // decimal one when it is followed by 1-2 digits.
    expect(parseMoneyInput('1.234,56')).toBe(1234.56);
    expect(parseMoneyInput('1,234.56')).toBe(1234.56);
  });

  it('treats a group of three as a thousands separator, not a decimal', () => {
    // `1,234` is one thousand two hundred and thirty four in en-US and also in de-DE it
    // would be written 1.234 — either way three trailing digits is not a decimal.
    expect(parseMoneyInput('1,234')).toBe(1234);
    expect(parseMoneyInput('1.234')).toBe(1234);
  });

  it('is NaN for what is not a number, so validators still refuse it', () => {
    // It must not invent a value. A form's `Number.isFinite` check is the last line of
    // defence and this has to keep feeding it the truth.
    expect(parseMoneyInput('')).toBeNaN();
    expect(parseMoneyInput('abc')).toBeNaN();
    expect(parseMoneyInput('1,2,3,4')).toBeNaN();
  });

  it('tolerates spaces and a currency symbol, which get pasted in', () => {
    expect(parseMoneyInput(' 1 234,56 ')).toBe(1234.56);
    expect(parseMoneyInput('€1.234,56')).toBe(1234.56);
  });

  it('keeps a negative sign', () => {
    expect(parseMoneyInput('-1,50')).toBe(-1.5);
  });
});
