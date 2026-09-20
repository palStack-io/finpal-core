import React, { useEffect, useState } from 'react';
import { goalService, type BufferPicture } from '../../services/goalService';
import { formatMoney } from '../../styles/money';

/**
 * What an emergency fund would need to be, in the reader's own figures.
 *
 * *** IT OFFERS THREE AND SIX MONTHS AND PICKS NEITHER. *** Those are
 * conventions, not facts: which is right depends on job security, dependants
 * and health, and finPal knows none of them. It states what each would cost
 * and what they already hold. The same line `avalanche-vs-snowball` walks, and
 * the same reason `peakSubline` states a figure instead of a recommendation.
 *
 * *** IT SAYS WHAT IT IS COUNTING. *** The target is built from spending sorted
 * as Fixed, so a user whose categories are unsorted gets an UNDERSTATED target
 * — the dangerous direction. The basis is printed and points at Categories,
 * which exists to fix exactly that.
 */
export const BufferCalculator: React.FC<{ currency: string }> = ({ currency }) => {
  const [picture, setPicture] = useState<BufferPicture | null | 'loading'>('loading');

  useEffect(() => {
    let live = true;
    goalService.getBufferPicture()
      .then((p) => { if (live) setPicture(p); })
      .catch(() => { if (live) setPicture(null); });
    return () => { live = false; };
  }, []);

  /* `null` means finPal cannot say — no spending recorded. It renders nothing
     rather than a zero target, which would be a sentence it cannot justify. */
  if (picture === 'loading' || picture === null) return null;

  const money = (n: number) => formatMoney(n, { currency });

  return (
    <section
      data-testid="buffer-calculator"
      style={{
        padding: '16px 18px', marginBottom: 24,
        background: 'var(--bg-card)',
        border: '1px solid var(--border-light)', borderRadius: 12,
      }}
    >
      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
        How much is enough?
      </h3>
      <p className="fp-hint" style={{ margin: '4px 0 12px', lineHeight: 1.55 }}>
        You spend <strong>{money(picture.essential_monthly)}</strong> a month on
        things that arrive whatever you do, and hold{' '}
        <strong>{money(picture.held)}</strong> you could reach this week — that
        is <strong>{picture.months_covered}</strong> months.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {picture.targets.map((t) => (
          <div
            key={t.months}
            data-testid={`buffer-target-${t.months}`}
            style={{
              flex: '1 1 180px', padding: '10px 12px',
              border: '1px solid var(--border-light)', borderRadius: 10,
            }}
          >
            <div className="fp-hint" style={{ fontSize: 12 }}>{t.months} months</div>
            <div style={{ fontSize: 18, fontWeight: 600, marginTop: 2 }}>
              {money(t.target)}
            </div>
            <div className="fp-hint" style={{ fontSize: 12.5, marginTop: 2 }}>
              {t.short_by > 0
                ? `${money(t.short_by)} to go`
                : `covered, with ${money(-t.short_by)} over`}
            </div>
          </div>
        ))}
      </div>

      {/* *** THE BASIS IS STATED, NOT ASSUMED. *** A reader whose categories
          are unsorted would otherwise get a target quietly too small. */}
      <p className="fp-hint" style={{ margin: '12px 0 0', fontSize: 12.5 }}>
        Counted from spending you have sorted as Fixed. Sorting more of it in{' '}
        Categories makes this figure truer.
      </p>
    </section>
  );
};
