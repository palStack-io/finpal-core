/**
 * The drawing a literacy badge borrows.
 *
 * *** A BADGE SLUG IS NOT A GEAR SLUG, AND RENDERING ONE AS THE OTHER DREW A
 * BULLET. *** On web, `BadgeIcon` asks `GearIcon` for `/gear/<slug>.svg`;
 * there is no `goal-reached.svg`, so every literacy badge fell through to the
 * `'•'` fallback AND put a 404 in the console on every visit. Found on the
 * deployed demo, not in a test: the unit tests render `BadgeIcon` happily
 * because the fetch is mocked away. AUDIT D-276.
 *
 * On mobile the same mistake is quieter and worse — `GEAR_PNG` is a STATIC
 * require map (Metro will not bundle a computed path), so an unmapped slug
 * renders nothing at all rather than a visible bullet.
 *
 * *** THE MAPPING IS PRESENTATIONAL, SO IT LIVES IN THE CLIENT. *** Same line
 * `mountainGeometry.ts` sits on: the server decides which badge you hold, the
 * client decides what it looks like. Sending a glyph name on the wire would
 * make the artwork a release-coupled API field for no gain.
 *
 * *** THIS FILE IS BYTE-IDENTICAL IN `web-ui/src/utils/` AND `mobile/src/utils/`,
 * AND A TEST DIFFS THEM RATHER THAN TRUSTING THIS SENTENCE. *** Two clients
 * drawing one badge differently is D-101 in pictures. `peakCopy.ts` is kept
 * the same way and for the same reason.
 *
 * *** REUSING THE GEAR ART IS THE OWNER'S DECISION (2026-09-17), NOT A
 * SHORTCUT: *** badges reuse the glyph inside a disc, and the disc is what
 * distinguishes a badge from equipment.
 */
/**
 * The badge slugs that have their OWN drawing, as opposed to borrowing one.
 *
 * *** THIS EXISTS TO STOP A 404 PER BADGE PER PAGE. *** The first version of
 * `BadgeIcon` tried `/badges/<slug>.svg` for every badge and fell back to
 * gear on a 404 — which made "drop a file in, no code change" true, and made
 * every page in the app log a failed request for every badge without art.
 * Measured on the demo: **480 console errors across one walkthrough**, from a
 * rail that renders on every page. That is D-275's lesson, reintroduced three
 * days after it was closed — a page that always has an error in its console
 * is a page whose console nobody reads.
 *
 * *** SO LANDING NEW ART IS A FILE PLUS A LINE, ON BOTH CLIENTS. *** Mobile
 * always needed the line (Metro will not bundle a computed path); web now
 * needs it too, which at least makes the two identical rather than subtly
 * different. `badgeGlyphsExist.test.ts` asserts this set matches the files on
 * disk exactly, so a file without a line — or a line without a file — fails.
 */
export const BADGE_ART = new Set<string>([
  'first-light',
  'cairn-builder',
  'map-maker',
]);

export const BADGE_GLYPH: Record<string, string> = {
  // Cutting through the thing that was in the way.
  'debt-free': 'ice-axe',
  // You arrived somewhere you had named.
  'goal-reached': 'signpost',
  // Knowing what you are carrying, three months running.
  'on-budget-3': 'pack-scale',
  'on-budget-6': 'slope-gauge',
  'on-budget-12': 'compass',
  // Keeping to a start time is the whole of a paydown plan.
  'on-plan-3': 'alpine-start',
  'on-plan-6': 'carabiner',

  // *** pointsPal's CONTRIBUTOR BADGES, WHICH SHIPPED WITH NO GLYPH AT ALL.
  // *** They are registered at boot through `PointsPalModule.get_badges()`,
  // so they never appeared in core's `BADGES` dict — and the gate that was
  // supposed to catch a missing drawing derives its list from that dict.
  // Result: a bullet on web and, because Metro needs a STATIC require map,
  // nothing whatsoever on mobile. D-276's shape, in the half of the system
  // its fix did not reach.
  //
  // A cairn is a pile of stones marking the route for whoever comes next,
  // which is what a contribution is; the map and the signpost follow it.
  'first-light': 'headlamp',
  'cairn-builder': 'cache',
  'map-maker': 'map',
};

/**
 * The gear slug to draw for a badge.
 *
 * *** FALLS BACK TO THE BADGE SLUG, NOT TO A DEFAULT PICTURE. *** A badge
 * registered by a module (`register_badge`) has no entry here, and giving it
 * somebody else's drawing would say something false about it. Passing the slug
 * through means it finds its own file if one exists and draws nothing if it
 * does not — absent rather than wrong, the same rule the badges themselves
 * follow.
 */
export const badgeGlyph = (slug: string): string => BADGE_GLYPH[slug] ?? slug;
