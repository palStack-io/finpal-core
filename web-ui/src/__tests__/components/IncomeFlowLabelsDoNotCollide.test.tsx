/**
 * *** THE LABELS WERE UNREADABLE TWICE AND NO GATE IN THIS REPO COULD SEE IT.
 * ***
 *
 * A Sankey's band height IS its figure, so on real spending the bands differ by
 * two orders of magnitude — the demo's Housing is £12,400 against a £18
 * Parking. Centre each label on its own band and six of them print on top of
 * each other. Fix that with a relaxation pass and the correction shift clips the
 * top label's ascender off the viewBox instead.
 *
 * Both were found by rendering the capture to a PNG and looking at it. Neither
 * is visible to anything that runs automatically:
 *
 *   the responsive walk measures OVERFLOW, and an overlap is inside the
 *   viewport — it reported ok at 1440, 1024, 768 and 390 with the labels in a
 *   pile. An svg clipping its own text does not overflow its container either.
 *
 *   the contrast walk measures COLOUR PAIRS, and the colours were never wrong.
 *   Two labels on top of each other are two correctly-coloured labels.
 *
 * `PageHead` carries the same lesson in its own docstring — *"the first version
 * placed them absolutely and they covered the subtitle at 390px, which no gate
 * can see because the responsive walk measures overflow and an overlap is
 * inside the viewport"*. This file is that lesson turned into an assertion, so
 * the third time is caught by the suite instead of by a screenshot.
 *
 * *** AND IT ASSERTS THE BANDS ARE UNTOUCHED, WHICH IS THE OTHER HALF. *** The
 * obvious fix for colliding labels is a minimum band height, and that is a lie:
 * it inflates the small figures and the picture stops summing, which is the one
 * property `incomeFlowConserves.test.ts` exists to protect. Labels may move;
 * bands may not.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { IncomeFlowChart } from '../../components/analytics/IncomeFlowChart';
import { incomeFlow } from '../../utils/incomeFlow';

/** The demo's own shape: one dominant category and a long thin tail. */
const FLOW = incomeFlow(
  [{ name: 'Income', amount: 9000 }, { name: 'Uncategorised', amount: 1900 }],
  [
    { name: 'Housing', amount: 12400 }, { name: 'Groceries', amount: 500.49 },
    { name: 'Shopping', amount: 357.11 }, { name: 'Transportation', amount: 215.5 },
    { name: 'Health & Fitness', amount: 149.97 }, { name: 'Electricity', amount: 134.5 },
    { name: 'Food & Dining', amount: 99.24 }, { name: 'Internet', amount: 79.99 },
    { name: 'Phone', amount: 60 }, { name: 'Parking', amount: 18 },
  ],
)!;

const money = (a: number) => `£${a.toFixed(2)}`;

function renderChart() {
  const { container } = render(<IncomeFlowChart flow={FLOW} format={money} />);
  const svg = container.querySelector('svg')!;
  const [, , , h] = svg.getAttribute('viewBox')!.split(' ').map(Number);
  return { container, svg, height: h };
}

/** Every label's `y`, split by which side of the chart it sits on. */
function labelRows(svg: SVGElement) {
  const mid = 500; // half of the 1000-unit viewBox
  const rows = [...svg.querySelectorAll('text')]
    .map((t) => ({
      x: Number(t.getAttribute('x')),
      y: Number(t.getAttribute('y')),
      text: t.textContent || '',
    }))
    // The middle node's two labels are centred and belong to neither stack.
    .filter((r) => Math.abs(r.x - mid) > 120);
  return {
    left: rows.filter((r) => r.x < mid).sort((a, b) => a.y - b.y),
    right: rows.filter((r) => r.x > mid).sort((a, b) => a.y - b.y),
  };
}

describe('the flow chart renders at all', () => {
  it('has a flow to draw and draws every node', () => {
    // Guards the guard: an empty svg satisfies every spacing assertion below.
    const { svg } = renderChart();
    const { left, right } = labelRows(svg);
    expect(left).toHaveLength(FLOW.inflows.length);
    expect(right).toHaveLength(FLOW.outflows.length);
    expect(right.length).toBeGreaterThan(3);
  });

  it('draws the overspent case, which is the one with the tightest labels', () => {
    expect(FLOW.net).toBeLessThan(0);
    const { svg } = renderChart();
    expect(svg.textContent).toContain('From savings or credit');
    expect(svg.textContent).toContain('Money moved');
  });
});

describe('no two labels overlap', () => {
  it.each(['left', 'right'] as const)('on the %s', (side) => {
    const { svg } = renderChart();
    const rows = labelRows(svg)[side];
    // 30 rather than the component's 34, so a small deliberate change to the
    // pitch does not fail this — what must never happen is text on text, and a
    // two-line label is about 27px of ink.
    for (let i = 1; i < rows.length; i += 1) {
      const gap = rows[i].y - rows[i - 1].y;
      expect(gap, `"${rows[i - 1].text}" and "${rows[i].text}" are ${gap} apart`)
        .toBeGreaterThanOrEqual(30);
    }
  });
});

describe('no label is clipped by the viewBox', () => {
  it('leaves room above the first and below the last', () => {
    const { svg, height } = renderChart();
    const { left, right } = labelRows(svg);
    for (const rows of [left, right]) {
      const first = rows[0];
      const last = rows[rows.length - 1];
      // A label's name sits on `y` and its figure 16 below, with a descender —
      // so the ink runs roughly y-7 to y+20. These are the bounds that the
      // two-shift version of the fit violated at the top.
      expect(first.y, `"${first.text}" is cut off the top`).toBeGreaterThanOrEqual(8);
      expect(last.y, `"${last.text}"'s figure is cut off the bottom`)
        .toBeLessThanOrEqual(height - 20);
    }
  });
});

describe('the bands are proportional and the labels did not change them', () => {
  it('keeps every band height a true fraction of the total', () => {
    const { svg } = renderChart();
    const bands = [...svg.querySelectorAll('rect')]
      .map((r) => Number(r.getAttribute('height')))
      // The middle node is the full height by definition; the two columns of
      // 8px-wide bands are what carry the figures.
      .filter((h) => h > 0);
    expect(bands.length).toBeGreaterThan(5);

    /* *** THE ASSERTION THAT FORBIDS THE EASY FIX. *** If somebody ever gives
       thin bands a minimum height to stop the labels colliding, the drawn
       heights stop summing to the drawn total and the chart quietly lies. The
       two 8px columns each sum to the same usable height, so comparing the two
       sides' totals catches an inflated band on either. */
    const svgH = Number(svg.getAttribute('viewBox')!.split(' ')[3]);
    const columns = [...svg.querySelectorAll('rect')]
      .filter((r) => Number(r.getAttribute('width')) === 8);
    const leftTotal = columns
      .filter((r) => Number(r.getAttribute('x')) < 500)
      .reduce((t, r) => t + Number(r.getAttribute('height')), 0);
    const rightTotal = columns
      .filter((r) => Number(r.getAttribute('x')) > 500)
      .reduce((t, r) => t + Number(r.getAttribute('height')), 0);

    expect(leftTotal).toBeGreaterThan(0);
    // The two sides carry the same total value, so they must occupy the same
    // total height — within a pixel or two of the MIN_BAND floor applied to a
    // hairline flow.
    expect(Math.abs(leftTotal - rightTotal)).toBeLessThan(svgH * 0.06);
  });
});
