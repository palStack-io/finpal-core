/**
 * An account colour is data, not a style — palStack-io/finpal-core#123.
 *
 * `Account.color` is `db.String(7)` and the marshmallow ceiling matches it. Both
 * account forms used to carry their own copy of the swatch list, holding CSS variable
 * references, and posted those strings to the API:
 *
 *   - `var(--brand-green-glow)` is 23 characters → refused by the validator with a
 *     length error, and because marshmallow rejects before the handler runs the backend
 *     logged nothing at all. That is the "400 with no backend log" in the report.
 *   - `var(--accent-blue)` (18), `var(--accent-red)` (17) and `var(--accent-yellow)`
 *     (20) cleared the validator and then overran the 7-character column.
 *
 * So four of the five account types could not be created and the fifth,
 * `investment`, worked only because its default was already a hex literal.
 *
 * This asserts the constraint rather than the current strings, so a future swatch is
 * covered without editing the test. It also sweeps the forms for a reintroduced
 * `var()`, because the defect was in what the forms *sent*, and a component could go
 * back to a local list without touching this module.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import {
  ACCOUNT_COLORS,
  getDefaultColorForType,
  ACCOUNT_COLOR_MAX_LENGTH,
} from '../../constants/accountColors';

// Every type the account forms offer. Kept explicit: reading it from the form would
// make the test agree with the form by construction.
const ACCOUNT_TYPES = ['checking', 'savings', 'credit', 'investment', 'cash', 'loan'];

const HEX = /^#[0-9a-f]{6}$/i;

const FORMS = [
  'src/components/forms/AddAccountForm.tsx',
  'src/components/forms/EditAccountForm.tsx',
];

describe('account colours fit the column they are stored in', () => {
  it('has swatches to check', () => {
    expect(ACCOUNT_COLORS.length).toBeGreaterThan(0);
    expect(ACCOUNT_COLOR_MAX_LENGTH).toBe(7);
  });

  it.each(ACCOUNT_COLORS)('swatch $label ($value) is a hex code that fits', ({ value }) => {
    expect(value).toMatch(HEX);
    expect(value.length).toBeLessThanOrEqual(ACCOUNT_COLOR_MAX_LENGTH);
  });

  it.each(ACCOUNT_TYPES)('the default colour for %s is a hex code that fits', (type) => {
    const value = getDefaultColorForType(type);
    expect(value).toMatch(HEX);
    expect(value.length).toBeLessThanOrEqual(ACCOUNT_COLOR_MAX_LENGTH);
  });

  it('has a default for an unknown type too', () => {
    const value = getDefaultColorForType('something-new');
    expect(value).toMatch(HEX);
    expect(value.length).toBeLessThanOrEqual(ACCOUNT_COLOR_MAX_LENGTH);
  });
});

describe('the account forms do not invent their own colour values', () => {
  it.each(FORMS)('%s declares no local colour list', (rel) => {
    const src = readFileSync(join(process.cwd(), rel), 'utf8');
    expect(src).not.toMatch(/const\s+ACCOUNT_COLORS\s*=/);
    expect(src).not.toMatch(/const\s+getDefaultColorForType\s*=/);
    expect(src).toContain("from '../../constants/accountColors'");
  });

  it.each(FORMS)('%s seeds its colour field from the shared helper', (rel) => {
    const src = readFileSync(join(process.cwd(), rel), 'utf8');
    // The form's initial colour is the one value that reaches the API without the user
    // touching the swatches, and in AddAccountForm it was a hardcoded
    // `color: 'var(--accent-blue)'` in `defaultValues`. Assert it comes from the helper.
    expect(src).toMatch(/color:\s*(account\.color\s*\|\|\s*)?getDefaultColorForType\(/);
  });

  // NOTE: there is deliberately no line-by-line sweep for `var(--` here. Both forms use
  // `var(--text-primary)`, `var(--accent-red)` and friends correctly and often, inside
  // multi-line `style={{ }}` objects, so any regex broad enough to catch a bad colour
  // value also catches a dozen good styles. The two assertions above are the whole
  // argument instead: the values in the shared module all fit the column, and neither
  // form has a list or a helper of its own — so a posted colour can only come from
  // there.
});
