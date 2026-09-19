/**
 * Where the money came from and where it went, drawn as a flow.
 *
 * *** HAND-DRAWN SVG, NOT A SANKEY LIBRARY, AND THE REASON IS THE DATA RATHER
 * THAN THE BUNDLE SIZE. *** A general Sankey solver exists to route many nodes
 * across many columns and to resolve crossings. This chart has exactly three
 * columns and no crossings by construction: every inflow goes to the one middle
 * node and the middle node goes to every outflow. Laying that out is an
 * accumulated offset down each side, which is twenty lines — and a solver would
 * bring its own opinions about what to do with a zero-width link, which is
 * precisely the case `incomeFlow` refuses on purpose.
 *
 * *** THE ARITHMETIC IS NOT HERE. *** `utils/incomeFlow.ts` owns it and
 * `incomeFlowConserves.test.ts` proves the two sides match to the cent,
 * including when the period overspent. This file turns values into pixels and
 * must not decide anything — the same split as `TotalsRow`, which is
 * deliberately dumb so the caller that has the data owns the formatting.
 *
 * *** AND EVERY LABEL CARRIES ITS OWN FIGURE. *** A flow diagram is read by
 * comparing widths, and widths are exactly what a reader cannot measure. D-102
 * is this project's row for a caption that disagreed with its own chart; the
 * defence is that the number beside the band comes from the same node the band
 * was drawn from, so there is nothing for it to disagree with.
 */

import React from 'react';
import type { FlowNode, IncomeFlow } from '../../utils/incomeFlow';

interface IncomeFlowChartProps {
  flow: IncomeFlow;
  /** Already-bound formatter, so this file owns no currency knowledge. */
  format: (amount: number) => string;
  /**
   * Open a spending slice. Absent means the chart stays a picture.
   *
   * *** ONLY THE SPENDING SIDE, AND ONLY NODES THE SERVER GAVE IDS FOR. ***
   * An income node has no "who did we pay" to answer, and a node whose ids
   * the backend never sent cannot be opened without guessing which rows it
   * meant. Both stay inert rather than offering a control that misleads.
   */
  onOpenSlice?: (node: FlowNode) => void;
  /** The slice currently open, so the chart can mark it. */
  openSliceId?: string | null;
}

/** Geometry. One viewBox, scaled by CSS — the chart is a band, not a square. */
const W = 1000;
const COL = 190;          // node column width
const MID_X = (W - COL) / 2;
const GAP = 10;           // vertical gap between stacked nodes
const MIN_BAND = 3;       // a band thinner than this is invisible, not subtle

/**
 * Colour by ROLE, not by category.
 *
 * Nine categories with nine hues is a legend nobody reads; what a reader needs
 * from this chart is which side a band is on and whether it is a real category
 * or a bundle. Income green, spending clay, and the two "not a category" nodes
 * — Unspent and the shortfall — in their own inks so they cannot be mistaken
 * for a line item. `--au-ink` and `--re-ink` are the theme's amber and red
 * TEXT inks, which are the pair measured to clear AA on both themes' cards.
 */
function inkFor(node: FlowNode): string {
  if (node.id === 'out-unspent') return 'var(--g-ink)';
  if (node.id === 'in-shortfall') return 'var(--re-ink)';
  if (node.bundled) return 'var(--text-secondary)';
  return node.side === 'in' ? 'var(--amount-income)' : 'var(--au-ink)';
}

interface Placed extends FlowNode {
  /** Top of the BAND. Proportional to the value, and never adjusted. */
  y: number;
  height: number;
  /** Centre of the LABEL, which is allowed to move. See `deCollide`. */
  labelY: number;
}

/**
 * *** LABELS MOVE; BANDS DO NOT. ***
 *
 * A label centred on its own band is right until the bands differ by two orders
 * of magnitude, which is the normal case for real spending: on the demo's own
 * figures Housing is £12,400 and Parking is £18, so six categories share a
 * 40px strip at the bottom and their labels print on top of each other. The
 * first render of this chart did exactly that — "Transportation", "Health &
 * Fitness", "Electricity" and "4 smaller categories" overlapped into an
 * unreadable block.
 *
 * *** AND NO GATE HERE COULD SEE IT. *** Nothing overflowed: the text is inside
 * the viewport at every width, so the responsive walk reported ok at 1440, 1024,
 * 768 and 390, and the contrast walk measured every pair correctly because the
 * colours were never the problem. `PageHead`'s own comment records the same
 * discovery — *"the first version placed them absolutely and they covered the
 * subtitle at 390px, which no gate can see because the responsive walk measures
 * overflow and an overlap is inside the viewport."* It was found by rendering
 * the capture to a PNG and looking at it.
 *
 * The fix must not be "give every band a minimum height". That is the obvious
 * one and it is a lie: the band's height IS the figure, and inflating the small
 * ones makes the picture stop summing — the exact property
 * `incomeFlowConserves.test.ts` exists to protect. So the bands keep their true
 * heights and the LABELS get their own layout: start at the band centre, then
 * push apart to a minimum pitch, then pull back inside the box. A label may end
 * up a little off its band; it is still in the same order, and legible beats
 * precisely aligned and unreadable.
 */
const LABEL_PITCH = 34;   // two lines of 13px/12px text, plus air
/*
 * *** THE VERTICAL BOUNDS ARE NOT `PITCH / 2`, AND THE FIRST VERSION WAS. ***
 * A label is TWO lines: the name on the baseline at `labelY` and the figure at
 * `dy=16` below it. So the ink extends from about `labelY - 7` (the name's
 * ascender) to about `labelY + 20` (the figure's descender) — asymmetric, and
 * bounding it by half a pitch either side clipped the bottom label's FIGURE
 * off the edge of the viewBox. Visible in the render, invisible to both walks:
 * an svg's own viewBox does not overflow its container, so there is nothing for
 * the responsive walk to measure, and the clipped text is still the same colour.
 * Measured off the rendered PNG, not guessed.
 */
const LABEL_TOP = 10;
const LABEL_BOTTOM = 22;

function deCollide(placed: Placed[], height: number): Placed[] {
  const out = placed.map((p) => ({ ...p }));

  // Forward: nothing may sit closer than a pitch to the one above it.
  for (let i = 1; i < out.length; i += 1) {
    const min = out[i - 1].labelY + LABEL_PITCH;
    if (out[i].labelY < min) out[i].labelY = min;
  }

  // Backward: the forward pass can push the last one off the bottom, so walk up
  // again. Two passes are enough because the constraint is one-dimensional and
  // the order never changes.
  for (let i = out.length - 2; i >= 0; i -= 1) {
    const max = out[i + 1].labelY - LABEL_PITCH;
    if (out[i].labelY > max) out[i].labelY = max;
  }

  // And keep the whole stack inside the box. If the nodes genuinely cannot fit
  // — more than `height / LABEL_PITCH` of them — they are evenly spread rather
  // than clipped, which is the honest failure: readable and slightly detached,
  // instead of some labels invisible.
  /* *** ONE FIT, NOT TWO SHIFTS — AND THE TWO-SHIFT VERSION CLIPPED THE TOP.
     *** The first version nudged the stack down if the first label was too
     high, then nudged it up if the last was too low. The second nudge undoes
     the first: with a 12,400 Housing band, every label below it gets pushed
     down by a pitch, the last one ends well past the bottom, and the corrective
     shift pulls the WHOLE stack up until "Housing" loses its ascender off the
     top edge. Two constraints applied in sequence means the last one wins.
     Seen in the render; neither walk can see an svg clipping its own text.

     So: measure the span once, and either it fits — in which case ONE shift
     places it, and which shift is decided before either is applied — or it does
     not, in which case the labels are spread across the available room. */
  const first = out[0];
  const last = out[out.length - 1];
  if (!first || !last) return out;

  const top = LABEL_TOP;
  const bottom = height - LABEL_BOTTOM;
  const room = bottom - top;
  const span = last.labelY - first.labelY;

  if (span >= room) {
    // Genuinely more labels than fit. Spread evenly rather than clip: a
    // slightly detached label is readable and a missing one is not.
    const step = room / Math.max(1, out.length - 1);
    out.forEach((p, i) => { p.labelY = top + i * step; });
    return out;
  }

  const shift = first.labelY < top
    ? top - first.labelY
    : (last.labelY > bottom ? bottom - last.labelY : 0);
  if (shift !== 0) out.forEach((p) => { p.labelY += shift; });
  return out;
}

/** Stack one side down a column, scaled so the whole side fills `height`. */
/**
 * Stack one side down a column at a SHARED scale.
 *
 * *** THE TWO SIDES USED DIFFERENT SCALES AND THAT IS THE ONE MISTAKE THIS
 * CHART CANNOT MAKE. *** The first version computed `usable = height - GAP *
 * (nodes.length - 1)` per side. The inflow column has three nodes and the
 * outflow column seven, so the inflows were laid out at 302px per total and the
 * outflows at 262px — meaning a £9,000 inflow band was drawn TALLER than a
 * £9,000 outflow band. On a diagram whose entire claim is that the width
 * entering a node is the width leaving it, that is the claim being false in
 * pixels while every figure printed beside it is correct.
 *
 * Caught by `IncomeFlowLabelsDoNotCollide.test.ts` comparing the two columns'
 * total band heights — 39px apart on a 322px box. Not visible in a screenshot:
 * a 13% scale difference between two columns is exactly the kind of thing the
 * eye accepts, which is why it is asserted rather than looked at.
 *
 * `usable` is therefore derived from the side with MORE nodes — the tighter
 * constraint — so neither column can overflow, and both convert value to pixels
 * with the same factor. The shorter side simply ends higher up, which is honest:
 * it has fewer gaps to pay for.
 */
function place(
  nodes: FlowNode[], total: number, height: number, usable: number,
): Placed[] {
  let y = 0;
  const bands = nodes.map((node) => {
    const h = Math.max(MIN_BAND, total > 0 ? (node.value / total) * usable : 0);
    const placed: Placed = { ...node, y, height: h, labelY: y + h / 2 };
    y += h + GAP;
    return placed;
  });
  return deCollide(bands, height);
}

export const IncomeFlowChart: React.FC<IncomeFlowChartProps> = ({
  flow, format, onOpenSlice, openSliceId,
}) => {
  /* Height follows the node count so bands stay readable: eight categories in
     a fixed 320px box gives 30px bands with 10px gaps, and the labels collide.
     52px per node is the smallest that fits a name and a figure on two lines. */
  const rows = Math.max(flow.inflows.length, flow.outflows.length);
  /* 46px per node was 52 and is now driven by the label pitch plus air: the
     labels are what need the room, and `deCollide` spreads them evenly rather
     than clipping if they still do not fit. */
  const H = Math.max(300, rows * (LABEL_PITCH + 12));

  /* One scale for both columns. See `place`. The side with more nodes pays for
     more gaps, so it sets the ceiling for both. */
  const usable = H - GAP * Math.max(0, rows - 1);
  const left = place(flow.inflows, flow.total, H, usable);
  const right = place(flow.outflows, flow.total, H, usable);

  /* The middle node is the full height by definition — it is the total, and
     both sides sum to it. That is the claim the chart makes, and it is checked
     in `incomeFlowConserves.test.ts` rather than assumed here. */
  let leftCursor = 0;
  let rightCursor = 0;

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', minWidth: 640, height: 'auto', display: 'block' }}
        role="img"
        aria-label={
          flow.net >= 0
            ? `Flow of ${format(flow.total)} in, ${format(flow.spent)} spent, `
              + `${format(flow.net)} unspent`
            : `Flow of ${format(flow.earned)} earned against ${format(flow.spent)} spent, `
              + `${format(-flow.net)} of it from savings or credit`
        }
      >
        {/* ── the links, drawn first so the nodes sit on top ──────────────── */}
        {left.map((node) => {
          const y0 = node.y;
          const y1 = leftCursor;
          leftCursor += node.height;
          const x0 = COL;
          const x1 = MID_X;
          const mx = (x0 + x1) / 2;
          return (
            <path
              key={`l-${node.id}`}
              d={`M${x0},${y0} C${mx},${y0} ${mx},${y1} ${x1},${y1}`
                + ` L${x1},${y1 + node.height} C${mx},${y1 + node.height}`
                + ` ${mx},${y0 + node.height} ${x0},${y0 + node.height} Z`}
              fill={inkFor(node)}
              opacity={0.22}
            />
          );
        })}
        {right.map((node) => {
          const y0 = rightCursor;
          rightCursor += node.height;
          const y1 = node.y;
          const x0 = MID_X + COL;
          const x1 = W - COL;
          const mx = (x0 + x1) / 2;
          return (
            <path
              key={`r-${node.id}`}
              d={`M${x0},${y0} C${mx},${y0} ${mx},${y1} ${x1},${y1}`
                + ` L${x1},${y1 + node.height} C${mx},${y1 + node.height}`
                + ` ${mx},${y0 + node.height} ${x0},${y0 + node.height} Z`}
              fill={inkFor(node)}
              opacity={0.22}
            />
          );
        })}

        {/* ── the nodes ─────────────────────────────────────────────────────── */}
        {left.map((node) => (
          <rect key={`ln-${node.id}`} x={COL - 8} y={node.y} width={8}
            height={node.height} fill={inkFor(node)} rx={2} />
        ))}
        <rect x={MID_X} y={0} width={COL} height={H} fill="var(--g-wash)" rx={4} />
        {right.map((node) => (
          <rect key={`rn-${node.id}`} x={W - COL} y={node.y} width={8}
            height={node.height} fill={inkFor(node)} rx={2} />
        ))}

        {/* *** THE HIT TARGET IS A BAND, NOT THE 8px BAR. *** An 8px-wide
            rect is a control nobody can hit and a focus ring nobody can see.
            This covers the node's bar and its whole label column, which is
            the region a reader would point at anyway. Drawn transparent and
            AFTER the bars so it takes the events; the labels below are
            `pointer-events: none` inside it so they never swallow a click.

            *** A BUTTON, NOT AN onClick ON A <rect>. *** Same rule the range
            peaks learned: a mouse-only control on a chart is a control that
            does not exist on a phone or to a keyboard. */}
        {onOpenSlice && right.map((node) => (
          node.categoryIds === undefined ? null : (
            <g
              key={`rh-${node.id}`}
              role="button"
              tabIndex={0}
              aria-label={`${node.label}, ${format(node.value)}. Show what it was spent on.`}
              aria-pressed={openSliceId === node.id}
              onClick={() => onOpenSlice(node)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onOpenSlice(node);
                }
              }}
              style={{ cursor: 'pointer' }}
            >
              <rect
                x={W - COL} y={node.y - 2} width={COL}
                height={Math.max(node.height, LABEL_PITCH) + 4}
                fill={openSliceId === node.id ? 'var(--g-wash)' : 'transparent'}
                rx={4}
              />
            </g>
          )
        ))}

        {/* ── labels. Each carries its own figure; see the header. ─────────── */}
        {left.map((node) => (
          <text key={`lt-${node.id}`} x={COL - 16} y={node.labelY}
            textAnchor="end" dominantBaseline="middle"
            fill="var(--text-primary)" fontSize={13}>
            <tspan fontWeight={600}>{node.label}</tspan>
            <tspan x={COL - 16} dy={16} fill="var(--text-secondary)" fontSize={12}>
              {format(node.value)}
            </tspan>
          </text>
        ))}
        {/* `pointer-events: none`: the label sits ON the hit band above,
            and a <text> that takes the click makes the control feel dead
            wherever the words happen to be. */}
        {right.map((node) => (
          <text pointerEvents="none" key={`rt-${node.id}`} x={W - COL + 16} y={node.labelY}
            dominantBaseline="middle"
            fill="var(--text-primary)" fontSize={13}>
            <tspan fontWeight={600}>{node.label}</tspan>
            <tspan x={W - COL + 16} dy={16} fill="var(--text-secondary)" fontSize={12}>
              {format(node.value)}
            </tspan>
          </text>
        ))}

        {/* The middle node says what it is and what it totals. When the period
            overspent, `total` is what was SPENT rather than what was earned —
            saying "income" there would be wrong, so the label follows the
            case. */}
        <text x={MID_X + COL / 2} y={H / 2 - 8} textAnchor="middle"
          fill="var(--g-ink)" fontSize={13} fontWeight={700}>
          {flow.net >= 0 ? 'Income' : 'Money moved'}
        </text>
        <text x={MID_X + COL / 2} y={H / 2 + 12} textAnchor="middle"
          fill="var(--g-ink)" fontSize={16} fontWeight={700}>
          {format(flow.total)}
        </text>
      </svg>
    </div>
  );
};

export default IncomeFlowChart;
