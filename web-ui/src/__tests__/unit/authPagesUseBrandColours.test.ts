/**
 * The pre-auth pages are the first thing anyone sees, and they were off-brand twice over.
 *
 * `ForgotPassword` and `ResetPassword` hardcoded `#10b981` / `#059669` — emerald-500/600,
 * which is not a finPal brand value and not a token — on a `#0f172a → #1e293b` slate
 * gradient. `Login` had the same gradient plus a `#3b82f6 → #1d4ed8` BLUE primary button,
 * while eighty lines below it already used the real brand `#15803d`. So one file disagreed
 * with itself about what finPal looks like.
 *
 * *** AND THE OLD GREEN FAILED WCAG AA ON THE PRIMARY CALL TO ACTION. ***
 *
 * White on `#10b981` is 2.54:1; white on Login's `#3b82f6` is 3.68:1. Both were the main
 * button on the page. Nobody reported that — the report was about the brand — and it was
 * found by computing the ratios while picking the replacement rather than by trusting that
 * a brand colour swap is cosmetic. So this file checks CONTRAST as well as brand, because
 * a green that is on-brand and illegible would satisfy a brand-only check.
 *
 * The values are hardcoded hex on purpose and that is asserted too: every pre-auth page is
 * dark in BOTH themes and uses no CSS variables. `ThemeProvider` wraps these routes, so a
 * `var(--…)` would resolve — and would resolve to LIGHT values in light mode, putting
 * near-white text on a dark gradient. Making these pages theme-aware is a design decision,
 * not a colour fix.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const PAGES = [
  'src/pages/Login.tsx',
  'src/pages/Register.tsx',
  'src/pages/ForgotPassword.tsx',
  'src/pages/ResetPassword.tsx',
  'src/pages/Landing.tsx',
];

/** finPal's greens, from finpal-theme.css. */
const BRAND = {
  main: '#15803d',
  dark: '#166534',
  light: '#86efac',
  glow: '#22c55e',
};

/** The dark surfaces these pages paint, = --kt-wash and --kt-card. */
const SURFACES = ['#0E1711', '#16241A'];

/**
 * Colours that must not appear as VALUES in a pre-auth page.
 *   emerald — never a finPal green
 *   slate   — the leftover navy that made dark mode read as two designs (D-127)
 *   blue    — Login's old primary button
 */
const BANNED = ['#10b981', '#059669', '#0f172a', '#1e293b', '#3b82f6', '#1d4ed8'];

const source = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

/**
 * Strip block comments before scanning. Each of these files now carries a banner that
 * NAMES the old colours in order to explain them — the same trap the category-icon guard
 * hit, where a regex over raw source matched its own explanation. Removing comments makes
 * "appears as a value" true rather than asserted.
 */
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

// ── contrast, computed ────────────────────────────────────────────────────────

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const channels = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((v) =>
    v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('the contrast maths agrees with a known reference', () => {
  it('black on white is 21:1', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 1);
  });

  it('reproduces the failure that prompted this file', () => {
    // If this ever stops being a failure the maths has broken, not the palette.
    expect(contrast('#ffffff', '#10b981')).toBeLessThan(4.5);
    expect(contrast('#ffffff', '#3b82f6')).toBeLessThan(4.5);
  });
});

describe('the brand palette is legible in the roles it is used in', () => {
  it('white on the button background clears AA', () => {
    expect(contrast('#ffffff', BRAND.main)).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#ffffff', BRAND.dark)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(SURFACES)('the accent green clears AA as text on %s', (surface) => {
    expect(contrast(BRAND.glow, surface)).toBeGreaterThanOrEqual(4.5);
  });

  it('records WHY two greens are needed rather than one', () => {
    // brand-main is the button background and is NOT legible as text on the page; that
    // asymmetry is the whole reason the fix is role-aware, so it is pinned.
    expect(contrast(BRAND.main, SURFACES[0])).toBeLessThan(4.5);
    expect(contrast(BRAND.glow, SURFACES[0])).toBeGreaterThan(
      contrast(BRAND.main, SURFACES[0]),
    );
  });
});

// ── the pages themselves ──────────────────────────────────────────────────────

describe('no pre-auth page uses an off-brand colour', () => {
  it('has pages to check', () => {
    expect(PAGES.length).toBeGreaterThan(0);
    PAGES.forEach((p) => expect(source(p).length).toBeGreaterThan(0));
  });

  it.each(PAGES)('%s', (rel) => {
    const code = codeOnly(source(rel));
    const found = BANNED.filter((c) =>
      new RegExp(c.replace('#', '#'), 'i').test(code),
    );
    expect(found, `${rel} still uses ${found.join(', ')}`).toEqual([]);
  });
});

describe('the pre-auth pages stay hardcoded rather than tokenised', () => {
  it.each(PAGES)('%s uses no CSS variables', (rel) => {
    // Not style policing: a token here resolves to LIGHT values on a page that is dark in
    // both themes. If these pages are ever made theme-aware this test is the thing to
    // delete, deliberately, rather than to work around.
    expect(codeOnly(source(rel))).not.toMatch(/var\(--/);
  });

  it('states the measured failure that makes the rule above worth having', () => {
    // ForgotPassword and ResetPassword really did mix a hardcoded dark page with
    // `color: 'var(--text-muted)'`. Both `--text-secondary` and `--text-muted` resolve
    // through `--kt-soft`, which is #56685D in light and #9CB3A3 in dark — so the SAME
    // token was 3.00:1 for a light-mode user and 8.17:1 for a dark-mode one, on a
    // background that never changed. That asymmetry is the defect, and pinning both
    // numbers means a future reader can see why the tokens were inlined instead of
    // guessing that someone disliked variables.
    const PAGE = '#0E1711';
    const KT_SOFT_LIGHT = '#56685D';
    const KT_SOFT_DARK = '#9CB3A3';

    expect(contrast(KT_SOFT_LIGHT, PAGE)).toBeLessThan(4.5);
    expect(contrast(KT_SOFT_DARK, PAGE)).toBeGreaterThanOrEqual(4.5);

    // And the red: #EF4444 would have been an on-brand fix that still failed on the card.
    expect(contrast('#EF4444', '#16241A')).toBeLessThan(4.5);
    expect(contrast('#f87171', '#16241A')).toBeGreaterThanOrEqual(4.5);
  });

  it.each(['#9CB3A3', '#f87171', '#ffffff', '#e2e8f0'])(
    'the inlined text colour %s clears AA on both dark surfaces',
    (fg) => {
      SURFACES.forEach((bg) => {
        expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
      });
    },
  );
});
