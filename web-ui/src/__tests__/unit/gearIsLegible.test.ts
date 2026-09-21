/**
 * The artwork is finished and good. It must not be rendered too small to see.
 *
 * *** THIS IS A RECORDED FINDING, NOT A STYLE OPINION. *** The coins design
 * measured that the 21 gear drawings ship "rendered at ~14px in a row of five,
 * where it is illegible", and called it "a sizing decision, not a missing
 * asset". Nothing enforced the decision, so this does.
 *
 * *** A BADGE NEEDS A BIGGER `size` THAN BARE GEAR FOR THE SAME LEGIBILITY. ***
 * `BadgeIcon` insets the glyph to 58% so its ring stays visible, so a 20px
 * badge is an 11.6px drawing — smaller than the thing the finding complained
 * about. The floors below are on the GLYPH, worked back to the prop.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/** Minimum legible glyph, in px. */
const MIN_GLYPH = 18;
/** `BadgeIcon` renders its glyph at 58% of `size` — keep in step with it. */
const BADGE_INSET = 0.58;
const MIN_BADGE_SIZE = Math.ceil(MIN_GLYPH / BADGE_INSET); // 32

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.tsx$/.test(entry) ? [full] : [];
  });
}

const files = walk('src').filter(
  (f) => !f.includes('__tests__')
    && !f.endsWith('GearIcon.tsx')
    && !f.endsWith('BadgeIcon.tsx')
);

type Site = { file: string; component: string; size: number };

const sites: Site[] = [];
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/<(GearIcon|BadgeIcon)\b[^>]*?size=\{(\d+)\}/g)) {
    sites.push({ file, component: m[1], size: Number(m[2]) });
  }
}

describe('gear and badges render at a legible size', () => {
  it('finds render sites at all — otherwise this file is vacuous', () => {
    expect(sites.length).toBeGreaterThan(3);
  });

  it('the inset here matches BadgeIcon, or the floor is wrong', () => {
    const badge = readFileSync('src/components/BadgeIcon.tsx', 'utf8');
    expect(badge).toContain(`size * ${BADGE_INSET}`);
  });

  for (const { file, component, size } of sites) {
    const floor = component === 'BadgeIcon' ? MIN_BADGE_SIZE : MIN_GLYPH;
    it(`${file} renders ${component} at ${size}, floor ${floor}`, () => {
      expect(size).toBeGreaterThanOrEqual(floor);
    });
  }
});
