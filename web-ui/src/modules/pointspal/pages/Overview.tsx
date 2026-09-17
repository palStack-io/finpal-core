import React, { useState, useEffect, useCallback } from 'react';
import { PageHead } from '../../../components/PageHead';
import { TotalsRow } from '../../../components/dashboard/TotalsRow';
import { useNavigate } from 'react-router-dom';
import { pointspalService, Overview } from '../service';
import CardFace from '../components/CardFace';
import StaleCardBanner from '../components/StaleCardBanner';
import { Loading } from '../../../components/common/Loading';
import { ScopeTag } from '../../../components/ScopeTag';
import { useMoney } from '../../../hooks/useMoney';

/* The cap-tracker link inside a `TotalsRow` note. A real button, not a styled
   div: it navigates, so it has to be reachable by keyboard. */
const capLinkStyle: React.CSSProperties = {
  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
  color: 'var(--g-ink)', font: 'inherit', fontWeight: 600,
};

const PointsPalOverview: React.FC = () => {
  const { money } = useMoney();
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
        <div style={{ color: 'var(--re-ink)', marginBottom: 12, fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700 }}>{error}</div>
        <button onClick={fetchData} style={btnStyle}>Retry</button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div style={{ padding: '24px 28px', background: 'var(--bg)', minHeight: '100%' }}>

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

      {/* *** THE APP'S HEAD, AND THE KPI BAR MOVES INTO IT. ***
          All five pointsPal pages hand-rolled the same head block — the
          eleven-page duplication `PageHead` exists to remove, repeated five
          more times inside one module. D-233 recorded these as EXEMPTIONS with
          a stated reason, and the reason was that a decision was pending; this
          is that decision (owner, 2026-09-16).

          *** IT DOES NOT WRITE PAST THE COINS SPEC — IT IMPLEMENTS IT. ***
          `docs/mockups/coins/pages-web-2.html` draws this page with
          `<h1>` + subtitle + a `right` slot + a ridge band, which is
          `PageHead`'s exact shape, and the purse it puts in that corner is what
          `PageHead` calls `right`. When coins ship the purse drops in beside
          the scope tag and nothing else moves.

          *** THE FOUR KPI CARDS BECOME ONE `TotalsRow`. *** They were a
          hand-rolled `auto-fit` grid of bordered cards, each repeating the same
          `yours` tag — one fact printed four times, which is D-101's
          duplication in chrome. The tag is said ONCE now, in `right`, because
          it is a property of every figure on the page.

          *** AND A MEASURED TRAP THAT THIS MOVE WALKS INTO: THE HEAD SKY IS
          LIGHTER THAN THE CARD. *** `--au-ink` is 4.88:1 on the page card and
          **3.95:1 on `--head-sky`**; clay is 4.08:1 and gold 3.95:1 there. So
          the warm inks cannot carry a figure in a head at all. That is D-229
          exactly — moving Investments' buttons into `PageHead` dropped
          `--g-ink` to 4.38:1 on this same surface. The figures below use
          `--re-ink` (5.09:1) and `--g-ink` (5.61:1), both measured on the sky
          rather than on the card.

          Bricolage Grotesque stays everywhere it is doing real work — the card
          faces, and the figures inside `TotalsRow`'s own type. What changed is
          the page TITLE. */}
      <PageHead
        band="pointspal"
        title="pointsPal"
        subtitle="Your rewards at a glance — cap alerts, missed points, and top opportunities."
        right={<ScopeTag scope="yours" />}
      >
        <TotalsRow cells={[
          {
            label: 'Rewards you hold',
            value: money(data.total_value_usd),
            note: `${data.cards.reduce((a, c) => a + c.points, 0).toLocaleString()} pts`
              + ` across ${data.cards.length} ${data.cards.length === 1 ? 'card' : 'cards'}`,
          },
          {
            label: 'Earned this month',
            value: `${data.pts_earned_this_month.toLocaleString()} pts`,
            note: 'on the cards you have connected',
          },
          {
            /* Red only when there IS something missed. At zero this is good
               news and colouring it like a loss would be a figure arguing with
               itself. */
            label: 'Missed this month',
            value: `${data.pts_missed_this_month.toLocaleString()} pts`,
            valueColor: data.pts_missed_this_month > 0 ? 'var(--re-ink)' : undefined,
            note: data.pts_missed_this_month > 0
              ? 'spend that went on the wrong card'
              : 'nothing went on the wrong card',
          },
          {
            /* *** KEPT DESPITE READING 0 ON THE DEMO, BECAUSE 0 HERE IS AN
               ANSWER RATHER THAN AN ABSENCE. *** "no cap alerts" is the state
               you want to be in, which is why it is green at zero — unlike a
               coin badge that is 0 because nothing can increment it. It also
               carries the only route out of this page to the cap tracker. */
            label: 'Cap alerts',
            value: String(data.active_cap_alerts),
            valueColor: data.active_cap_alerts > 0 ? 'var(--re-ink)' : 'var(--g-ink)',
            note: (
              <button type="button" onClick={() => navigate('/pointspal/caps')} style={capLinkStyle}>
                View cap tracker →
              </button>
            ),
          },
        ]} />
      </PageHead>

      {/* Main grid */}
      <div className="fp-two-pane">

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
                      <span>Fee: <b>{money(card.annual_fee)}/yr</b></span>
                    </div>
                    {card.expiry_alert && (
                      <div style={{ fontSize: 10, color: 'var(--au-ink)', marginTop: 4, fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 600 }}>
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
                // `--g50`, not '#eff6ff': the other two arms are themed tokens and this one was
                // a hardcoded light blue, so in dark mode one tile in three lit up. D-103.
                const iconBg = item.type === 'capped' ? 'var(--re50)' : item.type === 'warning' ? 'var(--au50)' : 'var(--g50)';
                const valueColor = item.type === 'capped' ? 'var(--re-ink)' : item.type === 'warning' ? 'var(--au-ink)' : 'var(--g-ink)';
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
                    <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, fontSize: 12, color: 'var(--g-ink)' }}>
                      +{act.pts_earned.toLocaleString()} pts
                    </div>
                    {act.pts_missed > 0 && (
                      <div style={{ fontSize: 10, color: 'var(--re-ink)' }}>
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
const textBtnStyle: React.CSSProperties = { background: 'none', border: 'none', color: 'var(--g-ink)', fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, fontSize: 12, cursor: 'pointer' };

export default PointsPalOverview;
