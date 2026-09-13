/**
 * Outbound links, in one place — mirroring `mobile/src/constants/links.ts`.
 *
 * *** THIS EXISTS BECAUSE THE SAME BUG HAS NOW HAPPENED THREE TIMES. *** D-109
 * was two mobile screens linking to a host that did not exist. D-201 was a dead
 * Terms link and the wrong privacy policy. And the Register page — the one
 * screen where a user is asked to AGREE to something — linked to `/terms` and
 * `/privacy` as RELATIVE paths, which are not routes in this app: they hit the
 * catch-all and bounced the user away from the form they were filling in.
 *
 * A URL in a string literal is just a string. Nothing typechecks it, nothing
 * renders it, and it is only ever found by somebody clicking it.
 *
 * *** MEASURED AGAINST THE LIVE HOST, 2026-09-13: ***
 *
 *     https://palstack.io/finpal/privacy   -> 200  ("finPal — Privacy Policy")
 *     https://palstack.io/finpal/terms     -> written this session, deploys with the homepage
 *     https://palstack.io/finpal/docs      -> 200  ("Documentation - finPal")
 *     https://palstack.io/finpal/docs/     -> 404   <- the trailing slash matters
 *
 * So nothing here carries a trailing slash, and nothing may append one.
 */

/** finPal's own product page. */
export const FINPAL_SITE = 'https://palstack.io/finpal';

/** The documentation. NO trailing slash — `/finpal/docs/` is a real 404. */
export const FINPAL_DOCS = 'https://palstack.io/finpal/docs';

/**
 * *** finPal'S privacy policy, which is NOT palStack'S. *** Both pages exist and
 * both return 200 — `palstack.io/privacy` is "Privacy Policy — palStack", about
 * the whole family. This is the finPal one.
 */
export const FINPAL_PRIVACY = 'https://palstack.io/finpal/privacy';

/** finPal's terms of service. */
export const FINPAL_TERMS = 'https://palstack.io/finpal/terms';
