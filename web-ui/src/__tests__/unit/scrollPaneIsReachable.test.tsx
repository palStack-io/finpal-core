/**
 * A SCROLLING BOX A MOUSE CAN READ AND A KEYBOARD CANNOT IS A WCAG 2.1.1
 * FAILURE, AND THE DASHBOARD SHIPPED ONE.
 *
 * The monthly breakdown's open row rendered its transactions into a bare
 * `<div style={{ maxHeight: 300, overflowY: 'auto' }}>`. There is nothing
 * focusable inside it — the rows are `<td>`s — so a keyboard user could not
 * reach the box at all, and everything past the 300px mark was unreachable
 * without a pointer. axe reports it as `scrollable-region-focusable`, impact
 * serious, and the E2E WCAG walk is what found it. **831 vitest tests were
 * green over it**, because the defect only exists in rendered geometry on a
 * route axe walks.
 *
 * `ScrollPane` is the fix made unforgettable: the tab stop and the accessible
 * name come with the box. This file is its own guard, and it is deliberately
 * narrow — the real oracle stays the axe walk over all 21 routes, because
 * axe's rule exempts a region whose descendants are focusable and no source
 * scan can resolve that.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ScrollPane } from '../../components/ScrollPane';

describe('ScrollPane', () => {
  it('is a tab stop, so a keyboard can scroll it', () => {
    render(<ScrollPane label="Individual transactions for September 2026">rows</ScrollPane>);
    const pane = screen.getByRole('group', { name: 'Individual transactions for September 2026' });
    expect(pane.getAttribute('tabindex')).toBe('0');
  });

  it('caps its height on the vertical axis', () => {
    render(<ScrollPane label="Rows" maxHeight={300}>rows</ScrollPane>);
    const pane = screen.getByRole('group', { name: 'Rows' });
    expect(pane.style.overflowY).toBe('auto');
    expect(pane.style.maxHeight).toBe('300px');
  });

  it('honours maxHeight on the horizontal axis too, rather than dropping it', () => {
    render(<ScrollPane label="Wide" axis="x" maxHeight={120}>wide</ScrollPane>);
    const pane = screen.getByRole('group', { name: 'Wide' });
    expect(pane.style.overflowX).toBe('auto');
    // A cap the component silently ignored would read as a working prop.
    expect(pane.style.maxHeight).toBe('120px');
  });

  it('leaves maxHeight unset when the caller does not ask for one', () => {
    render(<ScrollPane label="Wide" axis="x">wide</ScrollPane>);
    expect(screen.getByRole('group', { name: 'Wide' }).style.maxHeight).toBe('');
  });
});
