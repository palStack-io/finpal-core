/**
 * Sharing with the community is thanked. It is never paid.
 *
 * *** OWNER DECISION 2026-09-17: *** *"we arent taking contribtion code wise
 * but we appreciate users to use pointpal and do contribution"*.
 *
 * Two independent reasons this must stay true, and the gate covers both:
 *
 * 1. *** `submitted_to_community` ONLY MEANS A LINK WAS BUILT. *** §5.1 proved
 *    it: `generate_pr_url` sets the flag in the same function that builds the
 *    URL, with no outbound call anywhere, verified by monkeypatching
 *    `requests` to raise. A reward hanging off it pays for pressing a button,
 *    and §5.1's own warning is that paying for contributions gets you volume,
 *    not accuracy — while a community dataset's entire value IS accuracy.
 * 2. *** finPal CANNOT KNOW A CONTRIBUTION WAS ACCEPTED. *** Nothing links a
 *    merge back to a user, deliberately: D-91 keeps every identifier out of
 *    the public payload. So the copy thanks them for SHARING, which is the
 *    part that actually happened, and claims nothing about acceptance.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const page = readFileSync('src/modules/pointspal/pages/MyCards.tsx', 'utf8');

describe('contribution is thanked, not paid', () => {
  it('thanks a user who has shared', () => {
    expect(page).toMatch(/community-thanks/);
    expect(page).toMatch(/Thank you for sharing/);
  });

  it('the thanks is gated on having shared, not shown to everybody', () => {
    expect(page).toMatch(/card\.submitted_to_community && \(/);
  });

  /**
   * The rendered thanks block only.
   *
   * *** A CHARACTER WINDOW WAS THE WRONG TOOL AND FAILED FOR THE WRONG REASON.
   * *** A first version sliced 1,200 characters either side of the testid,
   * which swept in the button above it — "Add earn rates to community
   * database" — and tripped on the word "earn". The same mistake shape as the
   * privacy guard earlier today: scope the assertion to the thing, not to its
   * neighbourhood.
   */
  const thanksBlock = () => {
    const open = page.indexOf('{card.submitted_to_community && (');
    expect(open).toBeGreaterThan(-1);
    const close = page.indexOf(')}', page.indexOf('community-thanks'));
    expect(close).toBeGreaterThan(open);
    // *** COMMENTS STRIPPED, AND THIS IS THE THIRD TIME TODAY. *** The block's
    // own JSX comment says "No coins and no badge hang off this" — explaining
    // the rule — and a text scan cannot tell a prohibition from a violation.
    // The pointsPal privacy guards hit the same wall this morning and were
    // moved onto the AST for it. Here the fix is smaller: what must be clean is
    // the copy a USER reads, so only that is checked.
    return page.slice(open, close).replace(/\/\*[\s\S]*?\*\//g, '');
  };

  it('promises no coins and no badge for sharing', () => {
    const block = thanksBlock();
    for (const word of ['coin', 'Coin', 'badge', 'Badge', 'reward', 'earn ']) {
      expect(block).not.toContain(word);
    }
  });

  it('does not claim the contribution was ACCEPTED, only shared', () => {
    // finPal cannot know: nothing links a merge to a user, by design.
    const block = page.slice(
      page.indexOf('Thank you for sharing'),
      page.indexOf('Thank you for sharing') + 300
    );
    for (const word of ['accepted', 'merged', 'approved', 'published']) {
      expect(block.toLowerCase()).not.toContain(word);
    }
  });
});
