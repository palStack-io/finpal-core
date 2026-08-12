import React, { useState } from 'react';
import type { CapCard } from '../service';

interface CapProgressCardProps extends CapCard {
  isOpen: boolean;
  onToggle: () => void;
}

const statusConfig = {
  capped: {
    border: 'var(--re600)',
    barColor: 'var(--re600)',
    rateColor: 'var(--re600)',
    pctColor: 'var(--re600)',
    bg: 'var(--re50)',
    alertBg: 'var(--re50)',
    alertBorder: 'var(--re100)',
    alertTitleColor: 'var(--re600)',
    icon: '🚨',
  },
  warning: {
    border: 'var(--au400)',
    barColor: 'var(--au500)',
    rateColor: 'var(--au600)',
    pctColor: 'var(--au600)',
    bg: 'var(--white)',
    alertBg: 'var(--au50)',
    alertBorder: 'var(--au100)',
    alertTitleColor: 'var(--au600)',
    icon: '⚡',
  },
  ok: {
    border: 'var(--g400)',
    barColor: 'var(--g500)',
    rateColor: 'var(--g700)',
    pctColor: 'var(--g700)',
    bg: 'var(--white)',
    alertBg: 'var(--g50)',
    alertBorder: 'var(--g100)',
    alertTitleColor: 'var(--g700)',
    icon: '✅',
  },
};

const CapProgressCard: React.FC<CapProgressCardProps> = ({
  category,
  emoji,
  card_name,
  cap_period,
  spent,
  cap_amount,
  cap_pct,
  status,
  effective_rate,
  normal_rate,
  room_left,
  resets_at,
  recommended_switch,
  isOpen,
  onToggle,
}) => {
  const cfg = statusConfig[status];
  const noCap = cap_amount === null;

  const alertTitle =
    status === 'capped'
      ? `🚨 Cap Reached — Now Earning ${effective_rate}× Instead of ${normal_rate}×`
      : status === 'warning'
      ? `⚡ Approaching Cap — $${room_left} Left at ${effective_rate}×`
      : `✅ On Track — Full rate active`;

  const alertDesc =
    status === 'capped'
      ? `You've hit your $${cap_amount?.toLocaleString()} ${cap_period} cap on ${category.toLowerCase()}. Every dollar since has earned just ${effective_rate}× instead of ${normal_rate}×. Switch cards immediately for the rest of this period.`
      : status === 'warning'
      ? `At your typical spend you'll hit the cap soon. Cap resets ${resets_at}. Plan accordingly.`
      : `At your current pace you have $${room_left?.toLocaleString()} remaining at ${effective_rate}×. Cap resets ${resets_at}.`;

  return (
    <div
      onClick={noCap ? undefined : onToggle}
      style={{
        background: cfg.bg,
        border: `1px solid var(--border)`,
        borderLeft: `4px solid ${cfg.border}`,
        borderRadius: 'var(--r)',
        marginBottom: 10,
        overflow: 'hidden',
        cursor: noCap ? 'default' : 'pointer',
        boxShadow: 'var(--sh-xs)',
      }}
    >
      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px 10px' }}>
        <div style={{ fontSize: 22 }}>{emoji}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: "'Bricolage Grotesque', sans-serif",
              fontWeight: 700,
              fontSize: 13,
              color: 'var(--ink)',
            }}
          >
            {category} · {card_name}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
            {noCap
              ? 'No cap — always earning'
              : `$${cap_amount?.toLocaleString()}/${cap_period} cap · resets ${resets_at}`}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div
            style={{
              fontFamily: "'Bricolage Grotesque', sans-serif",
              fontWeight: 800,
              fontSize: 20,
              color: cfg.rateColor,
              lineHeight: 1,
            }}
          >
            {effective_rate}×
          </div>
          <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
            {status === 'capped' ? 'Effective now' : status === 'warning' ? `$${room_left} left` : 'Full rate'}
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ padding: '0 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              flex: 1,
              height: 6,
              background: 'var(--border)',
              borderRadius: 99,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${noCap ? 100 : Math.min(cap_pct, 100)}%`,
                background: noCap ? 'var(--grad)' : cfg.barColor,
                opacity: noCap ? 0.35 : 1,
                borderRadius: 99,
                transition: 'width 0.4s ease',
              }}
            />
          </div>
          <div
            style={{
              fontFamily: "'Bricolage Grotesque', sans-serif",
              fontWeight: 700,
              fontSize: 12,
              color: cfg.pctColor,
              minWidth: 30,
              textAlign: 'right',
            }}
          >
            {noCap ? '∞' : `${cap_pct}%`}
          </div>
        </div>
      </div>

      {/* Amounts row */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '6px 16px 12px',
          fontSize: 11,
          color: 'var(--muted)',
        }}
      >
        <span>${spent.toLocaleString()} spent</span>
        <b style={{ color: status === 'capped' ? 'var(--re600)' : 'var(--ink3)' }}>
          {noCap
            ? 'No cap — no action needed'
            : status === 'capped'
            ? `$${cap_amount?.toLocaleString()} cap — CAPPED`
            : `$${cap_amount?.toLocaleString()} cap — $${room_left} remaining at ${effective_rate}×`}
        </b>
      </div>

      {/* Expandable detail */}
      {!noCap && isOpen && (
        <div
          style={{ borderTop: '1px solid var(--border)', padding: '12px 16px 14px' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{
              background: cfg.alertBg,
              border: `1px solid ${cfg.alertBorder}`,
              borderRadius: 'var(--rs)',
              padding: '10px 14px',
              marginBottom: 12,
            }}
          >
            <div
              style={{
                fontFamily: "'Bricolage Grotesque', sans-serif",
                fontWeight: 700,
                fontSize: 12,
                color: cfg.alertTitleColor,
                marginBottom: 6,
              }}
            >
              {alertTitle}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink3)', lineHeight: 1.6 }}>{alertDesc}</div>
          </div>

          {recommended_switch && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 12,
              }}
            >
              <span style={{ color: 'var(--muted)' }}>
                {status === 'capped' ? 'Switch to →' : 'Fallback →'}
              </span>
              <span
                style={{
                  fontFamily: "'Bricolage Grotesque', sans-serif",
                  fontWeight: 700,
                  color: 'var(--ink)',
                }}
              >
                {recommended_switch.card_name}
              </span>
              <span
                style={{
                  fontFamily: "'Bricolage Grotesque', sans-serif",
                  fontWeight: 700,
                  color: 'var(--g-ink)',
                  background: 'var(--g50)',
                  border: '1px solid var(--g100)',
                  borderRadius: 20,
                  padding: '1px 10px',
                  fontSize: 11,
                }}
              >
                {recommended_switch.rate}×{' '}
                {recommended_switch.cap ? `to $${recommended_switch.cap.toLocaleString()}` : 'no cap'}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CapProgressCard;
