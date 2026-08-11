/**
 * Groups describe themselves as a household feature, because that is what they now are.
 *
 * **Owner decision, 2026-08-11:** groups began as a way to split with people *outside* the
 * household, and the product has moved to the household model — a group is for partners and
 * housemates who divide everything they share. The Groups surfaces still said *"with friends"*
 * and *"with friends and family"*, which is the old model advertising itself.
 *
 * *** THIS ASSERTS THE COPY, NOT A RESTRICTION — ON PURPOSE. *** `group_service.add_member`
 * does **not** check household membership: the creator may still add any user on the instance by
 * email. So the copy must say what groups are *for* without claiming a rule the backend does not
 * enforce. Writing "only household members can be added" here would be the D-91 shape exactly —
 * pointsPal promised *"No personal data is shared"* while sharing the card's last four. If
 * enforcement lands later, tighten the words then, not before.
 *
 * The one thing the copy may state as fact is that the person needs an account on this instance:
 * `add_member` answers *'User not found'* otherwise, so telling the user up front is honest and
 * saves a failed attempt.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const PAGES = join(__dirname, '..', '..', 'pages');
const groups = readFileSync(join(PAGES, 'Groups.tsx'), 'utf-8');
const groupDetail = readFileSync(join(PAGES, 'GroupDetail.tsx'), 'utf-8');

/** Only the user-visible strings: a word inside a prop name or identifier is not copy. */
function visibleText(src: string): string {
  const chunks: string[] = [];
  // JSX text between tags, and single-quoted strings that read like sentences.
  for (const m of src.matchAll(/>\s*([A-Z][^<>{}]{10,})\s*</g)) chunks.push(m[1]);
  for (const m of src.matchAll(/'([A-Z][^']{15,})'/g)) chunks.push(m[1]);
  return chunks.join('\n');
}

describe('the Groups surfaces describe the household model', () => {
  it('no longer advertises splitting with friends', () => {
    // "friends" and "friends and family" are the pre-household framing. A group between friends
    // is not what this feature is for any more, and the words are the only thing that told the
    // user which model they were in.
    const offences: string[] = [];
    for (const [name, src] of [['Groups.tsx', groups], ['GroupDetail.tsx', groupDetail]] as const) {
      for (const line of visibleText(src).split('\n')) {
        if (/\bfriends?\b/i.test(line)) offences.push(`${name}: ${line.trim()}`);
      }
    }
    expect(offences, `copy still frames groups around friends:\n${offences.join('\n')}`).toEqual([]);
  });

  it('names the household on the Groups page itself', () => {
    // The owner's ask was to "specify on the groups page", so the landing surface has to carry
    // it — not only the create form a user may never open.
    expect(visibleText(groups)).toMatch(/household/i);
  });

  it('tells you the person needs an account here, where you add them', () => {
    // The add-member modal is where a failure would otherwise be discovered by hitting
    // 'User not found'.
    expect(visibleText(groupDetail)).toMatch(/account/i);
  });

  it('does not claim a household restriction the backend does not enforce', () => {
    // The inverse assertion, and the one that matters most: `add_member` has no household
    // check, so absolute words here would be a promise the server breaks.
    const offences: string[] = [];
    for (const [name, src] of [['Groups.tsx', groups], ['GroupDetail.tsx', groupDetail]] as const) {
      for (const line of visibleText(src).split('\n')) {
        if (/\bonly\b[^.]*\bhousehold\b|\bhousehold\b[^.]*\bonly\b/i.test(line)) {
          offences.push(`${name}: ${line.trim()}`);
        }
      }
    }
    expect(
      offences,
      `copy promises an "only household" rule that add_member does not enforce:\n${offences.join('\n')}`,
    ).toEqual([]);
  });
});
