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
        border: `1px solid ${isHousehold ? 'rgba(59,130,246,0.35)' : 'var(--border-medium)'}`,
        background: isHousehold ? 'rgba(59,130,246,0.12)' : 'var(--surface-hover)',
        color: isHousehold ? '#3b82f6' : 'var(--text-muted)',
      }}
    >
      {SCOPE_TAG[scope]}
    </span>
  );
};
