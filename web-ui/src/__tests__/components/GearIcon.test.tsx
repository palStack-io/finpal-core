/**
 * learnPal gear: SVG if the file is there, emoji if it is not.
 *
 * Owner decision 2026-09-11 — *"make a path on the folder for svg with the names
 * they need to be with fallback to emoji when no svg found."* Dropping a
 * correctly-named file into `public/gear/` is the whole migration.
 *
 * *** THE TEST THAT MATTERS MOST IS THAT THE SVG IS INLINED RATHER THAN PUT IN
 * AN `<img src>`. *** An `<img>` cannot inherit `color`, so `fill="currentColor"`
 * would resolve to nothing and every icon would be invisible in one theme. That
 * is D-60's bug class — a value that renders as nothing while every test passes
 * — so it is asserted directly rather than trusted.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { GearIcon, GEAR_EMOJI } from '../../components/GearIcon';

const SVG = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M1 1h2v2z"/></svg>';

const mockFetch = (impl: (url: string) => Partial<Response> | null) => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const r = impl(String(url));
    if (r === null) throw new Error('network');
    return { ok: true, headers: new Headers({ 'content-type': 'image/svg+xml' }),
             text: async () => SVG, ...r } as Response;
  }));
};

beforeEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('GearIcon', () => {
  it('*** INLINES THE SVG SO `currentColor` CAN INHERIT ***', async () => {
    mockFetch(() => ({}));
    const { container } = render(<GearIcon slug="rope" />);

    await waitFor(() => expect(container.querySelector('svg')).toBeTruthy());
    // A real <svg> element in the document — not an <img>, which could not
    // inherit `color` and would render nothing.
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg')?.getAttribute('fill')).toBe('currentColor');
  });

  it('falls back to the emoji when the file is absent', async () => {
    // *** A DIFFERENT SLUG PER TEST, ON PURPOSE. *** The fetch cache is
    // module-level and deliberately never invalidated — the files cannot change
    // during a session — so reusing `rope` here would read the SVG the first
    // test cached and assert nothing about the fallback. Found by this test
    // failing for exactly that reason.
    mockFetch(() => ({ ok: false }));
    render(<GearIcon slug="oxygen" />);
    await waitFor(() => expect(screen.getByText(GEAR_EMOJI.oxygen)).toBeInTheDocument());
  });

  it('falls back when the network fails outright', async () => {
    mockFetch(() => null);
    render(<GearIcon slug="compass" />);
    await waitFor(() => expect(screen.getByText(GEAR_EMOJI.compass)).toBeInTheDocument());
  });

  it('*** REFUSES AN HTML 404 PAGE SERVED WITH STATUS 200 ***', async () => {
    // An SPA dev server answers an unknown path with index.html and a 200.
    // Trusting `r.ok` alone would cache that as an icon and render the entire
    // application inside a 24px box.
    mockFetch(() => ({
      ok: true,
      headers: new Headers({ 'content-type': 'text/html' }),
      text: async () => '<!doctype html><html><body>app</body></html>',
    }));
    render(<GearIcon slug="tent" />);
    await waitFor(() => expect(screen.getByText(GEAR_EMOJI.tent)).toBeInTheDocument());
  });

  it('refuses a body that is not an svg even with the right content-type', async () => {
    mockFetch(() => ({ text: async () => 'not markup at all' }));
    render(<GearIcon slug="helmet" />);
    await waitFor(() => expect(screen.getByText(GEAR_EMOJI.helmet)).toBeInTheDocument());
  });

  it('renders a dot for a slug nobody has drawn OR chosen an emoji for', async () => {
    // Never blank and never a crash: an unknown slug is a seeding typo, and the
    // milestone it belongs to still has to render.
    mockFetch(() => ({ ok: false }));
    render(<GearIcon slug="nonsense-slug" />);
    await waitFor(() => expect(screen.getByText('•')).toBeInTheDocument());
  });

  it('fetches each slug ONCE across renders', async () => {
    mockFetch(() => ({}));
    const { unmount } = render(<GearIcon slug="boots" />);
    await waitFor(() => expect(screen.queryByText(GEAR_EMOJI.boots)).toBeNull());
    unmount();
    render(<GearIcon slug="boots" />);
    await waitFor(() => expect(document.querySelector('svg')).toBeTruthy());
    expect((globalThis.fetch as any).mock.calls.length).toBe(1);
  });

  it('is announced when it carries meaning and hidden when it does not', async () => {
    mockFetch(() => ({ ok: false }));
    const { rerender } = render(<GearIcon slug="bivvy" label="Bivvy" />);
    await waitFor(() => expect(screen.getByRole('img', { name: 'Bivvy' })).toBeInTheDocument());

    rerender(<GearIcon slug="bivvy" />);
    await waitFor(() => expect(screen.queryByRole('img')).toBeNull());
  });

  it('every slug learnPal seeds has an emoji fallback', () => {
    // A milestone whose gear has neither a file nor a glyph renders a bare dot.
    // These eight are what C1b seeds today.
    for (const slug of ['map', 'boots', 'rope', 'headlamp', 'ice-axe', 'gloves',
                        'compass', 'trekking-poles']) {
      expect(GEAR_EMOJI[slug], slug).toBeTruthy();
    }
  });
});
