import React from 'react';

/**
 * The page's headline figures, as one row of hairline-separated cells.
 *
 * *** FOUR SEPARATE CARDS UNDER A CARD IS WHY THE PAGE READ AS "OUT OF PLACE".
 * *** The dashboard opened with the range in its own panel and then four more
 * panels below it, each with its own border, shadow, icon chip and padding —
 * three competing headers before any content. The mockup
 * (`docs/mockups/dashboard-web.html`) puts the totals INSIDE the range's card,
 * divided by hairlines, so the top of the page is one object instead of five.
 *
 * *** THE ICON CHIPS ARE GONE, AND THAT IS THE POINT OF THE CHANGE. *** A
 * coloured square per figure is four more things competing with the numbers.
 * What a figure means is carried by its label and its own colour — a negative
 * savings rate in clay says more than a pink piggy bank ever did.
 *
 * Kept deliberately dumb: it takes cells and renders them. No formatting, no
 * colour decisions, no knowledge of what a savings rate is — those belong to
 * the caller that has the data. That is what makes it reusable for Analytics,
 * which has the same shape of header and four of its own figures.
 */

export interface TotalsCell {
  /** e.g. `"Net Worth"`. Short: this is a column head, not a sentence. */
  label: string;
  /** Already formatted. `"—"` is a legitimate value and means "not known". */
  value: string;
  /** Omit for the default ink. A figure going the wrong way should say so. */
  valueColor?: string;
  /** One short line under the figure. */
  note?: React.ReactNode;
}

export interface TotalsRowProps {
  cells: TotalsCell[];
}

export const TotalsRow: React.FC<TotalsRowProps> = ({ cells }) => (
  <div
    data-testid="page-totals"
    style={{
      display: 'grid',
      // `auto-fit` with a 150px floor: four across on a desktop, two on a
      // tablet, one on a phone — without a media query, and without the
      // orphaned-fifth-card problem that a fixed column count creates.
      gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
      borderTop: '1px solid var(--border-light)',
    }}
  >
    {cells.map((cell, i) => (
      <div
        key={cell.label}
        style={{
          padding: '18px 22px',
          // Hairlines BETWEEN cells, never after the last one — a trailing
          // border is the tell of a row built by styling every child the same.
          borderRight: i < cells.length - 1 ? '1px solid var(--border-light)' : undefined,
        }}
      >
        <div style={{
          fontSize: '11.5px', letterSpacing: '0.09em', textTransform: 'uppercase',
          color: 'var(--text-secondary)',
        }}>
          {cell.label}
        </div>
        <div style={{
          fontSize: '26px', fontWeight: 600, marginTop: '5px',
          fontVariantNumeric: 'tabular-nums',
          color: cell.valueColor ?? 'var(--text-primary)',
        }}>
          {cell.value}
        </div>
        {cell.note && (
          <div className="fp-hint" style={{ fontSize: '12.5px', marginTop: '4px' }}>
            {cell.note}
          </div>
        )}
      </div>
    ))}
  </div>
);

export default TotalsRow;
