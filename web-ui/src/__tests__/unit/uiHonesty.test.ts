/**
 * Three classes of user-visible dishonesty, each keyed to its mechanism.
 *
 * All three were found the same way: pointsPal's UI was rendered for the first
 * time ever (it had been switched off in production — AUDIT D-34), three defects
 * were visible in one screenshot, and sweeping for *the class* rather than the
 * three found a fourth nobody had seen, plus a page outside pointsPal entirely.
 *
 *   A. A period adjective interpolated into a sentence. `Pts earned this {period}`
 *      rendered "Pts earned this monthly", and `capped this {cap_note}` rendered
 *      "capped this Cap at 65%" — that second one only appears when a card is
 *      displaced, so no screenshot of an empty account could have shown it.
 *
 *   B. A page showing money with no scope label. This instance is one household
 *      and some endpoints return every member's rows while others return the
 *      caller's, so an unlabelled total does not say whose money it is (D-01).
 *      D-01 swept the pages that were visible at the time; pointsPal was dark and
 *      web's Investments page was simply missed, though mobile's was labelled.
 *
 *   C. A plausible figure hardcoded as a default, which reads as the user's own
 *      data. `useState('84.50')` in the Best Card amount field. Same family as
 *      the fabricated analytics figures.
 *
 * Each check derives its inputs from the source tree, so a page or string added
 * later is covered without editing this file.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const SRC = join(__dirname, '..', '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules') continue;
      walk(full, out);
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const ALL_FILES = walk(SRC);
const rel = (f: string) => relative(SRC, f);

describe('A — no period adjective welded into a sentence', () => {
  /**
   * `this {expr}` in JSX text is the shape both bugs took: a period adjective
   * ("monthly") or an already-complete phrase ("Cap at 65%") dropped after the
   * word "this" cannot read correctly.
   *
   * The convention this enforces: **anything interpolated after "this" must come
   * through an explicit noun map**, whose name contains `Noun`. So
   * `this {periodNouns[period]}` is fine and `this {period}` is not — the fix is
   * to add the map rather than to hope the raw value happens to read as a noun.
   */
  it('interpolates only a deliberate noun after the word "this"', () => {
    const offenders: string[] = [];
    for (const file of ALL_FILES) {
      const text = readFileSync(file, 'utf8');
      text.split('\n').forEach((line, i) => {
        // JSX text only — not template literals or query strings (`?period=${period}`).
        if (/`/.test(line)) return;
        const m = /\bthis \{([^}]+)\}/.exec(line);
        if (!m) return;
        if (/noun/i.test(m[1])) return;
        offenders.push(
          `${rel(file)}:${i + 1}  interpolates "${m[1].trim()}" after "this" ` +
            `without a noun map — ${line.trim().slice(0, 70)}`
        );
      });
    }
    expect(offenders).toEqual([]);
  });
});

describe('C — no plausible figure hardcoded as a default', () => {
  it('never seeds state with a money-shaped literal', () => {
    const offenders: string[] = [];
    for (const file of ALL_FILES) {
      const text = readFileSync(file, 'utf8');
      text.split('\n').forEach((line, i) => {
        if (/useState\(\s*['"]?\d+\.\d{2}['"]?\s*\)/.test(line)) {
          offenders.push(`${rel(file)}:${i + 1}  ${line.trim().slice(0, 90)}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});

describe('B — a page that shows money says whose money it is', () => {
  /**
   * Scoped to page components. A shared component takes its scope from the page
   * that renders it (StatCard has a `scope` prop), and a modal showing one row
   * the user just clicked has an unambiguous owner.
   */
  /**
   * A page may be exempt only with a reason a reviewer would accept — the point
   * of the gate is that "we didn't get to it" is not one.
   */
  const EXEMPT: Record<string, string> = {
    'pages/GroupDetail.tsx':
      'Every figure is attached to a named member ("{from} owes {to} {amount}", ' +
      'and each member row carries its own balance), which states the owner more ' +
      'precisely than a YOURS/HOUSEHOLD tag could. A tag here would be noise.',
  };

  const PAGE_FILES = ALL_FILES.filter(
    (f) => /\/pages\/[^/]+\.tsx$/.test(f) && !/\/pages\/(Landing|Login|Register|ForgotPassword|ResetPassword|VerifyEmail|Settings_old)/.test(f)
  );

  it('finds page files to check', () => {
    expect(PAGE_FILES.length).toBeGreaterThan(5);
  });

  it.each(PAGE_FILES.map((f) => [rel(f), f] as const))(
    '%s',
    (name, file) => {
      if (EXEMPT[name]) return;
      const text = readFileSync(file, 'utf8');

      // Does this page render a currency figure of its own? `$${...}` matters as
      // much as formatCurrency — pointsPal builds its money strings that way, and
      // an earlier version of this check passed those pages without looking.
      const showsMoney =
        /formatCurrency\s*\(/.test(text) ||
        /<StatCard/.test(text) ||
        /<MetricCard/.test(text) ||
        /\$\$\{/.test(text) ||
        /≈ \$/.test(text) ||
        // JSX renders money as a literal `$` beside an expression, which no
        // single regex separates from template interpolation. These two are the
        // reliable tells: a 2dp format and the API's own USD field.
        /toFixed\(2\)/.test(text) ||
        /value_usd/.test(text);
      if (!showsMoney) return;

      const saysWhose =
        /ScopeTag/.test(text) ||
        /scope=/.test(text) ||
        /MIXED_SCOPE_CAPTION/.test(text);

      expect(
        saysWhose,
        `${rel(file)} renders a currency figure but carries no scope label. ` +
          `This instance is one household: state whether the figure is the ` +
          `caller's or everyone's, per src/utils/scope.ts.`
      ).toBe(true);
    }
  );
});
