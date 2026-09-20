import React, { useEffect, useState } from 'react';
import { goalService, type GoalSuggestion } from '../../services/goalService';
import { choiceForSuggestion, type GoalKindChoice } from '../../utils/goalKinds';

/**
 * Goals the user's own figures argue for.
 *
 * *** IT NAMES THE CONDITION BEFORE THE ACTION — VOICE RULE 11. *** "You are
 * carrying debt and have no savings goal" is a fact about circumstances, and
 * one step from a scolding. Stating what finPal OBSERVED lets the reader
 * disagree with the premise rather than only with the advice, which is the
 * difference between a suggestion and a nag.
 *
 * *** ONE LINE, NOT A CARD, AND IT IS THE ONE ADVICE SURFACE THAT STAYED ON
 * THE PAGE. *** Owner, 2026-09-20: the panels *"need to show only when a user
 * is trying to create a goal"*. A suggestion cannot obey that literally,
 * because a suggestion is WHAT MAKES SOMEBODY OPEN THE CREATE PANEL — moved
 * inside it, it would only ever be read by people who had already decided.
 * So it shrank from a three-line card to a single row, and clicking it opens
 * the panel WITH THE KIND ALREADY CHOSEN, which is what makes it part of the
 * create flow rather than a competing one.
 *
 * *** IT RENDERS NOTHING WHEN THERE IS NOTHING TO SAY. *** A page that always
 * has advice is a page whose advice means nothing — the same reason `coverage`
 * returns `None` for a dormant act rather than a zero. No empty state, no
 * "you're all caught up!", no box.
 *
 * *** AND IT PAYS NOTHING. *** `acts.py` refuses to pay for a SITUATION by
 * construction. Nothing here is wired to the coin engine; creating the goal
 * may earn later, because that makes a figure computable.
 */
export const GoalSuggestions: React.FC<{
  onStart: (choice: GoalKindChoice) => void;
}> = ({ onStart }) => {
  const [suggestions, setSuggestions] = useState<GoalSuggestion[] | null>(null);

  useEffect(() => {
    let live = true;
    goalService.getSuggestions()
      .then((rows) => { if (live) setSuggestions(rows); })
      /* Silent: a suggestion is an extra, and an error banner over a working
         goals page would be the page shouting about the wrong thing. */
      .catch(() => { if (live) setSuggestions([]); });
    return () => { live = false; };
  }, []);

  if (!suggestions || suggestions.length === 0) return null;

  return (
    <section data-testid="goal-suggestions" style={{ marginBottom: 16 }}>
      {suggestions.map((s) => (
        <button
          key={s.check}
          type="button"
          data-testid={`suggestion-${s.check}`}
          onClick={() => onStart(choiceForSuggestion(s.kind, s.check))}
          style={{
            display: 'flex', gap: 10, alignItems: 'baseline', width: '100%',
            textAlign: 'left', padding: '9px 12px', marginBottom: 6,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-light)', borderRadius: 9,
            cursor: 'pointer', color: 'var(--text-primary)',
          }}
        >
          <span style={{ fontSize: 13.5, fontWeight: 600 }}>{s.headline}</span>
          {/* *** THE CONDITION STILL TRAVELS WITH THE SUGGESTION — VOICE RULE
              11. *** Shrinking the card is a layout decision; dropping the
              reason would change what the feature IS. Stating what finPal
              observed is what lets the reader disagree with the premise
              rather than only with the advice. */}
          <span className="fp-hint" style={{ fontSize: 12.5, flex: 1, minWidth: 0 }}>
            {s.because}
          </span>
          <span style={{ color: 'var(--g-ink)', fontSize: 13, fontWeight: 600,
                         flexShrink: 0 }}>
            Start one →
          </span>
        </button>
      ))}
    </section>
  );
};
