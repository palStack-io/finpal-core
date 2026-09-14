import React from 'react';

/**
 * The award moment — and the coin and the lesson are ONE object.
 *
 * Not `+50 coins`, but: *finPal now knows that card is 19.99%. It is costing
 * you $13.33 a month, so of your $35.00 minimum only $21.67 comes off the
 * balance.* The reward and the teaching are the same act, which is the whole
 * thesis of the design.
 *
 * *** IF `revealed` IS NULL, THIS RENDERS NOTHING AT ALL. *** Not an empty box,
 * not a placeholder, not "well done". The server returns null when it cannot
 * compute the consequence, and on 2026-09-14 four payoffs were caught returning
 * copy that claimed an act was done beside `coins: 0`. Rendering a fallback here
 * would put that bug straight back — a sentence finPal cannot justify is worse
 * than silence.
 */
export const CoinAward: React.FC<{
  coins: number;
  revealed: string | null;
  onDismiss?: () => void;
}> = ({ coins, revealed, onDismiss }) => {
  if (!revealed || coins <= 0) return null;

  return (
    <div
      data-testid="coin-award"
      role="status"
      style={{
        display: 'flex', gap: 16, alignItems: 'flex-start',
        background: 'var(--bg-card)', border: '1px solid var(--border-light)',
        borderRadius: 16, padding: '16px 18px', marginTop: 14,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 44, height: 44, borderRadius: '50%', flex: 'none',
          background: 'radial-gradient(circle at 34% 28%, #fff7d6, #C9A227 56%, #9C7C18)',
          boxShadow: 'inset 0 -2px 4px rgba(0,0,0,0.28)',
        }}
      />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{
          fontSize: 17, fontWeight: 600, letterSpacing: '-0.015em',
          /* `--status-warn` is the amber ROLE token and measures AA on both
             themes. The raw brand gold is a fill, not a text colour. */
          color: 'var(--status-warn)',
        }}>
          +{coins.toLocaleString()} coins
        </div>
        <p style={{
          margin: '5px 0 0', fontSize: 15, lineHeight: 1.6,
          color: 'var(--text-primary)',
        }}>
          {revealed}
        </p>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          style={{
            background: 'none', border: 0, cursor: 'pointer',
            color: 'var(--text-secondary)', fontSize: 18, lineHeight: 1,
            padding: 0,
          }}
        >
          ×
        </button>
      )}
    </div>
  );
};
