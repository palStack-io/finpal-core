/**
 * Every content page supplies its own horizontal padding.
 *
 * *** THIS DEFECT REACHED THE DEMO AND A HUMAN FOUND IT, WHICH IS WHY THE GATE
 * EXISTS. *** `/kit` shipped wrapped in a bare `<div>`. `.main-content` carries
 * NO horizontal padding by design — it only reserves the fixed sidebar's width
 * — so the page rendered flush to the viewport edge: the gear grid's last
 * column and every act row's coin figure touched x=1440, while `PageHead`
 * looked correctly inset because it supplies its own. The owner's words were
 * "its padding is very off".
 *
 * *** NO EXISTING GATE COULD SEE IT. *** An unpadded page has a contrast ratio,
 * does not overflow (`.main-content` sets `overflow-x: hidden`), renders every
 * element, and passes axe. It is D-252's class: the only way to find it is to
 * look at the page.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

/**
 * Pages that legitimately own their whole viewport and are NOT in the padded
 * content shell. Auth screens use `AuthShell` (the pantryPal treatment, which
 * puts the range on the ground line and owns its own layout); Landing is the
 * marketing page. An entry here is a recorded decision, and the stale check
 * below stops it rotting.
 */
const NOT_A_CONTENT_PAGE = new Set([
  'Landing.tsx', 'Login.tsx', 'Register.tsx', 'ForgotPassword.tsx',
  'ResetPassword.tsx', 'NotFound.tsx', 'OidcCallback.tsx', 'Onboarding.tsx',
]);

/**
 * Pages that pad themselves without the shared helper.
 *
 * *** EMPTY, AND IT SHOULD STAY EMPTY. *** The first draft of this file listed
 * Dashboard and Settings here, and the stale check below caught it on the
 * first run: both already use `pageContainerStyle`. The mistake came from
 * grepping only for `className="page-container"` and missing the inline-style
 * form — two mechanisms for one thing, which is worth knowing about this
 * codebase. Every content page now uses one or the other.
 */
const PADS_ITSELF = new Set<string>();

const pages = [
  'Accounts.tsx', 'Analytics.tsx', 'BudgetsMinimal.tsx', 'Dashboard.tsx',
  'Goals.tsx', 'GroupDetail.tsx', 'Groups.tsx', 'Investments.tsx', 'Kit.tsx',
  'Review.tsx', 'Settings.tsx', 'Transactions.tsx',
];

describe('content pages are padded', () => {
  for (const page of pages) {
    if (NOT_A_CONTENT_PAGE.has(page)) continue;
    it(`${page} supplies horizontal padding`, () => {
      const src = readFileSync(`src/pages/${page}`, 'utf8');
      // Two mechanisms exist for the same thing: the `pageContainerStyle`
      // inline style and the `.page-container` class. Both are accepted;
      // neither is, on its own, the whole picture.
      const shared = /pageContainerStyle|className="page-container"/.test(src);
      const own = PADS_ITSELF.has(page) && /padding/.test(src);
      expect(shared || own).toBe(true);
    });
  }

  it('has no STALE entry in PADS_ITSELF', () => {
    // A page listed as self-padding that now uses the shared helper: delete the
    // entry, or the list stops describing anything.
    const stale = [...PADS_ITSELF].filter((page) => {
      const src = readFileSync(`src/pages/${page}`, 'utf8');
      return /pageContainerStyle/.test(src);
    });
    expect(stale).toEqual([]);
  });

  it('Kit specifically uses the shared container, since it is the one that broke', () => {
    const kit = readFileSync('src/pages/Kit.tsx', 'utf8');
    expect(kit).toMatch(/style=\{pageContainerStyle\}/);
  });
});
