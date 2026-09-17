/**
 * Everest and the goal range are different OBJECTS, not two sizes of one.
 *
 * *** THIS GATE IS THE PRICE OF AN OVERRIDE, AND IT IS WORTH PAYING. *** I
 * recommended Everest be a figure on the dashboard and drawn only on Kit,
 * because two mountain pictures on one page read as one confusing picture. The
 * owner decided it is drawn, in the middle (2026-09-17). The concern does not
 * disappear because the decision went the other way — it is answered by the
 * two drawings being visibly different things, and that is what this pins.
 *
 * `GoalRange` is MANY silhouettes on a ground line at varied heights, sized by
 * what each goal asks, from the user's money. `EverestPeak` is ONE peak with a
 * route and a climber on it, from their effort. If a later edit made Everest
 * reuse `MountainSilhouette`, or made the range draw a route, the distinction
 * would quietly collapse and the range would stop reading as the honest one.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const peak = readFileSync('src/components/dashboard/EverestPeak.tsx', 'utf8');
const dashboard = readFileSync('src/pages/Dashboard.tsx', 'utf8');

describe('Everest is not the range', () => {
  it('does not reuse the goal-range silhouettes', () => {
    expect(peak).not.toMatch(/MountainSilhouette/);
    expect(peak).not.toMatch(/mountainSilhouettes/);
  });

  it('draws ONE peak, not a range of them', () => {
    // A range is built by mapping; one mountain is a fixed path.
    expect(peak).not.toMatch(/\.map\(\s*\(?\s*(peak|mountain|goal)/);
  });

  it('carries a route and a climber, which the range never does', () => {
    expect(peak).toMatch(/strokeDasharray/);   // the unwalked route
    expect(peak).toMatch(/climberX/);
    expect(peak).toMatch(/climberY/);
  });

  it('prints metres and the public summit, never a percentage', () => {
    expect(peak).toMatch(/altitude_m/);
    expect(peak).toMatch(/summit_m/);
    // No "%" anywhere in what the user reads.
    expect(peak).not.toMatch(/}%|'%'|`%`/);
  });

  it('renders nothing at zero altitude', () => {
    expect(peak).toMatch(/altitude_m <= 0\) return null/);
  });

  it('sits between the page head and the section cards', () => {
    const head = dashboard.indexOf('</PageHead>');
    const everest = dashboard.indexOf('<EverestPeak />');
    const firstCard = dashboard.indexOf('<SectionCard');
    expect(head).toBeGreaterThan(-1);
    expect(everest).toBeGreaterThan(head);
    expect(everest).toBeLessThan(firstCard);
  });

  it('names no hardcoded colour, so both themes work', () => {
    // D-60's class: a hex here goes invisible in one theme.
    expect(peak).not.toMatch(/#[0-9a-fA-F]{3,6}/);
  });
});
