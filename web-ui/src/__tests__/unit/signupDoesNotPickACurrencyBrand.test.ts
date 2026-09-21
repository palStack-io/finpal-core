import { describe, it, expect } from 'vitest';

/**
 * *** THE SIGN-UP SCREEN MUST NOT NAME A CURRENCY BRAND, BECAUSE THERE IS NO
 * CURRENCY YET. ***
 *
 * `config/branding.ts` brands the app by the reader's currency — DollarPal for
 * USD, EuroPal for EUR, PoundPal, RupeePal and so on — and `Landing.tsx`
 * advertises that as a feature. It is a real feature, not a mistake.
 *
 * But `Register.tsx` had `Join DollarPal today` **hardcoded**, and never
 * imported `getBranding` at all, so every prospective user anywhere in the
 * world was invited to join the US one. At signup the account does not exist,
 * so there is no currency to brand with and no branded name can be correct;
 * the unbranded product name is the only honest option.
 *
 * `Onboarding.tsx` already carries this exact rule in a comment — *"never
 * `brandingMap.USD`'s fallback, which would label every unbranded currency
 * DollarPal"* — so this was the same reasoning failing one screen earlier.
 *
 * The auth screens are matched as SOURCE rather than rendered, because the
 * string is static copy: there is no state that makes it appear or not.
 */
const AUTH_SOURCES = import.meta.glob(
  ['../../pages/Register.tsx', '../../pages/Login.tsx',
    '../../pages/ForgotPassword.tsx', '../../pages/ResetPassword.tsx'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

/** Every brand `config/branding.ts` can produce. */
const CURRENCY_BRANDS = [
  'DollarPal', 'EuroPal', 'PoundPal', 'RupeePal', 'YenPal', 'YuanPal', 'RealPal',
];

/** Strip block and line comments so this file's own prose cannot trip it. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

describe('the auth screens do not claim a currency brand', () => {
  it('finds the auth sources at all', () => {
    // Guards the guard: a glob that matches nothing passes every assertion
    // below while checking exactly nothing.
    expect(Object.keys(AUTH_SOURCES).length).toBe(4);
  });

  for (const brand of CURRENCY_BRANDS) {
    it(`never renders "${brand}" on a screen reached before an account exists`, () => {
      const offenders = Object.entries(AUTH_SOURCES)
        .filter(([, src]) => stripComments(src).includes(brand))
        .map(([path]) => path.split('/').pop());
      expect(offenders, `${brand} in ${offenders.join(', ')}`).toEqual([]);
    });
  }

  it('Register says finPal, the unbranded name', () => {
    const src = Object.entries(AUTH_SOURCES)
      .find(([p]) => p.endsWith('Register.tsx'))![1];
    expect(src).toContain('Join finPal today');
  });

  it('does not achieve that by importing getBranding either', () => {
    // The fix is NOT "brand it correctly" — there is nothing to brand with
    // before the account exists. A `getBranding(...)` call here would fall back
    // to USD and reintroduce DollarPal for everyone, which is the defect.
    const src = Object.entries(AUTH_SOURCES)
      .find(([p]) => p.endsWith('Register.tsx'))![1];
    expect(stripComments(src)).not.toContain('getBranding');
  });
});
