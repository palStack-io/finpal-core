import React, { useEffect, useState } from 'react';
import { ScrollPane } from '../ScrollPane';

import {
  RANGE_SILHOUETTES, RANGE_UNMEASURED, MIN_RANGE_HEIGHT,
} from '../../utils/rangeSilhouettes';
import { heightForMagnitude } from '../../utils/mountainGeometry';
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
 * So this draws one SVG. What it does NOT do is invent new mountain shapes:
 * the paths come from `MOUNTAIN_SILHOUETTES`, the same band-indexed data the
 * Goals page draws, translated and scaled into a single viewBox. One source for
 * the shapes, two arrangements — because two sets of paths for one mountain is
 * how the two pages would drift.
 *
 * *** THE SCALE IS UNIFORM, WHICH IS WHAT KEEPS IT HONEST. ***
 * `heightForMagnitude` measures a goal against the global ceiling, which is
 * right for one card showing one peak. Four of those side by side read flat —
 * measured on the demo, Mount Rainier (4,392 m) and Table Mountain (1,085 m)
 * came out nearly the same size, the opposite of what a range is for. Every
 * peak is therefore multiplied by ONE factor so the tallest fills the frame.
 * Ratios survive exactly; only the zoom changes. Normalising each peak
 * independently would be the dishonest version and is the obvious thing to
 * reach for.
 *
 * *** NO DENOMINATOR. *** No "2 of 4 goals", no percentage across the range.
 * Decision 5 permits one denominator — a target the user chose — and each peak
 * prints its own real figure above it.
 */

/** The drawing box. Height is fixed; width grows with the number of peaks. */
const BOX_HEIGHT = 250;
const LABEL_BAND = 58;      // room above the tallest summit for its label block
const GROUND_Y = BOX_HEIGHT - 10;

interface RangePeak {
  goal: Goal;
  /** 0..100 from the shared geometry, before the range's uniform zoom. */
  height: number;
  band: number | null;
  scale: 'cost' | 'build' | string;
  unmeasured: boolean;
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

export const GoalRange: React.FC<GoalRangeProps> = ({ goals, currency, everest }) => {
  /**
   * Which peak is showing its detail: a goal id, `'everest'`, or nothing.
   *
   * *** ONE OPEN AT A TIME, AND HOVER, FOCUS AND TAP ALL SET IT. *** Owner,
   * 2026-09-19: *"i feel like if a user have multiple goal it will get
   * overpowering"* — and the geometry agrees. `SLOT` is a fixed 124 units while
   * `Mount Rainier · 4,392 m · saving` is ~170, so every caption was already
   * wider than the space it owns and neighbours collided at four goals.
   *
   * *** HOVER IS NOT THE TRIGGER, IT IS ONE OF THREE. *** A hover-only detail
   * does not exist on a phone, and this card renders down to 390px; it also
   * does not exist for a keyboard. So the peak is a focusable button and a tap
   * toggles it — which is what lets the WORD debt/saving stay printed and only
   * the figures move behind the interaction (D-269 is the reason that word
   * cannot be the thing that hides).
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
   * The open peak's detail, drawn LAST.
   *
   * *** SVG HAS NO `z-index` — IT PAINTS IN DOCUMENT ORDER. *** The popover
   * started life inside its own peak's `<g>`, which put Everest's (drawn
   * first, so the goals stand in front of it) underneath every goal label on
   * the card: "Emergency fund" and "Pay off the Visa Credit Card" were
   * painted straight through the panel. The LOCAL capture missed it because
   * the peak it focused happened to be the last one drawn; the demo showed it
   * immediately. Collected during the label passes and rendered after them,
   * so whichever peak is open is on top of all of them.
   */
  let openDetail: { cx: number; top: number; lines: string[] } | null = null;

  /** The handlers every peak shares, so one cannot drift from the others. */
  const peakHandlers = (id: string) => ({
    tabIndex: 0,
    role: 'button',
    'aria-expanded': openPeak === id,
    /* *** NO `outline: none`. *** The first version had it, which strips the
       only thing telling a keyboard user where they are (WCAG 2.4.7) — and it
       strips it on the very control this change made keyboard-reachable in the
       first place. The browser's own ring round the label's bbox is correct
       here; the detail appearing is a second indicator, not a substitute. */
    style: { cursor: 'pointer' } as React.CSSProperties,
    onMouseEnter: () => setOpenPeak(id),
    onMouseLeave: () => setOpenPeak((cur) => (cur === id ? null : cur)),
    onFocus: () => setOpenPeak(id),
    onBlur: () => setOpenPeak((cur) => (cur === id ? null : cur)),
    onClick: () => setOpenPeak((cur) => (cur === id ? null : id)),
  });

  /*
   * A goal with no `peak` is skipped. That field is undefined on any backend
   * predating mountains, and drawing a shape for it would be inventing a fact
   * the server never sent — the same choice the Goals page makes.
   */
  const peaks: RangePeak[] = goals
    .filter((goal) => goal.peak !== undefined)
    .map((goal) => {
      const peak = goal.peak!;
      return {
        goal,
        height: heightForMagnitude(peak.magnitude, peak.scale),
        band: peak.band,
        scale: peak.scale,
        unmeasured: peak.unmeasured,
        finished: (peak.magnitude ?? 0) <= 0,
      };
    })
    .sort((a, b) => b.height - a.height);

  /**
   * *** EVEREST IS PRESENT FOR EVERY USER, SO THE RANGE NO LONGER RETURNS NULL
   * ON ZERO GOALS. *** That is the whole point of the owner's placement: a user
   * with no goals used to see no mountain at all, and they are precisely the
   * population base camp is designed for (D-205).
   */
  /*
   * *** RENDERED AT 0 m TOO, AND THAT CORRECTION CAME FROM VERIFYING IT. ***
   * The first version gated this on `altitude_m > 0`, reasoning that a new user
   * should not be told they have climbed nothing. Checking the owner's actual
   * requirement — "no matter what mt everest will be present for all users even
   * those with no goals" — showed that gate excluded exactly the user it is
   * for: somebody brand new has no goals AND no coins, so they would have seen
   * no mountain at all.
   *
   * Decision 7 settles it: *the empty state is base camp*. Everest at zero IS
   * base camp, so it draws, and the label says "base camp" rather than "0 m" —
   * which is the difference between an invitation and a report card.
   */
  const climb = everest ?? null;
  if (peaks.length === 0 && !climb) return null;

  const tallest = peaks.length ? Math.max(...peaks.map((p) => p.height)) : 0;
  /*
   * With Everest in the range it takes the full band and the goals top out
   * below it, because Everest really is the taller mountain. Without it the
   * tallest goal fills the band as before.
   */
  const goalCeiling = climb ? 0.72 : 1;
  const zoom = tallest > 0 ? goalCeiling / tallest : 0;

  const ordered = intoRangeOrder(peaks);
  /** Where Everest stands: the middle slot, with the goals either side. */
  const everestSlot = climb ? Math.floor(ordered.length / 2) : -1;
  const slotCount = ordered.length + (climb ? 1 : 0);

  const usable = BOX_HEIGHT - LABEL_BAND - (BOX_HEIGHT - GROUND_Y);

  /*
   * *** THE SLOT IS NARROWER THAN A PEAK, WHICH IS WHAT MAKES IT A RANGE. ***
   * Width tracks height (uniform scale of a 100x100 box), so the tallest peak
   * is `usable` wide. A slot of that width leaves every peak standing alone
   * with the far ridge visible between them — which is what the previous
   * version did, and it read as four mountains rather than one range. At 68%
   * the near peaks overlap the shoulders of their neighbours.
   */
  const SLOT = Math.round(usable * 0.68);
  const contentWidth = SLOT * slotCount + usable * 0.5;

  /*
   * *** THE GROUND LINE HAS TO REACH BOTH EDGES OF THE CARD. ***
   * `preserveAspectRatio` scales the viewBox to fit, so a 500x250 box inside a
   * 1150px card rendered the whole range at half width with dead space either
   * side — it looked like a picture pasted into the middle of a panel. The box
   * is now at least as wide as the card's aspect, the ground and the far ridge
   * span all of it, and the peaks are centred within it. The mockup does the
   * same thing with extra ridges out at the edges.
   */
  const width = Math.max(contentWidth, BOX_HEIGHT * 4.4);
  const offset = (width - contentWidth) / 2;

  return (
    <ScrollPane label="Your goals drawn as a mountain range" axis="x" style={{ padding: '4px 0 0' }}>
      {/* *** A FIXED HEIGHT PLUS `width: 100%` DESTROYED THIS ON A PHONE, AND
          THE DESKTOP CAPTURE COULD NOT SHOW IT. *** With `height={250}` and a
          1100-wide viewBox, `meet` scaled the content to fit 340px of phone
          width — so the whole range drew at 340x77, anchored to the bottom of a
          250px card, under 170px of dead space, with 12.5px labels rendered at
          under 4px. Found by the walkthrough's phone pass, which is the only
          thing that looks at this width.

          `minWidth` instead: the range keeps a size its labels are legible at
          and the wrapper above scrolls horizontally when the viewport is
          narrower. `height="auto"` lets the box follow its own aspect ratio
          rather than reserving space the drawing does not use. */}
      <svg
        viewBox={`0 0 ${width} ${BOX_HEIGHT}`}
        preserveAspectRatio="xMidYMax meet"
        role="img"
        aria-label={`Your goals as a mountain range: ${ordered.map((p) => p.goal.name).join(', ')}`}
        style={{ display: 'block', width: '100%', minWidth: 680, height: 'auto' }}
      >
        <defs>
          {/* The shaded face as a GRADIENT, not a flat wedge. The first version
              painted 17% black over half the peak and the hard vertical seam
              down each summit is what made them look like folded paper. */}
          <linearGradient id="range-shade" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#000000" stopOpacity="0.02" />
            <stop offset="1" stopColor="#000000" stopOpacity="0.20" />
          </linearGradient>
        </defs>

        {/* A far ridge, behind everything. Decorative: it carries no figure,
            it is what stops the peaks floating on a blank rectangle. */}
        {/* *** THE FAR RIDGE SPANS THE WHOLE BOX, NOT THE PEAK SLOTS. ***
            It was generated at `i * SLOT`, which is peak-slot space — so once
            the peaks were centred with an offset the ridge stayed bunched on
            the left and the right half of the card was empty. It is now eight
            vertices distributed across the full width, independent of how many
            goals there are, so the horizon reaches both edges whether the user
            has one goal or six. Decorative: it carries no figure. */}
        <path
          d={`M0,${GROUND_Y} ${Array.from({ length: 8 }, (_, i) => {
            const x = (width / 8) * i;
            const dip = i % 2 === 0 ? 30 : 16;
            return `L${x + width / 16},${GROUND_Y - dip} L${x + width / 8},${GROUND_Y - 4}`;
          }).join(' ')} L${width},${GROUND_Y} Z`}
          fill="var(--peak-build)"
          opacity="var(--peak-backdrop-opacity)"
        />

        {/* *** EVEREST: THE CENTRAL PEAK, DRAWN BEFORE THE GOALS SO THEY STAND
            IN FRONT OF IT. *** It is the tallest and furthest back, which is
            what a real range looks like and what stops it hiding a goal.

            *** THE ROCK PALETTE IS THE THING THAT KEEPS IT HONEST. *** Goals
            are clay (cost) or green (build); this is `--text-muted`, so a
            reader can see at a glance that it is not one of their goals. The
            concern I raised twice — that one picture blurs money and effort —
            is answered by the colour and by the labels carrying different
            units, not by hiding it. */}
        {climb && (() => {
          const height = usable;                    // Everest fills the band
          const sc = height / 100;
          const w = 100 * sc;
          const x = offset + everestSlot * SLOT + (SLOT - w) / 2;
          const y = GROUND_Y - height;
          const shape = RANGE_SILHOUETTES[RANGE_SILHOUETTES.length - 1];
          const f = Math.min(1, climb.altitude_m / climb.summit_m);
          // The climber's y on the peak, measured from the ground up: the same
          // honest thing the standalone card did, without inventing a route
          // over a shape whose ridge this code does not know.
          // A floor of 6px, so a climber at base camp sits ON the ground line
          // rather than being clipped by it.
          const climberY = GROUND_Y - Math.max(height * f, 6);
          return (
            <g>
              <g transform={`translate(${x} ${y}) scale(${sc})`} color="var(--peak-unmeasured)">
                <path d={shape.body} fill="currentColor" />
                {shape.shade && <path d={shape.shade} fill="url(#range-shade)" />}
                {shape.snow && (
                  <path d={shape.snow} fill="var(--bg-card)"
                        opacity={shape.snowOpacity ?? 0.9} />
                )}
              </g>
              {/* How far up you are. A marker, not a bar: no track behind it,
                  because a track is a denominator and the only one this product
                  prints is the shop price. The summit figure is in the label. */}
              <circle
                cx={offset + everestSlot * SLOT + SLOT / 2}
                cy={climberY} r="5" fill="var(--status-warn)"
              />
            </g>
          );
        })()}

        {/* Tallest first, so shorter peaks are drawn in FRONT of it and the
            range has depth rather than a single flat row. */}
        {[...ordered]
          /* Goals step over Everest's slot, so the centre stays free for it. */
          .map((peak, i) => ({ peak, slot: i < everestSlot || everestSlot < 0 ? i : i + 1 }))
          .sort((a, b) => b.peak.height - a.peak.height)
          .map(({ peak, slot }) => {
            const shape = peak.unmeasured
              ? RANGE_UNMEASURED
              : RANGE_SILHOUETTES[Math.max(0, Math.min(peak.band ?? 0, RANGE_SILHOUETTES.length - 1))];
            const drawn = Math.max(peak.height * zoom, MIN_RANGE_HEIGHT);
            const pixelHeight = drawn * usable;
            /* The shape's box is 100 x 100 and the scale is UNIFORM, so the
               path is never distorted. Base width therefore tracks height,
               which is what a real range does — a taller mountain has a wider
               footprint. */
            const sc = pixelHeight / 100;
            const w = 100 * sc;
            const x = offset + slot * SLOT + (SLOT - w) / 2;
            const y = GROUND_Y - pixelHeight;
            const colour = peak.unmeasured
              ? 'var(--peak-unmeasured)'
              : peak.scale === 'cost' ? 'var(--peak-cost)' : 'var(--peak-build)';
            return (
              <g key={peak.goal.id} transform={`translate(${x} ${y}) scale(${sc})`} color={colour}>
                <path d={shape.body} fill="currentColor" />
                {/* The shaded face. Without it four peaks read as flat paper
                    cut-outs, which is exactly how the first version looked. */}
                {shape.shade && (
                  <path d={shape.shade} fill="url(#range-shade)" />
                )}
                {shape.snow && (
                  <path d={shape.snow} fill="#ffffff" opacity={shape.snowOpacity ?? 0.85} />
                )}
              </g>
            );
          })}

        {/* The ground. One line under the whole range, which is the thing that
            makes four peaks read as one landscape. */}
        <line
          x1="0" y1={GROUND_Y} x2={width} y2={GROUND_Y}
          stroke="var(--border-light)" strokeWidth="1.5"
        />

        {/* *** LABELS SIT ABOVE THEIR OWN SUMMIT, NOT IN A SHARED BAND. ***
            The first version put all three lines at y=18/32/45 for every peak,
            so a label could be 130px above the mountain it names and the reader
            had to guess which was which. Each block now hangs just over its own
            summit with a short leader, clamped so it never leaves the box. Every
            figure the picture carries is written here, which is why the whole
            `<svg>` can carry one `role="img"` label and lose nothing. */}
        {/* Everest's own label, in METRES — the goals' are in money, and that
            difference is deliberate: the two are not on one scale and nothing
            here pretends they are. */}
        {climb && (() => {
          const cx = offset + everestSlot * SLOT + SLOT / 2;
          const top = GROUND_Y - usable;
          const blockBottom = Math.max(top - 10, 46);
          const line1 = blockBottom - 28;
          const standing = climb.altitude_m > 0
            ? `you are at ${climb.altitude_m.toLocaleString()} m`
            : 'you are at base camp';
          /* *** THE ONE PLACE THAT SAYS WHAT EVEREST IS DOING HERE. *** It has
             always been drawn in rock grey so nobody reads it as their own
             goal, but nothing ever said what it WAS — a reader was left to
             infer it from a colour. Owner, 2026-09-19: *"we can also add
             content to everest. its the ultimate goal financial litracy"*.
             The summit height moves in here too: it is the least useful thing
             to print, because it is the same 8,849 m for everybody. */
          const detail = [
            `${climb.summit_m.toLocaleString()} m — the shared summit`,
            ...wrapLines(
              'Not one of your goals. Everyone on finPal climbs this one, and the '
              + 'summit is financial literacy: every act available to you, done. '
              + 'You gain altitude by telling finPal the truth about your own money.',
              44),
          ];
          return (
            <g
              {...peakHandlers('everest')}
              aria-label={`Everest, the shared climb. ${standing}. ${detail.join(' ')}`}
            >
              <line x1={cx} y1={blockBottom - 6} x2={cx} y2={top - 3}
                    stroke="var(--border-light)" strokeWidth="1" />
              <text x={cx} y={line1 + 13} textAnchor="middle"
                    style={{ fontSize: '12.5px', fontWeight: 600, fill: 'var(--text-primary)' }}>
                Everest{climb.at_summit ? ' ✓' : ''}
              </text>
              <text x={cx} y={line1 + 26} textAnchor="middle"
                    style={{ fontSize: '11px', fill: 'var(--status-warn)', fontWeight: 600 }}>
                {standing}
              </text>
              {openPeak === 'everest'
                && ((openDetail = { cx, top: blockBottom + 4, lines: detail }), null)}
            </g>
          );
        })()}

        {ordered.map((peak, i) => {
          const slot = i < everestSlot || everestSlot < 0 ? i : i + 1;
          const cx = offset + slot * SLOT + SLOT / 2;
          const drawn = Math.max(peak.height * zoom, MIN_RANGE_HEIGHT);
          const top = GROUND_Y - drawn * usable;
          // Two lines of ~13px, plus a leader. Clamped to the top of the box.
          const blockBottom = Math.max(top - 10, 46);
          const line1 = blockBottom - 28;
          const gp = peak.goal.peak;
          /* Never null: the scale comes from the goal's DIRECTION, so an
             unmeasured peak — the grey one, where no account states a rate —
             is still definitely debt. */
          const kind = gp ? peakKindLabel(gp) : '';
          /* What used to be printed under every peak. `filter(Boolean)` rather
             than a template: an unmeasured peak has no mountain and no
             elevation, and a row reading `· · ` is the shape this file already
             fixed once. */
          const detail = [
            [gp?.mountain?.name,
             gp?.mountain?.elevation_m ? peakElevation(gp.mountain.elevation_m) : null,
            ].filter(Boolean).join(' · '),
            remainingLabel(peak.goal, currency),
            gp?.apr != null ? `${gp.apr}% APR` : '',
            /* *** HOW LONG IT TAKES, WHICH IS WHAT A PAYOFF GOAL IS ASKING.
               *** The figure already existed inside the coins engine as a
               sentence nobody could reuse; it is one shared arithmetic now.
               It lives in the DETAIL rather than on the caption because it is
               the longest line either produces, and the caption is what the
               hover exists to keep short. */
            gp ? peakPayoffLine(gp, (n) => formatMoney(n, { currency })) ?? '' : '',
          ].filter(Boolean);
          return (
            <g
              key={`label-${peak.goal.id}`}
              {...HALO}
              {...peakHandlers(String(peak.goal.id))}
              aria-label={`${peak.goal.name}${peak.finished ? ', finished' : ''}, `
                + `${kind}. ${detail.join('. ')}`}
            >
              <line
                x1={cx} y1={blockBottom - 6} x2={cx} y2={top - 3}
                stroke="var(--border-light)" strokeWidth="1"
              />
              <text x={cx} y={line1 + 13} textAnchor="middle"
                    style={{ fontSize: '12.5px', fontWeight: 600, fill: 'var(--text-primary)' }}>
                {peak.goal.name}{peak.finished ? ' ✓' : ''}
              </text>
              {/* *** THE KIND IS A WORD, NOT ONLY A COLOUR, AND IT IS THE ONE
                  THING THAT MAY NOT MOVE BEHIND THE HOVER (FINPAL-26 / D-269).
                  *** The peaks are painted from `peakColorVar`, which says
                  cost or build in red and green and says it to nobody who
                  cannot tell those two apart — and the reporter, who can,
                  still asked "which of these is debt?". Putting that word in
                  the popover would answer the question only for a reader with
                  a mouse. The mountain, its height and the money went in
                  there; the word stays printed. */}
              <text x={cx} y={line1 + 26} textAnchor="middle"
                    style={{ fontSize: '11px', fill: 'var(--text-secondary)' }}>
                {kind}
              </text>
              {openPeak === String(peak.goal.id)
                && ((openDetail = { cx, top: blockBottom + 4, lines: detail }), null)}
            </g>
          );
        })}

        {/* *** THE CLIMBER, AND THE ONE DENOMINATOR DECISION 5 PERMITS. ***
            A figure on the ground under the tallest climb, with a dashed trail
            to how far up it the user actually is. That percentage is allowed
            precisely because the target is one the USER chose — it is their own
            goal's progress, not a band finPal invented. It is omitted entirely
            when there is nothing to stand under (every goal finished) rather
            than drawing a climber at 0%. */}
        {(() => {
          const tallestPeak = ordered.find((p) => p.height === tallest);
          if (!tallestPeak || tallestPeak.finished) return null;
          const slot = ordered.indexOf(tallestPeak);
          const cx = offset + slot * SLOT + SLOT / 2;
          const drawn = Math.max(tallestPeak.height * zoom, MIN_RANGE_HEIGHT);
          const top = GROUND_Y - drawn * usable;
          const target = tallestPeak.goal.target_amount ?? 0;
          const current = tallestPeak.goal.current_amount ?? 0;
          const pct = target > 0 ? Math.max(0, Math.min(100, (current / target) * 100)) : 0;
          if (pct <= 0) return null;
          const markY = GROUND_Y - (GROUND_Y - top) * (pct / 100);
          return (
            <g>
              <path
                d={`M${cx - 34},${GROUND_Y - 2} Q${cx - 26},${(GROUND_Y + markY) / 2} ${cx - 8},${markY}`}
                fill="none" stroke="var(--text-primary)" strokeWidth="1.4"
                strokeDasharray="3 5" opacity="0.42"
              />
              <circle cx={cx - 8} cy={markY} r="4" fill="var(--peak-build)" />
              {/* White, because this label sits ON the mountain. In
                  `--text-secondary` it rendered as unreadable mid-grey over
                  dark green — caught by looking at the picture, which is the
                  only way: the contrast walk reads computed CSS backgrounds and
                  never composites an SVG fill. */}
              <text x={cx + 2} y={markY + 4}
                    style={{ fontSize: '10.5px', fontWeight: 600, fill: '#ffffff' }}>
                {pct.toFixed(0)}% up
              </text>
              {/* The climber: a stick figure, deliberately crude, standing on
                  the ground line rather than floating. */}
              <g stroke="var(--text-primary)" strokeWidth="1.6" fill="none" opacity="0.7">
                <circle cx={cx - 40} cy={GROUND_Y - 20} r="3.2" fill="var(--text-primary)" stroke="none" />
                <line x1={cx - 40} y1={GROUND_Y - 17} x2={cx - 40} y2={GROUND_Y - 8} />
                <line x1={cx - 40} y1={GROUND_Y - 14} x2={cx - 45} y2={GROUND_Y - 11} />
                <line x1={cx - 40} y1={GROUND_Y - 14} x2={cx - 35} y2={GROUND_Y - 16} />
                <line x1={cx - 40} y1={GROUND_Y - 8} x2={cx - 44} y2={GROUND_Y - 1} />
                <line x1={cx - 40} y1={GROUND_Y - 8} x2={cx - 36} y2={GROUND_Y - 1} />
              </g>
            </g>
          );
        })()}

        {/* *** LAST CHILD, AND THAT IS THE WHOLE POINT. *** SVG paints in
            document order with no `z-index`, so a popover drawn inside its own
            peak's group sits under every label drawn after it. Everest is
            drawn FIRST (the goals stand in front of it), so its detail was
            under all four goal captions on the demo. */}
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
