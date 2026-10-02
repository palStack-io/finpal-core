import { describe, it, expect } from 'vitest';

/**
 * *** THE PRODUCT IS finPal IN EVERY CURRENCY. *** `config/branding.ts` used to name the app
 * "DollarPal", "EuroPal", "PoundPal" and so on by the reader's currency, and the sign-up screen once
 * invited the whole world to "Join DollarPal today" (D-231). The owner's rule, 2026-10-02: there is
 * no per-currency product name. This replaces `signupDoesNotPickACurrencyBrand.test.ts`, which only
 * covered four auth screens and called the naming "a real feature".
 *
 * Matched as SOURCE with comments stripped, so history written in a comment cannot trip it and a
 * string a user could see always does. Tests are excluded: they may name the brands to forbid them.
 */
const SOURCES = import.meta.glob(
  ['../../**/*.{ts,tsx,json}', '!../../**/__tests__/**', '!../../**/*.test.*'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

const BRANDS = /\b(DollarPal|EuroPal|PoundPal|RupeePal|YenPal|YuanPal|RealPal)\b/;
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('no per-currency product name', () => {
  it('scans the whole source tree', () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(100);
  });

  it('no source outside tests uses a currency brand as text or data', () => {
    const offenders = Object.entries(SOURCES)
      .filter(([, src]) => BRANDS.test(stripComments(src)))
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });

  it('the branding table carries no product name', async () => {
    const { getBranding } = await import('../../config/branding');
    for (const code of ['USD', 'EUR', 'GBP', 'INR', 'JPY'] as const) {
      expect(Object.keys(getBranding(code))).not.toContain('appName');
    }
  });
});
