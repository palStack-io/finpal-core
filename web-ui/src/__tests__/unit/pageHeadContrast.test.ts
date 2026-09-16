/**
 * The page title and its sentence are legible on BOTH stops of the head's
 * gradient — computed from the stylesheet, in both themes.
 *
 * *** WHY BOTH STOPS, WHEN THE WALK ALREADY MEASURES ONE. ***
 * `scripts/contrast-walk/walk.js` resolves a gradient by taking its **first
 * colour stop** — deliberately, with a comment explaining that it is "the
 * colour actually under the label's left edge" and errs toward the lighter end
 * rather than flattering the app. That was written after a green button
 * measured "white on white, 1:1" because `background-color` is `transparent`
 * on an element painted by `background-image`.
 *
 * So the walk gates `--head-sky` and nothing else. In LIGHT that happens to be
 * the harder stop (the sky is darker than `--bg-card`, so text on it has less
 * room). In DARK it is the easier one, and the stop the walk cannot see is
 * `--bg-card` itself — which every other surface in the app is already
 * measured on, so it is covered by accident rather than by design.
 *
 * "Covered by accident" is the thing this project keeps getting caught by, so
 * both ends are asserted here instead: a retuned `--head-sky` that fails in one
 * theme cannot reach the demo through the gap between two gates.
 *
 * *** MEASURED, NOT MATCHED. *** The tokens are read out of the stylesheet, so
 * a repainted palette is covered without editing this file. Two of this
 * project's cosmetic reports became six unreported WCAG failures because
 * colours were matched by eye.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const CSS = readFileSync(
  join(__dirname, '..', '..', 'styles', 'finpal-theme.css'), 'utf8');

/**
 * *** COMMENTS ARE STRIPPED FIRST, AND THAT IS NOT TIDINESS. ***
 * The dark block explains one token with the prose "`--kt-hover`, not
 * `--kt-card`: a tooltip floats OVER a card...", and a naive
 * `--kt-card:\s*([^;]+);` match finds THAT before the declaration — so
 * `--bg-card` resolved to an English sentence and every dark assertion here
 * failed on a regex, not on a colour. `dataStatementContrast.test.ts` carries
 * the same helper and has simply never asked for a token whose name also
 * appears in a comment.
 */
const DECLARATIONS = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

function themeBlock(theme: 'light' | 'dark'): string {
  const start = theme === 'light'
    ? DECLARATIONS.indexOf(':root {')
    : DECLARATIONS.indexOf('[data-theme="dark"]');
  expect(start).toBeGreaterThan(-1);
  const end = DECLARATIONS.indexOf('\n}', start);
  expect(end).toBeGreaterThan(start);
  return DECLARATIONS.slice(start, end);
}

/** Resolve `--name` in a theme, following one `var()` indirection. */
function token(theme: 'light' | 'dark', name: string): string {
  const block = themeBlock(theme);
  const read = (key: string) => {
    const m = block.match(new RegExp(`--${key}:\\s*([^;]+);`));
    return m ? m[1].trim() : null;
  };
  let value = read(name);
  expect(value, `--${name} is not declared in ${theme}`).not.toBeNull();
  const indirect = value!.match(/^var\(--([a-z0-9-]+)\)$/);
  if (indirect) value = read(indirect[1]);
  expect(value, `--${name} in ${theme} did not resolve to a colour`)
    .toMatch(/^#[0-9a-fA-F]{6}$/);
  return value!;
}

function luminance(hex: string): number {
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const n = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function ratio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const AA = 4.5;
/** The non-text bar. The ridge is decoration and is held to nothing — see below. */
const AA_NON_TEXT = 3;

describe.each(['light', 'dark'] as const)('the page head in %s', (theme) => {
  // The gradient is `linear-gradient(178deg, var(--head-sky), var(--bg-card) 96%)`,
  // so these two are the only surfaces any text in the head can sit on.
  const stops = () => ({
    sky: token(theme, 'head-sky'),
    card: token(theme, 'bg-card'),
  });

  it.each([
    ['the page title', 'text-primary'],
    ['the sentence under it', 'text-secondary'],
  ])('%s is at least AA on the sky, the stop the walk measures', (_role, name) => {
    const measured = ratio(token(theme, name), stops().sky);
    expect(measured, `--${name} on --head-sky in ${theme}`).toBeGreaterThanOrEqual(AA);
  });

  it.each([
    ['the page title', 'text-primary'],
    ['the sentence under it', 'text-secondary'],
  ])('%s is at least AA on the card, the stop the walk cannot see', (_role, name) => {
    const measured = ratio(token(theme, name), stops().card);
    expect(measured, `--${name} on --bg-card in ${theme}`).toBeGreaterThanOrEqual(AA);
  });

  it('the sky is distinguishable from the card, or the head is not a head', () => {
    // *** NOT A WCAG RULE — A DESIGN ONE, AND IT HAS A FLOOR ON PURPOSE. ***
    // The whole point of the band is that a page stops opening with a title on
    // empty wash. A sky retuned to within a hair of `--bg-card` would pass
    // every contrast assertion above and silently delete the feature. 1.03 is
    // deliberately low: this catches "identical", not "subtle".
    const { sky, card } = stops();
    expect(ratio(sky, card), `--head-sky vs --bg-card in ${theme}`)
      .toBeGreaterThan(1.03);
  });

  it('the ridge reads against the sky it is drawn on', () => {
    // The ridge carries no text and is `aria-hidden`, so 3:1 is the right bar
    // rather than 4.5 — and it is drawn at partial opacity over the sky, which
    // only ever REDUCES this, so the token pair is the optimistic case. Held
    // anyway: a ridge nobody can see is a 52px blank strip on every page.
    expect(ratio(token(theme, 'head-ridge'), stops().sky),
      `--head-ridge on --head-sky in ${theme}`).toBeGreaterThan(1.1);
    expect(ratio(token(theme, 'text-primary'), token(theme, 'head-ridge')),
      `the title must still read if it overlaps the ridge in ${theme}`)
      .toBeGreaterThanOrEqual(AA_NON_TEXT);
  });
});
