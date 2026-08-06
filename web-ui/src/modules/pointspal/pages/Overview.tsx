import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { pointspalService, Overview } from '../service';
import CardFace from '../components/CardFace';
import StaleCardBanner from '../components/StaleCardBanner';
import { Loading } from '../../../components/common/Loading';
import { ScopeTag } from '../../../components/ScopeTag';

const PointsPalOverview: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const overview = await pointspalService.getOverview();
      setData(overview);
    } catch {
      setError('Failed to load overview. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleVerify = async (id: number) => {
    await pointspalService.verifyCard(id);
    fetchData();
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <Loading size="md" text="Loading overview…" />
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

  if (!data) return null;

  return (
    <div style={{ padding: '24px 28px', background: 'var(--bg)', minHeight: '100%' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 800, fontSize: 22, color: 'var(--ink)', margin: 0 }}>
          ✦ pointsPal
        </h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
          Your rewards at a glance — cap alerts, missed points, and top opportunities.
        </p>
      </div>

      {/* Stale banners */}
      {data.stale_cards.map((sc) => (
        <StaleCardBanner
          key={sc.id}
          cardId={sc.id}
          cardName={sc.card_name}
          staleSince={sc.issuer_updated_at}
          staleStatus={sc.stale_status}
          onVerify={handleVerify}
        />
      ))}

      {/* KPI bar */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 12,
          marginBottom: 20,
        }}
      >
        {[
          {
            label: 'Total Rewards Value',
            value: `$${data.total_value_usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            sub: `${data.cards.reduce((a, c) => a + c.points, 0).toLocaleString()} pts across ${data.cards.length} cards`,
            valueColor: 'var(--ink)',
          },
          {
            label: 'Pts Earned (this month)',
            value: data.pts_earned_this_month.toLocaleString(),
            sub: null,
            valueColor: 'var(--ink)',
          },
          {
            label: 'Pts Missed (this month)',
            value: data.pts_missed_this_month.toLocaleString(),
            sub: data.pts_missed_this_month > 0 ? '⚠ cap hit' : null,
            valueColor: data.pts_missed_this_month > 0 ? 'var(--re600)' : 'var(--ink)',
            warn: data.pts_missed_this_month > 0,
          },
          {
            label: 'Cap Alerts',
            value: String(data.active_cap_alerts),
            sub: 'View cap tracker →',
            subAction: () => navigate('/pointspal/caps'),
            valueColor: data.active_cap_alerts > 0 ? 'var(--re600)' : 'var(--g700)',
          },
        ].map(({ label, value, sub, subAction, valueColor, warn }) => (
          <div
            key={label}
            style={{
              background: 'var(--white)',
              border: `1px solid ${warn ? 'var(--re100)' : 'var(--border)'}`,
              borderRadius: 'var(--r)',
              padding: '14px 16px',
              boxShadow: 'var(--sh-xs)',
            }}
          >
            {/* Every figure here is the caller's own: routes.py filters
                UserCard by user_id, so the whole row is `yours`. D-01's sweep
                never reached this page because the module was switched off. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 600 }}>
                {label}
              </div>
              <ScopeTag scope="yours" />
            </div>
            <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 800, fontSize: 24, color: valueColor, lineHeight: 1 }}>
              {value}
            </div>
            {sub && (
              <div
                onClick={subAction}
                style={{
                  fontSize: 11,
                  color: subAction ? 'var(--g700)' : warn ? 'var(--re600)' : 'var(--muted)',
                  marginTop: 6,
                  cursor: subAction ? 'pointer' : 'default',
                  fontFamily: subAction ? "'Bricolage Grotesque', sans-serif" : undefined,
                  fontWeight: subAction ? 600 : undefined,
                }}
              >
                {sub}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Main grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>

        {/* Left: Your Cards */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={cardTitle}>Your Cards</div>
            <button
              onClick={() => navigate('/pointspal/cards')}
              style={textBtnStyle}
            >
              Manage all →
            </button>
          </div>
          {/* Without this the panel rendered as a bare heading on a new install,
              while every neighbouring panel had an empty state. */}
          {data.cards.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--muted)', padding: '4px 0 8px' }}>
              No cards yet — add one to start tracking points.
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
            {data.cards.map((card) => {
              const barPct = Math.min((card.points / 100000) * 100, 100);
              return (
                <div
                  key={card.id}
                  style={{ border: '1px solid var(--border)', borderRadius: 'var(--rs)', overflow: 'hidden', cursor: 'pointer' }}
                  onClick={() => navigate('/pointspal/cards')}
                >
                  <CardFace
                    issuerColor={card.issuer_color}
                    cardName={card.card_name}
                    issuer={card.program}
                    points={card.points}
                    ptsLabel="pts"
                    style={{ minHeight: 70 }}
                  />
                  <div style={{ padding: '8px 10px' }}>
                    {/* Value bar */}
                    <div style={{ height: 4, background: 'var(--border)', borderRadius: 99, overflow: 'hidden', marginBottom: 6 }}>
                      <div style={{ height: '100%', width: `${barPct}%`, background: 'var(--grad)', borderRadius: 99 }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--muted)' }}>
                      <span>≈ <b style={{ color: 'var(--ink3)' }}>${card.est_value_usd.toLocaleString()}</b></span>
                      <span>Fee: <b>${card.annual_fee}/yr</b></span>
                    </div>
                    {card.expiry_alert && (
                      <div style={{ fontSize: 10, color: 'var(--au600)', marginTop: 4, fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 600 }}>
                        ⚠️ {card.expiry_alert}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Action Needed */}
          {data.action_items.length > 0 && (
            <div style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={cardTitle}>🔥 Action Needed</div>
                <button
                  onClick={() => navigate('/pointspal/caps')}
                  style={textBtnStyle}
                >
                  All alerts →
                </button>
              </div>
              {data.action_items.map((item, i) => {
                const iconBg = item.type === 'capped' ? 'var(--re50)' : item.type === 'warning' ? 'var(--au50)' : '#eff6ff';
                const valueColor = item.type === 'capped' ? 'var(--re600)' : item.type === 'warning' ? 'var(--au600)' : 'var(--g700)';
                return (
                  <div
                    key={i}
                    onClick={() => navigate(item.link_to)}
                    style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderBottom: i < data.action_items.length - 1 ? '1px solid var(--border)' : 'none', cursor: 'pointer' }}
                  >
                    <div style={{ width: 32, height: 32, borderRadius: 'var(--rs)', background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
                      {item.emoji}
                    </div>
                    <div style={flexMinZeroStyle}>
                      <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, fontSize: 12, color: 'var(--ink)' }}>{item.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, lineHeight: 1.4 }}>{item.description}</div>
                    </div>
                    <div style={rightAlignStyle}>
                      <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, fontSize: 12, color: valueColor }}>{item.value}</div>
                      <div style={microTextStyle}>{item.value_label}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Recent Earnings */}
          {data.recent_activity.length > 0 && (
            <div style={cardStyle}>
              <div style={cardTitle}>Recent Earnings</div>
              {data.recent_activity.map((act, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: i < data.recent_activity.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: act.dot_color, flexShrink: 0 }} />
                  <div style={flexMinZeroStyle}>
                    <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 600, fontSize: 12, color: 'var(--ink)' }}>{act.description}</div>
                    <div style={microTextStyle}>{act.card_name} · {act.subtitle}</div>
                  </div>
                  <div style={rightAlignStyle}>
                    <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, fontSize: 12, color: 'var(--g700)' }}>
                      +{act.pts_earned.toLocaleString()} pts
                    </div>
                    {act.pts_missed > 0 && (
                      <div style={{ fontSize: 10, color: 'var(--re600)' }}>
                        (−{act.pts_missed.toLocaleString()} missed)
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const cardStyle: React.CSSProperties = {
  background: 'var(--white)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r)',
  padding: '16px 18px',
  boxShadow: 'var(--sh-xs)',
};

const cardTitle: React.CSSProperties = {
  fontFamily: "'Bricolage Grotesque', sans-serif",
  fontWeight: 700,
  fontSize: 13,
  color: 'var(--ink)',
  margin: 0,
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

const microTextStyle: React.CSSProperties = { fontSize: 10, color: 'var(--muted)' };
const flexMinZeroStyle: React.CSSProperties = { flex: 1, minWidth: 0 };
const rightAlignStyle: React.CSSProperties = { textAlign: 'right', flexShrink: 0 };
const textBtnStyle: React.CSSProperties = { background: 'none', border: 'none', color: 'var(--g700)', fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, fontSize: 12, cursor: 'pointer' };

export default PointsPalOverview;
