/**
 * D-60 — the loading spinner must actually read as spinning.
 *
 * The SVG is the two-part spinner: a full circle as a faint track, with a
 * stronger arc rotating over it. The rotation is only visible because the two
 * differ in opacity — `.animate-spin` turns the whole SVG, so if track and arc
 * are equally opaque the result is a uniform ring that looks static no matter
 * how fast it turns.
 *
 * `opacity-25`/`opacity-75` supplied that contrast until the Tailwind toolchain
 * was removed and the classes stopped resolving. Nothing failed: no console
 * warning, no build error, and every other spinner in the app was unaffected
 * because they use lucide icons or Loading.tsx's counter-rotating rings, which
 * carry their own shape.
 *
 * The sibling gate (cssClassesAreDefined) catches the general case of a class
 * with no rule. This asserts the specific thing a user sees, on the RENDERED
 * element rather than on the source text, because the source read fine
 * throughout.
 */
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Button } from '../../components/common/Button';

function spinnerParts(container: HTMLElement) {
  const svg = container.querySelector('svg');
  if (!svg) throw new Error('no spinner rendered');
  const track = svg.querySelector('circle');
  const arc = svg.querySelector('path');
  if (!track || !arc) throw new Error('spinner is missing its track or its arc');
  return { svg, track, arc };
}

const opacityOf = (el: Element) =>
  Number.parseFloat(getComputedStyle(el).opacity || '1');

describe('Button loading spinner', () => {
  it('renders a spinner only while loading', () => {
    const idle = render(<Button>Save</Button>);
    expect(idle.container.querySelector('svg')).toBeNull();

    const busy = render(<Button isLoading>Save</Button>);
    expect(busy.container.querySelector('svg')).not.toBeNull();
  });

  it('draws the track and the arc at different opacities', () => {
    const { container } = render(<Button isLoading>Save</Button>);
    const { track, arc } = spinnerParts(container);

    const trackOpacity = opacityOf(track);
    const arcOpacity = opacityOf(arc);

    // The defect: both resolved to 1, so this equality held and the ring
    // rendered as one flat shape.
    expect(trackOpacity).not.toEqual(arcOpacity);

    // Direction matters too — a faint track UNDER a stronger arc. Inverted, it
    // reads as a hole travelling round a solid ring.
    expect(trackOpacity).toBeLessThan(arcOpacity);
    expect(trackOpacity).toBeLessThan(1);
  });

  it('still rotates', () => {
    const { container } = render(<Button isLoading>Save</Button>);
    const { svg } = spinnerParts(container);
    // .animate-spin is hand-defined in index.css and is covered by the
    // className gate; without it the opacities above would be decoration.
    expect(svg.getAttribute('class')).toContain('animate-spin');
  });
});
