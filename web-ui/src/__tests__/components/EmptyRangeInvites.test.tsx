/**
 * The dashboard's range when a user has no goals.
 *
 * *** THIS PANEL USED TO RENDER NOTHING, AND THE REASON WAS A GOOD ONE. ***
 * `GoalRange`'s note: *"an empty frame here would be decoration standing in for
 * a fact, and the 'you have nothing yet' case belongs to base camp."* The owner
 * asked for silhouettes and a prompt instead (2026-09-16), so the rule did not
 * go away — it became the thing this file enforces. What it forbids is a frame
 * that looks like DATA, and the tests below are exactly that boundary.
 *
 * *** AND THE INVITATION IS A LINK, NOT A HOVER TOOLTIP. *** The ask was a "!"
 * that says "set goals" on hover. Hover is unreachable by keyboard and absent
 * on touch, so it is a real `<Link>` with an accessible name that also goes
 * somewhere. A tooltip would have satisfied the request and failed two thirds
 * of the ways into the app.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import EmptyRange from '../../components/dashboard/EmptyRange';
import { RANGE_SILHOUETTES } from '../../utils/rangeSilhouettes';

const draw = () => render(<MemoryRouter><EmptyRange /></MemoryRouter>);

describe('it invites, and it is reachable without a mouse', () => {
  it('is a link to the goals page, not a tooltip', () => {
    draw();
    const cta = screen.getByRole('link', { name: /Set a goal/i });
    expect(cta).toHaveAttribute('href', '/goals');
  });

  it('carries its sentence in the accessible name, not only on hover', () => {
    // A `title` alone is a mouse affordance. The name is what a screen reader
    // and the keyboard both get.
    draw();
    expect(screen.getByRole('link', { name: 'Set a goal and it appears here as a mountain' }))
      .toBeInTheDocument();
  });

  it('labels the drawing as an outline rather than as a range of goals', () => {
    draw();
    const img = screen.getByRole('img');
    expect(img.getAttribute('aria-label')).toMatch(/No goals yet/i);
  });
});

describe('it must not look like data — the line the old decision drew', () => {
  it('renders no figure of any kind', () => {
    const { container } = draw();
    const text = container.textContent || '';
    // The only text is the "!" and the invitation. A digit here would be a
    // number about a portfolio the user does not have, which is D-102's shape.
    expect(text).not.toMatch(/\d/);
  });

  it('draws bodies only — no shade, no snow', () => {
    /* Shade and snow are what make a peak look RENDERED rather than sketched,
       and `GoalRange` draws them from real magnitudes. A sketch is the honest
       register for a thing that does not exist yet. */
    const { container } = draw();
    const paths = [...container.querySelectorAll('path')].map((p) => p.getAttribute('d'));
    const shades = RANGE_SILHOUETTES.map((s) => s.shade).filter(Boolean);
    const snows = RANGE_SILHOUETTES.map((s) => s.snow).filter(Boolean);
    for (const d of [...shades, ...snows]) {
      expect(paths, `a ${snows.includes(d!) ? 'snow' : 'shade'} path was drawn`)
        .not.toContain(d);
    }
    expect(paths.length).toBeGreaterThan(3);
  });

  it('reuses the shared silhouettes rather than carrying its own', () => {
    // Same mountains as a full dashboard, so the empty state and the real one
    // are recognisably the same product. A copied `d` is one that drifts.
    const { container } = draw();
    const paths = [...container.querySelectorAll('path')].map((p) => p.getAttribute('d'));
    const bodies = RANGE_SILHOUETTES.map((s) => s.body);
    expect(paths.some((d) => bodies.includes(d!))).toBe(true);
  });
});
