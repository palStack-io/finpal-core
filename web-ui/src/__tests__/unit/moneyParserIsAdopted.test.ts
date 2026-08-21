/**
 * A tested helper that nothing calls is the shape of D-106, and I shipped it here.
 *
 * `parseMoneyInput` was added to `styles/money.tsx` for #132 with 13 passing tests — and
 * **zero call sites**. Every form still called `parseFloat`. The helper's own tests were
 * green the entire time, which is exactly the trap `project_a_helper_test_is_not_adoption`
 * records: D-106 had three screens bypassing a helper while 494 tests stayed green.
 *
 * This asserts ADOPTION rather than behaviour, because behaviour is already covered next
 * door and behaviour is not what was broken.
 *
 * *** WEB WAS NOT EXPOSED TO THE TRUNCATION AND THE HELPER IS STILL RIGHT HERE. *** Every
 * money input in these forms is `type="number"`, so the browser normalises `.value` and
 * `parseFloat` could not have seen a comma. That is why this was a latent gap and not a
 * live defect — and also why it would have become one the moment anyone made an amount
 * field `type="text"` to let Europeans type a comma, which is the obvious next request
 * after #132. Mobile, whose field IS plain text, is where it was live.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

// Files that turn a user-typed string into a money figure.
const MONEY_FORMS = [
  'src/components/forms/AddTransactionForm.tsx',
  'src/components/forms/AddAccountForm.tsx',
  'src/components/forms/EditAccountForm.tsx',
];

describe('#132 the money parser is actually used', () => {
  it('is the premise: the helper exists and is exported', () => {
    expect(read('src/styles/money.tsx')).toMatch(/export function parseMoneyInput/);
  });

  it.each(MONEY_FORMS)('%s parses money with parseMoneyInput', (rel) => {
    expect(read(rel)).toMatch(/parseMoneyInput\(/);
  });

  it.each(MONEY_FORMS)('%s no longer parses an amount or balance with parseFloat', (rel) => {
    const offenders = read(rel)
      .split('\n')
      .map((line, i) => [i + 1, line] as const)
      // Only money. `parseInt`/`parseFloat` on an id, a limit or a count is fine, and a
      // blanket ban would be a rule nobody could follow.
      .filter(([, line]) => /parseFloat\s*\(/.test(line))
      .filter(([, line]) => /amount|balance|split_value|value:/i.test(line));
    expect(offenders).toEqual([]);
  });

  it('has at least one call site, so this file cannot pass vacuously', () => {
    // If MONEY_FORMS is ever emptied or the paths go stale, every `it.each` above
    // silently passes zero cases — the "assert it checked something" rule.
    const total = MONEY_FORMS
      .map((rel) => (read(rel).match(/parseMoneyInput\(/g) || []).length)
      .reduce((a, b) => a + b, 0);
    expect(MONEY_FORMS.length).toBeGreaterThan(0);
    expect(total).toBeGreaterThanOrEqual(MONEY_FORMS.length);
  });
});
