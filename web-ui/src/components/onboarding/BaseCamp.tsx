import React from 'react';

import { useDataStatement } from '../../hooks/useDataStatement';

/**
 * The closing screen: where onboarding ends and the app begins.
 *
 * *** IT OFFERS THREE ACTS AND GATES NOTHING. *** Spec decision 7 — the empty
 * state is BASE CAMP, not an empty range. A new user has no goals, no
 * categorised spending and no mountain to draw, and the honest thing to put in
 * front of them is the three things that tell finPal the most about their
 * position. Each pays coins the moment it is true, which is the whole design:
 * the reward and the benefit are the same act.
 *
 * *** THE THREE COME FROM THE SERVER, DERIVED FROM THE `ACTS` REGISTRY. ***
 * Retyping them here would let this screen promise an act that no longer
 * exists, and they are UNIVERSAL acts on purpose: a conditional one ("know what
 * your debt costs") is dormant for a user with no cards and would read as a
 * task they are failing.
 *
 * *** NO COUNT, NO BAR, NO "0 OF 3". *** Decision 5 permits a denominator only
 * where the user chose the target. Three named things a user can do is a list;
 * `0 of 3` is a report card on somebody who has been using finPal for ninety
 * seconds.
 */
export const BaseCamp: React.FC<{ onStart: () => void; starting?: boolean }> = ({
  onStart,
  starting = false,
}) => {
  const { catalog } = useDataStatement();
  const copy = catalog?.orientation?.base_camp;
  const acts = catalog?.first_acts ?? [];

  return (
    <div>
      <h2 style={heading}>{copy?.heading ?? 'You are at base camp.'}</h2>
      {(copy?.lines ?? []).map((line) => (
        <p key={line} style={body}>{line}</p>
      ))}

      {/* Absent rather than empty: if the catalogue did not load, a heading and
          a button are still a coherent screen, and three blank rows are not. */}
      {acts.length > 0 && (
        <ol style={{ margin: '1.25rem 0 0', paddingLeft: '1.2rem' }}>
          {acts.map((act) => (
            <li key={act.slug} style={{ ...body, marginBottom: '0.5rem' }}>
              {act.title}
            </li>
          ))}
        </ol>
      )}

      <button onClick={onStart} disabled={starting} style={primary}>
        {starting ? 'Getting things ready…' : 'Start'}
      </button>
    </div>
  );
};


/**
 * *** THE DARK-SHELL PALETTE, MEASURED ON THIS PAGE'S OWN CARD — NOT THE THEME
 * TOKENS. *** `Onboarding.tsx` paints a fixed `#0f172a → #1e293b` gradient in
 * BOTH themes, so `var(--text-primary)` here is 1.08:1 in light and
 * `var(--text-muted)` is 2.59:1 — that is D-212, found by measuring this shell
 * while building these screens rather than after shipping them.
 *
 * Measured against the composited card (`#1b2537`) and the inner translucent
 * card (`#242e40`):
 *   #ffffff  15.37 / 13.64   headings
 *   #cbd5e1  10.35 /  9.19   body
 *   #94a3b8   5.99 /  5.32   questions, labels
 *   #86efac      — /  9.71   the accent, also used for non-text glyphs
 */
const INK = '#ffffff';
const BODY = '#cbd5e1';
const MUTED = '#94a3b8';
const ACCENT = '#86efac';
const CARD_BG = 'rgba(148, 163, 184, 0.08)';
const CARD_LINE = 'rgba(148, 163, 184, 0.22)';

const heading: React.CSSProperties = {
  fontSize: '1.5rem', fontWeight: 700, color: INK,
  margin: '0 0 0.75rem', lineHeight: 1.25,
};
const body: React.CSSProperties = {
  fontSize: '0.95rem', lineHeight: 1.6, color: BODY,
  margin: '0 0 0.75rem',
};
const primary: React.CSSProperties = {
  marginTop: '1.5rem', padding: '0.8rem 1.6rem', borderRadius: '0.6rem',
  border: 'none', background: '#15803d', color: '#ffffff',
  fontWeight: 600, fontSize: '1rem', cursor: 'pointer',
};

export default BaseCamp;
