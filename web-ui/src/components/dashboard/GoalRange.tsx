import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { RANGE_SILHOUETTES, RANGE_UNMEASURED, shapeSummit } from '../../utils/rangeSilhouettes';
import { EVEREST, climbPoint, routePath } from '../../utils/everestRoute';
import { formatMoney } from '../../styles/money';
import { UNMEASURED_SUBLINE, peakElevation, peakKindLabel, peakPayoffLine } from '../../utils/peakCopy';
import { goalFinished, goalPeakHeight, goalProgress } from '../../utils/goalPeak';
import { staggerStyle } from '../../utils/entrance';
import type { Goal } from '../../types/goal';
import { GROUND_H, layoutRangeFitting, textWidth, type RangeInput } from './heroRangeLayout';

/**
 * "Your range", drawn along the bottom of the Dashboard hero (Dashboard C, core edition, 2026-11-20).
 *
 * *** ONE OVERLAPPING RANGE ON AN EVENING SKY. *** Everest at the back (the climb everyone shares, 8,849 m, nobody's
 * goal), the person's goal peaks stepping forward around its base, green for saving and rust for debt, a faint hazy
 * range behind and a dark ground in front. Every shape is the shared, generated silhouette (`rangeSilhouettes.ts`,
 * real ridgelines from `tools/peaks/`), scaled uniformly: never stretched. Positions come from the pure
 * `heroRangeLayout.ts` (tested for 0, 1 and 5 goals).
 *
 * *** A GOAL'S MOUNTAIN IS SIZED BY THE GOAL; HOW FAR UP IS ITS PROGRESS (Harun 2026-11-20). *** The peak is the
 * server's `peak.size` on the money ladder (`goalPeakHeight`); a marker on each peak stands at the height of the
 * goal's `progress` (the server's), and the tallest unfinished one also says it in words ("38% up").
 *
 * *** THE CLIMBER IS ON EVEREST, AT THE PERSON'S ALTITUDE FROM ACTS, NEVER MONEY. *** `everest.altitude_m` is placed
 * on the South Col route by `everestRoute.ts`, on a dotted route revealed through a mask (so the dots stay dots).
 *
 * *** THE KIND IS A WORD, NOT ONLY A COLOUR (FINPAL-26 / D-269). *** Each label prints "saving" or "debt" on its second
 * line; the mountain, its height and the money are in the detail that opens on hover, focus or tap.
 *
 * Motion (plain CSS, `.fp-range-*` in finpal-theme.css): the peaks rise a beat apart, then the route draws and the
 * markers land, once; a `.fp-quiet` page fades it instead, and reduced motion draws it at rest.
 */

const MIN_HEIGHT = 140;
const MIN_WIDTH = 320;

export interface GoalRangeProps {
  everest?: { altitude_m: number; summit_m: number; at_summit: boolean } | null;
  goals: Goal[];
  currency: string;
  /** Where Everest's summit stands, as a share of the width (left of centre on a wide hero). */
  everestAt?: number;
}

const EVEREST_EXPLAINER =
  'Not one of your goals. Everyone on finPal climbs this one, and the summit is financial literacy: every act '
  + 'available to you, done. Your height on Everest comes only from what you do, like recording a detail of your own '
  + 'money or finishing a lesson, never from how much money you have. It only goes up.';

/** What is left on a goal, in the goal's own terms (money still to save, or interest a month). */
const remainingLabel = (goal: Goal, currency: string): string => {
  const peak = goal.peak;
  if (!peak) return '';
  if (peak.scale === 'cost') {
    // A debt with no stated rate: say so, never "nothing owed".
    if (peak.rate_unknown || peak.magnitude === null) return UNMEASURED_SUBLINE;
    return peak.magnitude > 0 ? `${formatMoney(peak.magnitude, { currency })} a month in interest` : 'Nothing owed';
  }
  const left = Math.max(0, (goal.target_amount ?? 0) - (goal.current_amount ?? 0));
  return left > 0 ? `${formatMoney(left, { currency })} still to save` : 'Finished';
};

const wrapLines = (text: string, maxChars: number): string[] => {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (line && (line + ' ' + word).length > maxChars) { out.push(line); line = word; } else line = line ? `${line} ${word}` : word;
  }
  if (line) out.push(line);
  return out;
};

/** The detail panel: drawn LAST, so it paints over every label (SVG has no z-index). */
const PeakDetail: React.FC<{ cx: number; top: number; width: number; lines: string[] }> = ({ cx, top, width, lines }) => {
  const longest = lines.reduce((n, l) => Math.max(n, l.length), 0);
  const w = Math.min(Math.max(longest * 6.6 + 24, 140), 320);
  const h = lines.length * 16 + 14;
  const x = Math.min(Math.max(cx - w / 2, 6), Math.max(6, width - w - 6));
  return (
    <g style={{ pointerEvents: 'none' }} data-testid="peak-detail">
      <rect x={x} y={top} width={w} height={h} rx="7" fill="var(--hero-panel)" stroke="var(--hero-panel-line)" strokeWidth="1" />
      {lines.map((line, i) => (
        <text key={line + i} x={x + 12} y={top + 20 + i * 16} style={{ fontSize: '12px', fill: 'var(--hero-panel-ink)' }}>{line}</text>
      ))}
    </g>
  );
};

/** The drawing's box, measured (the hero's art slot); fixed fallbacks where nothing lays out (tests). */
function useBox(fallback = { w: 560, h: 260 }): [React.RefObject<HTMLDivElement | null>, { w: number; h: number }] {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const read = () => {
      const w = el.clientWidth; const h = el.clientHeight;
      if (w > 0) setBox({ w, h: h > 0 ? h : fallback.h });
    };
    read();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- measured once, then by the observer
  return [ref, box];
}

export const GoalRange: React.FC<GoalRangeProps> = ({ goals, currency, everest, everestAt = 0.45 }) => {
  const [boxRef, box] = useBox();
  const measured = box.w;
  const [openPeak, setOpenPeak] = useState<string | null>(null);
  const fadeId = `fp-range-fade-${useId().replace(/:/g, '')}`;

  useEffect(() => {
    if (openPeak === null) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenPeak(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openPeak]);

  const climb = everest ?? null;
  const peaks = goals
    .filter((goal) => goal.peak !== undefined && goal.peak !== null)
    .map((goal) => {
      const peak = goal.peak!;
      return {
        goal,
        height: goalPeakHeight(peak),
        band: Math.max(0, Math.min(peak.band ?? 0, RANGE_SILHOUETTES.length - 1)),
        unmeasured: peak.unmeasured,
        finished: goalFinished(goal),
        up: goalProgress(goal),
      };
    });
  if (peaks.length === 0 && !climb) return null;

  const boxWidth = Math.max(measured, MIN_WIDTH);
  const height = Math.max(MIN_HEIGHT, box.h);
  const shapeFor = (p: typeof peaks[number]) => (p.unmeasured ? RANGE_UNMEASURED : RANGE_SILHOUETTES[p.band]);

  // "38% up" on the tallest unfinished goal, from the server's `progress` (the Goals card draws the same figure).
  const tallest = [...peaks].sort((a, b) => b.height - a.height).find((p) => !p.finished);
  const upOf = (p: typeof peaks[number]): string | null => {
    if (p !== tallest || typeof p.goal.progress !== 'number') return null;
    const pct = Math.round(Math.max(0, Math.min(1, p.goal.progress)) * 100);
    return pct > 0 ? `${pct}% up` : null;
  };

  const standing = climb && climb.altitude_m > 0 ? `you are at ${climb.altitude_m.toLocaleString('en-US')} m` : 'you are at base camp';
  const everestLabel = `Everest · ${standing}`;

  const inputs: RangeInput[] = peaks.map((p) => {
    const up = upOf(p);
    return {
      id: String(p.goal.id),
      height: p.height,
      summit: shapeSummit(shapeFor(p).body),
      label: up ? `${p.goal.name} · ${up}` : p.goal.name,
      sub: p.goal.peak ? peakKindLabel(p.goal.peak) : '',
    };
  });
  const layout = layoutRangeFitting(inputs, {
    width: boxWidth, height, hasEverest: Boolean(climb), everestLabel, everestAt: boxWidth >= 500 ? everestAt : 0.5,
  });
  // Wider than the box only when the labels could not all fit in it; the art then scrolls sideways.
  const width = layout.width;
  const landAt = layout.peaks.length + 2;

  const handlers = (id: string) => ({
    tabIndex: 0,
    role: 'button',
    'aria-expanded': openPeak === id,
    style: { cursor: 'pointer' } as React.CSSProperties,
    onMouseEnter: () => setOpenPeak(id),
    onMouseLeave: () => setOpenPeak((cur) => (cur === id ? null : cur)),
    onFocus: () => setOpenPeak(id),
    onBlur: () => setOpenPeak((cur) => (cur === id ? null : cur)),
    onClick: () => setOpenPeak((cur) => (cur === id ? null : id)),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenPeak((cur) => (cur === id ? null : id)); }
    },
  });
  /** A 44 px tall, label-wide target under a label's text (WCAG 2.5.5). */
  const hitArea = (cx: number, y: number, w: number) => (
    <rect data-testid="range-label-hit" x={cx - w / 2} y={y - 24} width={w} height={44} fill="transparent" />
  );

  const labelOf = (id: string) => layout.labels.find((l) => l.id === id)!;
  let openDetail: { cx: number; top: number; lines: string[] } | null = null;
  const { groundY } = layout;
  const hazeA = Array.from({ length: 9 }, (_, i) =>
    `L${((width / 8) * i).toFixed(0)},${(groundY - 80 - (i % 2 ? 26 : 0) - (i % 3) * 9).toFixed(0)}`).join(' ');
  const hazeB = Array.from({ length: 13 }, (_, i) =>
    `L${((width / 12) * i).toFixed(0)},${(groundY - 44 - (i % 2 ? 18 : 0) - (i % 4) * 5).toFixed(0)}`).join(' ');
  const groundPath = `M0,${groundY + 4} ${Array.from({ length: 9 }, (_, i) =>
    `L${((width / 8) * i).toFixed(0)},${(groundY + (i % 2 ? 0 : 8)).toFixed(0)}`).join(' ')} L${width},${height} L0,${height} Z`;

  const names = [...(climb ? ['Everest'] : []), ...peaks.map((p) => p.goal.name)];

  return (
    <div ref={boxRef} className="fp-hero-range" data-testid="goal-range" style={{ overflowX: width > measured ? 'auto' : undefined }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="group"
        aria-label={`Your goals as a mountain range: ${names.join(', ')}`}
        style={{ display: 'block', width: width > measured ? width : '100%', height: 'auto', overflow: 'visible' }}
      >
        <defs>
          <linearGradient id={`${fadeId}-g`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="0.24" stopColor="#ffffff" stopOpacity="1" />
          </linearGradient>
          <clipPath id={`${fadeId}-above`}><rect x="0" y="0" width={width} height={groundY + 2} /></clipPath>
          <mask id={fadeId} maskUnits="userSpaceOnUse" x="0" y="0" width={width} height={height}>
            <rect x="0" y="0" width={width} height={height} fill={`url(#${fadeId}-g)`} />
          </mask>
        </defs>
        {/* The far ranges: haze, decorative, no figure. */}
        <g mask={`url(#${fadeId})`}>
          <path d={`M0,${groundY} ${hazeA} L${width},${groundY} Z`} fill="var(--hero-haze)" opacity="0.22" />
          <path d={`M0,${groundY} ${hazeB} L${width},${groundY} Z`} fill="var(--hero-haze)" opacity="0.4" />
        </g>

        {/* EVEREST: at the back, drawn first so the goals stand in front of it. */}
        {layout.everest && (() => {
          const p = layout.everest.place;
          return (
            <g className="fp-range-peak" style={staggerStyle(0)} data-testid="range-everest">
              <g transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(${(p.sx ?? p.scale).toFixed(4)} ${p.scale.toFixed(4)})`} color="var(--peak-unmeasured)">
                <path d={EVEREST.body} fill="currentColor" />
                {EVEREST.shade && <path d={EVEREST.shade} fill="var(--hero-shadow)" />}
                {EVEREST.snow && <path d={EVEREST.snow} fill="var(--peak-snow)" opacity={EVEREST.snowOpacity ?? 0.9} />}
              </g>
            </g>
          );
        })()}

        {/* The South Col route, dotted, BEHIND the goals. Revealed by a solid mask path that draws itself
            (`.fp-range-route-draw`), so the dashes stay dashes. */}
        {layout.everest && climb && (() => {
          const d = routePath(layout.everest.place, layout.everest.approachX);
          return (
            <g clipPath={`url(#${fadeId}-above)`}>
              <mask id={`${fadeId}-route`} maskUnits="userSpaceOnUse" x="0" y="0" width={width} height={height}>
                <path className="fp-range-route-draw" style={staggerStyle(landAt - 1)} d={d} pathLength={1}
                  fill="none" stroke="#ffffff" strokeWidth="12" strokeLinecap="round" />
              </mask>
              <path data-testid="range-route" d={d} fill="none" stroke="var(--hero-gold)" strokeWidth="2"
                strokeDasharray="3 6" strokeLinecap="round" opacity="0.9" mask={`url(#${fadeId}-route)`} />
            </g>
          );
        })()}

        {/* The goals, back to front. */}
        {layout.peaks.map((placed) => {
          const peak = peaks.find((p) => String(p.goal.id) === placed.id)!;
          const shape = shapeFor(peak);
          const colour = peak.unmeasured ? 'var(--peak-unmeasured)'
            : peak.goal.peak?.scale === 'cost' ? 'var(--peak-cost)' : 'var(--peak-build)';
          return (
            <g key={placed.id} className="fp-range-peak" style={staggerStyle(placed.order)} data-testid="range-peak" data-kind={peak.goal.peak?.scale}>
              <g transform={`translate(${placed.x.toFixed(1)} ${placed.y.toFixed(1)}) scale(${placed.sx.toFixed(4)} ${placed.scale.toFixed(4)})`} color={colour}>
                <path d={shape.body} fill="currentColor" />
                {shape.shade && <path d={shape.shade} fill="var(--hero-shadow)" />}
                {shape.snow && <path d={shape.snow} fill="var(--peak-snow)" opacity={shape.snowOpacity ?? 0.9} />}
              </g>
            </g>
          );
        })}

        {/* The ground in front. */}
        <path d={groundPath} fill="var(--hero-ground)" mask={`url(#${fadeId})`} />

        {/* HOW FAR UP each goal is: a marker at the height of the goal's progress, foot to summit. */}
        {layout.peaks.map((placed) => {
          const peak = peaks.find((p) => String(p.goal.id) === placed.id)!;
          if (peak.unmeasured) return null;
          const y = groundY - peak.up * (groundY - placed.summitY);
          return (
            <circle key={`up-${placed.id}`} className="fp-range-land" style={staggerStyle(landAt)}
              data-testid="goal-progress-mark" data-progress={peak.up.toFixed(3)}
              cx={placed.summitX.toFixed(1)} cy={y.toFixed(1)} r="4.5"
              fill="var(--hero-label)" stroke="var(--hero-ground)" strokeWidth="2" />
          );
        })}

        {/* The climber at the person's altitude (from acts), over everything. */}
        {layout.everest && climb && (() => {
          const at = climbPoint(layout.everest.place, climb.altitude_m, layout.everest.approachX);
          return (
            <circle className="fp-range-land" style={staggerStyle(landAt)} data-testid="range-climber"
              cx={at.x.toFixed(1)} cy={at.y.toFixed(1)} r="6.5" fill="var(--hero-gold)" stroke="var(--hero-ground)" strokeWidth="2.5" />
          );
        })()}

        {/* Everest's label: in METRES, where the goals' details are in money. */}
        {layout.everest && climb && (() => {
          const l = labelOf('everest');
          const detail = [`${climb.summit_m.toLocaleString('en-US')} m — the shared summit`, ...wrapLines(EVEREST_EXPLAINER, 46)];
          if (openPeak === 'everest') openDetail = { cx: l.cx, top: l.y + 8, lines: detail };
          return (
            <g {...handlers('everest')} data-testid="range-label-everest"
              aria-label={`Everest, the shared climb. ${standing}. ${detail.join(' ')}`}>
              {hitArea(l.cx, l.y, l.width)}
              <text x={l.cx} y={l.y} textAnchor="middle" className="fp-hero-range__label fp-hero-range__label--gold">
                <tspan>Everest</tspan><tspan>{' · '}</tspan><tspan>{standing}</tspan>
              </text>
              {climb.at_summit && <Check aria-hidden="true" size={12} x={l.cx + textWidth(everestLabel) / 2 - 2} y={l.y - 10} color="var(--hero-gold)" />}
            </g>
          );
        })()}

        {/* Goal labels: name (with "38% up" on the tallest), then the kind word. */}
        {inputs.map((input) => {
          const peak = peaks.find((p) => String(p.goal.id) === input.id)!;
          const l = labelOf(input.id);
          const gp = peak.goal.peak;
          const detail = [
            [gp?.mountain?.name, gp?.mountain?.elevation_m ? peakElevation(gp.mountain.elevation_m) : null].filter(Boolean).join(' · '),
            remainingLabel(peak.goal, currency),
            gp?.apr != null ? `${gp.apr}% APR` : '',
            gp ? peakPayoffLine(gp, (n) => formatMoney(n, { currency })) ?? '' : '',
          ].filter(Boolean);
          if (openPeak === input.id) openDetail = { cx: l.cx, top: l.y + 22, lines: detail };
          const leaderFrom = l.y + 20;
          return (
            <g key={`label-${input.id}`} {...handlers(input.id)} data-testid="range-label"
              aria-label={`${peak.goal.name}${peak.finished ? ', finished' : ''}, ${input.sub}. ${detail.join('. ')}`}>
              {hitArea(l.cx, l.y + 7, l.width)}
              {l.anchorY - leaderFrom > 10 && (
                <line x1={l.anchorX} y1={leaderFrom} x2={l.anchorX} y2={l.anchorY - 4} stroke="var(--hero-sub)" strokeWidth="1" opacity="0.5" />
              )}
              <text x={l.cx} y={l.y} textAnchor="middle" className="fp-hero-range__label" {...({ translate: 'no' } as Record<string, string>)}>
                {input.label}
              </text>
              {peak.finished && <Check data-testid="finished-tick" size={12} aria-hidden="true"
                x={l.cx + textWidth(input.label) / 2 - 2} y={l.y - 10} color="var(--hero-label)" />}
              <text x={l.cx} y={l.y + 15} textAnchor="middle" className="fp-hero-range__sub">{input.sub}</text>
            </g>
          );
        })}

        {openDetail && (() => {
          const d = openDetail as { cx: number; top: number; lines: string[] };
          return <PeakDetail cx={d.cx} top={Math.min(d.top, height - GROUND_H - d.lines.length * 16 - 14)} width={width} lines={d.lines} />;
        })()}
      </svg>
      {peaks.length === 0 && (
        <Link to="/goals" className="fp-hero-range__invite">Set a goal and it appears here as a mountain</Link>
      )}
    </div>
  );
};

export default GoalRange;
