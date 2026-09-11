import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { MountainSilhouette } from '../../components/MountainSilhouette';
import {
  MIN_MEASURED_HEIGHT, MOUNTAIN_SILHOUETTES, UNMEASURED_RIDGE,
} from '../../utils/mountainSilhouettes';

const svgOf = (container: HTMLElement) => {
  const svg = container.querySelector('svg');
  if (!svg) throw new Error('no svg rendered');
  return svg;
};

const box = (container: HTMLElement) => {
  const svg = svgOf(container);
  return {
    width: Number(svg.getAttribute('width')),
    height: Number(svg.getAttribute('height')),
    viewBox: svg.getAttribute('viewBox'),
    par: svg.getAttribute('preserveAspectRatio'),
  };
};

describe('MountainSilhouette — the paths are never stretched', () => {
  // *** THIS IS THE TEST THE MOCKUPS WOULD HAVE FAILED. *** Every silhouette in
  // `docs/mockups/silhouettes.html` carries `preserveAspectRatio="none"`, which
  // is exactly the stretching the design forbids in capitals. The mockups look
  // right only because each grid cell happens to be ~100px wide, the same as the
  // viewBox, so their distortion is zero by coincidence.
  it.each(MOUNTAIN_SILHOUETTES.map((s, band) => [band, s.boxHeight] as const))(
    'band %i keeps the aspect ratio of its own 100 x %i box',
    (band, boxHeight) => {
      const { container } = render(
        <MountainSilhouette band={band} height={100} scale="cost" maxPixelHeight={80} />,
      );
      const { width, height, viewBox } = box(container);
      expect(viewBox).toBe(`0 0 100 ${boxHeight}`);
      // The rendered box must have the SAME aspect as the viewBox, or the path
      // inside it is distorted.
      expect(width / height).toBeCloseTo(100 / boxHeight, 5);
    },
  );

  it('never sets preserveAspectRatio="none", at any band or size', () => {
    for (const band of [0, 1, 2, 3, 4, 5, null]) {
      const { container } = render(
        <MountainSilhouette band={band} height={55} scale="build" maxPixelHeight={40} />,
      );
      expect(box(container).par).not.toBe('none');
      expect(box(container).par).toBe('xMidYMax meet');
    }
  });

  it('scales both dimensions together when maxPixelHeight changes', () => {
    const small = render(
      <MountainSilhouette band={3} height={70} scale="cost" maxPixelHeight={40} />,
    );
    const big = render(
      <MountainSilhouette band={3} height={70} scale="cost" maxPixelHeight={120} />,
    );
    const a = box(small.container);
    const b = box(big.container);
    expect(b.height / a.height).toBeCloseTo(3, 5);
    expect(b.width / a.width).toBeCloseTo(3, 5);
  });
});

describe('MountainSilhouette — the ladder is legible without labels', () => {
  it('draws a DIFFERENT shape per band, not one shape at six sizes', () => {
    const paths = MOUNTAIN_SILHOUETTES.map((_, band) => {
      const { container } = render(
        <MountainSilhouette band={band} height={100} scale="cost" maxPixelHeight={80} />,
      );
      return container.querySelector('path')!.getAttribute('d');
    });
    expect(new Set(paths).size).toBe(MOUNTAIN_SILHOUETTES.length);
  });

  // *** THIS TEST FAILED FIRST AND THE TEST WAS THE THING THAT WAS WRONG. ***
  // It asserted that a higher band draws taller at the same `height` input. It
  // does not, and it must not: with the summit pinned to the magnitude, the band
  // shows up as the peak's WIDTH and outline. A higher band draws taller in
  // practice only because a higher band MEANS a bigger magnitude means a bigger
  // `height`. Had the component been changed to satisfy the original assertion,
  // summit height would have become a function of the band and a £5 boundary
  // would have jumped a goal a whole step.
  it('pins the summit to the magnitude, so the band changes the WIDTH', () => {
    const rendered = MOUNTAIN_SILHOUETTES.map((_, band) => {
      const { container } = render(
        <MountainSilhouette band={band} height={100} scale="cost" maxPixelHeight={100} />,
      );
      return box(container);
    });
    // Same magnitude in, same summit height out, whatever the band.
    for (const r of rendered) expect(r.height).toBeCloseTo(rendered[0].height, 5);
    // And the width falls as the mountains get steeper: Table Mountain is wide
    // and flat, Everest is narrow and tall. That IS the shape difference.
    for (let i = 1; i < rendered.length; i += 1) {
      expect(rendered[i].width).toBeLessThan(rendered[i - 1].width);
    }
  });

  // The band LADDER is the other pinning, and it is the one the mockup draws.
  it('fit="width" gives the ladder: one width, a taller box per band', () => {
    const heights = MOUNTAIN_SILHOUETTES.map((_, band) => {
      const { container } = render(
        <MountainSilhouette band={band} height={50} scale="cost"
                            maxPixelHeight={100} fit="width" />,
      );
      const b = box(container);
      expect(b.width).toBeCloseTo(100, 5);
      expect(b.width / b.height).toBeCloseTo(100 / MOUNTAIN_SILHOUETTES[band].boxHeight, 5);
      return b.height;
    });
    for (let i = 1; i < heights.length; i += 1) {
      expect(heights[i]).toBeGreaterThan(heights[i - 1]);
    }
  });

  it('fit="width" ignores the magnitude entirely, which is why it is legend-only', () => {
    const a = render(
      <MountainSilhouette band={3} height={20} scale="cost" maxPixelHeight={100} fit="width" />,
    );
    const b = render(
      <MountainSilhouette band={3} height={90} scale="cost" maxPixelHeight={100} fit="width" />,
    );
    expect(box(a.container).height).toBeCloseTo(box(b.container).height, 5);
  });

  it('has no snow on Table Mountain, whose flat top is the whole identity', () => {
    const { container } = render(
      <MountainSilhouette band={0} height={100} scale="cost" maxPixelHeight={80} />,
    );
    expect(container.querySelectorAll('path')).toHaveLength(1);
  });
});

describe('MountainSilhouette — unmeasured is not small, and zero is not unmeasured', () => {
  it('draws the flat ridge for an unmeasured peak, in the muted colour', () => {
    const { container } = render(
      <MountainSilhouette band={null} height={0} scale="cost" maxPixelHeight={80} unmeasured />,
    );
    const svg = svgOf(container);
    expect(box(container).viewBox).toBe(`0 0 100 ${UNMEASURED_RIDGE.boxHeight}`);
    expect(svg.getAttribute('style')).toContain('--peak-unmeasured');
    // No summit, no snow: it is deliberately NOT a mountain.
    expect(container.querySelectorAll('path')).toHaveLength(1);
  });

  it('ignores `height` for the ridge, so "we do not know" has no magnitude', () => {
    const a = render(
      <MountainSilhouette band={null} height={0} scale="cost" maxPixelHeight={80} unmeasured />,
    );
    const b = render(
      <MountainSilhouette band={null} height={95} scale="cost" maxPixelHeight={80} unmeasured />,
    );
    expect(box(a.container).height).toBe(box(b.container).height);
  });

  // *** A 0% APR ON A REAL BALANCE IS MEASURED. *** `monthlyInterestCost` returns
  // null only when NO account states a rate, so an explicit 0% gives magnitude 0
  // and the arithmetic says height 0 -- an invisible mountain, indistinguishable
  // from a broken card. A 0% balance transfer is common and "this costs you
  // nothing" is the most encouraging thing the card can say.
  it('floors a measured peak of zero magnitude so it is still drawn', () => {
    const { container } = render(
      <MountainSilhouette band={0} height={0} scale="cost" maxPixelHeight={100} />,
    );
    const { height } = box(container);
    expect(height).toBeGreaterThan(0);
    expect(height).toBeCloseTo(MIN_MEASURED_HEIGHT, 5);
  });

  it('makes a zero-cost mountain and the unmeasured ridge look different', () => {
    const zero = render(
      <MountainSilhouette band={0} height={0} scale="cost" maxPixelHeight={100} />,
    );
    const ridge = render(
      <MountainSilhouette band={null} height={0} scale="cost" maxPixelHeight={100} unmeasured />,
    );
    const z = zero.container.querySelector('path')!.getAttribute('d');
    const r = ridge.container.querySelector('path')!.getAttribute('d');
    expect(z).not.toBe(r);
    // Different width too, so they are not merely differently-coloured twins.
    expect(box(zero.container).width).not.toBeCloseTo(box(ridge.container).width, 1);
    expect(svgOf(zero.container).getAttribute('style')).toContain('--peak-cost');
    expect(svgOf(ridge.container).getAttribute('style')).toContain('--peak-unmeasured');
  });
});

describe('MountainSilhouette — the colour carries the never-compare rule', () => {
  it('uses clay for cost and forest for build, never the same variable', () => {
    const cost = render(
      <MountainSilhouette band={2} height={50} scale="cost" maxPixelHeight={80} />,
    );
    const build = render(
      <MountainSilhouette band={2} height={50} scale="build" maxPixelHeight={80} />,
    );
    expect(svgOf(cost.container).getAttribute('style')).toContain('--peak-cost');
    expect(svgOf(build.container).getAttribute('style')).toContain('--peak-build');
  });
});

describe('MountainSilhouette — defensive and accessible', () => {
  it('clamps a band off the end of the ladder rather than rendering nothing', () => {
    for (const band of [-3, 6, 99, 2.7]) {
      const { container } = render(
        <MountainSilhouette band={band} height={50} scale="cost" maxPixelHeight={80} />,
      );
      expect(container.querySelector('path')).not.toBeNull();
      expect(box(container).height).toBeGreaterThan(0);
    }
  });

  it('is hidden from assistive tech when it is decoration behind a card', () => {
    const { container } = render(
      <MountainSilhouette band={4} height={80} scale="cost" maxPixelHeight={100}
                          decorative title="ignored" />,
    );
    const svg = svgOf(container);
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('role')).toBeNull();
    expect(container.querySelector('title')).toBeNull();
  });

  it('names itself when it is not decoration', () => {
    const { container } = render(
      <MountainSilhouette band={4} height={80} scale="cost" maxPixelHeight={100}
                          title="Aconcagua, 6,961 m" />,
    );
    const svg = svgOf(container);
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe('Aconcagua, 6,961 m');
    expect(container.querySelector('title')?.textContent).toBe('Aconcagua, 6,961 m');
  });
});
