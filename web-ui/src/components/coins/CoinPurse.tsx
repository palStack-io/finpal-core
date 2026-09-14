import React from 'react';

/**
 * The coin purse — a gold coin and a balance, for a page header.
 *
 * *** NO DENOMINATOR, AND NO PROGRESS BAR. *** This shows what you have, not
 * how far through something you are. Design decision 5: the only progress bar
 * finPal draws is one whose target the user picked, which is why the gear shop
 * has one and this does not.
 *
 * *** GOLD, AND DELIBERATELY NOT GREEN. *** Green is money in this app —
 * `--amount-income` is the income figure. A coin rendered in the same colour as
 * a real balance would read as money the user has, which it is not. The gold is
 * its own thing precisely so nobody mistakes it for one.
 *
 * *** AND IT IS "COINS", NEVER "POINTS". *** pointsPal renders real
 * credit-card reward balances — tens of thousands of `pts`, worth real money.
 * A second "points" in one app is the worst available collision, and the two
 * must never appear in the same row.
 */
export const CoinPurse: React.FC<{ balance: number; label?: boolean }> = ({
  balance, label = true,
}) => (
  <div
    data-testid="coin-purse"
    style={{
      display: 'flex', alignItems: 'center', gap: 8,
      background: 'var(--bg-card)', border: '1px solid var(--border-light)',
      borderRadius: 999, padding: '6px 14px 6px 7px',
      boxShadow: 'var(--card-shadow)',
    }}
  >
    <span
      aria-hidden="true"
      style={{
        width: 21, height: 21, borderRadius: '50%', flex: 'none',
        // A radial highlight reads as metal at 21px where a flat disc reads as
        // a dot. Hardcoded rather than tokenised because it is one object's
        // material, not a role any other surface shares.
        background: 'radial-gradient(circle at 34% 30%, #fff5cf, #C9A227 58%, #9C7C18)',
        boxShadow: 'inset 0 -1px 2px rgba(0,0,0,0.25)',
      }}
    />
    <b style={{
      fontSize: 15.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
      letterSpacing: '-0.02em', color: 'var(--text-primary)',
    }}>
      {balance.toLocaleString()}
    </b>
    {label && (
      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>coins</span>
    )}
  </div>
);
