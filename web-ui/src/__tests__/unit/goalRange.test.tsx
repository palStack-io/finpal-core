/**
 * The dashboard's range — spec variant B, "the range is the dashboard".
 *
 * *** THE CASE WORTH TESTING IS THE GOAL WITH NO PEAK. *** `Goal.peak` is
 * undefined on any backend that predates mountains, and a component that draws
 * something anyway would be inventing a shape for a fact the server never sent.
 * The Goals page already makes that choice; this asserts the range makes the
 * same one, because two pictures of one fact are how they drift apart.
 *
 * *** AND THE ABSENCE OF A DENOMINATOR. *** Decision 5 permits exactly one:
 * a target the user chose. "2 of 4 goals" is not that, and a range is precisely
 * where somebody would add it.
 */
import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { GoalRange } from '../../components/dashboard/GoalRange';
import type { Goal } from '../../types/goal';

const withPeak = (over: Partial<Goal>): Goal => ({
  id: 1,
  name: 'Emergency fund',
  target_amount: 16000,
  current_amount: 8000,
  peak: {
    scale: 'build', magnitude: 8000, unmeasured: false, band: 3,
    mountain: { slug: 'mount-rainier', name: 'Mount Rainier', elevation_m: 4392 },
  },
  ...over,
} as Goal);

describe('the goal range', () => {
  it('prints the NAME, and keeps the mountain behind the interaction', () => {
    /* Owner, 2026-09-19: three printed lines per peak got "overpowering" with
       several goals, and the geometry agreed — SLOT is 124 units and
       `Mount Rainier · 4,392 m · saving` is ~170, so captions were already
       wider than the space they own. The mountain and its height moved into
       the detail; the name did not. */
    render(<GoalRange goals={[withPeak({})]} currency="USD" />);
    expect(screen.getByText('Emergency fund')).toBeTruthy();
    expect(screen.queryByText(/Mount Rainier/)).toBeNull();
    expect(screen.queryByText(/4,392 m/)).toBeNull();
  });

  it('shows the mountain, the height and the money on FOCUS, not just hover', () => {
    /* *** A HOVER-ONLY DETAIL DOES NOT EXIST ON A PHONE OR TO A KEYBOARD, ***
       and this card renders down to 390px. The peak is a focusable button and
       a tap toggles it, so the three ways in are hover, Tab and touch. This
       asserts the one a mouse test would miss. */
    render(<GoalRange goals={[withPeak({})]} currency="USD" />);
    const peak = screen.getByRole('button', { name: /Emergency fund/ });
    expect(peak.getAttribute('aria-expanded')).toBe('false');

    fireEvent.focus(peak);
    expect(peak.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Mount Rainier · 4,392 m')).toBeTruthy();
    expect(screen.getByText(/8,000.00 still to save/)).toBeTruthy();

    fireEvent.blur(peak);
    expect(screen.queryByText('Mount Rainier · 4,392 m')).toBeNull();
  });

  it('answers a screen reader WITHOUT the interaction', () => {
    // The detail is drawn on demand; the accessible name carries it always, so
    // nothing here is reachable only by pointing at it.
    render(<GoalRange goals={[withPeak({})]} currency="USD" />);
    const name = screen.getByRole('button', { name: /Emergency fund/ })
      .getAttribute('aria-label') ?? '';
    expect(name).toContain('saving');
    expect(name).toContain('Mount Rainier · 4,392 m');
    expect(name).toContain('still to save');
  });

  it('is dismissible from the keyboard, and opens one at a time', () => {
    // WCAG 2.1 1.4.13: content on hover or focus must be dismissible without
    // moving the pointer.
    render(
      <GoalRange
        goals={[withPeak({}), withPeak({ id: 2, name: 'Pay off the Visa' } as Partial<Goal>)]}
        currency="USD"
      />,
    );
    const a = screen.getByRole('button', { name: /Emergency fund/ });
    const b = screen.getByRole('button', { name: /Pay off the Visa/ });

    fireEvent.mouseEnter(a);
    expect(a.getAttribute('aria-expanded')).toBe('true');
    fireEvent.mouseEnter(b);
    expect(b.getAttribute('aria-expanded')).toBe('true');
    expect(a.getAttribute('aria-expanded')).toBe('false');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(b.getAttribute('aria-expanded')).toBe('false');
  });

  it('*** SAYS debt OR saving IN WORDS, NOT ONLY IN COLOUR ***', () => {
    /* FINPAL-26. The peaks are painted from `peakColorVar`, which states the
       never-compare rule in red and green — and states it to nobody who does
       not separate those two hues. The reporter, who does, still had to ask
       which peaks were debt.

       *** ASSERTED ON THE CAPTION, NOT ON THE FILL. *** A test on the colour
       would pass on exactly the version that caused the report. */
    render(
      <GoalRange
        goals={[
          withPeak({}),
          withPeak({
            id: 2, name: 'Pay off Visa',
            peak: {
              scale: 'cost', magnitude: 13.33, unmeasured: false, band: 1,
              mountain: { slug: 'ben-nevis', name: 'Ben Nevis', elevation_m: 1345 },
            },
          } as Partial<Goal>),
        ]}
        currency="USD"
      />
    );
    /* *** THE WORD IS PRINTED, WITH NOTHING HOVERED. *** When the rest of the
       caption moved behind hover/focus/tap on 2026-09-19 this was the one line
       that could not go with it: a detail you have to point at answers the
       reporter's question only for a reader with a mouse, which is the shape
       of the defect, not a fix for it. */
    expect(screen.getByText('saving')).toBeTruthy();
    expect(screen.getByText('debt')).toBeTruthy();
  });

  it('labels an UNMEASURED peak too — the scale is never unknown', () => {
    /* `unmeasured` is about the MAGNITUDE: no account states a rate. The scale
       comes from the goal's direction, so an unmeasured peak is still
       definitely debt, and leaving the word off the one peak drawn in grey
       would strand exactly the goal the user most needs to act on. */
    render(
      <GoalRange
        goals={[withPeak({
          name: 'Store card',
          peak: {
            scale: 'cost', magnitude: null, unmeasured: true, band: null,
            mountain: null,
          },
        } as Partial<Goal>)]}
        currency="USD"
      />
    );
    expect(screen.getByText('debt')).toBeTruthy();
  });

  it('states what is left in the goal\'s OWN terms', () => {
    // A saving goal says what is still to save; a payoff goal says what the
    // debt COSTS, because the balance alone does not say whether to pay it
    // first. Two goals, two different sentences, from one component.
    render(
      <GoalRange
        goals={[
          withPeak({}),
          withPeak({
            id: 2, name: 'Pay off the Visa', target_amount: 0, current_amount: -800,
            peak: {
              scale: 'cost', magnitude: 13.33, unmeasured: false, band: 1,
              mountain: { slug: 'ben-nevis', name: 'Ben Nevis', elevation_m: 1345 },
            },
          } as Partial<Goal>),
        ]}
        currency="USD"
      />,
    );
    // Each peak's own detail, opened one at a time — a saving goal says what
    // is still to save, a payoff goal says what the debt COSTS, because the
    // balance alone does not say whether to pay it first.
    fireEvent.focus(screen.getByRole('button', { name: /Emergency fund/ }));
    expect(screen.getByText(/8,000.00 still to save/)).toBeTruthy();
    fireEvent.focus(screen.getByRole('button', { name: /Pay off the Visa/ }));
    expect(screen.getByText(/13.33 a month in interest/)).toBeTruthy();
  });

  it('*** SKIPS A GOAL WITH NO PEAK RATHER THAN DRAWING ONE ***', () => {
    const noPeak = { id: 9, name: 'From before mountains', target_amount: 100, current_amount: 0 } as Goal;
    render(<GoalRange goals={[withPeak({}), noPeak]} currency="USD" />);
    expect(screen.getByText('Emergency fund')).toBeTruthy();
    expect(screen.queryByText('From before mountains')).toBeNull();
  });

  it('renders nothing at all when no goal has a peak', () => {
    // Not an empty frame. Decoration standing in for a fact is the thing this
    // whole design removes, and "you have nothing yet" belongs to base camp.
    const { container } = render(
      <GoalRange goals={[{ id: 9, name: 'x', target_amount: 1, current_amount: 0 } as Goal]} currency="USD" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('marks a finished climb, and prints no count of them', () => {
    render(
      <GoalRange
        goals={[withPeak({
          id: 3, name: 'Holiday fund', target_amount: 500, current_amount: 500,
          peak: {
            scale: 'build', magnitude: 0, unmeasured: false, band: 0,
            mountain: { slug: 'table-mountain', name: 'Table Mountain', elevation_m: 1085 },
          },
        } as Partial<Goal>)]}
        currency="USD"
      />,
    );
    expect(screen.getByText(/Holiday fund ✓/)).toBeTruthy();
    // No "1 of 1", no "100%", no "1 goal complete" — decision 5.
    expect(screen.queryByText(/\bof \d+\b/)).toBeNull();
    expect(screen.queryByText(/%/)).toBeNull();
  });
});

describe('Everest says what it is doing there', () => {
  const EVEREST = { altitude_m: 7973, summit_m: 8849, at_summit: false };

  it('prints the name and YOUR standing, and nothing about everyone else', () => {
    /* The two things that are about this reader: which peak it is, and how far
       up it they are. `8,849 m` is the same for every user on the instance, so
       it is the least useful thing the label could spend a line on. */
    render(<GoalRange goals={[]} currency="USD" everest={EVEREST} />);
    expect(screen.getByText('Everest')).toBeTruthy();
    expect(screen.getByText('you are at 7,973 m')).toBeTruthy();
    expect(screen.queryByText(/8,849 m/)).toBeNull();
  });

  it('*** EXPLAINS ITSELF ON DEMAND — IT USED TO EXPLAIN NOTHING ***', () => {
    /* Owner, 2026-09-19: *"we can also add content to everest. its the
       ultimate goal financial litracy"*. It has always been drawn in rock grey
       so nobody reads it as their own goal, but nothing ever SAID what it was
       — a reader had to infer that from a colour, which is D-269's shape on
       the one peak that is not a goal. */
    const { container } = render(
      <GoalRange goals={[]} currency="USD" everest={EVEREST} />);
    const peak = screen.getByRole('button', { name: /Everest/ });

    fireEvent.focus(peak);
    /* *** JOINED WITH SPACES, BECAUSE SVG HAS NO WORD WRAP. *** The sentence
       is measured into separate `<text>` lines, and `textContent`
       concatenates them with nothing between — so a naive substring check
       reads "financialliteracy" and fails on correct output.

       Read off the CONTAINER, not the peak: the panel is deliberately not a
       child of the peak that opened it — see the paint-order test below. */
    const drawn = [...container.querySelectorAll('text')]
      .map((t) => t.textContent).join(' ');
    expect(drawn).toContain('8,849 m — the shared summit');
    expect(drawn).toContain('financial literacy');
    expect(drawn).toContain('Not one of your goals');

    // And without the interaction, for a screen reader.
    expect(peak.getAttribute('aria-label') ?? '').toContain('financial literacy');
  });

  it('*** DRAWS THE PANEL AFTER EVERY LABEL, OR IT PAINTS UNDERNEATH THEM ***', () => {
    /* SVG has no `z-index`: it paints in document order. The panel started
       life inside its own peak's `<g>`, and Everest is drawn FIRST so the
       goals stand in front of it — so on the demo its detail rendered under
       all four goal captions, with "Emergency fund" straight through the
       text. The LOCAL capture missed it because the peak it happened to focus
       was the last one drawn. */
    const { container } = render(
      <GoalRange
        goals={[withPeak({}), withPeak({ id: 2, name: 'Pay off the Visa' } as Partial<Goal>)]}
        currency="USD" everest={EVEREST}
      />);
    fireEvent.focus(screen.getByRole('button', { name: /Everest/ }));

    const svg = container.querySelector('svg')!;
    const panel = svg.querySelector('rect[rx="7"]')!;
    expect(panel).toBeTruthy();

    // Every label group must come BEFORE the panel in document order.
    const kids = [...svg.children];
    const panelAt = kids.findIndex((k) => k.contains(panel));
    const lastLabelAt = kids.reduce(
      (last, k, i) => (k.querySelector('g[role="button"]') || k.matches('g[role="button"]')
        ? i : last), -1);
    expect(panelAt).toBeGreaterThan(lastLabelAt);
  });

  it('says base camp rather than 0 m, and still explains itself', () => {
    render(<GoalRange goals={[]} currency="USD"
                      everest={{ altitude_m: 0, summit_m: 8849, at_summit: false }} />);
    expect(screen.getByText('you are at base camp')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Everest/ }).getAttribute('aria-label') ?? '')
      .toContain('financial literacy');
  });
});
