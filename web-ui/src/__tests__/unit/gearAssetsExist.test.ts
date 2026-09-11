/**
 * *** THE FILENAMES ARE A CONTRACT AND NOTHING ELSE ENFORCES THEM. ***
 *
 * `GearIcon` resolves `/gear/<slug>.svg` and falls back to an emoji when the
 * fetch fails. That fallback is deliberate and silent — which means a RENAMED
 * or MISSING file produces no error anywhere: the icon quietly becomes an
 * emoji and every test still passes. This is the only place that can notice.
 *
 * The slug is `learn_milestones.gear_slug` server-side, so a mismatch here is a
 * mismatch with seeded data.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { GEAR_EMOJI } from '../../components/GearIcon';

const DIR = join(__dirname, '..', '..', '..', 'public', 'gear');
const files = readdirSync(DIR).filter((f) => f.endsWith('.svg'));
const slugs = files.map((f) => f.replace(/\.svg$/, ''));

describe('gear assets', () => {
  it('ships a non-trivial number of icons', () => {
    // A detector that silently inspects nothing looks exactly like one that
    // passes.
    expect(files.length).toBeGreaterThan(15);
  });

  it('every drawn icon has an emoji fallback for the servers that lack it', () => {
    // A self-hoster on an older bundle has no SVG; the emoji is what they get.
    const orphaned = slugs.filter((s) => !GEAR_EMOJI[s]);
    expect(orphaned, `drawn but no emoji fallback: ${orphaned.join(', ')}`).toEqual([]);
  });

  it('every emoji slug has a drawing', () => {
    // The inverse. A slug with an emoji and no file renders as an emoji
    // forever, which is indistinguishable from "the art has not arrived yet".
    const undrawn = Object.keys(GEAR_EMOJI).filter((s) => !slugs.includes(s));
    expect(undrawn, `emoji but no SVG: ${undrawn.join(', ')}`).toEqual([]);
  });

  it('*** NO ICON HARDCODES A COLOUR ***', () => {
    // A surviving `fill="#000000"` is invisible in dark mode. Same bug class
    // as D-60, and the reason the whole set is traced to `currentColor`.
    const hardcoded = files.filter((f) =>
      /(fill|stroke)\s*=\s*"#[0-9a-fA-F]/.test(readFileSync(join(DIR, f), 'utf8')));
    expect(hardcoded, `hardcoded colour: ${hardcoded.join(', ')}`).toEqual([]);
  });

  it('every icon declares a viewBox and no fixed size', () => {
    // Without a viewBox the icon does not scale; with width/height it ignores
    // the `size` prop.
    for (const f of files) {
      const src = readFileSync(join(DIR, f), 'utf8');
      expect(src, f).toMatch(/viewBox="0 0 24 24"/);
      expect(src, f).not.toMatch(/<svg[^>]*\swidth=/);
    }
  });
});
