import React, { useEffect, useState } from 'react';
import { goalService, type GoalSuggestion } from '../../services/goalService';

/**
 * Goals the user's own figures argue for.
 *
 * *** IT NAMES THE CONDITION BEFORE THE ACTION — VOICE RULE 11. *** "You are
 * carrying debt and have no savings goal" is a fact about circumstances, and
 * one step from a scolding. Stating what finPal OBSERVED lets the reader
 * disagree with the premise rather than only with the advice, which is the
 * difference between a suggestion and a nag.
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
export const GoalSuggestions: React.FC<{ onStart: (kind: string) => void }> = ({ onStart }) => {
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
    <section data-testid="goal-suggestions" style={{ marginBottom: 24 }}>
      {suggestions.map((s) => (
        <div
          key={s.check}
          data-testid={`suggestion-${s.check}`}
          style={{
            display: 'flex', gap: 16, alignItems: 'flex-start',
            padding: '14px 18px', marginBottom: 10,
            background: 'var(--bg-card)',
            border: '1px solid var(--border-light)', borderRadius: 12,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{s.headline}</div>
            <p className="fp-hint" style={{ margin: '4px 0 0', lineHeight: 1.55 }}>
              {s.because}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onStart(s.kind)}
            style={{
              flexShrink: 0, padding: '7px 13px', borderRadius: 8,
              border: '1px solid var(--border-medium)', background: 'transparent',
              color: 'var(--g-ink)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Start one
          </button>
        </div>
      ))}
    </section>
  );
};
