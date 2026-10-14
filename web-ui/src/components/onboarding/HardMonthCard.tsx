/**
 * Phase 1e: after a month that went over a budget, or a return after a long gap,
 * Dashboard and Budgets open with one calm line and one action before the totals
 * (docs/phase1e-hard-month-spec.md, approved 2026-10-14).
 *
 * *** EVERY WORD IS THE SERVER'S, AND SO IS THE DECISION. *** `GET
 * /api/v1/modules/hard-month` answers at most one opening; dismissing it is stored
 * on the server so the phone does not show it again.
 *
 * *** NOT A WARNING. *** No red, no icon of alarm, no modal: it sits in the flow
 * above the totals, which stay exactly where they were. It renders nothing until it
 * knows and nothing if the lookup fails, because the card is a nicety, not the only
 * way to anything.
 */
import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { onboardingService, type HardMonthOpening } from '../../services/onboardingService';

export const HardMonthCard: React.FC = () => {
  const [opening, setOpening] = useState<HardMonthOpening | null>(null);
  const [closing, setClosing] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    let cancelled = false;
    onboardingService.getHardMonth('en')
      .then((o) => { if (!cancelled) setOpening(o); })
      .catch(() => { /* no card beats a wrong one */ });
    return () => { cancelled = true; };
  }, []);

  if (!opening) return null;

  const close = async () => {
    setClosing(true);
    try {
      await onboardingService.dismissHardMonth(opening.key);
      setOpening(null);
    } catch {
      // Left on screen so the click can be retried.
    } finally {
      setClosing(false);
    }
  };

  const here = pathname === opening.href;
  return (
    <section
      aria-label={opening.text}
      data-hard-month={opening.state}
      style={{
        display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap',
        padding: '16px 20px', marginBottom: '20px',
        background: 'var(--surface-hover)', border: '1px solid var(--border-light)', borderRadius: '12px',
      }}
    >
      <p style={{ flex: '1 1 260px', margin: 0, color: 'var(--text-primary)', fontSize: '15px', lineHeight: 1.5 }}>
        {opening.text}
      </p>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {!here && (
          <Link to={opening.href}
                style={{ padding: '8px 16px', background: 'var(--brand-main-green)', borderRadius: '8px',
                         color: 'white', fontWeight: 600, textDecoration: 'none' }}>
            {opening.action}
          </Link>
        )}
        <button type="button" onClick={close} disabled={closing}
                style={{ padding: '8px 16px', background: 'var(--border-light)', border: 'none', borderRadius: '8px',
                         color: 'var(--text-primary)', fontWeight: 600, cursor: closing ? 'default' : 'pointer',
                         opacity: closing ? 0.6 : 1 }}>
          {opening.dismiss}
        </button>
      </div>
    </section>
  );
};

export default HardMonthCard;
