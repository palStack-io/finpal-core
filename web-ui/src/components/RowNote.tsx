import React from 'react';
import { StickyNote } from 'lucide-react';

/**
 * A note's first line, shown under a transaction row or an account's name.
 *
 * One line, truncated: a list is for scanning, and the full text is one click away in
 * the edit form the row already opens. `title` carries the whole note for a mouse
 * hover. Renders nothing for a missing or whitespace-only note, so a row without one
 * looks exactly as it did before notes were shown.
 *
 * Muted text, not a colour: the note is the user's own words and asserts nothing about
 * the money, so it takes `--text-muted` like the rest of the row's metadata.
 */
export const RowNote: React.FC<{ note?: string | null }> = ({ note }) => {
  const text = note?.trim();
  if (!text) return null;
  return (
    <p
      data-testid="row-note"
      title={text}
      style={{
        display: 'flex', alignItems: 'center', gap: '5px',
        color: 'var(--text-muted)', fontSize: '12.5px', margin: '3px 0 0',
        // `width: 0` + `min-width: 100%`: the note fills the space its row gives it
        // and contributes NOTHING to the row's own content width. Without this, a
        // card that wraps at 390px sized itself to the note's full unwrapped length
        // and overflowed the page (575px main at 390 — caught by the responsive walk).
        width: 0, minWidth: '100%',
      }}
    >
      <StickyNote size={12} aria-hidden="true" style={{ flexShrink: 0 }} />
      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {text}
      </span>
    </p>
  );
};
