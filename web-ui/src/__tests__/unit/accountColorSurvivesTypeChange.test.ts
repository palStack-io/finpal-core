/**
 * #130 — changing an account's type threw away the colour the user had picked.
 *
 * Reported as `palStack-io/finpal-core#130`: *"If you want to change account type, the
 * color will always reset to Green."*
 *
 * **The report is imprecise and the defect is real.** It does not always reset to green —
 * it resets to *the newly chosen type's* default, and green is savings' default only.
 * Green is neither the first swatch (blue is) nor the fallback (blue again), so the
 * obvious explanations are both wrong. What is genuine is that both account forms
 * overwrote the colour **unconditionally** on every type change, discarding a deliberate
 * choice with no way to get it back except re-picking.
 *
 * *** THE MECHANISM PREDATES f494909 AND THAT COMMIT IS STILL WHY THIS ARRIVED NOW. ***
 * `git show f494909^:...EditAccountForm.tsx` has the same three lines, byte for byte;
 * f494909 changed only the values, replacing per-form `var(--...)` lists with this shared
 * hex module. But before it, those var() strings were 17–23 chars against a `String(7)`
 * column, so per #123 four of five types could not persist a colour at all — the
 * overwrite happened in the browser and the write then failed. Making the colour save
 * end-to-end is what made a pre-existing overwrite newly *stick*. Disclosed as such on
 * the issue rather than fixed quietly.
 *
 * Also covered here, because #123 was fixed in two of three copies and the guard beside
 * this file cannot see the third:
 *
 *   - `pages/Accounts.tsx` held its own un-migrated `var()` colour map, and it is not
 *     styling — `Accounts.tsx` feeds `color:` into the row object handed to
 *     `<EditAccountForm account={...}>`. So for any account whose stored `color` is
 *     NULL, the edit form opened holding `var(--accent-blue)`, no swatch matched, and
 *     saving posted that string. The `${account.color}20` alpha concatenation two
 *     hundred lines below only works on a hex, too.
 *   - `PUT /accounts/<id>` applied no `validate_request` at all, so the marshmallow
 *     ceiling #123 added guards the POST and nothing guards the update.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import {
  ACCOUNT_COLORS,
  getDefaultColorForType,
  ACCOUNT_COLOR_MAX_LENGTH,
  colorForTypeChange,
} from '../../constants/accountColors';

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

describe('#130 a deliberately chosen colour survives a type change', () => {
  it('is the premise: green is savings\' default, not a global fallback', () => {
    // Pins the two explanations the report invites, both of which are wrong. If someone
    // later "simplifies" the map so green IS the fallback, this fails and says why.
    expect(getDefaultColorForType('savings')).toBe('#22c55e');
    expect(getDefaultColorForType('anything-unknown')).toBe('#3b82f6');
    expect(ACCOUNT_COLORS[0].value).toBe('#3b82f6');
  });

  it('still follows the type while the colour is untouched', () => {
    // The behaviour that was worth keeping: someone who never opens the swatches gets a
    // sensible per-type colour. Switching checking -> savings must still go green.
    expect(colorForTypeChange({
      previousType: 'checking',
      nextType: 'savings',
      currentColor: getDefaultColorForType('checking'),
    })).toBe(getDefaultColorForType('savings'));
  });

  it('KEEPS a colour the user chose deliberately', () => {
    // The reported defect. Pink is nobody's default, so it can only have been chosen.
    const pink = '#ec4899';
    expect(ACCOUNT_COLORS.some((c) => c.value === pink)).toBe(true);
    expect(colorForTypeChange({
      previousType: 'checking',
      nextType: 'savings',
      currentColor: pink,
    })).toBe(pink);
  });

  it('keeps a chosen colour even when it happens to be another type\'s default', () => {
    // The subtle half. Purple is investment's default, but if the user picked it while
    // on `checking` it is still a choice, and switching to savings must not eat it.
    const purple = getDefaultColorForType('investment');
    expect(colorForTypeChange({
      previousType: 'checking',
      nextType: 'savings',
      currentColor: purple,
    })).toBe(purple);
  });

  it('treats a missing colour as untouched rather than as a choice', () => {
    expect(colorForTypeChange({
      previousType: 'checking', nextType: 'credit', currentColor: '',
    })).toBe(getDefaultColorForType('credit'));
    expect(colorForTypeChange({
      previousType: 'checking', nextType: 'credit', currentColor: undefined,
    })).toBe(getDefaultColorForType('credit'));
  });

  it('treats a legacy var() colour as untouched, so the form can heal itself', () => {
    // An account created before #123 shipped can hold `var(--accent-blue)` in the DB.
    // That is not a colour the user can have picked from today's swatches, and leaving
    // it in place would re-post an invalid value. Switching type is a chance to fix it.
    expect(colorForTypeChange({
      previousType: 'checking',
      nextType: 'savings',
      currentColor: 'var(--accent-blue)',
    })).toBe(getDefaultColorForType('savings'));
  });

  it('never returns something that will not fit the column (#123)', () => {
    const HEX = /^#[0-9a-f]{6}$/i;
    for (const previousType of ['checking', 'savings', 'credit', 'investment', 'cash', 'loan']) {
      for (const nextType of ['checking', 'savings', 'credit', 'investment', 'cash', 'loan']) {
        for (const currentColor of [...ACCOUNT_COLORS.map((c) => c.value),
                                    '', undefined, 'var(--accent-blue)']) {
          const out = colorForTypeChange({ previousType, nextType, currentColor });
          expect(out).toMatch(HEX);
          expect(out.length).toBeLessThanOrEqual(ACCOUNT_COLOR_MAX_LENGTH);
        }
      }
    }
  });
});

describe('#123 was fixed in two of three copies — the third is live data', () => {
  // The guard beside this file sweeps only the two form files. This is the file it
  // cannot see, and its map fed the edit form. Widened here rather than there so the
  // reason travels with the finding.
  const COLOUR_BEARING_FILES = [
    'src/components/forms/AddAccountForm.tsx',
    'src/components/forms/EditAccountForm.tsx',
    'src/pages/Accounts.tsx',
  ];

  it.each(COLOUR_BEARING_FILES)('%s posts no var() colour', (rel) => {
    const source = read(rel);
    // Look only at colour context: `var()` is legitimate everywhere else in these files.
    const offenders = source
      .split('\n')
      .map((line, i) => [i + 1, line] as const)
      .filter(([, line]) => /colou?r/i.test(line) && /var\(--/.test(line))
      // A `style={{ color: 'var(--text-primary)' }}` is styling, not account data. The
      // defect is a var() reaching a `color:` that is POSTed or stored, which in these
      // files means the account-colour maps and the swatch list.
      .filter(([, line]) => !/style=|background|border|boxShadow|:\s*'var\(--text|:\s*'var\(--border/i.test(line));
    expect(offenders).toEqual([]);
  });

  it('Accounts.tsx does not carry its own account-colour map', () => {
    // The specific drift: a third `getAccountColor` switch. Asserting on the absence of
    // the duplicate rather than on its contents, so it cannot come back subtly wrong.
    const source = read('src/pages/Accounts.tsx');
    expect(source).not.toMatch(/const\s+getAccountColor\s*=/);
    expect(source).toMatch(/from\s+['"]\.\.\/constants\/accountColors['"]/);
  });
});
