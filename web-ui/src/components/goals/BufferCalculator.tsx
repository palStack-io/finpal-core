import React, { useEffect, useState } from 'react';
import { goalService, type BufferPicture } from '../../services/goalService';
import { formatMoney } from '../../styles/money';
import { bufferByHand } from '../../utils/bufferByHand';

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
export const BufferCalculator: React.FC<{
  currency: string;
  /**
   * *** THE WHOLE REASON THIS MOVED INTO THE CREATE PANEL. *** Standing on
   * the page it stated a figure the reader then had to retype into a form.
   * Here the target field is directly below it, so a target becomes a button
   * and the calculator stops being decorative.
   */
  onPickTarget?: (target: number) => void;
  /** Passed when learnPal is running; the lesson is an offer, never a gate. */
  onOpenLesson?: () => void;
}> = ({ currency, onPickTarget, onOpenLesson }) => {
  const [picture, setPicture] = useState<BufferPicture | null | 'loading'>('loading');
  /* *** THE BY-HAND PATH IS CLOSED BY DEFAULT AND OPENS ON REQUEST. *** It is
     a second set of figures for a question finPal has usually already
     answered, and showing both sets unasked would be the real-estate
     complaint this whole change came from. */
  const [byHandOpen, setByHandOpen] = useState(false);
  const [incomeText, setIncomeText] = useState('');
  const [fixedText, setFixedText] = useState('');

  useEffect(() => {
    let live = true;
    goalService.getBufferPicture()
      .then((p) => { if (live) setPicture(p); })
      .catch(() => { if (live) setPicture(null); });
    return () => { live = false; };
  }, []);

  /* *** `null` NO LONGER MEANS "RENDER NOTHING". *** It used to: with no
     spending sorted as Fixed there was no measured figure and a zero target
     is a sentence finPal cannot justify. But that state is exactly the person
     this calculator exists for — somebody with no buffer and no idea how big
     one should be — so the by-hand path is offered instead of silence.
     `loading` still draws nothing, because a flash of the fallback before the
     real figures arrive would be worse than a beat of blank. */
  if (picture === 'loading') return null;

  const money = (n: number) => formatMoney(n, { currency });
  const byHand = bufferByHand(
    fixedText === '' ? null : Number(fixedText),
    incomeText === '' ? null : Number(incomeText));

  return (
    <section
      data-testid="buffer-calculator"
      style={{
        padding: '16px 18px', marginBottom: 24,
        background: 'var(--bg-card)',
        border: '1px solid var(--border-light)', borderRadius: 12,
      }}
    >
      {/* *** h2, NOT h3, AND THE PAGE'S ONLY HEADING ABOVE IT IS THE h1. ***
          `every-page.spec.ts` fails a jump of more than one level, and it
          failed `/goals` in both themes on exactly this: an h3 sitting
          directly under the page title with no h2 anywhere between them. A
          reader tabbing headings hears a level that promises a section that
          does not exist. */}
      <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
        How much is enough?
      </h2>
      {picture ? (
        <p className="fp-hint" style={{ margin: '4px 0 12px', lineHeight: 1.55 }}>
          You spend <strong>{money(picture.essential_monthly)}</strong> a month on
          things that arrive whatever you do, and hold{' '}
          <strong>{money(picture.held)}</strong> you could reach this week — that
          is <strong>{picture.months_covered}</strong> months.
        </p>
      ) : (
        <p className="fp-hint" style={{ margin: '4px 0 12px', lineHeight: 1.55 }}>
          finPal cannot work this out yet — none of your spending is sorted as
          Fixed, so there is no monthly figure to multiply. Sort some in
          Categories, or tell it yourself below.
        </p>
      )}

      {picture && (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {picture.targets.map((t) => {
          const body = (
            <>
              <div className="fp-hint" style={{ fontSize: 12 }}>{t.months} months</div>
              <div style={{ fontSize: 18, fontWeight: 600, marginTop: 2 }}>
                {money(t.target)}
              </div>
              <div className="fp-hint" style={{ fontSize: 12.5, marginTop: 2 }}>
                {t.short_by > 0
                  ? `${money(t.short_by)} to go`
                  : `covered, with ${money(-t.short_by)} over`}
              </div>
            </>
          );
          const shell: React.CSSProperties = {
            flex: '1 1 180px', padding: '10px 12px', textAlign: 'left',
            border: '1px solid var(--border-light)', borderRadius: 10,
          };
          /* *** A BUTTON ONLY WHEN THERE IS SOMEWHERE FOR IT TO GO. *** An
             affordance that looks clickable and does nothing is worse than a
             plain figure — so without `onPickTarget` this stays a `<div>`
             rather than a button with no handler. */
          return onPickTarget ? (
            <button
              key={t.months} type="button"
              data-testid={`buffer-target-${t.months}`}
              onClick={() => onPickTarget(t.target)}
              style={{ ...shell, background: 'transparent',
                       color: 'var(--text-primary)', cursor: 'pointer' }}
            >
              {body}
              <div style={{ fontSize: 12.5, marginTop: 6, color: 'var(--g-ink)',
                            fontWeight: 600 }}>
                Use this target
              </div>
            </button>
          ) : (
            <div key={t.months} data-testid={`buffer-target-${t.months}`} style={shell}>
              {body}
            </div>
          );
        })}
      </div>
      )}

      {/* *** THE BASIS IS STATED, NOT ASSUMED. *** A reader whose categories
          are unsorted would otherwise get a target quietly too small. */}
      {picture && (
        <p className="fp-hint" style={{ margin: '12px 0 0', fontSize: 12.5 }}>
          Counted from spending you have sorted as Fixed. Sorting more of it in{' '}
          Categories makes this figure truer.
        </p>
      )}

      {/* *** A SECOND SET OF FIGURES, CLEARLY MARKED AS THE READER'S OWN. ***
          Owner, 2026-09-20. finPal keeps saying what it MEASURED and shows the
          typed answer beside it — it never silently replaces a measured figure
          with a guess, which is the whole difference between this and the
          bluffing four coin payoffs were caught doing.

          A typed figure is not finPal inventing one: it is the reader's claim
          about their own money, the same standing `Goal.current_manual` has. */}
      <button
        type="button"
        data-testid="buffer-by-hand-toggle"
        aria-expanded={byHandOpen}
        onClick={() => setByHandOpen((open) => !open)}
        style={{
          marginTop: 12, padding: 0, border: 0, background: 'transparent',
          color: 'var(--g-ink)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}
      >
        {byHandOpen ? 'Hide' : (picture ? 'Or enter it yourself' : 'Enter it yourself')} →
      </button>

      {byHandOpen && (
        <div data-testid="buffer-by-hand" style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ flex: '1 1 160px' }}>
              <label htmlFor="by-hand-fixed" className="fp-hint" style={{ fontSize: 12.5 }}>
                Fixed costs a month
              </label>
              <input
                id="by-hand-fixed" className="fp-input" inputMode="decimal"
                value={fixedText} onChange={(e) => setFixedText(e.target.value)}
              />
            </div>
            <div style={{ flex: '1 1 160px' }}>
              <label htmlFor="by-hand-income" className="fp-hint" style={{ fontSize: 12.5 }}>
                Income a month <span style={{ fontWeight: 400 }}>(optional)</span>
              </label>
              <input
                id="by-hand-income" className="fp-input" inputMode="decimal"
                value={incomeText} onChange={(e) => setIncomeText(e.target.value)}
              />
            </div>
          </div>

          {byHand && (
            <div style={{ marginTop: 10 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {byHand.targets.map((t) => (
                  <button
                    key={t.months} type="button"
                    data-testid={`by-hand-target-${t.months}`}
                    disabled={!onPickTarget}
                    onClick={() => onPickTarget?.(t.target)}
                    style={{
                      flex: '1 1 160px', textAlign: 'left', padding: '9px 11px',
                      border: '1px solid var(--border-light)', borderRadius: 10,
                      background: 'transparent', color: 'var(--text-primary)',
                      cursor: onPickTarget ? 'pointer' : 'default',
                    }}
                  >
                    <div className="fp-hint" style={{ fontSize: 12 }}>
                      {t.months} months
                    </div>
                    <div style={{ fontSize: 17, fontWeight: 600 }}>{money(t.target)}</div>
                    {/* *** SAYS WHOSE FIGURE THIS IS, ON THE FIGURE ITSELF. ***
                        The owner's decision was both sets shown with the typed
                        one labelled — a caption further down would not travel
                        with the number somebody screenshots. */}
                    <div className="fp-hint" style={{ fontSize: 12 }}>
                      from what you said
                    </div>
                  </button>
                ))}
              </div>

              {byHand.spare !== null && (
                <p className="fp-hint" style={{ margin: '10px 0 0', lineHeight: 1.55 }}>
                  {byHand.spare > 0 ? (
                    <>
                      That leaves <strong>{money(byHand.spare)}</strong> a month
                      unspent.{byHand.monthsAtHalfSpare !== null && (
                        <> Putting half of it aside reaches six months in{' '}
                        <strong>{byHand.monthsAtHalfSpare}</strong> months.</>
                      )}{' '}
                      <span style={{ opacity: 0.85 }}>
                        Half is an illustration, not a recommendation — finPal
                        has no basis for choosing a rate for you.
                      </span>
                    </>
                  ) : byHand.spare === 0 ? (
                    <>Your income exactly covers those costs, so there is
                    nothing spare to put aside yet.</>
                  ) : (
                    /* *** NOT CLAMPED TO ZERO. *** "You are 300 short every
                       month" and "you have nothing spare" are different
                       sentences about different situations, and the first is
                       the one that is true. */
                    <>Those costs are <strong>{money(-byHand.spare)}</strong> a
                    month more than the income you gave, so a buffer is not the
                    first thing to solve.</>
                  )}
                </p>
              )}
            </div>
          )}

          {onOpenLesson && (
            <button
              type="button" data-testid="buffer-open-lesson" onClick={onOpenLesson}
              style={{
                marginTop: 10, padding: 0, border: 0, background: 'transparent',
                color: 'var(--g-ink)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Read the lesson on buffers →
            </button>
          )}
        </div>
      )}
    </section>
  );
};
