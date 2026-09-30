/**
 * Everest is the central peak of the range, and is present for every user.
 *
 * *** THIS IS THE THIRD PLACEMENT, AND THE OWNER'S REASON IS THE STRONGEST OF
 * THE THREE. *** First a compact figure beside the purse, then its own card
 * below the range, now inside the range itself: *"this way no matter what mt
 * everest will be present for all users even those with no goals"*. That is
 * exactly the hole Everest exists to fill — a user with no goals had no
 * mountain at all, and they are base camp's own audience (D-205).
 *
 * *** THE CONCERN I RAISED TWICE DOES NOT GO AWAY BECAUSE THE DECISION WENT
 * THE OTHER WAY. *** One picture can blur money and effort. It is answered
 * here, and these are the answers this file pins:
 *   - Everest uses the ROCK token, never a goal's clay or green.
 *   - Its label is in METRES; the goals' are in money. The two never share a
 *     numeric scale and nothing pretends they do.
 *   - It carries no progress TRACK, only a marker — a track is a denominator.
 *
 * *** AND A PREVIOUS VERSION OF THIS FILE STOPPED TESTING WITHOUT FAILING. ***
 * It read a component that was later deleted, so it threw at import and vitest
 * reported "no tests" rather than an error: the suite went from 1085 to 1084
 * and still said green. Every path this file reads is asserted to exist first.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'fs';

const RANGE = 'src/components/dashboard/GoalRange.tsx';
const DASH = 'src/pages/Dashboard.tsx';

describe('Everest in the range', () => {
  it('reads files that actually exist, so this file cannot silently stop testing', () => {
    expect(existsSync(RANGE)).toBe(true);
    expect(existsSync(DASH)).toBe(true);
  });

  const range = () => readFileSync(RANGE, 'utf8');
  const dash = () => readFileSync(DASH, 'utf8');

  it('the range takes an everest prop and draws it', () => {
    expect(range()).toMatch(/everest\?:/);
    expect(range()).toMatch(/everestSlot/);
  });

  it('puts it in the MIDDLE slot, with goals either side', () => {
    expect(range()).toMatch(/Math\.floor\(ordered\.length \/ 2\)/);
  });

  it('renders for a user with NO goals, which is the whole reason', () => {
    // The old guard was `if (peaks.length === 0) return null`.
    expect(range()).toMatch(/peaks\.length === 0 && !climb\) return null/);
    // And the page stops branching to EmptyRange purely on goal count.
    expect(dash()).toMatch(/goals\.length > 0 \|\| everest\)/);
  });

  /**
   * Everest's own drawing block, from its opening IIFE to the comment that
   * begins the goal loop. Sliced narrowly on purpose: a first version of this
   * test sliced to `ordered.map`, which swept in the goals' own colours and
   * failed for the wrong reason.
   */
  const everestDrawing = () => {
    const src = range();
    const start = src.indexOf('{climb && (() => {');
    const end = src.indexOf('Tallest first, so shorter peaks', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    return src.slice(start, end);
  };

  it('uses the ROCK token, never a goal colour', () => {
    expect(everestDrawing()).toMatch(/--peak-unmeasured/);
    expect(everestDrawing()).not.toMatch(/--peak-cost|--peak-build/);
  });

  it('draws at ZERO altitude too, as base camp', () => {
    // *** THE CASE THE FIRST VERSION EXCLUDED. *** Gating on altitude > 0 hid
    // Everest from a brand-new user — no goals and no coins — who is exactly
    // the user the owner wants it present for. Decision 7: the empty state IS
    // base camp.
    expect(range()).toMatch(/const climb = everest \?\? null/);
    expect(range()).toMatch(/you are at base camp/);
  });

  it('labels itself in METRES, where the goals are in money', () => {
    expect(range()).toMatch(/summit_m\.toLocaleString\(\)\} m/);
    // The altitude line is now a ternary — metres when climbing, "base camp"
    // at zero — so match the metres branch rather than the old literal.
    expect(range()).toMatch(/you are at \$\{climb\.altitude_m\.toLocaleString\(\)\} m/);
  });

  it('carries a marker and no progress TRACK', () => {
    // A track behind the marker would be a denominator, and the only one this
    // product prints is the shop price.
    expect(everestDrawing()).toMatch(/<circle/);
    expect(everestDrawing()).not.toMatch(/<rect/);
  });

  it('names no hardcoded colour in EVEREST\'s block', () => {
    // *** SCOPED, BECAUSE THE FILE ALREADY HAS THREE HEXES AND THEY ARE FINE.
    // *** `#000000` at two stops of the shade gradient and `#ffffff` for snow
    // are deliberate: they are a shadow and snow, not theme colours, and they
    // read correctly on both themes. Asserting over the whole file would have
    // failed on pre-existing, correct code — which is how a gate gets weakened
    // to pass instead of tightened to be true.
    expect(everestDrawing()).not.toMatch(/#[0-9a-fA-F]{6}/);
  });

  it("Everest's snow is its own token, never the card colour — a hole on the dark card", () => {
    /* Owner screenshot 2026-09-26: in dark mode the cap was `--bg-card`, so the
       summit vanished into the background. */
    expect(range()).not.toMatch(/shape\.snow\}\s*fill="var\(--bg-card\)"/);
    expect(range()).toMatch(/shape\.snow\}\s*fill="var\(--peak-snow\)"/);
    const css = readFileSync('src/styles/finpal-theme.css', 'utf8');
    const dark = css.slice(css.indexOf('[data-theme="dark"]'));
    const snow = dark.match(/--peak-snow:\s*([^;]+);/);
    expect(snow, 'the dark theme sets --peak-snow').not.toBeNull();
    expect(snow![1]).not.toMatch(/bg-card/);
  });
});
