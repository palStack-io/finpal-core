import React, { useState, useEffect, useCallback } from 'react';
import { pointspalService, CapCard, CapSummary } from '../service';
import CapProgressCard from '../components/CapProgressCard';
import { Loading } from '../../../components/common/Loading';

type Period = 'monthly' | 'quarterly' | 'annual';

const periodLabels: Record<Period, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annual: 'Annual',
};

const CapTracker: React.FC = () => {
  const [period, setPeriod] = useState<Period>('monthly');
  const [caps, setCaps] = useState<CapCard[]>([]);
  const [summary, setSummary] = useState<CapSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openCard, setOpenCard] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [capsData, summaryData] = await Promise.all([
        pointspalService.getCaps(period),
        pointspalService.getCapSummary(period),
      ]);
      // Sort: capped first, warning second, ok last
      const sorted = [...capsData].sort((a, b) => {
        const order = { capped: 0, warning: 1, ok: 2 };
        return order[a.status] - order[b.status];
      });
      setCaps(sorted);
      setSummary(summaryData);
    } catch {
      setError('Failed to load cap data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <Loading size="md" text="Loading caps…" />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 32, textAlign: 'center' }}>
        <div style={{ color: 'var(--re600)', marginBottom: 12, fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700 }}>
          {error}
        </div>
        <button onClick={fetchData} style={btnStyle}>Retry</button>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 28px', background: 'var(--bg)', minHeight: '100%' }}>
      {/* Page header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 800, fontSize: 22, color: 'var(--ink)', margin: 0 }}>
          Cap Tracker
        </h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
          Real-time spend vs. earn caps — know exactly when to switch cards.
        </p>
      </div>

      {/* Period toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <span style={{ fontSize: 12, color: 'var(--muted)', fontFamily: "'Bricolage Grotesque', sans-serif" }}>Period:</span>
        {(['monthly', 'quarterly', 'annual'] as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            style={{
              padding: '5px 14px',
              borderRadius: 20,
              border: '1px solid',
              borderColor: period === p ? 'var(--g700)' : 'var(--border)',
              background: period === p ? 'var(--g700)' : 'var(--white)',
              color: period === p ? '#fff' : 'var(--ink3)',
              fontFamily: "'Bricolage Grotesque', sans-serif",
              fontWeight: 700,
              fontSize: 12,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {periodLabels[p]}
          </button>
        ))}
      </div>

      {/* 2-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, alignItems: 'start' }}>

        {/* Left: cap cards */}
        <div>
          {caps.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--muted)', fontSize: 14 }}>
              No cap data for this period.
            </div>
          ) : (
            caps.map((cap) => (
              <CapProgressCard
                key={`${cap.category}-${cap.card_name}`}
                {...cap}
                isOpen={openCard === `${cap.category}-${cap.card_name}`}
                onToggle={() =>
                  setOpenCard((prev) =>
                    prev === `${cap.category}-${cap.card_name}` ? null : `${cap.category}-${cap.card_name}`
                  )
                }
              />
            ))
          )}
        </div>

        {/* Right: summary panels */}
        {summary && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Period Summary */}
            <div style={cardStyle}>
              <div style={cardTitle}>Period Summary</div>
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>Pts earned this {period}</div>
                <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 800, fontSize: 28, color: 'var(--ink)', lineHeight: 1.1 }}>
                  {summary.pts_earned.toLocaleString()}
                </div>
                <div style={{ fontSize: 11, color: summary.value_missed_usd > 0 ? 'var(--re600)' : 'var(--muted)', marginTop: 4 }}>
                  {summary.value_missed_usd > 0
                    ? `≈ $${summary.value_missed_usd.toFixed(0)} missed to caps`
                    : 'No value missed this period'}
                </div>
              </div>
              {[
                { label: 'Points at full rate',   value: summary.pts_at_normal.toLocaleString(),  color: 'var(--g700)' },
                { label: 'Points at fallback',    value: summary.pts_at_fallback.toLocaleString(), color: 'var(--re600)' },
                { label: 'Points missed (caps)',  value: summary.pts_missed.toLocaleString(),      color: 'var(--re600)' },
                { label: 'Value missed',          value: `≈ $${summary.value_missed_usd.toFixed(0)}`, color: 'var(--re600)' },
                { label: 'Active cap alerts',     value: `${summary.active_alerts} alerts`,        color: 'var(--au600)' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                  <span style={{ color: 'var(--ink3)' }}>{label}</span>
                  <span style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, color }}>{value}</span>
                </div>
              ))}
            </div>

            {/* If You Switch Today */}
            {caps.find((c) => c.status === 'capped' && c.recommended_switch) && (() => {
              const capped = caps.find((c) => c.status === 'capped' && c.recommended_switch)!;
              const sw = capped.recommended_switch!;
              const estPts = Math.round(capped.room_left * sw.rate * 10);
              return (
                <div style={cardStyle}>
                  <div style={cardTitle}>If You Switch Today</div>
                  <p style={{ fontSize: 12, color: 'var(--ink3)', lineHeight: 1.7, marginBottom: 12 }}>
                    Moving {capped.category.toLowerCase()} to{' '}
                    <strong style={{ color: 'var(--g700)' }}>{sw.card_name} ({sw.rate}×)</strong>{' '}
                    for the rest of the period could recover an estimated{' '}
                    <strong style={{ color: 'var(--g700)' }}>+{estPts.toLocaleString()} pts</strong>.
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                    <span style={{ color: 'var(--muted)' }}>Switch</span>
                    <span style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, color: 'var(--ink)' }}>
                      {capped.category} → {sw.card_name}
                    </span>
                    <span style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, color: 'var(--g700)', background: 'var(--g50)', border: '1px solid var(--g100)', borderRadius: 20, padding: '1px 10px', fontSize: 11 }}>
                      +{estPts.toLocaleString()} pts
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* Upcoming Resets */}
            {summary.upcoming_resets.length > 0 && (
              <div style={cardStyle}>
                <div style={cardTitle}>Upcoming Resets</div>
                {summary.upcoming_resets.map((reset, i) => {
                  const dotColor = i === 0 ? 'var(--re600)' : i === 1 ? 'var(--au500)' : 'var(--g500)';
                  const textColor = i === 0 ? 'var(--re600)' : i === 1 ? 'var(--au600)' : 'var(--g700)';
                  const resetDate = new Date(reset.resets_at);
                  const now = new Date();
                  const days = Math.ceil((resetDate.getTime() - now.getTime()) / 86400000);
                  return (
                    <div key={`${reset.category}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < summary.upcoming_resets.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 600, fontSize: 12, color: 'var(--ink)' }}>
                          {reset.card_name} {reset.category} cap resets
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                          {reset.resets_at} · {reset.period}
                        </div>
                      </div>
                      <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, fontSize: 12, color: textColor }}>
                        {days > 0 ? `${days}d` : reset.resets_at}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
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
  marginBottom: 12,
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

export default CapTracker;
