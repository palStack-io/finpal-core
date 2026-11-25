/**
 * Core's motion is plain CSS (no motion kit): `.fp-rise`, `.fp-fill`, `.fp-mark-in`, `.fp-crossfade` and the hero's
 * settle are keyframes in `finpal-theme.css`, and every one of them is switched off under `prefers-reduced-motion`.
 *
 * The full entrance (the hero settling, cards rising, the range drawing) plays on a page's FIRST visit in a browser
 * session; after that the page wrapper carries `.fp-quiet`, which turns every entrance into a short fade (design
 * brief, "Motion": things settle in once, never loop for attention).
 */
import React, { useEffect, useState } from 'react';

const KEY = (page: string) => `fp-entered:${page}`;

/** True on the first visit of this browser session (decided once per mount; storage failures count as first). */
export function useFirstVisitThisSession(page: string): boolean {
  const [first] = useState(() => {
    try { return window.sessionStorage.getItem(KEY(page)) === null; } catch { return true; }
  });
  useEffect(() => {
    try { window.sessionStorage.setItem(KEY(page), '1'); } catch { /* private mode: every visit is a first */ }
  }, [page]);
  return first;
}

/** The stagger index for a `.fp-rise` / `.fp-fill` element (CSS caps the delay at the sixth item). */
export const staggerStyle = (index: number, extra?: React.CSSProperties): React.CSSProperties =>
  ({ ...extra, ['--i' as string]: index } as React.CSSProperties);
