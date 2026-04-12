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
            color: 'var(--au600)',
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
          color: loading ? 'var(--au600)' : '#fff',
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
