import React from 'react';
import { SCOPE_TAG, SCOPE_TITLE, type Scope } from '../utils/scope';

interface ScopeTagProps {
  /** `mixed` renders nothing — such a figure needs a caption, not a tag. */
  scope: Scope;
}

/**
 * Says whose money the figure beside it describes.
 *
 * AUDIT.md D-01: this instance is one household and most endpoints return every
 * member's rows, while transactions and the dashboard's expense figures are the
 * caller's own. Unlabelled, the difference read as the app contradicting itself.
 *
 * Deliberately quiet — a provenance note on the label, never competing with the
 * figure. `title` carries the longer explanation on hover.
 */
export const ScopeTag: React.FC<ScopeTagProps> = ({ scope }) => {
  // Guessing a side for a figure whose terms have different owners would be a
  // new wrong label, so there is nothing to render.
  if (scope === 'mixed') return null;

  const isHousehold = scope === 'household';

  return (
    <span
      title={SCOPE_TITLE[scope]}
      style={{
        fontSize: '10px',
        fontWeight: 700,
        letterSpacing: '0.06em',
        padding: '2px 6px',
        borderRadius: '5px',
        whiteSpace: 'nowrap',
        /* *** NO BLUE. *** This was `#3b82f6` on a blue tint — the last AA
           failure left on the page after the palette was adopted, at 3.12:1 for
           10px bold text, and a colour the kitchen-table palette does not
           contain at all. The two states are now told apart by WEIGHT of ink
           rather than by hue: household carries the full ink on a hairline
           fill, "yours" stays soft on the quiet fill. Both are palette tokens,
           so neither can drift from the theme again. */
        border: `1px solid ${isHousehold ? 'var(--kt-soft)' : 'var(--border-medium)'}`,
        background: isHousehold ? 'var(--kt-line)' : 'var(--surface-hover)',
        color: isHousehold ? 'var(--kt-ink)' : 'var(--text-muted)',
      }}
    >
      {SCOPE_TAG[scope]}
    </span>
  );
};
