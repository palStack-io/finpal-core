/**
 * Every badge the backend can award must have a drawing that exists.
 *
 * *** THE LIST IS DERIVED FROM `badges.py`, NOT TYPED OUT HERE. *** A
 * hardcoded copy goes stale the first time somebody adds a badge, and this
 * defect's whole shape was a slug with no file behind it — a second hand-kept
 * list is the same bug waiting. `every-page.spec.ts` derives its routes from
 * `App.tsx` for the same reason, and that is what caught `/welcome`.
 *
 * *** IT CHECKS THE FILE ON DISK. *** "We mapped it to `signpost`" is a claim
 * about source; `public/gear/signpost.svg` existing is the thing that makes an
 * icon appear. The bullet fallback that shipped to the demo passed every test
 * that only read the map.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { BADGE_GLYPH, badgeGlyph } from '../../utils/badgeGlyph';

/**
 * Every badge slug the server can award — CORE **and** MODULES.
 *
 * *** THE FIRST VERSION READ CORE'S DICT ONLY, AND WAS THEREFORE BLIND TO
 * THE CASE THAT BROKE. *** pointsPal's three contributor badges arrive at
 * runtime through `PointsPalModule.get_badges()` and `register_badge`, so
 * they are never in `BADGES = {` at rest. All three shipped with no glyph
 * mapping and no artwork — a bullet on web, nothing at all on mobile — while
 * this test stayed green. A gate that cannot see the failure it was written
 * for is worse than no gate, because it is believed.
 *
 * So the sweep reads every `get_badges()` in the module tree as well, and
 * asserts it FOUND some — a regex that matches nothing turns a derived list
 * into an empty one, which passes everything.
 */
function badgeSlugsFromBackend(): string[] {
  const core = readFileSync(join(process.cwd(), '../src/services/literacy/badges.py'), 'utf8');
  const body = core.slice(core.indexOf('BADGES = {'), core.indexOf('\ndef register_badge'));
  const slugs = [...body.matchAll(/^ {4}'([a-z0-9-]+)': \(/gm)].map((m) => m[1]);

  const moduleDir = join(process.cwd(), '../src/modules');
  for (const mod of readdirSync(moduleDir)) {
    const file = join(moduleDir, mod, 'badges.py');
    if (!existsSync(file)) continue;
    const src = readFileSync(file, 'utf8');
    const returned = src.slice(src.indexOf('def get_badges'));
    slugs.push(...[...returned.matchAll(/^ {8}'([a-z0-9-]+)': \(/gm)].map((m) => m[1]));
  }
  return slugs;
}

describe('badge glyphs', () => {
  const slugs = badgeSlugsFromBackend();

  it('reads the backend list at all — otherwise this file is vacuous', () => {
    /* A regex that matches nothing turns a derived list into an empty one,
       which passes everything. That is the exact trap `every-page.spec.ts`
       records hitting. */
    expect(slugs.length).toBeGreaterThanOrEqual(5);
    expect(slugs).toContain('goal-reached');
    /* *** AND A MODULE ONE, OR THE SWEEP IS READING CORE ONLY AGAIN. ***
       This single assertion is the difference between the gate that missed
       the contributor badges and the one that would have caught them. */
    expect(slugs).toContain('map-maker');
  });

  it('maps every badge to a gear slug', () => {
    expect(slugs.filter((s) => !(s in BADGE_GLYPH))).toEqual([]);
  });

  it('maps every badge to a file that EXISTS on disk', () => {
    const missing = slugs.filter(
      (s) => !existsSync(join(process.cwd(), 'public', 'gear', `${badgeGlyph(s)}.svg`)));
    expect(missing).toEqual([]);
  });

  it('loads badge art from /badges/, and gear art only as a FALLBACK', () => {
    /* *** THE SPEC AND THE CODE DISAGREED, AND THE CODE WOULD HAVE WON
       SILENTLY. *** `2026-09-17-contributor-badge-art-prompt.md` has always
       said badge art goes to `public/badges/<slug>.svg`. `BadgeIcon`
       delegated straight to `GearIcon`, which only ever reads `/gear/` — so
       a correctly-generated file dropped where the spec said would have
       rendered nothing at all, on both clients.

       Two directories is also the right shape: it is what stops a badge and
       a purchasable gear piece ever being the same file — D-219 in storage
       rather than on screen. */
    const src = readFileSync(join(process.cwd(), 'src/components/BadgeIcon.tsx'), 'utf8');
    expect(src).toMatch(/\/badges\/\$\{slug\}\.svg/);
    // And the fallback survives, or every badge goes blank until art lands.
    expect(src).toMatch(/badgeGlyph\(/);
  });

  it('passes an unknown slug through rather than inventing a picture', () => {
    /* A module-registered badge has no entry. Handing it somebody else's
       drawing would say something false about it; an empty disc says nothing,
       which is the honest answer. */
    expect(badgeGlyph('a-badge-a-module-added')).toBe('a-badge-a-module-added');
  });
});
