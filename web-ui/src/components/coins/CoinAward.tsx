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
  /**
   * The one-time explanation of what a coin IS, or `null`.
   *
   * *** RENDERED AS A PANEL INSIDE THIS COMPONENT, NEVER AS A MODAL OVER IT
   * (spec §14.6). *** The payoff sentence IS the lesson (decision 6), so a
   * popup on top of it competes with the very thing it exists to support. The
   * award simply renders TALLER the first time.
   */
  teach?: { topic: string; title: string; body: string } | null;
  /**
   * How many awards are queued behind this one.
   *
   * *** SAYING THE NUMBER IS THE WHOLE FIX, AND IT IS DELIBERATELY NOT AN
   * AUTO-ADVANCE. *** A timer or an auto-dismiss would clear an award the user
   * has not read, and the payoff sentence IS the reward (decision 6) — so
   * hurrying it along throws away the only thing the award is for. What the
   * pile-up actually costs is the SURPRISE of a panel returning with nothing
   * explaining why, and a count fixes exactly that.
   */
  remaining?: number;
  /**
   * Open the Kit. Absent means no link is drawn.
   *
   * *** THE AWARD HAD NO WAY OUT OF ITSELF, AND THAT WAS THE WHOLE REPORT
   * (FINPAL-27): *"I can't interact with this pop-up"*. *** Every control on it
   * made it GO AWAY — the × and nothing else — so the one place that answers
   * "coins for what?" was reachable only by a user who already knew the Kit
   * existed.
   *
   * *** IT IS A NAMED LINK, NOT A TAPPABLE CARD. *** A card that silently
   * navigates is a card whose destination you learn by losing your place, and
   * on web the card already contains a button (the ×), which a wrapping button
   * cannot legally contain. So the affordance says where it goes.
   */
  onOpenKit?: () => void;
  onDismiss?: () => void;
}> = ({ coins, revealed, teach, remaining = 0, onOpenKit, onDismiss }) => {
  if (!revealed || coins <= 0) return null;

  return (
    <div
      data-testid="coin-award"
      /* No role="status": the container's persistent live region announces
         it (a region mounted with its text is often missed). */
      style={{
        display: 'flex', gap: 16, alignItems: 'flex-start',
        background: 'var(--bg-card)', border: '1px solid var(--border-light)',
        borderRadius: 16, marginTop: 14,
        position: 'relative',
        /* *** `position: relative` IS LOAD-BEARING, NOT TIDINESS. *** The
           "N more" count below is absolutely positioned; without a positioned
           ancestor it anchors to the nearest one — here the fixed container in
           `CoinAwardContainer` — and lands in the corner of the viewport
           instead of the corner of the card. */
        /* Extra bottom padding only when the count is there, so it never sits
           on top of the payoff sentence. */
        padding: remaining > 0 ? '16px 18px 26px' : '16px 18px',
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
        {teach && (
          /* *** A PANEL, NOT A MODAL — AND IT SITS BELOW THE SENTENCE, NOT
             ABOVE IT. *** The payoff sentence is the reward; this only explains
             what the reward IS, and it is shown once in a user's life. Ranking
             it above the sentence would make the first coin a lecture. */
          <div
            data-testid="coin-award-teach"
            style={{
              marginTop: 12, paddingTop: 12,
              borderTop: '1px solid var(--border-light)',
            }}
          >
            <div style={{
              fontSize: 13, fontWeight: 600, letterSpacing: '0.02em',
              color: 'var(--text-secondary)', textTransform: 'uppercase',
            }}>
              {teach.title}
            </div>
            <p style={{
              margin: '4px 0 0', fontSize: 14, lineHeight: 1.55,
              color: 'var(--text-secondary)',
            }}>
              {teach.body}
            </p>
          </div>
        )}
        {onOpenKit && (
          /* Last, so the order is reward, then lesson, then where to go next —
             a link above the payoff sentence would rank the errand over the
             thing the user just earned. */
          <button
            type="button"
            data-testid="coin-award-kit"
            onClick={onOpenKit}
            style={{
              marginTop: 12, padding: 0, border: 0, background: 'none',
              fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
              /* The theme-aware link ink, 6.92 / 8.21 on the card — not the
                 green FILL token, which is a background colour. */
              color: 'var(--g-ink)',
              cursor: 'pointer', textAlign: 'left',
            }}
          >
            See what else earns coins →
          </button>
        )}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={remaining > 0
            ? `Dismiss, ${remaining} more waiting`
            : 'Dismiss'}
          style={{
            background: 'none', border: 0, cursor: 'pointer',
            color: 'var(--text-secondary)', fontSize: 18, lineHeight: 1,
            padding: 0,
          }}
        >
          ×
        </button>
      )}
      {remaining > 0 && (
        /* Sits with the dismiss control, because that is what it explains:
           pressing × brings the next one. */
        <span
          data-testid="coin-award-remaining"
          style={{
            position: 'absolute', right: 14, bottom: 10,
            fontSize: 11, color: 'var(--text-secondary)',
          }}
        >
          {remaining} more
        </span>
      )}
    </div>
  );
};
