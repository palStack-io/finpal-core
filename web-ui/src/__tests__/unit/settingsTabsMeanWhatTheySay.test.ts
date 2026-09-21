/**
 * Settings has an Account tab and a Preferences tab, and each holds what its
 * name says.
 *
 * *** BOTH HALVES OF THIS WERE BROKEN AND THE OWNER FOUND BOTH BY CLICKING.
 * *** On 2026-09-20: the tab called "Profile" collided with the new
 * `/profile` page, so they went looking for their shelf and badges under
 * Settings and found a name field. And "Preferences" rendered eleven lines —
 * a heading, a sentence, and then it closed — while the three actual
 * preferences (currency, timezone, number format) sat under Profile.
 *
 * A nav item that leads to an empty page is the affordance-that-does-nothing
 * shape, and two tabs called Profile is D-102's family in an information
 * architecture: a label that does not describe what is behind it.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = () => readFileSync(join(process.cwd(), 'src/pages/Settings.tsx'), 'utf8');

/** The JSX for one `activeTab === '<id>'` branch. */
function tabBody(id: string): string {
  const s = src();
  const start = s.indexOf(`activeTab === '${id}'`);
  expect(start).toBeGreaterThan(-1);
  const next = s.indexOf('activeTab === ', start + 20);
  return s.slice(start, next === -1 ? undefined : next);
}

describe('Settings tabs mean what they say', () => {
  it('has no tab called "Profile" — that is a page now', () => {
    /* Two things called Profile is what sent the owner to the wrong one. */
    expect(src()).not.toMatch(/label: 'Profile'/);
    expect(src()).toMatch(/label: 'Account'/);
  });

  it('keeps the `profile` id, so old ?tab=profile links still work', () => {
    /* The label changed; the route contract did not. Changing the id would
       break every link anybody has already saved or shipped. */
    expect(src()).toMatch(/\{ id: 'profile', label: 'Account'/);
  });

  it('*** THE PREFERENCES TAB IS NOT EMPTY ***', () => {
    const body = tabBody('preferences');
    for (const field of ['settings-currency', 'settings-timezone', 'settings-number-format']) {
      expect(body).toContain(field);
    }
    // And it can be saved, or the fields are decorative.
    expect(body).toContain('handleProfileSave');
  });

  it('Account holds identity, NOT behaviour', () => {
    /* The split that makes both names true: who you are vs how the app
       behaves for you. If currency drifts back here, this fails. */
    const body = tabBody('profile');
    expect(body).toMatch(/settings-name|Full Name/);
    expect(body).not.toContain('settings-currency');
    expect(body).not.toContain('settings-timezone');
    expect(body).not.toContain('settings-number-format');
  });
});
