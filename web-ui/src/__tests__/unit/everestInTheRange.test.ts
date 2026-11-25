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
    expect(range()).toMatch(/data-testid="range-everest"/);
  });

  it('stands it at the back, with goals either side (Dashboard C: `heroRangeLayout.ts`)', () => {
    // Placement is the pure layout's (heroRangeLayout.test.ts); the drawing paints Everest before the goals so they
    // stand in front of it.
    const src = range();
    expect(src.indexOf('data-testid="range-everest"')).toBeLessThan(src.indexOf('data-testid="range-peak"'));
    expect(src).toMatch(/hasEverest: Boolean\(climb\)/);
  });

  it('renders for a user with NO goals, which is the whole reason', () => {
    expect(range()).toMatch(/peaks\.length === 0 && !climb\) return null/);
    expect(dash()).toMatch(/goals\.length > 0 \|\| everest\)/);
  });

  const everestDrawing = () => {
    const src = range();
    const start = src.indexOf('{layout.everest && (() => {');
    const end = src.indexOf('{/* The South Col route', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    return src.slice(start, end);
  };

  it('uses the ROCK token, never a goal colour', () => {
    expect(everestDrawing()).toMatch(/--peak-unmeasured/);
    expect(everestDrawing()).not.toMatch(/--peak-cost|--peak-build/);
  });

  it('draws at ZERO altitude too, as base camp', () => {
    expect(range()).toMatch(/const climb = everest \?\? null/);
    expect(range()).toMatch(/you are at base camp/);
  });

  it('labels itself in METRES, where the goals are in money', () => {
    expect(range()).toMatch(/climb\.summit_m\.toLocaleString\('en-US'\)\} m — the shared summit/);
    expect(range()).toMatch(/you are at \$\{climb\.altitude_m\.toLocaleString\('en-US'\)\} m/);
  });

  it('carries a marker on the real route and no progress TRACK', () => {
    // A track behind the marker would be a denominator. The marker is the climber, placed on the South Col route by
    // elevation from acts, never money.
    expect(range()).toMatch(/data-testid="range-climber"/);
    expect(range()).toMatch(/climbPoint\(layout\.everest\.place, climb\.altitude_m/);
    expect(everestDrawing()).not.toMatch(/<rect/);
  });

  it("names no hardcoded colour in EVEREST's block", () => {
    expect(everestDrawing()).not.toMatch(/#[0-9a-fA-F]{6}/);
  });

  it("Everest's snow is its own token, never the card colour — a hole on the dark card", () => {
    expect(range()).not.toMatch(/\.snow\}\s*fill="var\(--bg-card\)"/);
    expect(range()).toMatch(/EVEREST\.snow\}\s*fill="var\(--peak-snow\)"/);
    const css = readFileSync('src/styles/finpal-theme.css', 'utf8');
    const dark = css.slice(css.indexOf('[data-theme="dark"]'));
    const snow = dark.match(/--peak-snow:\s*([^;]+);/);
    expect(snow, 'the dark theme sets --peak-snow').not.toBeNull();
    expect(snow![1]).not.toMatch(/bg-card/);
  });
});
