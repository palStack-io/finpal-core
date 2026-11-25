/**
 * The page hero (core, Dashboard C / Budgets C, 2026-11-20): one component on every page. The title is the page's
 * only h1, art OR an action sits on the right, and every hero carries a mountain silhouette: a page with no art of its
 * own gets the quiet decorative ridge along the bottom edge, aria-hidden, without asking.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'fs';
import { PageHero } from '../../components/PageHero';

describe('PageHero', () => {
  it('names its section by the h1 and carries the pill and the answer', () => {
    render(<PageHero title="Budgets" titleId="t" pill="November so far" answer={<p>$769.74 left</p>} />);
    const h1 = screen.getByRole('heading', { level: 1, name: 'Budgets' });
    expect(h1.closest('section')!.getAttribute('aria-labelledby')).toBe('t');
    expect(screen.getByTestId('page-hero-pill').textContent).toBe('November so far');
    expect(screen.getByText('$769.74 left')).toBeInTheDocument();
  });

  it('draws the decorative ridge by default, hidden from screen readers', () => {
    render(<PageHero title="Accounts" action={<button type="button">Add account</button>} />);
    const ridge = screen.getByTestId('hero-ridge');
    expect(ridge.getAttribute('aria-hidden')).toBe('true');
    // Real ridgelines (the generated shapes), never a hand-drawn triangle.
    expect(ridge.querySelectorAll('path').length).toBeGreaterThan(4);
    expect(screen.getByRole('button', { name: 'Add account' })).toBeInTheDocument();
  });

  it('gives way to the page\'s own art (the range), and draws the art rather than the action', () => {
    render(<PageHero title="Hi" art={<div data-testid="art" />} action={<button type="button">x</button>} />);
    expect(screen.queryByTestId('hero-ridge')).toBeNull();
    expect(screen.getByTestId('art')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'x' })).toBeNull();
  });

  it('is 260 px tall on a wide screen, and every entrance is off under reduced motion', () => {
    const css = readFileSync('src/styles/finpal-theme.css', 'utf8');
    expect(css).toMatch(/\.fp-page-hero \{[^}]*min-height: 260px/);
    const reduced = css.slice(css.indexOf('@keyframes fp-rise'));
    const block = reduced.slice(reduced.indexOf('@media (prefers-reduced-motion: reduce)'));
    for (const cls of ['.fp-rise', '.fp-fill', '.fp-page-hero', '.fp-hero-ridge', '.fp-range-peak', '.fp-range-route-draw']) {
      expect(block.slice(0, block.indexOf('}')), cls).toContain(cls);
    }
    // Only transform and opacity move.
    for (const name of ['fp-rise', 'fp-fade', 'fp-fill']) {
      const kf = css.slice(css.indexOf(`@keyframes ${name} `)).split('\n')[0];
      expect(kf).not.toMatch(/width|height|top|left|margin/);
    }
  });
});
