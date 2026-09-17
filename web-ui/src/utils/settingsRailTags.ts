/**
 * The little fact beside each Settings section in the rail.
 *
 * Settings is nine subjects on one scroll, and the rail was throwing away
 * everything it already knew — so you had to open a section to find out whether
 * it was doing anything. Each tag is a fact the section knows anyway.
 *
 * *** AN ABSENT TAG MUST RENDER AS NOTHING, NEVER AS A VALUE. *** Every
 * function here returns `null` rather than a zero when it does not have the
 * answer. "Household · 0 people" is a false statement about an instance whose
 * member list simply has not arrived yet, and it is indistinguishable on screen
 * from a true one. `null !== undefined` has bitten this project before, so the
 * callers test for `null` explicitly and the type forbids anything else.
 *
 * *** AND THIS IS NOT THE PAGE'S ONLY HEAD DECISION. *** Settings deliberately
 * does NOT get `PageHead`'s 27px title and ridge band: it has its own two-pane
 * shell, and a 52px band inside a 232px rail would be absurd. The rail carrying
 * state is the change; the chrome is not.
 */

export interface RailFacts {
  /** Members in this instance, or `null` while unknown / not applicable. */
  memberCount: number | null;
  /** ENTITLEMENT — "may you". `undefined` when the user has none. */
  modules?: string[];
  /**
   * PREFERENCE — "do you want to". `undefined` means **nothing hidden**, not
   * everything: there is no such key for a user who has never hidden one.
   */
  hiddenModules?: string[];
  /** e.g. `'USD'`. */
  currency?: string;
}

/**
 * How many modules are actually showing in the nav.
 *
 * *** ENTITLEMENT MINUS PREFERENCE, AND THE TAB ITSELF SHOWS SOMETHING ELSE. ***
 * `types/user.ts` states that `hidden_modules` is deliberately NOT subtracted
 * from `modules`, because the Modules tab renders from `modules` and is the only
 * screen that can un-hide one — filtering that list would make hiding a one-way
 * door. That is right for the tab and wrong for the tag: the tag says "on", and
 * a module the user has hidden is not on. So the two answer different questions
 * on purpose, and this is the only place that subtracts.
 *
 * Returns `null` when there is no entitlement at all, because the section does
 * not exist for that user either.
 */
export function modulesOn(facts: RailFacts): number | null {
  if (!facts.modules || facts.modules.length === 0) return null;
  const hidden = new Set(facts.hiddenModules ?? []);
  // Counted by membership rather than by subtracting lengths: a stale slug in
  // `hidden_modules` that is no longer entitled would otherwise subtract from a
  // total it was never part of, and report one fewer module than are showing.
  return facts.modules.filter((slug) => !hidden.has(slug)).length;
}

/**
 * The tag for one section id, or `null` for no tag.
 *
 * Unknown ids return `null` rather than throwing: the rail is built from an
 * entitlement-filtered list, and a section with nothing worth saying is the
 * normal case, not an error.
 */
export function railTag(sectionId: string, facts: RailFacts): string | null {
  switch (sectionId) {
    case 'household': {
      // Absent until the member list arrives. Never "0 people".
      if (facts.memberCount === null || facts.memberCount <= 0) return null;
      return facts.memberCount === 1 ? '1 person' : `${facts.memberCount} people`;
    }
    case 'modules': {
      const on = modulesOn(facts);
      return on === null ? null : `${on} on`;
    }
    case 'notifications':
      /* *** THIS ONE IS A CLAIM ABOUT THE PRODUCT, NOT A PIECE OF STATE. ***
         finPal sends email and nothing else — there is no push stack, no
         device-token column and no sender. `notification_email` has five
         consumers; `notification_budget_alerts`,
         `notification_transaction_alerts` and `notification_push` have zero
         between them. Four toggles were offered once and three of them saved a
         value nothing would ever read, which is worse than offering nothing
         because the screen looked like it worked (D-148, removed by D-172).
         So this cannot go stale, and it is the honest summary of a
         one-channel product. */
      return 'email only';
    case 'preferences':
      return facts.currency ?? null;
    default:
      return null;
  }
}
