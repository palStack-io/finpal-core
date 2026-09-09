import React, { useState } from 'react';

interface StaleCardBannerProps {
  cardId: number;
  cardName: string;
  staleSince: string;
  staleStatus: string;
  onVerify: (id: number) => Promise<void>;
}

const staleMessages: Record<string, string> = {
  issuer_change_after_verification: 'Issuer updated their rewards program after your last verification.',
  rates_unverified:                 'Earn rates have not been verified recently.',
  program_change:                   'Rewards program terms may have changed.',
};

const StaleCardBanner: React.FC<StaleCardBannerProps> = ({
  cardId,
  cardName,
  staleSince,
  staleStatus,
  onVerify,
}) => {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const message = staleMessages[staleStatus] ?? 'Card rates may be outdated — please verify.';

  const handleVerify = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setLoading(true);
    try {
      await onVerify(cardId);
      setDone(true);
    } finally {
      setLoading(false);
    }
  };

  if (done) return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        background: 'var(--au50)',
        border: '1px solid var(--au100)',
        borderRadius: 'var(--rs)',
        padding: '10px 14px',
        marginBottom: 10,
      }}
    >
      <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>⚠️</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: "'Bricolage Grotesque', sans-serif",
            fontWeight: 700,
            fontSize: 12,
            color: 'var(--au-ink)',
            marginBottom: 2,
          }}
        >
          {cardName} — rates may be outdated
        </div>
        <div style={{ fontSize: 11, color: 'var(--ink3)', lineHeight: 1.5 }}>
          {message}
          {staleSince && (
            <span style={{ color: 'var(--muted)' }}>
              {' '}
              Since {new Date(staleSince).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}.
            </span>
          )}
        </div>
      </div>
      <button
        onClick={handleVerify}
        disabled={loading}
        style={{
          flexShrink: 0,
          background: loading ? 'var(--au100)' : 'var(--au500)',
          /* *** DARK INK ON AMBER, NOT WHITE. *** White on --au500 (#f59e0b)
             measures 2.15:1 — the worst pair on the whole pointsPal surface, and
             it is a BUTTON LABEL. Amber is the one accent in this palette light
             enough that white cannot sit on it; --ink2 measures 6.81:1 and keeps
             the amber. The theme file's own comment at line 105 already says
             "#f59e0b is 2.09:1 in light" about a different element. D-103. */
          /* *** A FIXED SLATE, NOT `--ink2` — AND THE FIRST ATTEMPT HERE MADE
             DARK MODE WORSE, WHICH IS THE POINT. *** `--ink2` flips with the
             theme (#1e293b light, #e2e8f0 dark) but amber does NOT: --au500 is
             #f59e0b in both. So a theme-following ink measured 6.81:1 in light
             and 1.74:1 in dark — worse than the white it replaced. A surface
             that does not theme needs a label that does not either. */
          color: loading ? 'var(--au-ink)' : '#1e293b',
          border: 'none',
          borderRadius: 'var(--rs)',
          padding: '6px 12px',
          fontFamily: "'Bricolage Grotesque', sans-serif",
          fontWeight: 700,
          fontSize: 11,
          cursor: loading ? 'default' : 'pointer',
          whiteSpace: 'nowrap',
          transition: 'background 0.15s',
        }}
      >
        {loading ? 'Verifying…' : 'Verify now →'}
      </button>
    </div>
  );
};

export default StaleCardBanner;
