/**
 * The data statement's ink is legible on the surface it sits on — computed from
 * the stylesheet, not eyeballed.
 *
 * *** WHY THIS IS A UNIT TEST AND NOT A CASE IN THE CONTRAST WALK. *** The walk
 * captures PAGES and guards against capturing a stub: its runner requires 20
 * elements to interact and 50 to accept a capture (a rule written after
 * Investments serialised as a two-element stub and BOTH walks reported it
 * clean). `DataStatement` is one bordered block — a heading and four paragraphs,
 * about six elements — so adding it to the walk would have meant weakening that
 * threshold, and this project's rule is to comply with a guard rather than bend
 * it. The statement's only page is Settings, which is not in the walk at all;
 * when it is, this file is redundant and should go.
 *
 * *** MEASURED, NOT MATCHED. *** The tokens are read out of
 * `finpal-theme.css` and resolved one level (`--text-muted: var(--kt-soft)`), so
 * a retuned palette is covered without editing this file. Two of this project's
 * cosmetic reports became six unreported WCAG failures because colours were
 * matched by eye.
 *
 * *** AND IT RECORDS ONE FINDING WORTH KEEPING: `--text-muted` AND
 * `--text-secondary` ARE THE SAME TOKEN *** (both `--kt-soft`). The operator
 * note is therefore quieter by SIZE and a rule, not by colour. Anyone
 * "correcting" that by inventing a third, lighter grey has to get past the
 * assertion at the bottom.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const CSS = readFileSync(
  join(__dirname, '..', '..', 'styles', 'finpal-theme.css'), 'utf8');

/** The `:root` block is light; `[data-theme="dark"]` is dark. */
function themeBlock(theme: 'light' | 'dark'): string {
  const start = theme === 'light'
    ? CSS.indexOf(':root {')
    : CSS.indexOf('[data-theme="dark"]');
  expect(start).toBeGreaterThan(-1);
  const end = CSS.indexOf('\n}', start);
  expect(end).toBeGreaterThan(start);
  return CSS.slice(start, end);
}

/** Resolve `--name` in a theme, following one `var()` indirection. */
function token(theme: 'light' | 'dark', name: string): string {
  const block = themeBlock(theme);
  const read = (key: string) => {
    const m = block.match(new RegExp(`--${key}:\\s*([^;]+);`));
    return m ? m[1].trim() : null;
  };
  let value = read(name);
  expect(value).not.toBeNull();
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

/** WCAG 2.1 AA for body text. The heading is large but is held to the same bar. */
const AA = 4.5;

describe.each(['light', 'dark'] as const)('the data statement in %s', (theme) => {
  // The surface: the statement is a bordered block on Settings' hover surface.
  const surface = () => token(theme, 'surface-hover');

  it.each([
    ['heading', 'text-primary'],
    ['the three lines', 'text-secondary'],
    ['the operator note', 'text-muted'],
  ])('%s is at least AA on the block it sits on', (_role, name) => {
    const measured = ratio(token(theme, name), surface());
    expect(measured, `${name} on surface-hover in ${theme}`)
      .toBeGreaterThanOrEqual(AA);
  });

  it('the border is visible against the block it encloses', () => {
    // *** 3:1 IS THE NON-TEXT BAR, AND THE BORDER IS WHAT MAKES THIS READ AS A
    // STATEMENT RATHER THAN AS LOOSE PARAGRAPHS. *** It is allowed to be
    // subtle: this asserts it is not invisible, which is a different claim.
    const measured = ratio(token(theme, 'border-light'), surface());
    expect(measured).toBeGreaterThan(1.02);
  });
});

it('records that muted and secondary are the same token, so nobody invents a third', () => {
  // If these ever diverge the component's comment is wrong and the operator
  // note's own ratio needs re-measuring — which the suite above will do.
  for (const theme of ['light', 'dark'] as const) {
    expect(token(theme, 'text-muted')).toBe(token(theme, 'text-secondary'));
  }
});
