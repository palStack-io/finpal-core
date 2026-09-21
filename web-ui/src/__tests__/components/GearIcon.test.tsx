/**
 * learnPal gear: a CSS mask painted with `currentColor`.
 *
 * *** THIS FILE USED TO TEST A `fetch`, AND THE FETCH IS GONE — SO THE TESTS
 * CHANGED MEANING RATHER THAN BEING DELETED. *** 2026-09-20: every glyph in
 * the app rendered as an empty box in a real browser while Playwright, on
 * the identical URL, rendered them fine. The difference was the request
 * TYPE: a tab loading the SVG is a `document` request, `fetch()` is an
 * `xhr` request, and a content blocker that STALLS rather than rejects
 * produces exactly that — no artwork, and no emoji fallback either, because
 * the old code only fell back on a REJECTED promise and this one never
 * settled. Mobile was never affected, which is the tell: it maps bundled
 * assets and makes no runtime request at all.
 *
 * *** THE PROPERTY THAT STILL MATTERS MOST IS THE SAME ONE. *** The old
 * version inlined markup because an `<img>` cannot inherit `color`, so
 * `fill="currentColor"` would resolve to nothing and every icon would be
 * invisible in one theme — D-60's bug class. A mask keeps that guarantee by
 * a different route: it has no colour of its own, and
 * `background-color: currentColor` paints through it.
 *
 * *** AND TWO OLD TESTS ARE GONE BECAUSE THE RISK IS GONE, NOT IGNORED. ***
 * "Refuses an HTML 404 page served with status 200" and "refuses a body
 * that is not an svg" both guarded `dangerouslySetInnerHTML` against an SPA
 * dev server answering an unknown path with index.html. There is no
 * `innerHTML` any more: a mask that cannot load paints nothing. The
 * injection surface was removed rather than defended.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GearIcon, GEAR_EMOJI, GEAR_SLUGS } from '../../components/GearIcon';

const maskOf = (el: HTMLElement) =>
  el.style.getPropertyValue('mask-image') || el.style.getPropertyValue('-webkit-mask-image');

describe('GearIcon', () => {
  it('*** PAINTS `currentColor` THROUGH A MASK, SO IT INHERITS ***', () => {
    /* The whole reason this component exists rather than an `<img>`. If the
       colour stops being `currentColor`, every icon goes one fixed shade and
       is invisible in one theme — silently, which is D-60. */
    render(<GearIcon slug="rope" size={40} label="Rope" />);
    const el = screen.getByRole('img', { name: 'Rope' });
    expect(el.style.backgroundColor).toBe('currentcolor');
    expect(maskOf(el)).toContain('/gear/rope.svg');
  });

  it('*** MAKES NO NETWORK REQUEST AT ALL ***', () => {
    /* The bug this rewrite fixes. A mask loads through the image pipeline;
       if this component ever reaches for `fetch` again it becomes stallable
       by the same thing that broke it. */
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    render(<GearIcon slug="tent" size={40} />);
    expect(spy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('sizes the mask to CONTAIN, so wider drawings are not cropped', () => {
    render(<GearIcon slug="map" size={40} label="Map" />);
    const el = screen.getByRole('img', { name: 'Map' });
    const size = el.style.getPropertyValue('mask-size')
      || el.style.getPropertyValue('-webkit-mask-size');
    expect(size).toBe('contain');
  });

  it('renders a dot for a slug nobody has drawn, rather than a broken mask', () => {
    /* A mask pointing at a file that does not exist paints NOTHING — an
       invisible hole with no clue it is broken. An unknown slug is caught
       before it gets that far. */
    const { container } = render(<GearIcon slug="not-a-real-slug" size={24} />);
    expect(container.textContent).toBe('•');
    expect(maskOf(container.firstChild as HTMLElement)).toBe('');
  });

  it('is announced when it carries meaning and hidden when it does not', () => {
    const { rerender, container } = render(<GearIcon slug="boots" size={24} label="Boots" />);
    expect(screen.getByRole('img', { name: 'Boots' })).toBeInTheDocument();

    rerender(<GearIcon slug="boots" size={24} />);
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('every slug learnPal seeds has an emoji fallback', () => {
    /* Unchanged in intent: a slug with no emoji entry is one this component
       cannot draw at all, mask or not. */
    expect(GEAR_SLUGS.length).toBe(21);
    for (const slug of GEAR_SLUGS) expect(GEAR_EMOJI[slug]).toBeTruthy();
  });
});
