import React, { useEffect, useState } from 'react';
import { goalService, type SinkingPicture } from '../../services/goalService';
import { formatMoney } from '../../styles/money';

/**
 * What the bills that are not monthly cost, and a twelfth of that.
 *
 * *** THIS ONE NAMES THE FIGURE, AND `BufferCalculator` DELIBERATELY DOES
 * NOT. *** An emergency fund's size is a judgement about job security and
 * dependants, which finPal knows nothing about, so that component offers
 * three months and six and refuses to choose. A sinking fund has no judgement
 * in it: the annual total is observed and the divisor is twelve. Stating the
 * twelfth is arithmetic, not advice — and refusing to state it here would be
 * false modesty rather than honesty.
 *
 * *** IT SAYS WHAT IT COUNTED. *** The total is spending in categories the
 * user has sorted as Non-monthly, so an unsorted user gets a target that is
 * quietly too small — the dangerous direction. The basis is printed and
 * points at Categories, which exists to fix exactly that. Same rule
 * `BufferCalculator` follows.
 */
export const SinkingCalculator: React.FC<{
  currency: string;
  onPickTarget?: (target: number) => void;
}> = ({ currency, onPickTarget }) => {
  const [picture, setPicture] = useState<SinkingPicture | null | 'loading'>('loading');

  useEffect(() => {
    let live = true;
    goalService.getSinkingPicture()
      .then((p) => { if (live) setPicture(p); })
      .catch(() => { if (live) setPicture(null); });
    return () => { live = false; };
  }, []);

  /* `null` means nothing is classified `non_monthly`. Rendering nothing beats
     a zero target, which is a sentence finPal cannot justify. */
  if (picture === 'loading' || picture === null) return null;

  /* The server's code, not the page's — D-278. */
  const money = (n: number) => formatMoney(n, { currency: picture.currency_code || currency });

  return (
    <section
      data-testid="sinking-calculator"
      style={{
        padding: '14px 16px',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-light)', borderRadius: 10,
      }}
    >
      <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 600 }}>
        Set aside a twelfth
      </h3>
      <p className="fp-hint" style={{ margin: '4px 0 10px', lineHeight: 1.55 }}>
        Bills that do not arrive monthly cost you{' '}
        <strong>{money(picture.annual)}</strong> over the last{' '}
        {picture.months_counted} months. Putting{' '}
        <strong>{money(picture.monthly)}</strong> aside each month is what
        stops the next one landing as a surprise.
      </p>

      {onPickTarget ? (
        <button
          type="button"
          data-testid="sinking-use-target"
          onClick={() => onPickTarget(picture.annual)}
          style={{
            padding: '7px 13px', borderRadius: 8,
            border: '1px solid var(--border-medium)', background: 'transparent',
            color: 'var(--g-ink)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Use {money(picture.annual)} as the target
        </button>
      ) : null}

      <p className="fp-hint" style={{ margin: '10px 0 0', fontSize: 12.5 }}>
        Counted from spending you have sorted as Non-monthly. Sorting more of
        it in Categories makes this figure truer.
      </p>
    </section>
  );
};
