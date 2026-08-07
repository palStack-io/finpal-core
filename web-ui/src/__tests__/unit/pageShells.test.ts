/**
 * U-03 — the extracted page shells must keep rendering what they replaced.
 *
 * Seven pages each inlined a byte-identical `<h1>` style and a byte-identical
 * outer wrapper. Both are now `.page-title` and `.page-container`.
 *
 * **The reconciliation is the part worth guarding.** `.page-title` already
 * existed, was used by nothing, and said `font-size: 28px; margin: 0` — while
 * every page rendered `32px` with `8px` beneath it. So "point the pages at the
 * design system" would have shrunk every title on the app. The class was
 * changed to match the pages, not the other way round: keeping the rendering
 * identical is what makes this a refactor, and resizing headings is a design
 * decision that belongs to the owner.
 *
 * These assertions pin the values the inline styles had. If someone later
 * decides 28px was right after all, this test should be UPDATED deliberately —
 * failing here means the size changed, which is exactly the event worth
 * noticing, because nothing else in the suite renders these pages against real
 * CSS. jsdom does not apply an external stylesheet, so a rendering test would
 * pass no matter what these rules said.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const theme = readFileSync(
  resolve(process.cwd(), 'src/styles/finpal-theme.css'), 'utf8');

/** The body of `selector { ... }`, comments stripped. */
function rule(selector: string): string {
  const at = theme.indexOf(`${selector} {`);
  expect(at, `${selector} is not defined`).toBeGreaterThan(-1);
  const body = theme.slice(at + selector.length + 2, theme.indexOf('}', at));
  return body.replace(/\/\*[\s\S]*?\*\//g, '');
}

const declares = (selector: string, prop: string, value: string) => {
  const found = rule(selector)
    .split(';')
    .map((d) => d.trim())
    .find((d) => d.startsWith(`${prop}:`));
  expect(found, `${selector} does not declare ${prop}`).toBeDefined();
  expect(found!.replace(`${prop}:`, '').trim()).toBe(value);
};

describe('.page-title carries what the seven pages inlined', () => {
  // The exact inline block it replaced:
  //   fontSize: '32px', fontWeight: 700, marginBottom: '8px',
  //   color: 'var(--text-primary)'
  it('is 32px, not the 28px the unused class used to say', () => {
    declares('.page-title', 'font-size', '32px');
  });

  it('keeps the 8px below the heading', () => {
    declares('.page-title', 'margin', '0 0 8px');
  });

  it('keeps weight and colour', () => {
    declares('.page-title', 'font-weight', '700');
    declares('.page-title', 'color', 'var(--text-primary)');
  });
});

describe('.page-container carries what the seven pages inlined', () => {
  it('matches maxWidth 1400px, margin 0 auto', () => {
    declares('.page-container', 'max-width', '1400px');
    declares('.page-container', 'margin', '0 auto');
  });
});

describe('the shells are actually used', () => {
  /**
   * Both classes were defined-and-unused before this change, which is the
   * condition that let `.page-title` drift away from the app unnoticed. A rule
   * nothing references cannot be wrong, so nothing keeps it right.
   */
  const sources = import.meta.glob('../../pages/*.tsx', {
    query: '?raw', import: 'default', eager: true,
  }) as Record<string, string>;

  const usages = (name: string) =>
    Object.entries(sources).filter(([, s]) => s.includes(`className="${name}"`));

  it('page-title is on several pages', () => {
    expect(usages('page-title').length).toBeGreaterThanOrEqual(5);
  });

  it('page-container is on several pages', () => {
    expect(usages('page-container').length).toBeGreaterThanOrEqual(6);
  });

  it('and the inline forms they replaced are gone from those pages', () => {
    for (const [file, source] of Object.entries(sources)) {
      expect(source, `${file} still inlines the page-title block`).not.toContain(
        "fontSize: '32px', fontWeight: 700, marginBottom: '8px'");
      expect(source, `${file} still inlines the container block`).not.toContain(
        "maxWidth: '1400px', margin: '0 auto'");
    }
  });
});

describe('the extracted typography roles carry their inline values', () => {
  /**
   * Same contract as .page-title above: every value is copied from the inline
   * block it replaced, so rendering is unchanged. Pinned in text because jsdom
   * applies no external stylesheet — a rendering test cannot see these at all.
   *
   * These are named ROLES, not utilities. `.mb-16` would be hand-rolling the
   * Tailwind this project deliberately removed; a "hint" or a "section title"
   * is something the design has an opinion about, and a margin is not.
   */
  const cases: Array<[string, Array<[string, string]>]> = [
    ['.fp-hint', [['color', 'var(--text-secondary)'], ['font-size', '14px']]],
    ['.fp-hint-block', [['color', 'var(--text-secondary)'], ['font-size', '14px'],
                        ['margin-bottom', '16px']]],
    ['.fp-error-text', [['color', 'var(--accent-red)'], ['font-size', '14px'],
                        ['margin', '0']]],
    ['.fp-meta', [['color', 'var(--text-muted)'], ['font-size', '13px']]],
    ['.fp-item-title', [['color', 'var(--text-primary)'], ['font-size', '16px'],
                        ['font-weight', '600'], ['margin-bottom', '4px']]],
    ['.fp-section-title', [['font-size', '18px'], ['font-weight', '600'],
                           ['color', 'var(--text-primary)'], ['margin-bottom', '16px']]],
  ];

  it.each(cases)('%s', (selector, decls) => {
    for (const [prop, value] of decls) declares(selector, prop, value);
  });

  it('.fp-input is left drifted ON PURPOSE, so nobody half-adopts it', () => {
    // Five inputs inline `padding: 12px`; this rule still says `10px 14px`.
    // Adopting it without reconciling would resize every one of them, which is
    // the trap .page-title set. Recorded as a rule rather than a comment so the
    // next slice cannot miss it.
    declares('.fp-input', 'padding', '10px 14px');
  });
});
