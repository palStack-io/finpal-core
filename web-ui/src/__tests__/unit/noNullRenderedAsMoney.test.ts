/**
 * No component renders a nullable number into a money string without checking
 * for null first.
 *
 * *** THIS SHIPPED, ON `main`, ON EVERY RULE CARD. ***
 * `TransactionRules` guarded `rule.amount_min !== undefined` and the API sends
 * `null`. `null !== undefined` is true, so the line drew — and interpolated
 * into a template it produced, literally:
 *
 *     Amount: Min: $null - Max: $null
 *
 * on all 52 of the demo's rules. It was found in a screenshot of the deployed
 * demo, which is the third defect this pass that no gate could see, and this
 * file is the gate for the shape.
 *
 * *** WHY A SOURCE SCAN AND NOT A RENDER TEST. *** A render test needs a
 * fixture per call site, and the failure mode is that nobody writes the
 * fixture for the site they forgot. The shape is textual and narrow enough to
 * match honestly: a `$` immediately followed by an interpolation, inside a
 * template literal. That is the construct that cannot survive a null, and it
 * is also the construct that hardcodes a dollar sign into an app that serves
 * 22 currencies — so there are two reasons to refuse it and one rule.
 *
 * `formatMoney` is the way to render an amount. It takes a number, so a null
 * cannot reach it without TypeScript complaining first, which is the actual
 * protection.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '..', '..');

function sources(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) out.push(full);
    }
  };
  walk(SRC);
  return out;
}

/**
 * *** WHERE A HARDCODED `$` IS THE HONEST CHOICE, AND WHY THE LIST IS SHORT. ***
 *
 * `money()` renders in the READER's currency and does not convert, so putting a
 * USD figure through it prints "£95" on a number that is 95 dollars. For a
 * value that states its own currency, the hardcoded symbol is correct and
 * `money()` is the bug. pointsPal is the only place this arises: card programs
 * are US products and the API says so in the field names.
 *
 * Each entry costs a line and a reason, exactly as `roleClassesAreReferenced`'s
 * and `tokenContrast`'s escape hatches do — silencing this gate is possible but
 * only as a visible diff.
 */
const ALLOWED: RegExp[] = [
  // `value_missed_usd`, `est_value_usd`, `upliftUsd`: the NAME declares the
  // currency, in either casing the codebase uses.
  /(_usd|Usd)\b/,
  // `annual_fee` has NO currency of its own — `pointspal/models.py:19` is a
  // bare `db.Column(db.Float)`. Every seeded program is a US card, so dollars
  // is right in practice and undeclared in the schema. Allowed with the gap
  // named rather than "fixed" into a wrong symbol.
  /\bannual_fee\b/,
];

describe('money is never built by hand around a nullable value', () => {
  it('no source interpolates straight after a hardcoded currency symbol', () => {
    // `$${...}` inside a template literal: a dollar sign, then whatever the
    // value happens to be, including the word "null".
    const offenders: string[] = [];
    for (const file of sources()) {
      // *** COMMENTS ARE BLANKED, NOT SKIPPED BY PREFIX. *** The first version
      // skipped lines starting with `*` or `//`, and then matched a line in the
      // MIDDLE of a block comment that was documenting this very defect. Line
      // numbers are preserved by replacing each comment with the same number of
      // newlines, so a real finding still points at the right line.
      const src = readFileSync(file, 'utf8').replace(
        /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
        (m) => m.replace(/[^\n]/g, ' '));
      const lines = src.split('\n');
      lines.forEach((line, i) => {
        for (const m of line.matchAll(/\$\$\{([^}]*)\}/g)) {
          if (ALLOWED.some((ok) => ok.test(m[1]))) continue;
          offenders.push(`${file.slice(SRC.length + 1)}:${i + 1}  ${line.trim().slice(0, 80)}`);
        }
      });
    }
    expect(offenders, [
      'A hardcoded "$" followed by an interpolation renders `$null` when the',
      'value is null — which is what shipped on every rule card — and hardcodes',
      'one currency into an app that serves 22. Use `formatMoney(amount)`.',
      '',
      ...offenders,
    ].join('\n')).toEqual([]);
  });

  it('the fixed call site guards against null, not merely against undefined', () => {
    const src = readFileSync(join(SRC, 'components', 'TransactionRules.tsx'), 'utf8');
    // The distinction is the whole defect: the server sends null and the old
    // guard only excluded undefined.
    expect(src).toContain('rule.amount_min != null');
    expect(src).not.toContain('rule.amount_min !== undefined');
  });
});
