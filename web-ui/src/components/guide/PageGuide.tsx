import React, { useEffect } from 'react';
import { GuideArt } from './GuideArt';
import { useGuideStore } from '../../store/guideStore';
import type { GuidePage } from '../../services/onboardingService';
import { GuideTour } from './GuideTour';

/**
 * "What is this page for", once, then on request.
 *
 * *** RENDERS NOTHING UNTIL IT KNOWS, AND NOTHING IF IT CANNOT FIND OUT. *** Showing
 * the card while the dismissal state loads would flash it at everyone who already
 * dismissed it; a failed lookup is far more often a blip than a new user, and the
 * card is a nicety, not the only route to anything.
 *
 * *** A LANDMARK, NOT A DIALOG. *** The card does not trap the page; the tour does.
 */
export const PageGuide: React.FC<{ page: GuidePage }> = ({ page }) => {
  const { status, pages, dismissed, reopened, touring, load, dismiss, closeReopened, startTour } =
    useGuideStore();

  // Core's web UI is English-only (no language layer), so it asks for English.
  useEffect(() => { void load('en'); }, [load]);

  // Leaving the page ends a tour or a reopened card: neither may restart unprompted on return.
  useEffect(() => () => {
    const s = useGuideStore.getState();
    if (s.touring === page) useGuideStore.setState({ touring: null });
    if (s.reopened === page) useGuideStore.setState({ reopened: null });
  }, [page]);

  const copy = pages[page];
  if (status !== 'ready' || !copy) return null;

  const wasDismissed = dismissed.includes(page);
  const open = !wasDismissed || reopened === page;
  const id = `guide-${page}`;

  return (
    <>
      {open && (
        <section aria-labelledby={id} className="fp-guide-card" data-guide-card={page}>
          <GuideArt page={page} size={72} />
          <div className="fp-guide-card-body">
            <h2 id={id} className="fp-item-title">{copy.heading}</h2>
            {copy.lines.map((line) => (
              <p key={line} style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.5, marginTop: '6px' }}>
                {line}
              </p>
            ))}
            <div className="fp-guide-card-actions">
              <button
                type="button"
                onClick={async () => {
                  if (wasDismissed) closeReopened(); else await dismiss(page);
                  // The card is about to unmount with focus inside it; hand focus to the help button
                  // (it appears as the card goes) instead of letting it fall to <body>.
                  setTimeout(() => document.getElementById(`guide-button-${page}`)?.focus(), 0);
                }}
                style={{ padding: '8px 16px', background: 'var(--border-light)', border: 'none', borderRadius: '8px',
                         color: 'var(--text-primary)', fontWeight: 600, cursor: 'pointer' }}
              >
                Got it
              </button>
              {copy.tour && copy.tour.length > 0 && (
                <button
                  type="button"
                  onClick={() => startTour(page)}
                  style={{ padding: '8px 16px', background: 'var(--brand-main-green)', border: 'none', borderRadius: '8px',
                           color: 'white', fontWeight: 600, cursor: 'pointer' }}
                >
                  Show me around
                </button>
              )}
            </div>
          </div>
        </section>
      )}
      {touring === page && copy.tour && <GuideTour page={page} steps={copy.tour} />}
    </>
  );
};

export default PageGuide;
