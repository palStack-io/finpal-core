/**
 * The outbound links and the setup steps for SimpleFin, in one place.
 *
 * They live here because three surfaces show them — the Settings panel that takes the
 * token, the Accounts callout that points at it, and the docs site — and the last time
 * they were written out separately they disagreed. The link the Settings panel shipped,
 * `https://beta-bridge.simplefin.org/simplefin/claim`, was a **404**: that path is the
 * endpoint an application POSTs to, never a page a person can open.
 *
 * `bridge.simplefin.org/simplefin/create` is the address SimpleFin's own developer guide
 * tells integrators to send users to.
 */

/** Where a user signs up and generates a setup token. */
export const SIMPLEFIN_BRIDGE_URL = 'https://bridge.simplefin.org/simplefin/create';

/** finPal's own setup guide, anchored at the SimpleFin section. */
export const SIMPLEFIN_DOCS_URL = 'https://palstack.io/finpal/docs.html#simplefin';

/**
 * The steps, in the order a user does them.
 *
 * Deliberately not a description of SimpleFin's UI beyond the one button they have to
 * find: their wording is theirs to change, and instructions that narrate someone else's
 * screen go stale silently.
 */
export const SIMPLEFIN_STEPS: readonly string[] = [
  'Open SimpleFin Bridge and create an account. It is a paid service — around $1.50 a month, billed by SimpleFin, not by finPal.',
  'Connect your bank inside SimpleFin Bridge. Your bank credentials are entered there and never reach finPal.',
  'Still in Bridge, choose to connect a new app. It gives you a setup token: one long line of letters and numbers.',
  'Copy the whole token and paste it below. It works only once, so if you have connected before, generate a fresh one.',
];
