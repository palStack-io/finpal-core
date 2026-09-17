/**
 * The cairn is a marker, not a score.
 *
 * *** THE ONE THING THAT MUST NOT HAPPEN IS STONES THAT ACCUMULATE. *** A
 * marker that grew with progress would be decision 5's denominator wearing a
 * hat: a score finPal chose, on a page the user never asked to be measured on.
 * The whole product has exactly one denominator and it is the shop price.
 *
 * *** AND IT MUST BE ABLE TO CLEAR. *** A permanent marker on every page reads
 * as decoration within a day. Sidebar's Review badge already carries that rule
 * in its own words: a permanent "0" would nag about a job already done.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const cairn = readFileSync('src/components/Cairn.tsx', 'utf8');
const sidebar = readFileSync('src/components/layout/Sidebar.tsx', 'utf8');

describe('the cairn is binary', () => {
  it('takes no count, fraction or progress prop', () => {
    // If a `count`, `of`, `total` or `progress` prop ever appears here, the
    // marker has become a gauge.
    for (const banned of ['count', 'total', 'progress', 'fraction', 'ratio']) {
      expect(cairn).not.toMatch(new RegExp(`\\b${banned}\\??:`));
    }
  });

  it('draws a fixed three stones, not a variable number', () => {
    const stones = cairn.match(/<ellipse/g) ?? [];
    expect(stones).toHaveLength(3);
    // No array mapping over stones, which is how a fixed drawing becomes a
    // gauge in one edit.
    expect(cairn).not.toMatch(/\.map\(/);
  });

  it('inherits currentColor rather than naming a token', () => {
    // A hardcoded colour here would go invisible in one theme — D-60's class.
    expect(cairn).toMatch(/fill="currentColor"/);
    expect(cairn).not.toMatch(/#[0-9a-fA-F]{3,6}/);
  });

  it('the rail renders it CONDITIONALLY, so it can clear', () => {
    expect(sidebar).toMatch(/openSurfaces\.has\(/);
    expect(sidebar).toMatch(/<Cairn\b/);
  });

  it('the rail maps only known surface names', () => {
    const known = new Set([
      'accounts', 'transactions', 'categories', 'budgets', 'recurring',
      'rules', 'goals', 'review', 'investments', 'groups', 'settings',
    ]);
    const map = sidebar.match(/SURFACE_BY_PATH[^}]*}/s)?.[0] ?? '';
    expect(map).toBeTruthy();
    const used = [...map.matchAll(/:\s*'([a-z]+)'/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(5);
    expect(used.filter((s) => !known.has(s))).toEqual([]);
  });
});
