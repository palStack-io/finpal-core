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
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { BADGE_GLYPH, badgeGlyph } from '../../utils/badgeGlyph';

/** `'slug': (` in the BADGES dict — the same shape `register_badge` adds to. */
function badgeSlugsFromBackend(): string[] {
  const src = readFileSync(join(process.cwd(), '../src/services/literacy/badges.py'), 'utf8');
  const body = src.slice(src.indexOf('BADGES = {'), src.indexOf('\ndef register_badge'));
  return [...body.matchAll(/^ {4}'([a-z0-9-]+)': \(/gm)].map((m) => m[1]);
}

describe('badge glyphs', () => {
  const slugs = badgeSlugsFromBackend();

  it('reads the backend list at all — otherwise this file is vacuous', () => {
    /* A regex that matches nothing turns a derived list into an empty one,
       which passes everything. That is the exact trap `every-page.spec.ts`
       records hitting. */
    expect(slugs.length).toBeGreaterThanOrEqual(5);
    expect(slugs).toContain('goal-reached');
  });

  it('maps every badge to a gear slug', () => {
    expect(slugs.filter((s) => !(s in BADGE_GLYPH))).toEqual([]);
  });

  it('maps every badge to a file that EXISTS on disk', () => {
    const missing = slugs.filter(
      (s) => !existsSync(join(process.cwd(), 'public', 'gear', `${badgeGlyph(s)}.svg`)));
    expect(missing).toEqual([]);
  });

  it('passes an unknown slug through rather than inventing a picture', () => {
    /* A module-registered badge has no entry. Handing it somebody else's
       drawing would say something false about it; an empty disc says nothing,
       which is the honest answer. */
    expect(badgeGlyph('a-badge-a-module-added')).toBe('a-badge-a-module-added');
  });
});
