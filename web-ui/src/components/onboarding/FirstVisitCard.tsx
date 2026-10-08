/**
 * The card on a user's first visit to Accounts or Investments (owner, 2026-10-01).
 *
 * *** EVERY WORD IS THE SERVER'S. *** Heading and lines come from
 * `GET /api/v1/modules/catalog` → `first_visit`, for the same reason as the rest
 * of onboarding: copy in a client can only be corrected by shipping it. The one
 * string this file owns is the button.
 *
 * *** DISMISSED ON THE SERVER, NOT IN localStorage. *** A card dismissed on the
 * web must stay dismissed on the phone, so the state is `GET/POST
 * /api/v1/modules/first-visit`, and a POST answers the whole list.
 *
 * *** IT RENDERS NOTHING UNTIL IT KNOWS, AND NOTHING IF IT CANNOT FIND OUT. ***
 * Showing it while the dismissal state loads would flash a card at everyone who
 * already dismissed it; a failed lookup is far more often a blip than a new
 * user, and the card is a nicety, not the only route to anything.
 */

import React, { useEffect, useState } from 'react';
import { Info } from 'lucide-react';
import {
  onboardingService,
  type FirstVisitCopy,
  type FirstVisitPage,
} from '../../services/onboardingService';

export const FirstVisitCard: React.FC<{ page: FirstVisitPage }> = ({ page }) => {
  const [copy, setCopy] = useState<FirstVisitCopy | null>(null);
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const state = await onboardingService.getFirstVisit();
        if (cancelled || state.dismissed.includes(page)) return;
        // Only a user who has NOT dismissed it pays for the catalogue.
        const catalog = await onboardingService.getCatalog();
        // Absent on a server with SimpleFIN off: no card, not a blank one.
        const card = catalog.first_visit?.[page];
        if (!cancelled && card) setCopy(card);
      } catch {
        // See the docstring: no card beats a card the user already dismissed.
      }
    })();
    return () => { cancelled = true; };
  }, [page]);

  if (!copy) return null;

  const dismiss = async () => {
    setDismissing(true);
    try {
      const state = await onboardingService.dismissFirstVisit(page);
      if (state.dismissed.includes(page)) setCopy(null);
    } catch {
      // Left on screen so the click can be retried; a card that vanished
      // without being stored would come back on the next visit.
    } finally {
      setDismissing(false);
    }
  };

  return (
    <section
      aria-labelledby={`first-visit-${page}`}
      style={{
        padding: '20px',
        marginBottom: '24px',
        background: 'var(--surface-hover)',
        border: '1px solid var(--border-light)',
        borderRadius: '12px',
      }}
    >
      <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div
          aria-hidden="true"
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            background: 'rgba(59, 130, 246, 0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Info size={20} color="#3b82f6" />
        </div>

        <div style={{ flex: 1, minWidth: '240px' }}>
          {/* h2: the card sits directly under the page's <h1>. */}
          <h2 id={`first-visit-${page}`} className="fp-item-title">{copy.heading}</h2>
          {copy.lines.map((line) => (
            <p
              key={line}
              style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.5, marginTop: '6px' }}
            >
              {line}
            </p>
          ))}
          <button
            type="button"
            onClick={dismiss}
            disabled={dismissing}
            style={{
              marginTop: '12px',
              padding: '8px 16px',
              background: 'var(--border-light)',
              border: 'none',
              borderRadius: '8px',
              color: 'var(--text-primary)',
              fontWeight: 600,
              cursor: dismissing ? 'default' : 'pointer',
              opacity: dismissing ? 0.6 : 1,
            }}
          >
            Got it
          </button>
        </div>
      </div>
    </section>
  );
};
