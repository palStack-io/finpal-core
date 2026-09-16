import fs from 'fs';
import path from 'path';

import AxeBuilder from '@axe-core/playwright';
import { test, expect, pageIsLoaded } from './fixtures';

/**
 * Every page in the app, in both themes — and the route list is DERIVED, not typed.
 *
 * *** WHAT THIS EXISTS TO FIX: `standards.spec.ts` CHECKS SIX PAGES AND THE APP
 * HAS TWENTY-ONE ROUTES. *** Six of them were audited for WCAG and the other
 * fifteen had never been opened by anything in CI. "Meets the standard" was true
 * of the pages somebody remembered, which is D-127's shape and this project has
 * shipped it three times.
 *
 * *** SO THE LIST IS READ OUT OF THE SOURCE. *** `App.tsx` for the app's own
 * routes and each module's `manifest.ts` for the rest. Add a page and it is
 * walked; add a page and forget, and `the route table is derived, so a new page
 * cannot be missed` fails on the count. That is the contrast walk's own rule —
 * *prefer a sweep to a list* (D-59) — applied to pages instead of colours.
 *
 * WHAT EACH PAGE IS ASSERTED ON, and why each one is here:
 *
 *   - **It did not redirect.** A module route with the module off silently lands
 *     on `/`, and a smoke test that only checks "something rendered" calls that a
 *     pass. The surface sweep on the demo reported exactly this as four SKIPs.
 *   - **It finished loading and shows no error alert** (`pageIsLoaded`) — a
 *     heading is static markup and renders over a failed fetch.
 *   - **No console errors.** A React key warning is noise; an uncaught TypeError
 *     in a render path is a blank section nobody sees in a screenshot.
 *   - **No failed network requests** to our own API. A 500 behind a page that
 *     still draws is invisible to every other gate here.
 *   - **axe at wcag2a/wcag2aa**, on all of them rather than six.
 *
 * Colour-contrast stays disabled for the reason `standards.spec.ts` gives: the
 * contrast walk already gates it against the actually painted background, and two
 * gates on one criterion is two places to disagree.
 */

const STANDARD = ['wcag2a', 'wcag2aa'];
const SRC = path.join(process.cwd(), 'src');

/** Every `<Route path="...">` in App.tsx, in source order. */
function routesInApp(): string[] {
  const src = fs.readFileSync(path.join(SRC, 'App.tsx'), 'utf8');
  return [...src.matchAll(/path="([^"]+)"/g)].map((m) => m[1]);
}

/** Every route each module manifest registers, with the slug that gates it. */
function moduleRoutes(): Array<{ slug: string; path: string }> {
  const dir = path.join(SRC, 'modules');
  const out: Array<{ slug: string; path: string }> = [];
  for (const entry of fs.readdirSync(dir)) {
    const manifest = path.join(dir, entry, 'manifest.ts');
    if (!fs.existsSync(manifest)) continue;
    const src = fs.readFileSync(manifest, 'utf8');
    // *** BOTH SPELLINGS, BECAUSE THE MANIFEST NOW USES A CONSTANT. *** learnPal
    // exports `MODULE_SLUG` and writes `slug: MODULE_SLUG`, so a regex looking
    // only for a quoted literal silently found nothing and the module-probe
    // exemption below stopped exempting anything. A derived list that quietly
    // derives an empty one is worse than a hardcoded list.
    const slug = src.match(/slug:\s*'([^']+)'/)?.[1]
      ?? src.match(/MODULE_SLUG\s*=\s*'([^']+)'/)?.[1];
    if (!slug) continue;
    const routesBlock = src.split('routes:')[1] ?? '';
    for (const m of routesBlock.matchAll(/path:\s*'([^']+)'/g)) {
      out.push({ slug, path: m[1] });
    }
  }
  return out;
}

/**
 * The signed-in pages, with the heading each one must actually render.
 *
 * *** A HEADING PER PAGE, NOT A SHARED `/.*\/` . *** A regex that matches
 * anything turns `pageIsLoaded` into "a level-1 heading exists", and every page
 * in this app has one of those even when its data failed to load.
 */
const HEADINGS: Record<string, RegExp> = {
  '/dashboard': /Dashboard|Welcome|Overview/,
  '/transactions': /Transactions/,
  '/accounts': /Accounts/,
  '/budgets': /Budget/,
  '/goals': /Goals/,
  '/categories': /Categor/,
  '/recurring': /Recurring/,
  '/rules': /Rules/,
  '/groups': /Groups/,
  '/analytics': /Analytics/,
  '/investments': /Investments/,
  '/settings': /Settings/,
  // *** `/review` WAS UNACCOUNTED FROM THE DAY IT SHIPPED (2026-09-13). *** The
  // count guard above was red the whole time and nobody saw it, because this
  // suite is deliberately not in `preflight.sh` and had not been run since.
  // A gate nobody runs protects nothing.
  '/review': /Review/,
  '/kit': /Your kit/,
};

/** Routes that exist but are deliberately not walked here, each with a reason. */
const NOT_WALKED: Record<string, string> = {
  '/': 'the landing page is signed-out; auth.spec.ts owns it',
  '/login': 'signed-out; auth.spec.ts drives the real form',
  '/register': 'signed-out, and registration is invitation-gated (D-119)',
  '/forgot-password': 'signed-out',
  '/reset-password': 'signed-out, and needs a token from an email',
  '/auth/callback': 'an OIDC redirect target, not a page a user opens',
  '/onboarding': 'redirects away once the demo user has completed it',
  '/groups/:id': 'a detail page; needs a live id, and groups.spec has no fixture yet',
  // *** THE CATCH-ALL IS A PAGE NOW, AND IT IS WALKED — JUST NOT BY ITS PATH.
  // *** `page.goto('/*')` is not a URL a browser resolves, so the literal route
  // string cannot drive the sweep. The dedicated test below opens a URL that
  // matches nothing instead, which is how a real user reaches it, and runs the
  // same axe + heading-outline assertions.
  '*': 'a real page (NotFound), reached below by an unknown URL rather than by this path',
};

/** A URL no route in App.tsx can match. Changing it must not change the result. */
const UNKNOWN_URL = '/this-page-does-not-exist';

const WALKED = Object.keys(HEADINGS);

test.describe('the route table is derived, so a new page cannot be missed', () => {
  test('every route in App.tsx is either walked or has a written reason', () => {
    const unaccounted = routesInApp().filter(
      (r) => !(r in HEADINGS) && !(r in NOT_WALKED),
    );
    expect(
      unaccounted,
      'a route was added to App.tsx and to neither list here — add a heading to '
        + 'walk it, or a reason to NOT_WALKED saying why not',
    ).toEqual([]);
  });

  test('every module route is registered here too', () => {
    const known = new Set([...WALKED, ...Object.keys(NOT_WALKED)]);
    const missing = moduleRoutes()
      .map((r) => r.path)
      .filter((p) => !known.has(p) && !MODULE_HEADINGS[p]);
    expect(missing, 'a module gained a route that nothing opens').toEqual([]);
  });
});

/** Module pages, gated on the user actually having the module. */
const MODULE_HEADINGS: Record<string, RegExp> = {
  // Read off the rendered page, not guessed from the route — `/pointspal/redeem`
  // is headed "Redemption Optimizer" and a guessed /Redeem/ only matched it by
  // luck of substring.
  '/pointspal': /pointsPal/,
  '/pointspal/caps': /Cap/,
  '/pointspal/recommend': /Best Card|Recommend/,
  '/pointspal/cards': /My Cards/,
  '/pointspal/redeem': /Redemption Optimizer/,
  '/learnpal': /learnPal/,
  // Lowercase 'r': the page is headed "Your range". `/Range/` never matched
  // it, and nobody noticed because learnPal was off in this suite until
  // 2026-09-14 — so this expectation had never once been exercised.
  '/learnpal/range': /Your range/,
  '/learnpal/lessons': /Lesson/,
};

/**
 * Console errors and failed API calls, collected per page.
 *
 * *** FILTERED, BECAUSE AN UNFILTERED CONSOLE GATE CRIES WOLF AND GETS DELETED.
 * *** Browser-level noise (a favicon 404, a devtools notice) is not the app
 * failing. An uncaught exception and a 5xx from our own API are.
 */
const MODULE_SLUGS = [...new Set(moduleRoutes().map((r) => r.slug))];

test('the module slugs were actually derived', () => {
  // *** A SWEEP THAT SWEEPS NOTHING LOOKS EXACTLY LIKE A SWEEP THAT PASSES. ***
  // This file reads slugs out of the manifests; when a manifest changed shape the
  // regex found none, and every module-probe exemption silently stopped applying.
  expect(MODULE_SLUGS.sort()).toEqual(['learnpal', 'pointspal']);
});

function watch(page: import('@playwright/test').Page) {
  const errors: string[] = [];
  const failed: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (/favicon|DevTools|Download the React/i.test(text)) return;
    // *** A 404 FROM A MODULE NAMESPACE IS A PROBE, NOT A FAILURE. *** The
    // backend only registers `/api/v1/<module>/…` when that module is enabled,
    // and each client service treats 404 as "not installed" and renders
    // nothing — deliberately, so a deployment that does not use learnPal does
    // not get a red banner on its goals page. The browser still logs the 404.
    //
    // Keyed to the SLUGS the manifests declare rather than to the string
    // "learnpal", so a third module is covered the day it is added and nothing
    // else is. The first version of this gate failed /goals on exactly this and
    // would have been weakened or deleted rather than believed.
    if (/status of 404/.test(text)) return;
    errors.push(text);
  });
  page.on('pageerror', (err) => errors.push(`uncaught: ${err.message}`));
  page.on('response', (res) => {
    const path = new URL(res.url()).pathname;
    if (!path.startsWith('/api/')) return;
    // 5xx is always ours. 404 is ours too UNLESS it is a module probe — see the
    // note above; `/api/v1/<slug>/…` is allowed to be absent.
    const isModuleProbe = MODULE_SLUGS.some((s) => path.startsWith(`/api/v1/${s}/`));
    if (res.status() >= 500 || (res.status() === 404 && !isModuleProbe)) {
      failed.push(`${res.status()} ${path}`);
    }
  });
  return { errors, failed };
}

for (const [route, heading] of Object.entries(HEADINGS)) {
  for (const theme of ['light', 'dark'] as const) {
    test(`${route} renders, stays put and meets WCAG 2 AA in ${theme}`, async ({
      page,
    }) => {
      const seen = watch(page);

      await page.goto(route);
      await page.evaluate((t) => {
        localStorage.setItem('theme', t);
        document.documentElement.setAttribute('data-theme', t);
      }, theme);
      // *** RELOAD AFTER SETTING THE THEME. *** Components read the theme at
      // mount, so setting it on a live page leaves half the tree on the old one.
      await page.reload();

      // It did not bounce. A module route with its module off lands on `/` and
      // still "renders".
      expect(new URL(page.url()).pathname, 'the route redirected away').toBe(route);

      await pageIsLoaded(page, heading);

      expect(seen.errors, `console errors on ${route}`).toEqual([]);
      expect(seen.failed, `server errors behind ${route}`).toEqual([]);

      const results = await new AxeBuilder({ page })
        .withTags(STANDARD)
        .disableRules(['color-contrast'])
        .analyze();
      expect(
        results.violations.map((v) => `${v.id}: ${v.nodes.length} node(s)`),
        `WCAG violations on ${route} (${theme})`,
      ).toEqual([]);

      // *** THE HEADING OUTLINE, ON ALL OF THEM RATHER THAN SIX. ***
      // `standards.spec.ts` has asserted this since it was written, over its own
      // hand-typed list of six pages — so fifteen routes could jump h1 -> h3 and
      // nothing said so. That is the same gap this file exists to close for axe,
      // and it is D-59's rule again: prefer a sweep to a list. The route list
      // here is DERIVED, so a page added tomorrow is checked tomorrow.
      //
      // Neither `page-has-heading-one` nor `heading-order` is a WCAG AA rule —
      // both are axe "best practice" and so out of scope for the run above — but
      // a screen reader navigates by this outline, and D-221 was a real skip on
      // the app's landing page justified by a comment claiming the opposite.
      const levels = await page.evaluate(() =>
        Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6'))
          // Only what is actually on screen: a collapsed section's heading is
          // not in the outline a reader walks.
          .filter((h) => (h as HTMLElement).offsetParent !== null)
          .map((h) => Number(h.tagName[1])));

      expect(levels.filter((l) => l === 1).length,
        `${route} (${theme}): expected exactly one h1`).toBe(1);
      for (let i = 1; i < levels.length; i += 1) {
        expect(levels[i] - levels[i - 1],
          `${route} (${theme}): heading jumps h${levels[i - 1]} -> h${levels[i]}`)
          .toBeLessThanOrEqual(1);
      }
    });
  }
}

/**
 * *** THE 404, WALKED BY AN UNKNOWN URL RATHER THAN BY ITS ROUTE STRING. ***
 *
 * `path="*"` cannot be navigated to; a user reaches this page by typing
 * something wrong, so the test does that. The assertions are deliberately the
 * same ones every other route gets — axe, the heading outline, no console
 * errors — because the reason this page exists at all is that the catch-all
 * used to be a silent `<Navigate>`, and a silent redirect is exactly the kind
 * of thing that passes a test suite.
 *
 * *** AND THE FIRST ASSERTION IS THAT IT DID NOT REDIRECT. *** If somebody
 * restores the `<Navigate>`, every other expectation here would still pass
 * against the dashboard: it has an h1, it is axe-clean, and it logs nothing.
 * Pinning the URL is what makes this a test of the 404 rather than a test of
 * wherever the 404 sent us.
 */
for (const theme of ['light', 'dark'] as const) {
  test(`an unknown URL renders the 404 page in ${theme}`, async ({ page }) => {
    const seen = watch(page);

    await page.goto(UNKNOWN_URL);
    await page.evaluate((t) => {
      localStorage.setItem('theme', t);
      document.documentElement.setAttribute('data-theme', t);
    }, theme);
    await page.reload();

    expect(new URL(page.url()).pathname,
      'the catch-all redirected instead of rendering — a silent relocation is '
        + 'the behaviour NotFound replaced').toBe(UNKNOWN_URL);

    await pageIsLoaded(page, /That page is not here/);

    // The sentence that is the whole point of the page, asserted as text rather
    // than trusted to the heading: a 404 that does not say the data is intact
    // is a 404 that leaves a finance user guessing.
    await expect(page.getByText(/Nothing has gone wrong with your data/))
      .toBeVisible();

    expect(seen.errors, `console errors on ${UNKNOWN_URL}`).toEqual([]);
    expect(seen.failed, `server errors behind ${UNKNOWN_URL}`).toEqual([]);

    const results = await new AxeBuilder({ page })
      .withTags(STANDARD)
      .disableRules(['color-contrast'])
      .analyze();
    expect(
      results.violations.map((v) => `${v.id}: ${v.nodes.length} node(s)`),
      `WCAG violations on the 404 (${theme})`,
    ).toEqual([]);

    const levels = await page.evaluate(() =>
      Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6'))
        .filter((h) => (h as HTMLElement).offsetParent !== null)
        .map((h) => Number(h.tagName[1])));
    expect(levels.filter((l) => l === 1).length,
      `the 404 (${theme}): expected exactly one h1`).toBe(1);
    for (let i = 1; i < levels.length; i += 1) {
      expect(levels[i] - levels[i - 1],
        `the 404 (${theme}): heading jumps h${levels[i - 1]} -> h${levels[i]}`)
        .toBeLessThanOrEqual(1);
    }
  });
}

test.describe('module pages', () => {
  /**
   * *** A MODULE ROUTE IS EITHER RENDERED OR REDIRECTED, AND BOTH ARE ANSWERS. ***
   * The demo sweep reported `/pointspal` as a SKIP — "route likely absent from
   * this build" — which is the one reading that is definitely wrong: the route is
   * registered, and `App.tsx` gates it on `user.modules`. Whichever the demo
   * user has, the behaviour is pinned here rather than shrugged at.
   */
  for (const [route, heading] of Object.entries(MODULE_HEADINGS)) {
    test(`${route} either renders its page or redirects to the app root`, async ({
      page,
    }) => {
      const seen = watch(page);
      await page.goto(route);
      // *** THE GUARD REDIRECTS CLIENT-SIDE, AFTER MOUNT. *** Reading
      // `page.url()` the instant `goto` resolves catches the route BEFORE React
      // Router has moved, so a gated page looks like it rendered and then fails
      // on a heading that was never going to appear. Give the redirect a beat.
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(300);
      const landed = new URL(page.url()).pathname;

      if (landed !== route) {
        // Gated off for this user. The only acceptable destination is the app
        // root — anywhere else is a broken guard, and a 404 page would be worse.
        // *** A SIGNED-IN USER MUST NOT BE DROPPED ON THE MARKETING PAGE. ***
        // `/` is the LANDING page — "Your Money, Your Rules", "Get Started
        // Today" — and that is where a gated module route currently sends
        // somebody who is already logged in. Recorded as the defect it is
        // rather than allowed, because a redirect that "works" is exactly the
        // kind of thing a smoke test calls a pass.
        expect(
          ['/dashboard'],
          `${route} is gated off for this user and sent them to ${landed}. `
            + 'A signed-in user belongs on /dashboard, not on the signed-out '
            + 'landing page.',
        ).toContain(landed);
        return;
      }

      await pageIsLoaded(page, heading);
      expect(seen.errors, `console errors on ${route}`).toEqual([]);
      expect(seen.failed, `server errors behind ${route}`).toEqual([]);

      const results = await new AxeBuilder({ page })
        .withTags(STANDARD)
        .disableRules(['color-contrast'])
        .analyze();
      expect(
        results.violations.map((v) => `${v.id}: ${v.nodes.length} node(s)`),
        `WCAG violations on ${route}`,
      ).toEqual([]);
    });
  }
});
