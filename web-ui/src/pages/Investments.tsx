/**
 * Investments Page
 * Track and manage investment portfolios
 */

import React, { useState, useEffect } from 'react';
import {
  LineChart,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Plus,
  Package,
  RefreshCw,
  BarChart3
} from 'lucide-react';
import { investmentService } from '../services/api/investments';
// `GET /api/v1/investments/portfolios` filters on user_id.in_(get_all_user_ids()),
// and its own docstring says "for household" — so these totals include every
// member's holdings. D-01 labelled the other pages and mobile labelled this one;
// web's copy was the gap.
import { ScopeTag } from '../components/ScopeTag';
import { useToast } from '../contexts/ToastContext';
import { useAuthStore } from '../store/authStore';
import { getBranding } from '../config/branding';
import { PageHead } from '../components/PageHead';
import { TotalsRow } from '../components/dashboard/TotalsRow';
import { holdingTotals, valueSplit, lastPriceUpdate } from '../utils/holdingTotals';
import { AddHoldingModal } from '../components/investment/AddHoldingModal';
import { StockDetailModal } from '../components/investment/StockDetailModal';
import { flexRowGap8, flexRowGap12, flexRowBetween, flexColGap12, flexColGap16, flexColGap20, sectionHeaderStyle, pageContainerStyle, pageMaxWidthStyle, cardStyle, tableStyle } from '../styles/layoutStyles';

interface Portfolio {
  id: number;
  name: string;
  description: string;
  account_id?: number;
  created_at: string;
  updated_at: string;
}

interface Holding {
  id: number;
  portfolio_id: number;
  symbol: string;
  name: string;
  shares: number;
  purchase_price: number;
  current_price: number;
  /* *** THESE FOUR WERE ON THE WIRE THE WHOLE TIME AND THIS INTERFACE DID NOT
     DECLARE THEM. *** `src/models/investment.py` exposes them as `@property`
     (`shares * purchase_price`, `shares * current_price`), so they are always
     present — not nullable columns. Verified against the live payload before
     being declared here, because an interface in this codebase has claimed a
     field the endpoint does not send five times over, and a green typecheck is
     reassuring the whole time it happens. */
  cost_basis: number;
  current_value: number;
  gain_loss: number;
  gain_loss_percentage: number;
  purchase_date: string;
  notes: string;
  sector: string;
  industry: string;
  last_update: string;
}

const bodyTextStyle: React.CSSProperties = { color: 'var(--text-secondary)', fontSize: '14px' };
const tableHeaderRightStyle: React.CSSProperties = { padding: '16px', textAlign: 'right', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: '600' };
const tableHeaderLeftStyle: React.CSSProperties = { padding: '16px', textAlign: 'left', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: '600' };
const bigNumberStyle: React.CSSProperties = { color: 'var(--text-primary)', fontSize: '28px', fontWeight: '700' };
const tableCellRightStyle: React.CSSProperties = { padding: '16px', textAlign: 'right', color: 'var(--text-primary)', fontSize: '14px' };

/* Lifted out of the JSX when the actions moved into `PageHead`'s `right` slot.
   The colours and both D-103 comments are carried over verbatim — they were
   MEASURED, and moving markup is not a reason to re-derive a ratio. */
const addHoldingButtonStyle: React.CSSProperties = {
  padding: '10px 16px',
  background: 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
  border: 'none',
  borderRadius: '8px',
  /* *** WHITE, NOT `--text-primary`. *** This is a filled green button, so its
     label sits on the brand green in BOTH themes while `--text-primary` flips
     with the page: it measured 2.83:1 in light (#17301f on #15803d) and 4.32:1
     in dark (#e9f0e6). White measures 5.02:1 on the gradient's first stop.
     `color: 'white'` on coloured buttons is this app's deliberate convention,
     not an oversight. D-103. */
  color: 'white',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  fontSize: '14px',
  fontWeight: '600',
  transition: 'transform 0.2s',
};

const refreshPricesButtonStyle: React.CSSProperties = {
  padding: '10px 16px',
  /* *** `--g-wash`, NOT `rgba(21, 128, 61, 0.2)` — AND THE WALK IS WHY. ***
     A translucent background means the text's real contrast is decided by
     whatever is behind the button. On the page card the 20% wash composited to
     #cde3d3 and `--g-ink` measured 5.27:1; moving these actions into `PageHead`
     put the same wash on `--head-sky`, composited to #b4d2be, and the ratio
     fell to **4.38:1** — a genuine AA failure introduced by moving markup, with
     no colour changed. `[investments:light] new failing pair #166534|#b4d2be`
     is what the contrast tree-walk reported, and it is the only reason this was
     found: 930 unit tests and a typecheck were green over it.
     `--g-wash` is that old page-card composite made OPAQUE, so it looks the
     same and cannot be re-derived from its parent again.

     The border stays translucent deliberately — it carries no text, so it has
     no ratio to fail, and it keeps the button's edge reading against both
     surfaces. The original note still holds and is why the hue is this one:
     `--brand-light-green` (#86efac) over the wash on a light page measured
     1.04:1, the worst pair on this surface. The wash was the problem, not the
     hue. D-103. */
  background: 'var(--g-wash)',
  border: '1px solid rgba(21, 128, 61, 0.5)',
  borderRadius: '8px',
  color: 'var(--g-ink)',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  fontSize: '14px',
  fontWeight: '600',
  transition: 'all 0.3s',
};

const valueSplitWrapStyle: React.CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border-light)',
  borderRadius: '12px',
  padding: '20px',
  marginBottom: '24px',
};
const valueSplitLabelStyle: React.CSSProperties = {
  color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600,
  letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '10px',
};
const valueSplitBarStyle: React.CSSProperties = {
  display: 'flex', height: '10px', borderRadius: '5px', overflow: 'hidden',
};
const valueSplitLegendStyle: React.CSSProperties = {
  display: 'flex', flexWrap: 'wrap', gap: '16px', marginTop: '10px',
  color: 'var(--text-secondary)', fontSize: '13px',
};
const valueSplitNoteStyle: React.CSSProperties = {
  color: 'var(--text-secondary)', fontSize: '13px', marginTop: '10px',
};
const priceAgeStyle: React.CSSProperties = {
  padding: '14px 16px',
  borderTop: '1px solid var(--border-light)',
  color: 'var(--text-secondary)',
  fontSize: '13px',
};

export const Investments: React.FC = () => {
  const { showToast } = useToast();
  const { user } = useAuthStore();
  const branding = getBranding(user?.default_currency_code || 'USD');

  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedPortfolio, setSelectedPortfolio] = useState<number | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedHolding, setSelectedHolding] = useState<Holding | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [portfoliosResponse, holdingsResponse] = await Promise.all([
        investmentService.getPortfolios(),
        investmentService.getHoldings()
      ]);

      setPortfolios(portfoliosResponse.portfolios || []);
      setHoldings(holdingsResponse.holdings || []);
    } catch (error: any) {
      console.error('Failed to load investment data:', error);
      showToast('Failed to load investment data', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const ensurePortfolioExists = async () => {
    if (portfolios.length === 0) {
      try {
        const createResponse = await investmentService.createPortfolio({
          name: 'My Portfolio',
          description: 'Default investment portfolio'
        });
        if (createResponse.success) {
          setPortfolios([createResponse.portfolio]);
          return true;
        }
      } catch (err) {
        console.error('Failed to create default portfolio:', err);
        showToast('Failed to create portfolio. Please try again.', 'error');
        return false;
      }
    }
    return true;
  };

  const handleOpenAddModal = async () => {
    const hasPortfolio = await ensurePortfolioExists();
    if (hasPortfolio) {
      setShowAddModal(true);
    }
  };

  const refreshPrices = async () => {
    try {
      setIsRefreshing(true);
      const response = await investmentService.getHoldings();
      setHoldings(response.holdings || []);
      showToast('Prices updated successfully', 'success');
    } catch (error: any) {
      console.error('Failed to refresh prices:', error);
      showToast('Failed to refresh prices', 'error');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Calculate portfolio statistics
  /* *** THIS PAGE USED TO DO THE SERVER'S ARITHMETIC AGAIN, IN TYPESCRIPT. ***
     It summed `current_price * shares` and `purchase_price * shares` while the
     payload already carried `current_value` and `cost_basis` — which the server
     computes with those exact two expressions (`src/models/investment.py`,
     `@property`). Measured against the live demo they agreed to the cent, so
     deleting the client copy changes no figure: it removes a second place that
     had to stay right, which is D-101's shape. `holdingTotals` only ADDS UP
     what the server sent and refuses what it cannot read. */
  const visibleHoldings = selectedPortfolio
    ? holdings.filter(h => h.portfolio_id === selectedPortfolio)
    : holdings;

  const totals = holdingTotals(visibleHoldings);
  const split = valueSplit(visibleHoldings);
  const pricesUpdatedAt = lastPriceUpdate(visibleHoldings);

  /* The count moved out of a stat card and into a note under the cost, where it
     qualifies a figure instead of being one. */
  const holdingCountLabel = visibleHoldings.length === 1
    ? 'one holding'
    : `${visibleHoldings.length} holdings`;

  /* The portfolio's name when exactly one is in view, so "Worth now" says what
     it is the worth OF. Absent rather than guessed when several are mixed. */
  const selectedPortfolioName = selectedPortfolio
    ? portfolios.find(p => p.id === selectedPortfolio)?.name
    : portfolios.length === 1 ? portfolios[0]?.name : undefined;
  const portfolioNote = selectedPortfolioName ?? 'all portfolios';

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(amount);
  };

  /**
   * Gain/loss colours come from the theme's MONEY-ROLE tokens, not from the brand
   * palette (D-103). This page used `--brand-green-glow` — the DARK value — in both
   * themes, which measures 2.21:1 on the light card: a WCAG AA failure on the
   * figure the page exists to show. `--amount-income` is the token written for
   * exactly this (#15803d light / #22c55e dark) and its own comment records that
   * one green against two backgrounds was the original bug. `--re-ink` is its
   * counterpart for a loss (#b91c1c / #f87171); plain `--accent-red` measured
   * 3.65:1 light and 4.29:1 dark, failing in BOTH.
   */
  const formatPercent = (percent: number) => {
    return `${percent >= 0 ? '+' : ''}${percent.toFixed(2)}%`;
  };

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', background: `linear-gradient(to bottom, var(--bg-primary), var(--bg-secondary))`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--text-primary)', fontSize: '18px' }}>Loading investment data...</div>
      </div>
    );
  }

  return (
    <>
      <div style={pageContainerStyle}>
        <div className="page-container">
          {/* *** THE ACTIONS GO THROUGH `PageHead`'s `right` SLOT, NOT BESIDE AN h1. ***
              The two buttons keep their own colours and their D-103 comments —
              those were measured, and a redesign is not a reason to re-derive
              them. What changes is that the title, the sentence and the ridge
              now come from one component instead of this page's own markup. */}
          <PageHead
            title="Investments"
            subtitle="What you put in, what it is worth now, and the gap between them."
            band="investments"
            right={(
              <>
                <button
                  onClick={handleOpenAddModal}
                  style={addHoldingButtonStyle}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.05)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                >
                  <Plus size={16} />
                  Add Holding
                </button>
                <button
                  onClick={refreshPrices}
                  disabled={isRefreshing}
                  style={{
                    ...refreshPricesButtonStyle,
                    cursor: isRefreshing ? 'not-allowed' : 'pointer',
                    opacity: isRefreshing ? 0.6 : 1,
                  }}
                  /* Hover restores the base token rather than re-introducing the
                     translucent wash the fix removed — otherwise hovering would
                     put the failing pair back. */
                  onMouseEnter={(e) => !isRefreshing && (e.currentTarget.style.filter = 'brightness(0.96)')}
                  onMouseLeave={(e) => !isRefreshing && (e.currentTarget.style.filter = 'none')}
                >
                  <RefreshCw size={16} style={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }} />
                  {isRefreshing ? 'Refreshing...' : 'Refresh Prices'}
                </button>
              </>
            )}
          />

          {/* *** THE GAIN LEADS, AND THE "Holdings: 2" CARD IS GONE. ***
              Four cards stood here: Total Value, Total Gain/Loss, Total Cost and
              a count of the user's own rows. Counting your own holdings is not
              information — the table below is right there — and it took a
              quarter of the page's most valuable strip to say it.
              `sidebarAndStatCardsMeasured` refuses a hand-rolled stat grid
              where `TotalsRow` exists, which is what this now uses.

              The figures are the SERVER's, summed by `holdingTotals` — see that
              file for why recomputing them here was D-101 rather than a bug. */}
          <TotalsRow cells={[
            {
              label: 'Worth now',
              value: formatCurrency(totals.worthNow),
              note: portfolioNote,
            },
            {
              label: 'You put in',
              value: formatCurrency(totals.youPutIn),
              note: `across ${holdingCountLabel}`,
            },
            {
              label: 'Ahead by',
              value: `${totals.gain >= 0 ? '+' : ''}${formatCurrency(totals.gain)}`,
              valueColor: totals.gain >= 0 ? 'var(--amount-income)' : 'var(--re-ink)',
              /* `gainPercent` is null when nothing was put in — a portfolio you
                 paid nothing for has no percentage return, and 0% would read as
                 "flat". The helper returns null and this renders the reason. */
              note: totals.gainPercent === null
                ? 'no cost to measure against'
                : `${formatPercent(totals.gainPercent)} on what you paid`,
            },
          ]} />

          {/* Where the value sits — only worth drawing when there is more than
              one holding to split between. One holding is 100% of itself. */}
          {split.length > 1 && (
            <div style={valueSplitWrapStyle}>
              <div style={valueSplitLabelStyle}>Where the value sits</div>
              <div style={valueSplitBarStyle}>
                {split.map((seg, i) => (
                  <div
                    key={seg.symbol}
                    style={{
                      width: `${seg.share}%`,
                      /* *** seg-1 AND seg-4, NOT seg-1 AND seg-2. *** The five
                         segment tokens are ordered for a donut with five wedges
                         and a legend beside it. `--kt-seg-1` (#15803D) next to
                         `--kt-seg-2` (#3F7D5C) are both greens: at this height
                         they read as one continuous bar, so a two-holding split
                         looked like a single holding. A two-segment bar needs the
                         two ENDS of the ramp. `--kt-seg-4` carries no text here,
                         which is the only way it may be used — it measures
                         3.06:1 and the kit file says so. */
                      background: i === 0 ? 'var(--kt-seg-1)' : 'var(--kt-seg-4)',
                    }}
                  />
                ))}
              </div>
              <div style={valueSplitLegendStyle}>
                {split.map((seg, i) => (
                  <span key={seg.symbol} style={flexRowGap8}>
                    <span style={{
                      width: '8px', height: '8px', borderRadius: '50%',
                      background: i === 0 ? 'var(--kt-seg-1)' : 'var(--kt-seg-4)',
                    }} />
                    {seg.symbol} {seg.share.toFixed(1)}%
                  </span>
                ))}
              </div>
              {/* Said once, as a fact about the shape of this account rather than
                  as advice. finPal does not know the reader's risk tolerance and
                  must not imply that it does. */}
              {split.length === 2 && (
                <p style={valueSplitNoteStyle}>
                  Two holdings is a concentration, not a portfolio.
                </p>
              )}
            </div>
          )}

          {/* A holding the server could not describe is NAMED, never dropped —
              a total quietly missing a row is the failure `holdingTotals`
              exists to prevent. */}
          {totals.unreadable.length > 0 && (
            <p style={valueSplitNoteStyle}>
              Not counted above: {totals.unreadable.join(', ')} — the server did not
              send figures for {totals.unreadable.length === 1 ? 'it' : 'them'}.
            </p>
          )}

          {/* Holdings Table */}
          {holdings.length > 0 ? (
            <div style={{
              background: 'var(--bg-card)',
              backdropFilter: 'blur(12px)',
              border: '1px solid var(--border-light)',
              borderRadius: '12px',
              overflow: 'hidden'
            }}>
              <div style={{ padding: '20px', borderBottom: '1px solid var(--border-light)' }}>
                <h2 style={{ color: 'var(--text-primary)', fontSize: '20px', fontWeight: '600' }}>
                  Your Holdings
                </h2>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={tableStyle}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <th style={tableHeaderLeftStyle}>Symbol</th>
                      <th style={tableHeaderLeftStyle}>Name</th>
                      <th style={tableHeaderRightStyle}>Shares</th>
                      <th style={tableHeaderRightStyle}>Avg Cost</th>
                      <th style={tableHeaderRightStyle}>Current Price</th>
                      <th style={tableHeaderRightStyle}>Market Value</th>
                      <th style={tableHeaderRightStyle}>Gain/Loss</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holdings.map((holding) => {
                      /* *** THE SERVER'S FIGURES, NOT A FOURTH COPY OF ITS
                         ARITHMETIC. *** These four lines used to read
                           marketValue = current_price * shares
                           costBasis   = purchase_price * shares
                           gain        = marketValue - costBasis
                           gainPercent = gain / costBasis * 100
                         which is exactly what `src/models/investment.py`
                         computes as `@property` and sends as `current_value`,
                         `cost_basis`, `gain_loss` and `gain_loss_percentage`.
                         The D-101 duplication was removed from the page TOTALS
                         and was still live here, one level down, per row — so
                         the fix had been half-done. Measured against the live
                         payload the two agree to the cent on both holdings, so
                         no figure on screen changes. */
                      const marketValue = holding.current_value;
                      const gain = holding.gain_loss;
                      const gainPercent = holding.gain_loss_percentage;

                      return (
                        <tr
                          key={holding.id}
                          onClick={() => setSelectedHolding(holding)}
                          style={{
                            borderBottom: '1px solid var(--surface-hover)',
                            transition: 'background 0.2s',
                            cursor: 'pointer'
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--table-row-hover)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                        >
                          <td style={{ padding: '16px' }}>
                            <span style={{ color: 'var(--text-primary)', fontWeight: '600', fontSize: '15px' }}>{holding.symbol}</span>
                          </td>
                          <td style={{ padding: '16px' }}>
                            <div>
                              <div style={{ color: 'var(--text-primary)', fontSize: '14px' }}>
                                {holding.name || holding.symbol}
                              </div>
                              {holding.sector && (
                                <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '2px' }}>
                                  {holding.sector}
                                </div>
                              )}
                            </div>
                          </td>
                          <td style={tableCellRightStyle}>
                            {holding.shares.toFixed(2)}
                          </td>
                          <td style={tableCellRightStyle}>
                            {formatCurrency(holding.purchase_price)}
                          </td>
                          <td style={tableCellRightStyle}>
                            {formatCurrency(holding.current_price)}
                          </td>
                          <td style={{ padding: '16px', textAlign: 'right', color: 'var(--text-primary)', fontSize: '14px', fontWeight: '600' }}>
                            {formatCurrency(marketValue)}
                          </td>
                          <td style={{ padding: '16px', textAlign: 'right' }}>
                            <div style={{ color: gain >= 0 ? 'var(--amount-income)' : 'var(--re-ink)', fontSize: '14px', fontWeight: '600' }}>
                              {formatCurrency(gain)}
                            </div>
                            <div style={{ color: gain >= 0 ? 'var(--amount-income)' : 'var(--re-ink)', fontSize: '12px', marginTop: '2px' }}>
                              {formatPercent(gainPercent)}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {/* *** THE FIGURES ABOVE ARE NEVER "LIVE", AND THE PAGE SAYS SO. ***
                  `current_value` is `shares * current_price`, and `current_price`
                  is whatever the last refresh wrote — so every total on this page
                  is exactly as old as this line. A screen that hid that would be
                  inviting a decision on a stale number. Absent, not "unknown",
                  when no holding carries a timestamp. */}
              {pricesUpdatedAt && (
                <div style={priceAgeStyle}>
                  Prices last updated{' '}
                  <strong style={{ color: 'var(--text-primary)' }}>
                    {pricesUpdatedAt.toLocaleString(undefined, {
                      day: 'numeric', month: 'short', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </strong>
                  {' '}— not a live quote.
                </div>
              )}
            </div>
          ) : (
            <div style={{
              padding: '64px 24px',
              background: 'var(--bg-card)',
              backdropFilter: 'blur(12px)',
              border: '1px solid var(--border-light)',
              borderRadius: '12px',
              textAlign: 'center'
            }}>
              <div style={{
                display: 'inline-flex',
                padding: '16px',
                background: 'rgba(21, 128, 61, 0.2)',
                borderRadius: '50%',
                marginBottom: '16px'
              }}>
                <LineChart size={32} style={{ color: 'var(--brand-main-green)' }} />
              </div>
              <h3 style={{ color: 'var(--text-primary)', fontSize: '20px', fontWeight: '600', marginBottom: '8px' }}>
                No Holdings Yet
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '24px' }}>
                Start tracking your investments by adding your first holding
              </p>
              <button
                onClick={handleOpenAddModal}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '12px 24px',
                  background: 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
                  border: 'none',
                  borderRadius: '8px',
                  /* White, not `--text-primary`: a filled green button's label sits on
                     the brand green in BOTH themes while `--text-primary` flips with the
                     page, so one theme always loses -- 2.83:1 light, 4.32:1 dark, against
                     4.5. White is 5.02:1 on the gradient's first stop. D-103. */
                  color: 'white',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'transform 0.2s'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.05)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
              >
                <Plus size={18} />
                Add Your First Holding
              </button>
            </div>
          )}

          <style>{`
            @keyframes spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      </div>

      {/* Add Holding Modal */}
      <AddHoldingModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={loadData}
        portfolios={portfolios}
      />

      {/* Stock Detail Modal */}
      {selectedHolding && (
        <StockDetailModal
          holding={selectedHolding}
          onClose={() => setSelectedHolding(null)}
          onUpdate={loadData}
        />
      )}
    </>
  );
};
