/**
 * Real mountains, drawn from real elevation: the geometry every finPal mountain shares (design move 3, 2026-11-20).
 *
 * *** THIS FILE DRAWS NOTHING AND IS BYTE-IDENTICAL IN THREE REPOS. *** finpal_core web-ui, finpal_premium web-ui
 * and finpal-mobile each hold a copy (separate git repos, nothing to import between them, the same convention as
 * `mountainGeometry.ts`). Change one, change all three, and `diff` them.
 *
 * *** WHAT CHANGED, AND WHAT DID NOT. *** The server still decides which mountain a goal is (`peak.mountain`, from
 * the seeded band table); nothing here re-derives that. What changed is the drawing: a goal's peak is now that
 * mountain's real profile (`peakProfiles.ts`, generated once from public elevation data) at its REAL height on a
 * shared metre scale, with contour lines every 1,000 m. The person's own height on the climb comes from acts
 * (`everest.altitude_m`), never from money, and is drawn on Everest, the climb everyone shares (8,849 m).
 *
 * *** ONE SCALE PER DRAWING, BOTH WAYS. *** A drawing picks one vertical px-per-metre and one horizontal
 * px-per-metre and applies them to every peak in it, so relative heights AND widths are true. The two differ (a
 * mountain 9 km high and 18 km wide drawn without exaggeration is a low hump), so every drawing is vertically
 * exaggerated, by the SAME factor for every peak in it, the way any published elevation profile is. That is
 * different in kind from the forbidden `preserveAspectRatio="none"`, which stretches each shape by its own box.
 */
import { PEAK_PROFILES, type PeakProfile } from './peakProfiles';

export const CONTOUR_STEP_M = 1000;
export const EVEREST_SLUG = 'everest';
export const EVEREST_M = 8849;

/** Which colour a peak takes. The colour carries the rule; the label still says it in words. */
export type RealPeakKind = 'saving' | 'debt' | 'everest' | 'unmeasured';

/**
 * Green for a saving goal, rust for a debt, grey for Everest (it is nobody's goal) and grey for a peak finPal
 * cannot measure (no rate stated: not a small mountain, no mountain at all).
 *
 * Keyed on the server's `scale` ('cost' is a debt), never on `Goal.kind`, which is presentation-only.
 */
export function realPeakKind(peak: { scale?: string | null; unmeasured?: boolean | null } | null | undefined,
  isEverest = false): RealPeakKind {
  if (isEverest) return 'everest';
  if (!peak || peak.unmeasured) return 'unmeasured';
  return peak.scale === 'cost' || peak.scale === 'paydown' ? 'debt' : 'saving';
}

/** The real profile for a catalogue slug, or null for a slug the catalogue does not hold. */
export function profileFor(slug: string | null | undefined): PeakProfile | null {
  if (!slug) return null;
  return Object.prototype.hasOwnProperty.call(PEAK_PROFILES, slug) ? PEAK_PROFILES[slug] : null;
}

/** The server's band order (`BAND_ORDER` in `src/services/goal/mountains.py`): band index to catalogue slug. */
export const BAND_SLUGS = ['table-mountain', 'ben-nevis', 'mount-fuji', 'mount-rainier', 'aconcagua', 'everest'];

/**
 * The profile for a goal's `peak` payload: by the server's mountain slug, else by its band index (an older payload
 * may carry the mountain's name without its slug). Null when unmeasured: no rate stated means no mountain.
 */
export function profileForPeak(peak: { unmeasured?: boolean | null; band?: number | null;
  mountain?: { slug?: string | null } | null } | null | undefined): PeakProfile | null {
  if (!peak || peak.unmeasured) return null;
  return profileFor(peak.mountain?.slug)
    ?? (peak.band != null && peak.band >= 0 ? profileFor(BAND_SLUGS[peak.band]) : null);
}

/** Where a profile sits in a drawing. `pxPerM` is vertical, `pxPerMx` horizontal; both shared by every peak. */
export interface ProfileFrame {
  /** Left edge of the transect, in drawing units. */
  x: number;
  /** The y of sea level (0 m). */
  groundY: number;
  /** Vertical: drawing units per metre of elevation. */
  pxPerM: number;
  /** Horizontal: drawing units per metre along the ground. */
  pxPerMx: number;
}

/** The y of an elevation. */
export const elevationY = (frame: ProfileFrame, metres: number): number => frame.groundY - metres * frame.pxPerM;

/** Width of a profile in a frame. */
export const profileWidth = (profile: PeakProfile, frame: Pick<ProfileFrame, 'pxPerMx'>): number =>
  profile.length_m * frame.pxPerMx;

const r1 = (n: number) => Math.round(n * 10) / 10;

/** The profile's points in drawing units. */
export function profilePoints(profile: PeakProfile, frame: ProfileFrame): Array<[number, number]> {
  return profile.points.map(([d, e]) => [r1(frame.x + d * frame.pxPerMx), r1(elevationY(frame, e))]);
}

/** The lowest ground the transect crosses, in metres. Below it the drawing has no data. */
export const profileFloor = (profile: PeakProfile): number => Math.min(...profile.points.map((p) => p[1]));

/**
 * The mountain itself: the skyline, closed along the profile's OWN floor (the lowest ground it crosses).
 *
 * *** NOT CLOSED TO SEA LEVEL. *** Everest's transect never drops below about 5,200 m and Aconcagua's below about
 * 4,100 m; filling them solid to 0 m drew five-kilometre walls at the transect's ends, which is not terrain anybody
 * has seen. The part between the floor and sea level is drawn by `footPath` and faded, so the true height is still
 * readable against the scale without inventing slopes the data does not have.
 */
export function bodyPath(profile: PeakProfile, frame: ProfileFrame): string {
  const pts = profilePoints(profile, frame);
  const floorY = r1(elevationY(frame, profileFloor(profile)));
  const first = pts[0];
  const last = pts[pts.length - 1];
  return `M${first[0]},${floorY} ${pts.map(([x, y]) => `L${x},${y}`).join(' ')} L${last[0]},${floorY} Z`;
}

/** The column from the profile's floor down to sea level, for a fade. Empty when the floor is at sea level. */
export function footPath(profile: PeakProfile, frame: ProfileFrame): string {
  const floor = profileFloor(profile);
  if (floor <= 0) return '';
  const pts = profilePoints(profile, frame);
  const x0 = pts[0][0];
  const x1 = pts[pts.length - 1][0];
  const top = r1(elevationY(frame, floor));
  const g = r1(frame.groundY);
  return `M${x0},${top} L${x1},${top} L${x1},${g} L${x0},${g} Z`;
}

/** The skyline only, as an open line (for an outline stroke or a draw-on animation). */
export function skylinePath(profile: PeakProfile, frame: ProfileFrame): string {
  return profilePoints(profile, frame).map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join(' ');
}

/** Contour levels every `step` metres strictly below `topM`: 1,000, 2,000, ... */
export function contourLevels(topM: number, step = CONTOUR_STEP_M): number[] {
  const out: number[] = [];
  for (let m = step; m < topM; m += step) out.push(m);
  return out;
}

/**
 * The height scale's labelled ticks for a drawing whose tallest point is `topM`: every 2,000 m from 1,000
 * (1,000, 3,000, 5,000, 7,000) when the drawing reaches above 4,000 m, otherwise every 1,000 m. Unlabelled lines
 * still run every 1,000 m (`contourLevels`); this only thins the numbers so they do not crowd.
 */
export function scaleTicks(topM: number): number[] {
  const all = contourLevels(topM + 1);
  return topM > 4000 ? all.filter((m) => (m / 1000) % 2 === 1) : all;
}

/**
 * Where the climber stands for an altitude in metres: walking the left flank, the first place the skyline reaches
 * that elevation, at that elevation (so the dot sits at the person's REAL height on the scale).
 *
 * Below the profile's lowest ground (Everest's transect starts near 5,200 m, and a new climber is at 0 m) the dot
 * sits at the transect's left edge, still at its true height, inside the faded foot. Above the summit it is the
 * summit.
 */
export function climberPoint(profile: PeakProfile, frame: ProfileFrame, altitudeM: number): { x: number; y: number } {
  const pts = profile.points;
  let top = 0;
  pts.forEach((p, i) => { if (p[1] > pts[top][1]) top = i; });
  const alt = Math.max(0, Math.min(altitudeM, pts[top][1]));
  const at = (d: number, e: number) => ({ x: r1(frame.x + d * frame.pxPerMx), y: r1(elevationY(frame, e)) });
  if (alt <= pts[0][1]) return at(pts[0][0], alt);
  for (let i = 1; i <= top; i++) {
    const [d0, e0] = pts[i - 1];
    const [d1, e1] = pts[i];
    if (e1 >= alt && e0 < alt) {
      const t = (alt - e0) / (e1 - e0);
      return at(d0 + (d1 - d0) * t, alt);
    }
  }
  return at(pts[top][0], pts[top][1]);
}

/** The summit's position in a frame (for a label). */
export function summitPoint(profile: PeakProfile, frame: ProfileFrame): { x: number; y: number } {
  let top = 0;
  profile.points.forEach((p, i) => { if (p[1] > profile.points[top][1]) top = i; });
  const [d, e] = profile.points[top];
  return { x: r1(frame.x + d * frame.pxPerMx), y: r1(elevationY(frame, e)) };
}

/**
 * Lay a row of profiles out left to right on ONE horizontal scale, overlapping like a range.
 *
 * `overlap` is the share of the narrower neighbour's width that two neighbours share. Returns each profile's left
 * x and the scale, chosen so the whole row (plus `padding` each side) fits `width`. Pure, so the range and its
 * tests agree on where every peak stands.
 */
export function layoutRow(profiles: PeakProfile[], width: number, padding = 0, overlap = 0.22):
  { xs: number[]; pxPerMx: number } {
  if (profiles.length === 0) return { xs: [], pxPerMx: 0 };
  // Total length in metres once overlaps are taken out.
  let metres = profiles[0].length_m;
  for (let i = 1; i < profiles.length; i++) {
    metres += profiles[i].length_m - overlap * Math.min(profiles[i - 1].length_m, profiles[i].length_m);
  }
  const pxPerMx = (width - 2 * padding) / metres;
  const xs: number[] = [padding];
  for (let i = 1; i < profiles.length; i++) {
    const shared = overlap * Math.min(profiles[i - 1].length_m, profiles[i].length_m);
    xs.push(xs[i - 1] + (profiles[i - 1].length_m - shared) * pxPerMx);
  }
  return { xs: xs.map(r1), pxPerMx };
}

/** "<goal> · <peak> <elevation> m", with the number formatted by the caller's locale formatter. */
export function rangeLabel(goalName: string, peakName: string, elevationM: number,
  formatNumber: (n: number) => string): string {
  return `${goalName} · ${peakName} ${formatNumber(elevationM)} m`;
}

/**
 * A real profile as a GLYPH in a fixed box: the outline of `profile`, scaled so its transect spans `boxW` and its
 * relief (lowest ground to summit) spans from `boxH` up to `summitY`. For the places that draw a mountain as a
 * shape rather than to a height scale (a goal card's backdrop, the sign-in horizon, empty states, onboarding):
 * the outline is the real one, and the caller still scales the whole box uniformly. The summit lands at the
 * profile's own summit x, not at the box's centre.
 */
export function boxSilhouette(profile: PeakProfile, boxW: number, boxH: number, summitY: number): string {
  const floor = profileFloor(profile);
  const relief = Math.max(1, profile.elevation_m - floor);
  const pts = profile.points.map(([d, e]) => [
    r1((d / profile.length_m) * boxW),
    r1(boxH - ((e - floor) / relief) * (boxH - summitY)),
  ]);
  return `M0,${boxH} ${pts.map(([x, y]) => `L${x},${y}`).join(' ')} L${boxW},${boxH} Z`;
}

/** The points of `boxSilhouette`'s outline (summit included), for placing things on it. */
export function boxOutline(profile: PeakProfile, boxW: number, boxH: number, summitY: number): Array<[number, number]> {
  const floor = profileFloor(profile);
  const relief = Math.max(1, profile.elevation_m - floor);
  return profile.points.map(([d, e]) => [
    r1((d / profile.length_m) * boxW),
    r1(boxH - ((e - floor) / relief) * (boxH - summitY)),
  ]);
}
