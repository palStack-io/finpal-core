/**
 * A `$` printed into JSX text is a hardcoded currency, and this is the gate.
 *
 * *** THE DETECTOR MATTERS MORE THAN THE FIX. *** A first sweep looked for
 * `formatMoney(...)` calls with no currency argument and produced TWO FALSE
 * POSITIVES — mobile components that receive a currency-aware formatter as a
 * PROP of the same name. Grepping for the shape of a call cannot tell those
 * apart.
 *
 * What does work is this: a line containing `${` and no backtick. Inside a
 * template literal `${}` interpolates; in JSX text the `$` is printed verbatim
 * and only the braces evaluate. So `Amount: <strong>${x.toFixed(2)}</strong>`
 * renders a dollar sign to a user whose currency is anything else — which is
 * exactly what the recurring screen did, on both its lists, while every other
 * figure in the app rendered correctly.
 *
 * *** THE ALLOWLIST IS FOR GENUINELY-USD FIGURES ONLY. *** pointsPal values
 * points in US cents-per-point, which is the industry convention, and the API
 * field names say so (`value_usd`, `total_value_usd`, `max_redeemable_usd`).
 * Rendering those with the user's symbol WITHOUT converting would turn a
 * correct figure into a false claim — the same defect shape as showing an
 * inferred account type as a fact (D-77 / D-108). So they keep the dollar, and
 * each entry here has to name the USD-denominated field that justifies it.
 *
 * Anything NOT on the list must format through `formatMoney`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const SRC = join(__dirname, '..', '..');

/**
 * Sites that render a figure the API itself denominates in USD. The value is
 * the field that makes it true — a bare `true` would let anything in.
 */
const USD_DENOMINATED: string[] = [
  'value_usd',
  'total_value_usd',
  'max_redeemable_usd',
  'est_value_usd',
];

/**
 * *** KEYED ON THE FIELD, NOT ON `file:line` — AND THE FIRST VERSION WAS KEYED
 * ON THE LINE. *** Adding one import shifted three entries by two lines and the
 * allowlist stopped matching anything, which is D-127's shape exactly: a guard
 * keyed to a spelling goes blind. A line number is a spelling of a location.
 * The USD-denominated field name is the thing that actually makes the dollar
 * correct, so that is what the allowlist holds, and it survives any edit that
 * does not change the field.
 */
const isUsdDenominated = (text: string): boolean =>
  USD_DENOMINATED.some((field) => text.includes(field));

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      return entry === '__tests__' || entry === 'node_modules' ? [] : walk(full);
    }
    return full.endsWith('.tsx') ? [full] : [];
  });

/** A line printing a literal `$` straight into JSX: has `${` and no backtick. */
const offendingLines = (file: string): Array<{ line: number; text: string }> =>
  readFileSync(file, 'utf8')
    .split('\n')
    .map((text, i) => ({ line: i + 1, text }))
    .filter(({ text }) => {
      if (!text.includes('${') || text.includes('`')) return false;
      const trimmed = text.trim();
      // comments are prose about this bug, not the bug
      return !(trimmed.startsWith('*') || trimmed.startsWith('//')
               || trimmed.startsWith('/*'));
    });

describe('no hardcoded currency symbol reaches a user', () => {
  it('finds no literal `$` in JSX text outside the USD allowlist', () => {
    const found: string[] = [];
    for (const file of walk(SRC)) {
      const rel = relative(SRC, file).split('\\').join('/');
      for (const { line, text } of offendingLines(file)) {
        if (isUsdDenominated(text)) continue;
        found.push(`${rel}:${line}  ${text.trim().slice(0, 80)}`);
      }
    }
    expect(found, `hardcoded currency in JSX text:\n${found.join('\n')}`)
      .toEqual([]);
  });

  it('every allowlisted USD field is still rendered somewhere', () => {
    // An allowlist entry for a field nobody renders any more is dead weight
    // that silently widens the gate. This is the half that keeps it honest.
    const all = walk(SRC).map((f) => readFileSync(f, 'utf8')).join('\n');
    for (const field of USD_DENOMINATED) {
      expect(all.includes(field), `${field} is allowlisted but rendered nowhere`)
        .toBe(true);
    }
  });
});
