/**
 * learnPal renders BADGES; the shop renders GEAR. The two must stay distinct.
 *
 * *** THIS IS D-219 AS A TEST, AND THE DEFECT SHIPPED. *** Measured
 * 2026-09-15: `LearnMilestone.gear_slug` held 19 slugs, `GEAR_PRICES` held 21,
 * and the intersection was 19 — learnPal handed out, free, the same objects
 * the shop sells for 700 to 2,400 coins. The design has two reward types
 * precisely because *"a badge is a stamped disc you were given and gear is
 * equipment you bought"*, and because *"studying cannot flatter your
 * finances"*. Neither held in the code.
 *
 * Owner decision 2026-09-17: badges reuse the glyph inside a disc. This gate
 * is what stops a later edit quietly reaching for `GearIcon` in learnPal again
 * — which would look completely fine and silently undo the distinction.
 *
 * *** IT CHECKS THE RENDERING, NOT THE SLUGS. *** The slugs are deliberately
 * shared (that is the point of reusing the artwork), so a slug-based check
 * would either pass always or fail always. What must differ is what a user
 * SEES.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

const learnpalFiles = walk('src/modules/learnpal')
  .filter((f) => !f.includes('__tests__') && !/\.test\./.test(f));

describe('badges are not gear', () => {
  it('finds learnPal source at all — otherwise this file is vacuous', () => {
    expect(learnpalFiles.length).toBeGreaterThan(3);
  });

  it('learnPal renders no <GearIcon> anywhere', () => {
    const offenders = learnpalFiles.filter((f) =>
      /<GearIcon\b/.test(readFileSync(f, 'utf8'))
    );
    expect(offenders).toEqual([]);
  });

  it('learnPal does render badges, so the swap actually happened', () => {
    const withBadges = learnpalFiles.filter((f) =>
      /<BadgeIcon\b/.test(readFileSync(f, 'utf8'))
    );
    expect(withBadges.length).toBeGreaterThan(0);
  });

  it('BadgeIcon is visibly a disc, not a bare glyph', () => {
    // If a later edit strips the ring, a badge becomes indistinguishable from
    // equipment at a glance and the distinction is only a caption again.
    const src = readFileSync('src/components/BadgeIcon.tsx', 'utf8');
    expect(src).toMatch(/borderRadius:\s*'50%'/);
    expect(src).toMatch(/border:/);
  });

  it('the Kit shop still renders GEAR, not badges', () => {
    const kit = readFileSync('src/pages/Kit.tsx', 'utf8');
    expect(kit).toMatch(/<GearIcon\b/);
    expect(kit).not.toMatch(/<BadgeIcon\b/);
  });
});
