import React from 'react';
import { Link } from 'react-router-dom';
import { Mountain } from 'lucide-react';

import type { User } from '../../types/user';
import { MODULE_SLUG } from './manifest';

/**
 * "Your range is off" — shown on Goals when the user has learnPal but has hidden it.
 *
 * *** THE HARD PART IS NOT THE BANNER, IT IS KNOWING WHEN NOT TO SHOW IT. ***
 * `service.ts` says it plainly: a 404 from the learnPal namespace means the
 * module is not installed on this deployment, and "treating it as an error would
 * put a red banner on the goals page of every deployment that simply does not
 * use learnPal". A prompt is the same mistake in a friendlier font.
 *
 * So three states, and only ONE of them is a prompt:
 *
 *   1. **Never granted** — the slug is not in `user.modules`. adminPal did not
 *      entitle this user. There is no switch for them to flip, and telling them
 *      to go and find one is worse than saying nothing.
 *   2. **Granted, and the user HID it** (`modules` ∋ slug, `hidden_modules` ∋
 *      slug). *** THIS IS THE ONE. *** They own a switch, it is off, and the
 *      absence on this page is a consequence of a choice they made on another
 *      screen and may well have forgotten. Naming it is a kindness; the fix is
 *      one link away.
 *   3. **Granted, visible, but the deployment does not run learnPal** — the API
 *      404s. A self-hoster who never turned `LEARNPAL_ENABLED` on. Nothing they
 *      do on this page changes that.
 *
 * *** IT NAMES THE CONDITION AND THEN NAMES WHAT IS STILL THEIRS (voice rule 11).
 * *** It does not say "you are missing out" or count what they have not done.
 * The goals and their mountains are core and are all still on the page — so the
 * note says what is absent and where the switch is, and stops.
 *
 * *** INLINE, WHERE THE RANGE WOULD HAVE BEEN — NOT A MODAL. *** A dialog on
 * every visit to Goals is a nag, and a nag about an optional module is how people
 * learn to dismiss things without reading them. Sitting in the gap explains the
 * gap.
 */

/** The one state that earns the note. Exported so a test can pin it. */
export function rangeIsHiddenByChoice(user: Pick<User, 'modules' | 'hidden_modules'> | null): boolean {
  if (!user) return false;
  const granted = (user.modules ?? []).includes(MODULE_SLUG);
  const hidden = (user.hidden_modules ?? []).includes(MODULE_SLUG);
  return granted && hidden;
}

export const RangeHiddenNote: React.FC = () => (
  <div
    style={{
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      background: 'var(--bg-card)',
      border: '1px solid var(--border-light)',
      borderRadius: 16,
      padding: '14px 18px',
      marginBottom: 20,
    }}
  >
    <Mountain size={18} style={{ color: 'var(--g-ink)', flexShrink: 0 }} aria-hidden="true" />
    <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 14 }}>
      Your range is hidden, so it is not drawn here. Your goals and their peaks are
      unaffected.
    </p>
    {/* An explicit colour, because this app has no global `a {}` rule and an
        unstyled link falls back to the user agent's #0000ee — 1.72:1 on the dark
        card. `--g-ink` themes and measures 6.92 / 8.21 on the two surfaces. */}
    <Link
      to="/settings?tab=modules"
      style={{ color: 'var(--g-ink)', fontWeight: 600, fontSize: 14, marginLeft: 'auto' }}
    >
      Show learnPal again
    </Link>
  </div>
);
