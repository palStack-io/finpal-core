import React from 'react';

interface ScrollPaneProps {
  /** What a keyboard user lands on. Announced when the pane takes focus. */
  label: string;
  /** Caps the pane's height so the content scrolls inside it. Applies on both axes. */
  maxHeight?: number | string;
  /** Scroll sideways instead of down. */
  axis?: 'y' | 'x';
  style?: React.CSSProperties;
  children: React.ReactNode;
}

/**
 * A scrollable box that a keyboard can reach.
 *
 * A bare `overflow: auto` div is a WCAG 2.1.1 failure: a mouse can scroll it
 * and a keyboard cannot, so content below the fold is unreachable without a
 * pointer. axe reports it as `scrollable-region-focusable`, and the dashboard's
 * open month row shipped exactly that shape. `tabIndex={0}` is the whole fix —
 * it makes the pane focusable, and arrow keys scroll a focused region for free.
 *
 * Every scrolling box in the app should be one of these rather than an inline
 * `overflowY: 'auto'`, so the tab stop and the name cannot be forgotten again.
 */
export const ScrollPane: React.FC<ScrollPaneProps> = ({
  label,
  maxHeight,
  axis = 'y',
  style,
  children,
}) => (
  <div
    tabIndex={0}
    role="group"
    aria-label={label}
    style={{
      ...(axis === 'y' ? { overflowY: 'auto' } : { overflowX: 'auto' }),
      // Honoured on both axes on purpose: dropping it for `axis="x"` would make
      // a caller's cap silently do nothing.
      ...(maxHeight === undefined ? {} : { maxHeight }),
      ...style,
    }}
  >
    {children}
  </div>
);
