import React, { useState, useEffect, useCallback } from 'react';
import { pointspalService, RedemptionOverview, RedemptionOption } from '../service';
import { Loading } from '../../../components/common/Loading';
import { ScopeTag } from '../../../components/ScopeTag';
import { flexRowGap8, flexRowGap12, flexRowBetween, flexColGap12, flexColGap16, flexColGap20, sectionHeaderStyle, pageContainerStyle, pageMaxWidthStyle, tableStyle } from '../../../styles/layoutStyles';

const cppStyle = (cpp: number): React.CSSProperties => {
  if (cpp >= 2.0) return { color: 'var(--g700)', fontWeight: 800 };
  if (cpp >= 1.0) return { color: 'var(--au600)', fontWeight: 700 };
  return { color: 'var(--muted)', fontWeight: 600 };
};

const tagStyles: Record<string, React.CSSProperties> = {
  Best:  { background: 'var(--g100)',  color: 'var(--g700)',  border: '1px solid var(--g200)' },
  Good:  { background: 'var(--au100)', color: 'var(--au600)', border: '1px solid var(--au300)' },
  OK:    { background: 'var(--border)', color: 'var(--muted)', border: '1px solid var(--border)' },
  Avoid: { background: 'var(--re100)', color: 'var(--re600)', border: '1px solid var(--re100)' },
};

const Redeem: React.FC = () => {
  const [data, setData] = useState<RedemptionOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await pointspalService.getRedemptionOptions();
      setData(result);
    } catch {
      setError('Failed to load redemption options. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <Loading size="md" text="Loading redemption options…" />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 32, textAlign: 'center' }}>
        <div style={{ color: 'var(--re600)', marginBottom: 12, fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700 }}>{error}</div>
        <button onClick={fetchData} style={btnStyle}>Retry</button>
      </div>
    );
  }

  if (!data || data.programs.length === 0) {
    return (
      <div style={{ padding: '24px 28px' }}>
        <PageHeader />
        <div style={{ textAlign: 'center', padding: '64px 24px', color: 'var(--muted)', fontSize: 14 }}>
          No redemption options available. Add cards to get started.
        </div>
      </div>
    );
  }

  // Split programs into 2 columns
  const left = data.programs.filter((_, i) => i % 2 === 0);
  const right = data.programs.filter((_, i) => i % 2 !== 0);

  return (
    <div style={{ padding: '24px 28px', background: 'var(--bg)', minHeight: '100%' }}>
      <PageHeader />

      {/* Top banner */}
      <div
        style={{
          background: 'var(--grad)',
          borderRadius: 'var(--r)',
          padding: '20px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
          boxShadow: 'var(--sh-md)',
        }}
      >
        <div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 600, marginBottom: 4 }}>
            Maximum extractable value
          </div>
          <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 800, fontSize: 32, color: '#fff', lineHeight: 1 }}>
            ${data.max_redeemable_usd.toLocaleString('en-US', { minimumFractionDigits: 0 })}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 6 }}>
            from {data.total_points.toLocaleString()} total points across {data.card_count} cards
          </div>
        </div>
        <div style={{ display: 'flex', gap: 32, textAlign: 'right' }}>
          <div>
            <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 800, fontSize: 22, color: '#fff' }}>
              ${data.total_value_usd.toLocaleString()}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>Current estimated value</div>
          </div>
          <div>
            <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 800, fontSize: 22, color: 'var(--au300)' }}>
              +${(data.max_redeemable_usd - data.total_value_usd).toLocaleString()}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>Potential uplift via transfers</div>
          </div>
        </div>
      </div>

      {/* 2-column grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {left.map((program) => (
            <ProgramCard key={program.program_name} program={program} />
          ))}
        </div>

        {/* Right column: programs + tips */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {right.map((program) => (
            <ProgramCard key={program.program_name} program={program} />
          ))}

          {/* Tips panel */}
          {data.tips && data.tips.length > 0 && (
            <div style={cardStyle}>
              <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, fontSize: 13, color: 'var(--ink)', marginBottom: 12 }}>
                💡 Tips
              </div>
              {data.tips.map((tip, i) => {
                const tipStyles: Record<string, { bg: string; border: string; titleColor: string }> = {
                  expiry:   { bg: 'var(--au50)',  border: 'var(--au100)', titleColor: 'var(--au600)' },
                  transfer: { bg: 'var(--g50)',   border: 'var(--g200)',  titleColor: 'var(--g700)' },
                  info:     { bg: 'var(--g50)',     border: 'var(--g100)',  titleColor: 'var(--g700)' },
                };
                const s = tipStyles[tip.type] ?? tipStyles.info;
                return (
                  <div
                    key={i}
                    style={{
                      background: s.bg,
                      border: `1px solid ${s.border}`,
                      borderRadius: 'var(--rs)',
                      padding: '10px 12px',
                      marginBottom: i < data.tips.length - 1 ? 8 : 0,
                    }}
                  >
                    <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, fontSize: 12, color: s.titleColor, marginBottom: 4 }}>
                      {tip.title}
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--ink3)', lineHeight: 1.5, margin: 0 }}>{tip.body}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const ProgramCard: React.FC<{ program: RedemptionOverview['programs'][0] }> = ({ program }) => (
  <div style={cardStyle}>
    {/* Program header */}
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
      <div style={{ width: 10, height: 10, borderRadius: '50%', background: program.dot_color, flexShrink: 0 }} />
      <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, fontSize: 13, color: 'var(--ink)', flex: 1 }}>
        {program.program_name}
      </div>
      <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, fontSize: 12, color: 'var(--muted)' }}>
        {program.points.toLocaleString()} pts
      </div>
    </div>

    <table style={tableStyle}>
      <thead>
        <tr style={{ borderBottom: '1px solid var(--border)' }}>
          {['Partner', 'Type', '¢/pt', 'Tag'].map((h) => (
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
                padding: '4px 6px 8px',
              }}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {program.options.map((opt: RedemptionOption) => (
          <tr key={opt.partner} style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '9px 6px' }}>
              <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 600, fontSize: 12, color: 'var(--ink)' }}>
                {opt.partner}
              </div>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>{opt.description}</div>
            </td>
            <td style={{ padding: '9px 6px' }}>
              <span style={{ background: 'var(--border)', color: 'var(--muted)', border: '1px solid var(--border)', fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, fontSize: 10, padding: '2px 7px', borderRadius: 20 }}>
                {opt.type}
              </span>
            </td>
            <td style={{ padding: '9px 6px' }}>
              <span style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 13, ...cppStyle(opt.cpp) }}>
                {opt.cpp.toFixed(1)}¢
              </span>
            </td>
            <td style={{ padding: '9px 6px' }}>
              <span style={{
                ...tagStyles[opt.tag],
                fontFamily: "'Bricolage Grotesque', sans-serif",
                fontWeight: 700,
                fontSize: 10,
                padding: '2px 8px',
                borderRadius: 20,
                whiteSpace: 'nowrap',
              }}>
                {opt.tag}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const PageHeader: React.FC = () => (
  <div style={{ marginBottom: 20 }}>
    <h1 style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 800, fontSize: 22, color: 'var(--ink)', margin: 0 }}>
      Redemption Optimizer
    </h1>
    <div style={{ marginTop: 6 }}><ScopeTag scope="yours" /></div>
    <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
      Maximize what your points are worth — ranked by cents per point.
    </p>
  </div>
);

const cardStyle: React.CSSProperties = {
  background: 'var(--white)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r)',
  padding: '16px 18px',
  boxShadow: 'var(--sh-xs)',
};

const btnStyle: React.CSSProperties = {
  padding: '8px 20px',
  background: 'var(--g700)',
  color: '#fff',
  border: 'none',
  borderRadius: 'var(--rs)',
  fontFamily: "'Bricolage Grotesque', sans-serif",
  fontWeight: 700,
  fontSize: 13,
  cursor: 'pointer',
};

export default Redeem;
