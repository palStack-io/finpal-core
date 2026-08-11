import React from 'react';
import type { RecommendCard, DisplacedWinner } from '../service';
import { flexRowGap8, flexRowGap12, flexRowBetween, flexColGap12, flexColGap16, flexColGap20, sectionHeaderStyle, pageContainerStyle, pageMaxWidthStyle, cardStyle, tableStyle } from '../../../styles/layoutStyles';

interface RecommendTableProps {
  cards: RecommendCard[];
  displacedWinner?: DisplacedWinner;
  category?: string;
  amount?: number;
}

const tagStyles: Record<string, React.CSSProperties> = {
  best:   { background: 'var(--g100)',  color: 'var(--g700)',  border: '1px solid var(--g200)' },
  good:   { background: 'var(--au100)', color: 'var(--au600)', border: '1px solid var(--au300)' },
  ok:     { background: '#f1f5f9',      color: 'var(--muted)', border: '1px solid var(--border)' },
  capped: { background: 'var(--re100)', color: 'var(--re600)', border: '1px solid var(--re100)' },
};

const tagLabel: Record<string, string> = {
  best: 'Best', good: 'Good', ok: 'Skip', capped: 'Capped',
};

const RecommendTable: React.FC<RecommendTableProps> = ({
  cards,
  displacedWinner,
  category,
  amount,
}) => {
  return (
    <div>
      {/* Sub-header */}
      {category && amount && (
        <div
          style={{
            fontSize: 11,
            color: 'var(--muted)',
            fontFamily: "'Bricolage Grotesque', sans-serif",
            marginBottom: 10,
          }}
        >
          ${amount.toFixed(2)} · {category} · cap-aware
        </div>
      )}

<div className="fp-table-scroll">
      <table style={tableStyle}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {['Card', 'Rate', 'Effective', 'Value', ''].map((h) => (
              <th
                key={h}
                style={{
                  textAlign: 'left',
                  fontFamily: "'Bricolage Grotesque', sans-serif",
                  fontSize: 10,
                  fontWeight: 700,
                  color: 'var(--muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  padding: '4px 8px 8px',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cards.map((card) => {
            const isCapped = card.tag === 'capped';
            const isBest = card.tag === 'best';
            return (
              <tr
                key={card.card_name}
                style={{
                  background: isCapped
                    ? 'rgba(254,242,242,0.6)'
                    : isBest
                    ? 'var(--g50)'
                    : 'transparent',
                  borderLeft: isCapped ? '3px solid var(--re600)' : isBest ? '3px solid var(--g400)' : '3px solid transparent',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                {/* Card name + program */}
                <td style={{ padding: '10px 8px' }}>
                  <div
                    style={{
                      fontFamily: "'Bricolage Grotesque', sans-serif",
                      fontWeight: 600,
                      fontSize: 12,
                      color: isCapped ? 'var(--muted)' : 'var(--ink)',
                    }}
                  >
                    {card.card_name}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>
                    {card.program}
                    {isCapped && (
                      <span style={{ color: 'var(--re600)', fontWeight: 700 }}> · CAP HIT</span>
                    )}
                  </div>
                </td>

                {/* Nominal rate */}
                <td style={{ padding: '10px 8px' }}>
                  <span
                    style={{
                      fontFamily: "'Bricolage Grotesque', sans-serif",
                      fontWeight: 700,
                      fontSize: 13,
                      color: isCapped ? 'var(--muted)' : 'var(--ink3)',
                      textDecoration: isCapped ? 'line-through' : 'none',
                    }}
                  >
                    {card.nominal_rate}×
                  </span>
                </td>

                {/* Effective rate */}
                <td style={{ padding: '10px 8px' }}>
                  <span
                    style={{
                      fontFamily: "'Bricolage Grotesque', sans-serif",
                      fontWeight: 700,
                      fontSize: 13,
                      color: isCapped ? 'var(--re600)' : isBest ? 'var(--g700)' : 'var(--ink3)',
                    }}
                  >
                    {card.effective_rate}×
                  </span>
                </td>

                {/* Value */}
                <td style={{ padding: '10px 8px' }}>
                  <span
                    style={{
                      fontFamily: "'Bricolage Grotesque', sans-serif",
                      fontWeight: isBest ? 800 : 600,
                      fontSize: 13,
                      color: isCapped ? 'var(--re600)' : isBest ? 'var(--g700)' : 'var(--ink3)',
                    }}
                  >
                    ${card.value_usd.toFixed(2)}
                  </span>
                </td>

                {/* Tag */}
                <td style={{ padding: '10px 8px' }}>
                  <span
                    style={{
                      ...tagStyles[card.tag],
                      fontFamily: "'Bricolage Grotesque', sans-serif",
                      fontWeight: 700,
                      fontSize: 10,
                      padding: '2px 8px',
                      borderRadius: 20,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {tagLabel[card.tag]}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>

      {/* "Why" explanation box — shown when a displaced winner exists */}
      {displacedWinner && (
        <div
          style={{
            marginTop: 14,
            background: '#eff6ff',
            border: '1px solid #dbeafe',
            borderRadius: 'var(--rs)',
            padding: '12px 14px',
          }}
        >
          <div
            style={{
              fontFamily: "'Bricolage Grotesque', sans-serif",
              fontWeight: 700,
              fontSize: 12,
              color: '#1d4ed8',
              marginBottom: 6,
            }}
          >
            ✦ Why {displacedWinner.card_name} is crossed out
          </div>
          <p style={{ fontSize: 12, color: 'var(--ink3)', lineHeight: 1.6, margin: 0 }}>
            {displacedWinner.card_name} earns {displacedWinner.normal_rate}× normally but has hit
            its cap — so it earns at a reduced rate for the rest of this period.{' '}
            {displacedWinner.cap_note} The optimizer surfaces the next best uncapped card instead.
          </p>
        </div>
      )}
    </div>
  );
};

export default RecommendTable;
