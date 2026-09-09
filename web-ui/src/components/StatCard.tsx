import React, { useState } from 'react';
import { flexRowGap8, flexRowGap12, flexRowBetween, flexColGap12, flexColGap16, flexColGap20, sectionHeaderStyle, pageContainerStyle, pageMaxWidthStyle, cardStyle, tableStyle } from '../styles/layoutStyles';
import { tabular } from '../styles/money';
import { ScopeTag } from './ScopeTag';
import type { Scope } from '../utils/scope';

interface StatCardProps {
  label: string;
  value: string;
  accentColor: string;
  icon: React.ReactNode;
  subtitle?: React.ReactNode;
  valueColor?: string;
  /**
   * Whose money this figure covers (AUDIT.md D-01). Optional: a card showing
   * something that is not a per-owner total leaves it off. `mixed` renders no
   * tag, so those cards say it in their `subtitle` instead.
   */
  scope?: Scope;
}

export const StatCard: React.FC<StatCardProps> = ({ label, value, accentColor, icon, subtitle, valueColor, scope }) => {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'var(--bg-card)',
        border: `1px solid ${hovered ? accentColor + '66' : 'var(--border-light)'}`,
        borderRadius: '16px',
        padding: '24px',
        boxShadow: hovered ? '0 8px 24px var(--card-hover-shadow)' : 'var(--card-shadow)',
        transform: hovered ? 'translateY(-3px)' : 'translateY(0)',
        transition: 'all 0.2s ease',
        cursor: 'default',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '16px' }}>
        <div>
          <p style={{
            color: 'var(--text-secondary)',
            fontSize: '14px',
            marginBottom: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            flexWrap: 'wrap',
          }}>
            {label}
            {scope && <ScopeTag scope={scope} />}
          </p>
          {/* *** A FIGURE IS NOT A HEADING. *** This was an <h3>, sitting
              directly under each page's <h1>, so the document outline a screen
              reader navigates by was a list of money values — "$5,042.18",
              "$1,204.00" — with a skipped level in front of them. Found by the
              E2E heading check; the label above is the <p>, and this is its
              value, so <p> is what it is.

              Tabular figures: every stat card on every page holds a money
              value, so one change here makes the whole app's numbers align in a
              column instead of reading as a ragged edge. */}
          <p
            // A stable handle for tests, now that the value is not a heading.
            // `TransactionsHousehold.test.tsx` addressed these by `level: 3`
            // specifically to tell a CARD value from a transaction ROW amount —
            // both render the same string — so removing the heading removed its
            // only way to discriminate. The intent was right; it needed a hook
            // that is not a lie about document structure.
            data-testid="stat-value"
            style={{
            fontSize: '28px',
            fontWeight: 'bold',
            color: valueColor || 'var(--text-primary)',
            margin: 0,
            ...tabular,
          }}>{value}</p>
        </div>
        <div style={{
          width: '48px',
          height: '48px',
          background: accentColor + '33',
          borderRadius: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          {icon}
        </div>
      </div>
      {subtitle && (
        <div style={flexRowGap8}>
          {subtitle}
        </div>
      )}
    </div>
  );
};
