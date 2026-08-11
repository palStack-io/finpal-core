/**
 * Every split method the UI offers must be one the backend actually computes.
 *
 * AUDIT **D-93**: web offered a fourth method, "By Shares", with its own `<option>`, its own
 * input ("Your Shares") and its own hint (*"Specify shares for each member (e.g., 1:2:3)"*).
 * `calculate_splits` has no `shares` branch, and nothing validates the field — so the expense
 * saved and split to **nobody**. Measured on a $100 expense with one other participant:
 * `custom` → payer 40.00, other 60.00, total 100.00; `shares` → payer 0, others [], **total
 * 0.00**. The row vanished from every settle-up.
 *
 * *** THE ALLOWED SET IS DERIVED FROM THE BACKEND, NOT WRITTEN DOWN HERE. *** A test that
 * hardcoded `['equal', 'percentage', 'custom']` would go blind the moment someone invents a
 * fifth method, which is precisely how this defect survived: every payload-shaped test passed
 * over it because the *shape* was fine. Keyed to the mechanism, this fails on the next invented
 * method with no edit — the lesson from `project_guards_keyed_to_a_spelling_go_blind`.
 *
 * Three surfaces can each introduce an unbacked method independently, so all three are checked:
 * a dropdown `<option>`, a conditional branch comparing a split-method variable to a literal,
 * and a TypeScript union on a split-method field. D-93 was present in all three at once.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const WEB_SRC = join(__dirname, '..', '..');
const BACKEND_MODEL = join(__dirname, '..', '..', '..', '..', 'src', 'models', 'transaction.py');

/** Every method `calculate_splits` has a branch for — read out of the backend itself. */
function implementedMethods(): Set<string> {
  const py = readFileSync(BACKEND_MODEL, 'utf-8');
  const found = new Set<string>();
  for (const m of py.matchAll(/split_method\s*==\s*'([a-z_]+)'/g)) found.add(m[1]);
  for (const m of py.matchAll(/split_method\s+in\s+\[([^\]]+)\]/g)) {
    for (const lit of m[1].matchAll(/'([a-z_]+)'/g)) found.add(lit[1]);
  }
  return found;
}

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === '__tests__' || entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...tsxFiles(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const files = tsxFiles(WEB_SRC);
const rel = (f: string) => f.slice(WEB_SRC.length + 1);

describe('the backend defines which split methods exist', () => {
  it('has branches for the methods we expect, so the derivation is not silently empty', () => {
    // A guard on the guard. If `calculate_splits` were refactored so this regex matched
    // nothing, every check below would vacuously pass and the gate would be dead.
    const impl = implementedMethods();
    expect(impl.size).toBeGreaterThanOrEqual(3);
    expect(impl).toContain('equal');
    expect(impl).toContain('percentage');
    expect(impl).toContain('custom');
  });

  it('does NOT implement shares — the fact D-93 turns on', () => {
    expect(implementedMethods()).not.toContain('shares');
  });
});

describe('no UI surface offers a method the backend cannot compute', () => {
  it('every <option> in a split-method <select> is backed', () => {
    const impl = implementedMethods();
    const offences: string[] = [];

    for (const file of files) {
      const src = readFileSync(file, 'utf-8');
      // Each <select>…</select> block, so option values are attributed to the right control.
      for (const block of src.matchAll(/<select[\s\S]*?<\/select>/g)) {
        const text = block[0];
        if (!text.includes('split_method')) continue;
        for (const opt of text.matchAll(/value="([a-z_]+)"/g)) {
          if (!impl.has(opt[1])) offences.push(`${rel(file)}: <option value="${opt[1]}">`);
        }
      }
    }

    expect(offences, `a dropdown offers a method the backend never computes:\n${offences.join('\n')}`)
      .toEqual([]);
  });

  it('every branch comparing a split method to a literal names a backed method', () => {
    // Catches the panels and hints that hang off a method without being an <option> —
    // `defaultSplitMethod === 'shares'` rendered a whole members panel of its own.
    const impl = implementedMethods();
    const offences: string[] = [];

    for (const file of files) {
      const src = readFileSync(file, 'utf-8');
      for (const cmp of src.matchAll(/([A-Za-z_.]*[sS]plit[_]?[mM]ethod)\s*[=!]==?\s*'([a-z_]+)'/g)) {
        if (!impl.has(cmp[2])) offences.push(`${rel(file)}: ${cmp[1]} === '${cmp[2]}'`);
      }
    }

    expect(offences, `a branch keys off a method the backend never computes:\n${offences.join('\n')}`)
      .toEqual([]);
  });

  it('every string union typing a split method lists only backed methods', () => {
    // A union is a claim about the server (the fifth time that phrasing has earned its place
    // in this repo). `'equal' | 'percentage' | 'custom' | 'shares'` told TypeScript that
    // shares was a legitimate value, so nothing downstream could object to it.
    const impl = implementedMethods();
    const offences: string[] = [];

    for (const file of files) {
      const src = readFileSync(file, 'utf-8');
      for (const line of src.split('\n')) {
        if (!/split_method|[sS]plitMethod/.test(line)) continue;
        const literals = [...line.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
        // Only lines that look like a union, not an ordinary comparison.
        if (literals.length < 2 || !line.includes('|')) continue;
        for (const lit of literals) {
          if (!impl.has(lit)) offences.push(`${rel(file)}: union includes '${lit}' — ${line.trim()}`);
        }
      }
    }

    expect(offences, `a type union admits a method the backend never computes:\n${offences.join('\n')}`)
      .toEqual([]);
  });
});
