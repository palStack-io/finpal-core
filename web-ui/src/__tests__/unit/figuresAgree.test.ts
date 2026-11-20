/**
 * UI audit 2026-11-20, P1-5: "Numbers that look like the same thing disagree from screen to screen".
 *
 * Measured on the premium demo persona Alex (core has the same code paths): net worth -$3,521.80 on the
 * Dashboard and -$7,650.00 on Accounts (the Accounts page summed its own balances and left out the investment
 * portfolio); "what came in" on several screens with no window named; and $432.6 in the Analytics legend.
 *
 * The rules this file holds:
 *  - Net worth has one source, the server (`/accounts/summary` on Accounts, the same function behind the
 *    Dashboard's `net_worth`). No page totals balances itself.
 *  - Every headline income/spend figure names its window.
 *  - Money goes through `formatMoney`, never a currency symbol glued to `toLocaleString()`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { formatMoney } from '../../styles/money';

const read = (f: string) => readFileSync(f, 'utf8');

describe('one figure, one value', () => {
  it('Accounts takes net worth from the server summary, never a local sum of balances', () => {
    const src = read('src/pages/Accounts.tsx');
    expect(src).toMatch(/accountService\.getSummary\(\)/);
    expect(src).toMatch(/const totalBalance = summary\?\.net_worth/);
    expect(src).not.toMatch(/accounts\.reduce\(\(sum, acc\) => sum \+ acc\.balance/);
    // When investments are counted it says so in the Dashboard's words.
    expect(src).toMatch(/invested \? 'Accounts and investments'/);
    expect(read('src/pages/Dashboard.tsx')).toMatch(/note: 'Accounts and investments'/);
  });

  it('the Dashboard names the month on its income and spending figures', () => {
    const src = read('src/pages/Dashboard.tsx');
    const totals = src.slice(src.indexOf('const totalsCells = ['), src.indexOf('];', src.indexOf('const totalsCells = [')));
    expect(totals).not.toMatch(/Current month earnings|Spending this month/);
    expect(totals.match(/note: monthSoFar/g)?.length).toBe(2);
  });

  it('Analytics headline cards carry the selected window', () => {
    expect(read('src/pages/Analytics.tsx').match(/period=\{rangeLabel\}/g)?.length).toBe(4);
  });

  it('Transactions totals say they are all time', () => {
    const src = read('src/pages/Transactions.tsx');
    const totals = src.slice(src.indexOf('<TotalsRow cells={['), src.indexOf(']} />', src.indexOf('<TotalsRow cells={[')));
    expect(totals.match(/note: 'All time'/g)?.length).toBe(3);
  });

  it('no money is a currency symbol glued to toLocaleString (that dropped cents: "$432.6")', () => {
    for (const f of ['src/pages/Analytics.tsx', 'src/pages/Dashboard.tsx', 'src/pages/Accounts.tsx']) {
      expect(read(f)).not.toMatch(/currencySymbol\}\{[^}]*toLocaleString\(\)/);
    }
    expect(formatMoney(432.6, { currency: 'USD' })).toBe('$432.60');
  });
});
