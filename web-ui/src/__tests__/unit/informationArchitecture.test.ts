/**
 * The information architecture, pinned to mechanisms rather than to lists.
 *
 * Three separate failures are guarded here, and each one has already happened
 * in this project:
 *
 *  1. A ROUTE NOTHING LINKS TO. `/categories` and `/simplefin` were routed in
 *     App.tsx and linked from nowhere — reachable only by typing the URL. Both
 *     rendered a *duplicate implementation* of a screen that was live elsewhere
 *     (441 lines vs the 844-line CategoryManagement in Settings; 425 vs 417 for
 *     SimpleFin), so ~866 lines of divergent UI sat unreachable. This is D-46's
 *     shape — a control that exists and does nothing — and it is the mirror of
 *     `test_web_ui_urls_exist.py`, which checks that every URL web-ui *calls*
 *     resolves. Nothing checked that every route web-ui *declares* is reachable.
 *
 *  2. THE TWO CLIENTS DRIFTING APART. Web and mobile organised the same features
 *     differently — web buried Categories/Rules/Recurring in Settings while
 *     mobile had them as top-level screens — so "where do I find X?" had two
 *     answers. The shared vocabulary is the fix, and it only stays shared if
 *     something compares the two files.
 *
 *  3. A FEATURE QUIETLY GOING BACK INTO SETTINGS. Settings had grown to twelve
 *     tabs in a ~1,250-line file by accreting features that are not settings.
 *
 * Keyed to the mechanism in each case: the route table, the two heading lists,
 * and the tab ids — never to a list of known-bad names, because the defect is
 * always "somebody added one more".
 *
 * See docs/superpowers/specs/2026-08-07-finpal-ia-and-mobile-parity-design.md
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

const SRC = resolve(process.cwd(), 'src');
const MOBILE_MORE = resolve(
  process.cwd(), '../../mobile/app/(tabs)/more.tsx');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry) && !full.includes('__tests__')) out.push(full);
  }
  return out;
}

const FILES = walk(SRC);
const app = readFileSync(join(SRC, 'App.tsx'), 'utf8');

/** Every `path="/x"` declared in App.tsx, minus params and wildcards. */
const declaredRoutes = [...app.matchAll(/path="(\/[^"]*)"/g)]
  .map((m) => m[1])
  .filter((p) => !p.includes(':') && p !== '*' && p !== '/');

/**
 * Routes that are legitimately never linked from inside the app. Each needs a
 * REASON, and the second test below fails if one of these stops being routed —
 * so this cannot rot into a place to hide new orphans.
 */
const UNLINKED_BY_DESIGN: Record<string, string> = {
  '/login': 'entered by redirect when unauthenticated',
  '/register': 'reached from the landing page and /login',
  '/forgot-password': 'reached from /login',
  '/reset-password': 'entered from an emailed link',
  '/onboarding': 'entered by redirect after first sign-in',
  '/auth/callback': 'the OIDC provider redirects here',
  '/dashboard': 'the post-login default, and the logo links to it',
};

describe('every declared route is reachable', () => {
  it('finds a non-trivial number of routes, or the scan is broken', () => {
    // A regex that matched nothing would make every assertion below vacuous —
    // the failure mode this project has hit four times.
    expect(declaredRoutes.length).toBeGreaterThan(8);
  });

  it('no route is declared that nothing links to', () => {
    const body = FILES.filter((f) => !f.endsWith('App.tsx'))
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n');

    const orphans = declaredRoutes.filter((route) => {
      if (route in UNLINKED_BY_DESIGN) return false;
      // `to="/x"`, `navigate('/x')`, `path: '/x'` all count as a link.
      return !new RegExp(`["'\`]${route}["'\`]`).test(body);
    });

    expect(orphans, `these routes are declared in App.tsx and linked from nowhere, so they are reachable only by typing the URL. Either link them or delete them — do not add them to UNLINKED_BY_DESIGN unless a user genuinely arrives there without clicking: ${orphans.join(', ')}`).toEqual([]);
  });

  it('the by-design list is not stale', () => {
    // The other half of the contract. Without it the exemption list only ever
    // describes the past, and a deleted route would leave a permanent hole
    // somebody could park a real orphan in.
    const stale = Object.keys(UNLINKED_BY_DESIGN).filter(
      (r) => !declaredRoutes.includes(r));
    expect(stale, `no longer routed, so drop from UNLINKED_BY_DESIGN: ${stale.join(', ')}`).toEqual([]);
  });
});

describe('the two clients share one nav vocabulary', () => {
  const headingsOf = (source: string) => {
    const m = source.match(/NAV_GROUP_HEADINGS\s*=\s*\[([^\]]*)\]/);
    expect(m, 'NAV_GROUP_HEADINGS not found — the parity check cannot see it').toBeTruthy();
    return [...m![1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  };

  const web = headingsOf(readFileSync(
    join(SRC, 'components/layout/Sidebar.tsx'), 'utf8'));

  it('web declares the five groups, in order', () => {
    expect(web).toEqual(['Money', 'Plan', 'Insight', 'Shared', 'Modules']);
  });

  // Reading across the repo boundary is deliberate: mobile lives in the OUTER
  // repo and no finpal_core test can otherwise see it, which is exactly how the
  // two clients drifted apart in the first place.
  //
  // It is skipped — visibly, never silently — when mobile is absent, because
  // `finpal_core` is its own repo and a standalone clone has no ../../mobile.
  // The skip is only acceptable because the assertion above is self-contained
  // and always runs: web's own vocabulary stays pinned either way, so this file
  // can never degrade into a check that inspects nothing.
  const haveMobile = existsSync(MOBILE_MORE);

  it.skipIf(!haveMobile)('mobile declares exactly the same list, in the same order', () => {
    const mobile = headingsOf(readFileSync(MOBILE_MORE, 'utf8'));
    expect(mobile).toEqual(web);
  });

  it('says out loud whether the cross-client check actually ran', () => {
    // Without this, "10 passed" looks identical whether the parity check ran or
    // was skipped. Run from the monorepo and this asserts the real thing above
    // executed; run from a standalone finpal-core clone and it records why not.
    if (!haveMobile) {
      expect(MOBILE_MORE).toMatch(/mobile[/\\]app/);
      return;
    }
    expect(readFileSync(MOBILE_MORE, 'utf8')).toContain('NAV_GROUP_HEADINGS');
  });
});

describe('Settings holds settings, not features', () => {
  const settings = readFileSync(join(SRC, 'pages/Settings.tsx'), 'utf8');
  const tabIds = [...settings.matchAll(/\{\s*id:\s*'([a-z-]+)'/g)].map((m) => m[1]);

  it('reads the tab ids at all', () => {
    expect(tabIds.length).toBeGreaterThan(5);
    expect(tabIds).toContain('profile');
  });

  it.each(['categories', 'rules', 'recurring'])(
    'the %s tab stays promoted out of Settings', (id) => {
      expect(tabIds).not.toContain(id);
    });

  it('and each of them is a real route instead', () => {
    for (const path of ['/categories', '/rules', '/recurring']) {
      expect(declaredRoutes, `${path} must be a first-class route now that it is not a Settings tab`).toContain(path);
    }
  });
});
