/**
 * The account icon must be legible on the tint it sits on — measured, not eyeballed.
 *
 * A regression I introduced, and the CI contrast tree-walk caught it twice. Fixing #123's
 * third copy (`pages/Accounts.tsx` still held a `var()` colour map) made
 * `background: `${account.color}20`` produce a REAL tint for the first time; before that the
 * concatenation yielded `var(--accent-blue)20`, invalid CSS, so nothing rendered and the
 * icon sat on the plain card. CI reported it exactly:
 *
 *     REGRESSION [accounts:light] new failing pair: #3b82f6|#dce8f1|3|icon   (3.10:1)
 *
 * *** THE LESSON IS THE ONE THIS PROJECT KEEPS RE-LEARNING: MAKING SOMETHING WORK CAN
 * REVEAL A DEFECT THE BROKEN VERSION WAS HIDING. *** It is #130's own shape — a colour
 * overwrite only started to stick once colours began saving at all.
 *
 * *** TWO WRONG FIXES CAME FIRST, AND BOTH ARE WORTH RECORDING. ***
 *
 * 1. Computing a darkened colour in JS from `data-theme`. It moved the failure rather than
 *    removing it (`#234e94|#1f373b` on dark), because **both captures come from ONE React
 *    render** — `run.mjs` injects `data-theme="dark"` into the finished HTML afterwards. So
 *    anything decided at render time is always light, and the dark page bakes in the light
 *    choice. One failing pair traded for another is not a fix.
 * 2. `filter: brightness(0.6)` in CSS. It renders correctly to a human and is **invisible
 *    to the gate**, which reads computed COLOUR, not painted pixels. Reaching for it would
 *    have been gaming the gate rather than fixing the contrast.
 *
 * What works is a single DECLARED value that CSS resolves per theme: the ink token. The
 * account's colour is still carried — by the tint behind the glyph — so nothing is lost but
 * the glyph's own hue, and it buys 10.84:1 at worst instead of 1.72:1.
 *
 * Note this does NOT contradict CLAUDE.md's "do not use var(--text-primary) on coloured
 * buttons — use white". That rule is about a SOLID colour background; a 12.5% tint is a
 * near-card surface, which is exactly where the ink token belongs.
 *
 * Ratios are computed and the tokens are read out of the stylesheet, so a new swatch or a
 * retuned card colour is covered without editing this file — measure a colour, never match.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import { ACCOUNT_COLORS, ACCOUNT_SWATCH_TINT_ALPHA } from '../../constants/accountColors';

/** WCAG 2.1: non-text content (an icon) needs 3:1. */
const ICON_MINIMUM = 3;
/** The stricter text bar, asserted as margin rather than as a requirement. */
const TEXT_MINIMUM = 4.5;

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');
const THEME_CSS = read('src/styles/finpal-theme.css');

/** The card surface each swatch sits on, per theme, read from the tokens. */
const cardFor = (theme: 'light' | 'dark') => tokenPair('--kt-card')[theme === 'light' ? 0 : 1];
/** The ink the glyph resolves to, per theme. `--text-primary` is `var(--kt-ink)`. */
const inkFor = (theme: 'light' | 'dark') => tokenPair('--kt-ink')[theme === 'light' ? 0 : 1];

function tokenPair(name: string): string[] {
  const found = [...THEME_CSS.matchAll(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`, 'g'))]
    .map((m) => m[1]);
  if (found.length < 2) {
    throw new Error(`expected ${name} declared for both themes, found ${found.length}`);
  }
  return found;
}

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

const relativeLuminance = (rgb: number[]) => {
  const linear = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
};

const contrast = (a: number[], b: number[]) => {
  const [l1, l2] = [relativeLuminance(a), relativeLuminance(b)];
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

/** What the browser composites for `background: <color><alpha>`. */
const tint = (color: string, card: string) => {
  const alpha = parseInt(ACCOUNT_SWATCH_TINT_ALPHA, 16) / 255;
  const f = channels(color);
  const c = channels(card);
  return f.map((v, i) => v * alpha + c[i] * (1 - alpha));
};

describe('the account icon is legible on its own tint', () => {
  it('has swatches, a tint alpha and both token pairs to check', () => {
    // Assert it checked something: an empty list passes every `it.each` vacuously, and a
    // renamed token would otherwise make this whole file silently meaningless.
    expect(ACCOUNT_COLORS.length).toBeGreaterThanOrEqual(8);
    expect(ACCOUNT_SWATCH_TINT_ALPHA).toBe('20');
    expect(inkFor('light')).not.toBe(inkFor('dark'));
    expect(cardFor('light')).not.toBe(cardFor('dark'));
  });

  it('is the premise: the COLOURED glyph fails on a light card', () => {
    // Without this the suite could pass because the treatment is unnecessary. The worst
    // swatch must genuinely be under the bar before the fix is credited with anything.
    const worst = Math.min(...ACCOUNT_COLORS.map(({ value }) =>
      contrast(channels(value), tint(value, cardFor('light')))));
    expect(worst).toBeLessThan(ICON_MINIMUM);
  });

  it.each(ACCOUNT_COLORS)('$label clears 3:1 on a light card', ({ value }) => {
    expect(contrast(channels(inkFor('light')), tint(value, cardFor('light'))))
      .toBeGreaterThanOrEqual(ICON_MINIMUM);
  });

  it.each(ACCOUNT_COLORS)('$label clears 3:1 on a dark card', ({ value }) => {
    expect(contrast(channels(inkFor('dark')), tint(value, cardFor('dark'))))
      .toBeGreaterThanOrEqual(ICON_MINIMUM);
  });

  it('clears the stricter TEXT bar too, on every swatch and both themes', () => {
    // The margin is the point. One declared value serves two near-opposite backgrounds,
    // so "just above 3:1" would be fragile to any future card-colour tweak.
    const worst = Math.min(...ACCOUNT_COLORS.flatMap(({ value }) => [
      contrast(channels(inkFor('light')), tint(value, cardFor('light'))),
      contrast(channels(inkFor('dark')), tint(value, cardFor('dark'))),
    ]));
    expect(worst).toBeGreaterThanOrEqual(TEXT_MINIMUM);
  });

  it('the page uses the ink TOKEN, so CSS resolves it per theme', () => {
    // The mechanism matters as much as the ratio — see the two wrong fixes in the header.
    // A render-time decision cannot work here, and a filter is invisible to the gate.
    const page = read('src/pages/Accounts.tsx');
    expect(page).toMatch(/ACCOUNT_SWATCH_TINT_ALPHA/);
    expect(page).toMatch(/color: 'var\(--text-primary\)'/);
    expect(page).not.toMatch(/filter: *brightness/);
  });
});
