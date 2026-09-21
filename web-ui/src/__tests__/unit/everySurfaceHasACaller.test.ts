/**
 * Every surface the server can award on has a client that asks for it.
 *
 * *** THIS GATE IS D-106's LESSON AS A TEST. *** There, three screens bypassed
 * a helper while 494 tests stayed green, because nothing checked ADOPTION —
 * only that the helper worked. `CoinAward.tsx` then shipped with zero
 * consumers for the same reason. A surface with no caller earns coins
 * invisibly: nothing renders, nothing errors, and the 04:30 cron still pays,
 * so it looks like it works.
 *
 * *** IT IS A LOWER BOUND, AND SAYING SO MATTERS. *** This asserts each
 * surface is asked for SOMEWHERE. It cannot prove the call sits on the right
 * page.
 *
 * *** AND THE LIST BELOW WENT STALE THE FIRST TIME THE SERVER GAINED A
 * SURFACE. *** Adding `pointspal` server-side left this file passing while the
 * new surface had no caller at all — the gate could not see what it did not
 * know about. That hole is now closed from the OTHER side:
 * `test_surface_lists_agree.py` reads this array out of this file and asserts
 * it equals `SURFACES` in `acts.py`. Two languages, one list, and a mismatch
 * fails in Python rather than passing in TypeScript.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/** Mirrors `SURFACES` in `src/services/literacy/acts.py`. */
const SERVER_SURFACES = [
  'accounts', 'transactions', 'categories', 'budgets', 'recurring',
  'rules', 'goals', 'review', 'investments', 'groups', 'settings',
  'pointspal',
] as const;

/**
 * Empty, and it should STAY empty: every surface the server declares now has a
 * caller. An entry here is a recorded decision to leave one unwired, and the
 * stale-entry test below refuses to let it rot into a hole nobody noticed.
 */
const NOT_WIRED_YET = new Set<string>();

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

const sources = walk('src')
  .filter((f) => !f.includes('__tests__'))
  .map((f) => readFileSync(f, 'utf8'));

const called = new Set<string>();
for (const src of sources) {
  for (const m of src.matchAll(/useSurfaceCoins\(\s*'([a-z]+)'\s*\)/g)) {
    called.add(m[1]);
  }
}

describe('every earning surface has a client caller', () => {
  it('finds callers at all — otherwise this whole file is vacuous', () => {
    expect(called.size).toBeGreaterThan(5);
  });

  for (const surface of SERVER_SURFACES) {
    if (NOT_WIRED_YET.has(surface)) continue;
    it(`${surface} is asked for by some page`, () => {
      expect(called.has(surface)).toBe(true);
    });
  }

  it('asks for no surface the server does not know', () => {
    const unknown = [...called].filter(
      (s) => !(SERVER_SURFACES as readonly string[]).includes(s)
    );
    expect(unknown).toEqual([]);
  });

  it('has no STALE entry in NOT_WIRED_YET', () => {
    // A surface listed as unwired that now has a caller: delete the entry, or
    // the list stops describing anything. Same rule as the demo-coverage
    // exemptions.
    const stale = [...NOT_WIRED_YET].filter((s) => called.has(s));
    expect(stale).toEqual([]);
  });
});
