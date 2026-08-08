import React, { useState } from 'react';
import { pointspalService, RecommendationResult } from '../service';
import RecommendTable from '../components/RecommendTable';
import { Loading } from '../../../components/common/Loading';
import { ScopeTag } from '../../../components/ScopeTag';

const CATEGORIES = [
  { label: '✈️ Travel',        value: 'travel' },
  { label: '🍽️ Dining',       value: 'dining' },
  { label: '🛒 Groceries',     value: 'groceries' },
  { label: '⛽ Gas',           value: 'gas' },
  { label: '🛍️ Shopping',     value: 'shopping' },
  { label: '💊 Pharmacy',      value: 'pharmacy' },
  { label: '🎬 Entertainment', value: 'entertainment' },
  { label: '🌐 Other',         value: 'other' },
];

const BestCard: React.FC = () => {
  const [category, setCategory] = useState('groceries');
  const [merchant, setMerchant] = useState('');
  // Empty, not a pre-filled figure. '84.50' looked like the user's own data and
  // was invented — the page's empty state already says to enter an amount.
  const [amount, setAmount] = useState('');
  const [result, setResult] = useState<RecommendationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFind = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return;
    setLoading(true);
    setError(null);
    try {
      const data = await pointspalService.getRecommendation(category, amt);
      setResult(data);
    } catch {
      setError('Could not fetch recommendation. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const catLabel = CATEGORIES.find((c) => c.value === category)?.label ?? category;

  return (
    <div style={{ padding: '24px 28px', background: 'var(--bg)', minHeight: '100%' }}>
      {/* Page header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 800, fontSize: 22, color: 'var(--ink)', margin: 0 }}>
          Best Card Recommender
        </h1>
        <div style={{ marginTop: 6 }}><ScopeTag scope="yours" /></div>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
          Cap-aware recommendations — we factor in where you are against each card's limits right now.
        </p>
      </div>

      {/* 2-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 20, alignItems: 'start' }}>

        {/* Left: inputs + recent lookups */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Input card */}
          <div style={cardStyle}>
            {/* Category chips */}
            <div style={{ marginBottom: 16 }}>
              <div style={fieldLabel}>Category</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {CATEGORIES.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => setCategory(c.value)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 20,
                      border: '1px solid',
                      borderColor: category === c.value ? 'var(--g700)' : 'var(--border)',
                      background: category === c.value ? 'var(--g700)' : 'var(--white)',
                      color: category === c.value ? '#fff' : 'var(--ink3)',
                      fontFamily: "'Bricolage Grotesque', sans-serif",
                      fontWeight: 600,
                      fontSize: 11,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Merchant */}
            <div style={{ marginBottom: 16 }}>
              <div style={fieldLabel}>Merchant (optional)</div>
              <input
                value={merchant}
                onChange={(e) => setMerchant(e.target.value)}
                placeholder="e.g. Whole Foods, Trader Joe's…"
                className="fp-input"
              />
            </div>

            {/* Amount + button */}
            <div>
              <div style={fieldLabel}>Amount</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="fp-input" style={{ flex: 1 }}
                />
                {/* handleFind silently returns on a non-positive amount, so without
                    this the button looks live and does nothing. */}
                <button
                  onClick={handleFind}
                  disabled={loading || !(parseFloat(amount) > 0)}
                  style={{
                    padding: '8px 16px',
                    background: loading || !(parseFloat(amount) > 0) ? 'var(--g100)' : 'var(--g700)',
                    color: loading || !(parseFloat(amount) > 0) ? 'var(--g700)' : '#fff',
                    border: 'none',
                    borderRadius: 'var(--rs)',
                    fontFamily: "'Bricolage Grotesque', sans-serif",
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: loading || !(parseFloat(amount) > 0) ? 'default' : 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.15s',
                  }}
                >
                  {loading ? '…' : 'Find Best →'}
                </button>
              </div>
            </div>
          </div>

          {/* Recent lookups — static placeholder */}
          <div style={cardStyle}>
            <div style={cardTitle}>Recent Lookups</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>
              Your recent searches will appear here.
            </div>
          </div>
        </div>

        {/* Right: results */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
              <Loading size="md" text="Analyzing your cards…" />
            </div>
          )}

          {error && !loading && (
            <div style={{ ...cardStyle, color: 'var(--re600)', fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, fontSize: 13 }}>
              {error}
            </div>
          )}

          {!loading && !result && !error && (
            <div style={{ ...cardStyle, textAlign: 'center', padding: '48px 24px', color: 'var(--muted)' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>✦</div>
              <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, fontSize: 14, color: 'var(--ink3)', marginBottom: 6 }}>
                Select a category and amount
              </div>
              <div style={{ fontSize: 12 }}>Cap-aware results will appear here</div>
            </div>
          )}

          {!loading && result && (
            <>
              {/* Winner banner */}
              <div
                style={{
                  background: 'var(--grad)',
                  borderRadius: 'var(--r)',
                  padding: '20px 24px',
                  position: 'relative',
                  overflow: 'hidden',
                  boxShadow: 'var(--sh-md)',
                }}
              >
                {/* Glow orb */}
                <div style={{ position: 'absolute', top: -20, right: -20, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', pointerEvents: 'none' }} />
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 600, marginBottom: 6 }}>
                  Best card for ${parseFloat(amount).toFixed(2)} · {catLabel}
                </div>
                <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 800, fontSize: 22, color: '#fff', marginBottom: 6 }}>
                  {result.winner.card_name}
                </div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.9)' }}>
                  Earn {result.winner.pts_earned.toLocaleString()} pts ≈ <b>${result.winner.value_usd.toFixed(2)}</b> ({result.winner.effective_rate}×{result.winner.cap_note ? '' : ' · no cap'})
                </div>
                {result.displaced_winner && (
                  <div style={{ marginTop: 10, background: 'rgba(255,255,255,0.15)', borderRadius: 'var(--rs)', padding: '6px 12px', fontSize: 11, color: '#fff' }}>
                    {/* cap_note arrives as a complete phrase ("Cap at 65%", see
                        routes.py), so welding it after "capped this" rendered
                        "capped this Cap at 65%". It stands on its own after the dash. */}
                    <span style={{ opacity: 0.8 }}>{result.displaced_winner.card_name} was your usual pick — but it is capped:</span>{' '}
                    <b>{result.displaced_winner.cap_note}</b>
                  </div>
                )}
              </div>

              {/* Full comparison table */}
              <div style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={cardTitle}>Full Comparison</div>
                </div>
                <RecommendTable
                  cards={result.all_cards}
                  displacedWinner={result.displaced_winner}
                  category={catLabel}
                  amount={parseFloat(amount)}
                />
              </div>
            </>
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

const fieldLabel: React.CSSProperties = {
  fontFamily: "'Bricolage Grotesque', sans-serif",
  fontWeight: 600,
  fontSize: 11,
  color: 'var(--muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};
export default BestCard;
