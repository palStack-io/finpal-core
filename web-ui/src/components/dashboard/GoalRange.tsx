import React, { useEffect, useId, useState } from 'react';
import { ScrollPane } from '../ScrollPane';

import { RANGE_UNMEASURED } from '../../utils/rangeSilhouettes';
import {
  EVEREST_M, EVEREST_SLUG, bodyPath, climberPoint, contourLevels, elevationY, footPath, layoutRow, profileFor, profileForPeak,
  rangeLabel, realPeakKind, scaleTicks, skylinePath, summitPoint, type ProfileFrame, type RealPeakKind,
} from '../../utils/realRange';
import type { PeakProfile } from '../../utils/peakProfiles';
import { formatMoney } from '../../styles/money';
import { peakElevation, peakKindLabel, peakPayoffLine } from '../../utils/peakCopy';
import type { Goal } from '../../types/goal';

/**
 * Every goal, drawn as ONE range.
 *
 * *** THE FIRST VERSION OF THIS WAS FOUR SEPARATE PEAKS IN A FLEX ROW, AND IT
 * READ AS CLIP-ART. *** Each `MountainSilhouette` rendered its own `<svg>` in
 * its own box with a gap beside it, so what arrived on the page was four icons
 * in a line — not a landscape. The owner's word for it was "absurd", and the
 * mockup (`docs/mockups/dashboard-web.html`) shows why: a range is peaks that
 * OVERLAP on a SHARED ground line, with the sky behind them.
 *
 * So this draws one SVG.
 *
 * *** REAL MOUNTAINS, DRAWN FROM REAL ELEVATION (design move 3, approved 2026-11-20). *** Each goal is the
 * mountain the server mapped it to (`peak.mountain`), drawn from that mountain's real elevation profile
 * (`utils/peakProfiles.ts`, generated once from public elevation data) at its REAL height: one metre scale for the
 * whole picture, contour lines every 1,000 m, a height scale on the left. Green for saving, rust for debt, grey
 * for Everest. The geometry is `utils/realRange.ts`, shared byte-for-byte with core and mobile.
 *
 * *** HEIGHT IS NO LONGER DRAWN FROM MONEY. *** It used to be `heightForMagnitude` (a cube root of the money
 * figure); now the money picks the mountain, as it always did, and the mountain is drawn as tall as it really is.
 * The ONE marker is the climber on Everest, at the person's altitude from acts. The old second climber (a money
 * percentage drawn as a height on the tallest goal) is gone: height from acts, never money.
 *
 * *** NO DENOMINATOR. *** No "2 of 4 goals", no percentage across the range.
 * Decision 5 permits one denominator — a target the user chose — and each peak
 * prints its own real figure above it.
 */

/** The drawing box. Height is fixed; width grows with the number of peaks. */
const BOX_HEIGHT = 300;
const LABEL_BAND = 62;      // room above the tallest summit for its label block
const GROUND_Y = BOX_HEIGHT - 12;
/** Room on the left for the height scale's numbers. */
const SCALE_GUTTER = 52;
/**
 * A goal finPal cannot measure has no mountain, so it has no profile. It still needs a footprint in the row; this
 * is that width in metres, the same as a small real peak, and it is never drawn as terrain.
 */
const UNMEASURED_LENGTH_M = 7000;

interface RangePeak {
  goal: Goal;
  /** The real mountain the server mapped this goal to, or null when unmeasured (no rate stated). */
  profile: PeakProfile | null;
  kind: RealPeakKind;
  finished: boolean;
}

export interface GoalRangeProps {
  /**
   * The shared climb, drawn as the CENTRAL peak of the range.
   *
   * *** OWNER DECISION 2026-09-17, AND IT IS THE THIRD PLACEMENT. *** First a
   * compact figure, then its own card below the range, now inside the range
   * itself: *"this way no matter what mt everest will be present for all users
   * even those with no goals"*. That reason is the strongest of the three — it
   * is exactly the hole Everest exists to fill (a user with no goals had no
   * mountain at all, which is base camp's own audience, D-205).
   *
   * *** THE UNITS DO NOT SHARE A SCALE, AND THE LABELS CARRY THAT. *** A goal's
   * height comes from a money magnitude; Everest's from metres climbed. They
   * cannot be compared numerically, so nothing tries to: Everest is drawn as
   * the tallest because it IS (8,849 m against Ben Nevis's 1,345), its label
   * is in metres, and the goals' labels stay in money. The rock palette keeps
   * it from being read as a goal.
   */
  everest?: { altitude_m: number; summit_m: number; at_summit: boolean } | null;
  goals: Goal[];
  currency: string;
}

/**
 * What is left to do, in the goal's own terms.
 *
 * A saving goal states what is still to save. A payoff goal states what the
 * debt costs per month, because a balance alone does not say whether it is
 * worth paying first.
 */
const remainingLabel = (goal: Goal, currency: string): string => {
  const peak = goal.peak;
  if (!peak) return '';
  if (peak.scale === 'cost') {
    return peak.magnitude > 0
      ? `${formatMoney(peak.magnitude, { currency })} a month in interest`
      : 'Nothing owed';
  }
  const left = Math.max(0, (goal.target_amount ?? 0) - (goal.current_amount ?? 0));
  return left > 0 ? `${formatMoney(left, { currency })} still to save` : 'Finished';
};

/**
 * Arrange peaks so the range rises to a summit instead of stepping down.
 *
 * Tallest goes nearest the middle and the rest alternate outwards, which is
 * what a real skyline does and what the mockup draws. A plain sort renders a
 * staircase, which looks like a chart rather than a landscape.
 */
const intoRangeOrder = <T,>(sortedDescending: T[]): T[] => {
  const left: T[] = [];
  const right: T[] = [];
  sortedDescending.forEach((item, i) => {
    if (i === 0) left.push(item);
    else if (i % 2 === 1) right.push(item);
    else left.unshift(item);
  });
  return [...left, ...right];
};

/**
 * A halo, so a caption stays readable where it lands on a NEIGHBOUR'S peak.
 *
 * *** THE MOUNTAINS OVERLAP ON PURPOSE, SO THE LABELS OVERLAP THEM TOO. *** A
 * range is peaks sharing one ground line rather than four icons in a row, which
 * means a short goal beside a tall one has its caption drawn across the tall
 * one's flank — 11px grey on a dark red body. It was already marginal at two
 * lines, and FINPAL-26's kind word is what made it unreadable, on a screenshot
 * of the very fixture this page is captured from.
 *
 * `paint-order: stroke` puts the outline UNDER the glyphs, so it thickens
 * nothing: over the sky the halo IS the sky, and only over a silhouette does it
 * show at all. Widening the slots instead would flatten the range back into the
 * row of clip-art this component exists to not be.
 */
const HALO = {
  /* *** `paintOrder` IS AN ATTRIBUTE HERE, NOT A STYLE KEY, AND THE DIFFERENCE
     IS THE WHOLE FIX. *** In a `style` object React emits `stroke-width` but
     drops `paint-order` — so the first version painted a 3px outline OVER every
     glyph and turned all four captions into white blobs. Seen on the capture,
     not reasoned about. */
  paintOrder: 'stroke' as const,
  stroke: 'var(--bg-card)',
  strokeWidth: 3,
  strokeLinejoin: 'round' as const,
};

/**
 * Break a sentence into lines an SVG can draw.
 *
 * *** SVG `<text>` DOES NOT WRAP. *** There is no width to wrap against, so a
 * long string runs straight out of the viewBox and off the card. Everything
 * else in this file is a short fixed phrase; Everest's explanation is the first
 * real prose the picture carries, so it gets measured out here instead of being
 * hand-split into string literals that nobody will re-balance after an edit.
 */
const wrapLines = (text: string, maxChars: number): string[] => {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (line && (line + ' ' + word).length > maxChars) { out.push(line); line = word; }
    else line = line ? `${line} ${word}` : word;
  }
  if (line) out.push(line);
  return out;
};

/** Roughly how wide a string is at 11px, in viewBox units. */
const textWidth = (chars: number) => chars * 5.55;

/**
 * The detail a peak shows on hover, focus or tap.
 *
 * *** DRAWN IN THE viewBox, NOT AS AN HTML POPOVER. *** The range lives inside
 * a horizontally scrolling pane and is scaled by `preserveAspectRatio`, so an
 * absolutely-positioned HTML tooltip would need the viewBox-to-pixel scale and
 * the pane's scroll offset to place itself, and would be wrong at every width
 * the responsive walk checks. Drawn inside the SVG it is simply in the same
 * coordinate system as the peak it belongs to.
 *
 * *** IT HANGS BELOW THE LABEL, WHICH IS THE ONLY PLACE THERE IS ROOM. *** The
 * label block is already clamped to the top of the box (`blockBottom >= 46`),
 * so there is nothing above it. Below means it lands on a mountain, which is
 * why it paints its own background rather than relying on the sky.
 */
const PeakDetail: React.FC<{
  cx: number; top: number; width: number; lines: string[];
}> = ({ cx, top, width, lines }) => {
  const longest = lines.reduce((n, l) => Math.max(n, l.length), 0);
  const w = Math.min(Math.max(textWidth(longest) + 20, 120), 300);
  const h = lines.length * 14 + 14;
  // Clamped into the box: a peak at either edge would otherwise hang its
  // detail off the side of the card, which is where the leftmost goal sits.
  const x = Math.min(Math.max(cx - w / 2, 6), Math.max(6, width - w - 6));
  return (
    <g style={{ pointerEvents: 'none' }}>
      <rect
        x={x} y={top} width={w} height={h} rx="7"
        fill="var(--bg-card)" stroke="var(--border-medium)" strokeWidth="1"
      />
      {lines.map((line, i) => (
        <text
          key={line + i} x={x + 10} y={top + 18 + i * 14}
          style={{ fontSize: '10.5px', fill: 'var(--text-secondary)' }}
        >
          {line}
        </text>
      ))}
    </g>
  );
};

/** The colour token for a kind. Everest and an unmeasured goal are both rock grey; neither is a climb of money. */
const KIND_COLOUR: Record<RealPeakKind, string> = {
  saving: 'var(--peak-build)',
  debt: 'var(--peak-cost)',
  everest: 'var(--peak-unmeasured)',
  unmeasured: 'var(--peak-unmeasured)',
};

/**
 * A label's centre, kept far enough from both edges that the whole block stays inside the drawing. A peak near
 * either end of the row would otherwise hang half its caption past the viewBox, where it is cut off (the
 * responsive walk measures exactly that).
 */
const clampLabelX = (x: number, lines: string[], width: number, left: number): number => {
  // 13px semibold names run wider than the 11px estimate, hence the 1.25.
  const half = (Math.max(...lines.map((l) => textWidth(l.length))) * 1.25) / 2 + 6;
  return Math.min(Math.max(x, left + half), width - half);
};

export const GoalRange: React.FC<GoalRangeProps> = ({ goals, currency, everest }) => {
  /* Core has no motion kit: the range is simply drawn. (Premium draws each skyline on entry.) */
  /** Unique per instance: two ranges on one page must not share clip-path or gradient ids. */
  const uid = useId().replace(/:/g, '');
  /**
   * Which peak is showing its detail: a goal id, `'everest'`, or nothing.
   *
   * *** ONE OPEN AT A TIME, AND HOVER, FOCUS AND TAP ALL SET IT. *** Owner, 2026-09-19: several goals' worth of
   * figures at once was "overpowering". A hover-only detail does not exist on a phone or for a keyboard, so the
   * peak is a focusable button and a tap toggles it.
   */
  const [openPeak, setOpenPeak] = useState<string | null>(null);

  /* Dismissible without moving the pointer — WCAG 2.1 1.4.13. */
  useEffect(() => {
    if (openPeak === null) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenPeak(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openPeak]);

  /**
   * The open peak's detail, drawn LAST. SVG paints in document order with no `z-index`, so a panel drawn inside
   * its own peak's group sits under every label drawn after it (Everest's did, on the demo).
   */
  let openDetail: { cx: number; top: number; lines: string[] } | null = null;

  /** The handlers every peak shares, so one cannot drift from the others. */
  const peakHandlers = (id: string) => ({
    tabIndex: 0,
    role: 'button',
    'aria-expanded': openPeak === id,
    /* No `outline: none`: the browser's focus ring is the only thing telling a keyboard user where they are. */
    style: { cursor: 'pointer' } as React.CSSProperties,
    onMouseEnter: () => setOpenPeak(id),
    onMouseLeave: () => setOpenPeak((cur) => (cur === id ? null : cur)),
    onFocus: () => setOpenPeak(id),
    onBlur: () => setOpenPeak((cur) => (cur === id ? null : cur)),
    onClick: () => setOpenPeak((cur) => (cur === id ? null : id)),
  });

  /*
   * A goal with no `peak` is skipped: that field is undefined on any backend predating mountains, and drawing a
   * shape for it would invent a fact the server never sent. The MOUNTAIN is the server's (`peak.mountain.slug`,
   * from the seeded band table); this only looks up that mountain's real profile.
   */
  const peaks: RangePeak[] = goals
    .filter((goal) => goal.peak !== undefined)
    .map((goal) => {
      const peak = goal.peak!;
      const profile = profileForPeak(peak);
      return {
        goal,
        profile,
        kind: profile ? realPeakKind(peak) : 'unmeasured',
        finished: (peak.magnitude ?? 0) <= 0,
      };
    })
    .sort((a, b) => (b.profile?.elevation_m ?? 0) - (a.profile?.elevation_m ?? 0));

  /*
   * *** EVEREST IS PRESENT FOR EVERY USER, SO THE RANGE NO LONGER RETURNS NULL ON ZERO GOALS. *** Owner,
   * 2026-09-17: "no matter what mt everest will be present for all users even those with no goals". Drawn at 0 m
   * too: Everest at zero IS base camp (decision 7), and the label says so.
   */
  const climb = everest ?? null;
  if (peaks.length === 0 && !climb) return null;
  const everestProfile = profileFor(EVEREST_SLUG)!;

  const ordered = intoRangeOrder(peaks);
  /** Where Everest stands: the middle slot, with the goals either side. */
  const everestSlot = climb ? Math.floor(ordered.length / 2) : -1;
  type Slot = { peak: RangePeak | null; length: number };
  const slots: Slot[] = ordered.map((peak) => ({ peak, length: peak.profile?.length_m ?? UNMEASURED_LENGTH_M }));
  if (climb) slots.splice(everestSlot, 0, { peak: null, length: everestProfile.length_m });

  /*
   * *** ONE VERTICAL SCALE FOR EVERY PEAK, IN METRES. *** The tallest thing drawn fills the band and everything
   * else is in true proportion to it: with Everest in the range a Table Mountain is an eighth of its height,
   * because it is. One horizontal scale too (`layoutRow`), so widths are true relative to each other. The
   * vertical is exaggerated against the horizontal, by the same factor for every peak, as any elevation profile is.
   */
  const topM = Math.max(climb ? EVEREST_M : 0, ...peaks.map((p) => p.profile?.elevation_m ?? 0), 1000);
  const pxPerM = (GROUND_Y - LABEL_BAND) / topM;
  const width = Math.max(BOX_HEIGHT * 4.2, 260 * slots.length);
  /* The layout row is built from lengths only; an unmeasured slot is a stand-in of fixed length. */
  const rowProfiles = slots.map((s) => ({ length_m: s.length } as PeakProfile));
  const { xs, pxPerMx } = layoutRow(rowProfiles, width - SCALE_GUTTER, 20, 0.28);
  const frameAt = (i: number): ProfileFrame => ({ x: SCALE_GUTTER + xs[i], groundY: GROUND_Y, pxPerM, pxPerMx });
  const goalSlot = (i: number) => (everestSlot < 0 || i < everestSlot ? i : i + 1);

  /** One mountain: faded foot, body, contours clipped to it, then the skyline drawn on. */
  /* A render function, not an inner component: an inner component is a new type every render, so hovering a peak
     would remount every mountain and replay the entrance. */
  const mountain = (id: string, profile: PeakProfile, frame: ProfileFrame, kind: RealPeakKind, rank: number) => {
      const colour = KIND_COLOUR[kind];
      const clip = `${uid}-clip-${id}`;
      const body = bodyPath(profile, frame);
      return (
        <g key={id} data-testid={`peak-${id}`} data-kind={kind} data-summit-m={profile.elevation_m}>
          <g>
            <clipPath id={clip}><path d={body} /></clipPath>
            {/* Below the transect's lowest ground there is no data, so the colour fades to sea level instead of
                walls being drawn there. The fade is what keeps the TRUE height readable on the scale. */}
            <path d={footPath(profile, frame)} fill={`url(#${uid}-foot-card)`} />
            <path d={footPath(profile, frame)} fill={`url(#${uid}-foot-${kind})`} />
            {/* Opaque under the tint, so a peak in front hides the one behind it. */}
            <path d={body} fill="var(--bg-card)" />
            <path d={body} fill={colour} fillOpacity={0.2} />
            <g clipPath={`url(#${clip})`} stroke={colour} strokeOpacity={0.4} strokeWidth={1}>
              {contourLevels(profile.elevation_m).map((mtr) => (
                <line key={mtr} data-contour={mtr} x1={frame.x} x2={frame.x + profile.length_m * frame.pxPerMx}
                      y1={elevationY(frame, mtr)} y2={elevationY(frame, mtr)} />
              ))}
            </g>
          </g>
          <path d={skylinePath(profile, frame)} fill="none" stroke={colour} strokeWidth={1.6}
                  strokeLinejoin="round"  />
        </g>
      );
  };

  const standing = climb && climb.altitude_m > 0
    ? `you are at ${climb.altitude_m.toLocaleString()} m`
    : 'you are at base camp';

  /** What the whole picture says, for a screen reader: every mountain and its real height, and where you are. */
  const described = slots.map((s) => {
    if (!s.peak) return `Everest ${peakElevation(EVEREST_M)}, ${standing}`;
    const gp = s.peak.goal.peak;
    if (!s.peak.profile || !gp?.mountain) return `${s.peak.goal.name}, ${gp ? peakKindLabel(gp) : ''}`;
    return `${rangeLabel(s.peak.goal.name, gp.mountain.name, s.peak.profile.elevation_m, (n) => n.toLocaleString('en-GB'))}, ${peakKindLabel(gp)}`;
  });

  return (
    <ScrollPane label={"Your goals drawn as a mountain range"} axis="x" style={{ padding: '4px 0 0' }}>
      {/* `role="group"`, not `img`: the peaks inside are focusable buttons, and `img` would hide them (axe
          nested-interactive). `minWidth` keeps labels legible; the pane scrolls on a phone. */}
      <svg
        viewBox={`0 0 ${width} ${BOX_HEIGHT}`}
        preserveAspectRatio="xMidYMax meet"
        role="group"
        aria-label={`Your goals as real mountains, drawn to their real heights with a line every 1,000 m: ${described.join('; ')}`}
        style={{ display: 'block', width: '100%', minWidth: 680, height: 'auto' }}
      >
        <defs>
          {(Object.keys(KIND_COLOUR) as RealPeakKind[]).map((kind) => (
            <linearGradient key={kind} id={`${uid}-foot-${kind}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: KIND_COLOUR[kind], stopOpacity: 0.2 }} />
              <stop offset="1" style={{ stopColor: KIND_COLOUR[kind], stopOpacity: 0.03 }} />
            </linearGradient>
          ))}
          {/* The card colour, fading out: a foot hides what stands behind it near the top and lets it show
              through lower down, so an overlap reads as depth rather than as a translucent box. */}
          <linearGradient id={`${uid}-foot-card`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--bg-card)', stopOpacity: 1 }} />
            <stop offset="0.6" style={{ stopColor: 'var(--bg-card)', stopOpacity: 0 }} />
          </linearGradient>
        </defs>

        {/* The height scale: a faint line every 1,000 m across the whole picture, numbered every other one. The
            same lines run INSIDE each mountain as its contours. Decorative here; the group label carries it. */}
        <g aria-hidden="true">
          {contourLevels(topM).map((mtr) => (
            <line key={mtr} x1={SCALE_GUTTER} x2={width} y1={GROUND_Y - mtr * pxPerM} y2={GROUND_Y - mtr * pxPerM}
                  stroke="var(--border-light)" strokeWidth="1" />
          ))}
          {scaleTicks(topM).map((mtr) => (
            <text key={mtr} x={4} y={GROUND_Y - mtr * pxPerM + 4}
                  style={{ fontSize: '11px', fill: 'var(--text-muted)' }}>
              {peakElevation(mtr)}
            </text>
          ))}
        </g>

        {/* *** EVEREST: THE CENTRAL PEAK, DRAWN BEFORE THE GOALS SO THEY STAND IN FRONT OF IT. *** Rock grey
            (`--peak-unmeasured`), never a goal colour, so nobody reads it as one of their own goals. The climber
            is the ONE marker on the picture and its height is the person's altitude from acts, never money,
            placed where Everest's real skyline reaches that height. A marker, not a bar: no track behind it. */}
        {climb && (() => {
          const frame = frameAt(everestSlot);
          const dot = climberPoint(everestProfile, frame, climb.altitude_m);
          return (
            <g>
              {mountain('everest', everestProfile, frame, 'everest', 0)}
              <circle data-testid="climber" cx={dot.x} cy={dot.y} r="6"
                        fill="var(--status-warn)" stroke="var(--bg-card)" strokeWidth="2.5"
                        />
            </g>
          );
        })()}

        {/* Tallest first, so shorter peaks are drawn in FRONT of it and the range has depth. */}
        {ordered
          .map((peak, i) => ({ peak, slot: goalSlot(i) }))
          .sort((a, b) => (b.peak.profile?.elevation_m ?? 0) - (a.peak.profile?.elevation_m ?? 0))
          .map(({ peak, slot }, rank) => {
            const frame = frameAt(slot);
            if (peak.profile) {
              return mountain(String(peak.goal.id), peak.profile, frame, peak.kind, rank + 1);
            }
            /* *** UNMEASURED IS NOT A SMALL MOUNTAIN. *** No rate stated, so finPal does not know which mountain
               this is: a low grey ridge, no summit, no contours, no elevation on the scale. */
            const w = UNMEASURED_LENGTH_M * pxPerMx;
            const sc = w / 100;
            return (
              <g key={peak.goal.id} data-testid={`peak-${peak.goal.id}`} data-kind="unmeasured">
                <path d={RANGE_UNMEASURED.body} fill="var(--peak-unmeasured)" fillOpacity={0.35}
                      transform={`translate(${frame.x} ${GROUND_Y - 100 * sc * 0.25}) scale(${sc} ${sc * 0.25})`} />
              </g>
            );
          })}

        {/* The ground: sea level, the 0 of the scale. */}
        <line x1={SCALE_GUTTER} y1={GROUND_Y} x2={width} y2={GROUND_Y} stroke="var(--border-light)" strokeWidth="1.5" />

        {/* Everest's label, in METRES; the goals' details are in money, and the two are never one scale. */}
        {climb && (() => {
          const summit = summitPoint(everestProfile, frameAt(everestSlot));
          const s = { x: clampLabelX(summit.x, ['Everest', standing], width, SCALE_GUTTER), y: summit.y };
          const blockBottom = Math.max(s.y - 8, 40);
          const line1 = blockBottom - 28;
          /* The one place that says what Everest is doing here (owner, 2026-09-19: "its the ultimate goal
             financial litracy"). The summit height moves into the detail: it is the same for everybody. */
          const detail = [
            `${climb.summit_m.toLocaleString()} m — the shared summit`,
            ...wrapLines('Not one of your goals. Everyone on finPal climbs this one, and the summit is financial literacy: every act available to you, done. You gain altitude by telling finPal the truth about your own money.', 44),
          ];
          return (
            <g
              {...HALO}
              {...peakHandlers('everest')}
              aria-label={`Everest, the shared climb. ${standing}. ${detail.join(' ')}`}
            >
              <text x={s.x} y={line1 + 13} textAnchor="middle"
                    style={{ fontSize: '13px', fontWeight: 600, fill: 'var(--text-primary)' }}>
                Everest{climb.at_summit ? ' ✓' : ''}
              </text>
              <text x={s.x} y={line1 + 26} textAnchor="middle"
                    style={{ fontSize: '12px', fill: 'var(--status-warn)', fontWeight: 600 }}>
                {standing}
              </text>
              {openPeak === 'everest'
                && ((openDetail = { cx: s.x, top: blockBottom + 4, lines: detail }), null)}
            </g>
          );
        })()}

        {ordered.map((peak, i) => {
          const frame = frameAt(goalSlot(i));
          const gp = peak.goal.peak;
          const summit = peak.profile
            ? summitPoint(peak.profile, frame)
            : { x: frame.x + (UNMEASURED_LENGTH_M * pxPerMx) / 2, y: GROUND_Y - 14 };
          /* Never null: the scale comes from the goal's DIRECTION, so an unmeasured peak is still definitely debt. */
          const kind = gp ? peakKindLabel(gp) : '';
          /* *** THE MOUNTAIN AND ITS REAL HEIGHT ARE PRINTED NOW (design move 3, 2026-11-20). *** The 2026-09-19
             decision moved them behind the hover because three lines per peak crowded the old slots; the approved
             real-elevation design labels every peak "<goal> · <peak> <elevation> m". The kind word stays printed
             beside it (FINPAL-26 / D-269), and the money stays in the detail. */
          const peakLine = peak.profile && gp?.mountain
            ? `${gp.mountain.name} ${peakElevation(peak.profile.elevation_m)} · ${kind}`
            : kind;
          const s = { x: clampLabelX(summit.x, [peak.goal.name, peakLine], width, SCALE_GUTTER), y: summit.y };
          const blockBottom = Math.max(s.y - 8, 40);
          const line1 = blockBottom - 28;
          const detail = [
            remainingLabel(peak.goal, currency),
            gp?.apr != null ? `${gp.apr}% APR` : '',
            gp ? peakPayoffLine(gp, (n) => formatMoney(n, { currency })) ?? '' : '',
          ].filter(Boolean);
          const spoken = peak.profile && gp?.mountain
            ? rangeLabel(peak.goal.name, gp.mountain.name, peak.profile.elevation_m, (n) => n.toLocaleString('en-GB'))
            : peak.goal.name;
          return (
            <g
              key={`label-${peak.goal.id}`}
              {...HALO}
              {...peakHandlers(String(peak.goal.id))}
              aria-label={`${spoken}${peak.finished ? ', finished' : ''}, `
                + `${kind}. ${detail.join('. ')}`}
            >
              <text x={s.x} y={line1 + 13} textAnchor="middle"
                    {...({ translate: 'no' } as Record<string, string>) /* SVG types lack it; the DOM honours it */}
                    style={{ fontSize: '13px', fontWeight: 600, fill: 'var(--text-primary)' }}>
                {peak.goal.name}{peak.finished ? ' ✓' : ''}
              </text>
              <text x={s.x} y={line1 + 26} textAnchor="middle"
                    style={{ fontSize: '12px', fill: 'var(--text-secondary)' }}>
                {peakLine}
              </text>
              {openPeak === String(peak.goal.id)
                && ((openDetail = { cx: s.x, top: blockBottom + 4, lines: detail }), null)}
            </g>
          );
        })}

        {/* LAST CHILD: the open detail paints over every label. */}
        {openDetail && (
          <PeakDetail
            cx={openDetail.cx} top={openDetail.top}
            width={width} lines={openDetail.lines}
          />
        )}
      </svg>
    </ScrollPane>
  );
};

export default GoalRange;
