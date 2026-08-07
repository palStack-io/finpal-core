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
