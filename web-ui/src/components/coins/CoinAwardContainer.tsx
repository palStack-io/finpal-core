import React, { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useCoinAwards } from '../../contexts/CoinAwardContext';
import { CoinAward } from './CoinAward';

/**
 * Renders whichever award is at the head of the queue, app-wide.
 *
 * *** MOUNTED ONCE, BESIDE `ToastContainer`, FOR THE REASON THIS MILESTONE
 * EXISTS. *** `CoinAward.tsx` shipped correct and with ZERO consumers, because
 * every earning page would have had to remember to render it. Eleven surfaces
 * can earn; one container cannot forget.
 *
 * *** IT PULLS `unseen` ON SIGN-IN, WHICH IS WHAT GIVES A CRON AWARD ITS
 * MOMENT. *** The nightly pass runs at 04:30 while the user is asleep. Without
 * this the award never happened as far as they could tell.
 */
export const CoinAwardContainer: React.FC = () => {
  const { current, remaining, dismiss, dismissAll, loadUnseen } = useCoinAwards();
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  /**
   * *** OPENING THE KIT ACKS THE AWARD (FINPAL-27). *** Not because the user
   * pressed dismiss — they did the opposite — but because the award is fixed to
   * the corner of the VIEWPORT, so leaving it up would park it on top of the
   * very page it just sent them to. Reading it and acting on it is the most
   * "seen" an award ever gets; `ack` is ratchet-only, so the next one in the
   * queue simply takes its place.
   */
  const openKit = useCallback(() => {
    navigate('/kit');
    dismiss();
  }, [navigate, dismiss]);

  useEffect(() => {
    // *** GATED ON A USER, NOT RUN ON MOUNT. *** `/api/v1/coins` is
    // `@jwt_required()`, so calling it on the landing page is a guaranteed 401
    // on every visit by a signed-out visitor.
    if (!user) return;
    void loadUnseen();
  }, [user, loadUnseen]);

  // *** NO USER, NO AWARD — BELT AND BRACES BESIDE THE PROVIDER'S RESET. ***
  // The owner caught an award rendering on the signed-out login page. The
  // provider now clears its queue when the user changes, and this refuses to
  // paint one even if something ever repopulates it: a coins figure on a page
  // where nobody is signed in is somebody else's money on screen.
  /* *** ESCAPE DISMISSES — BUT NEVER OUT FROM UNDER A DIALOG OR A FIELD. ***
     The award sits at the END of the DOM, dozens of Tabs from the top of the
     page, so a keyboard user had no practical way to close it. */
  useEffect(() => {
    if (!current) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (document.querySelector('[role="dialog"], [aria-modal="true"]')) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      dismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, dismiss]);

  if (!user) return null;

  /* *** ONE LIVE REGION, MOUNTED FOR THE WHOLE SESSION. *** The card used to
     carry its own role="status", created in the same render as its text, and
     screen readers commonly miss a region that appears already full. */
  const spoken = current
    ? `${current.coins.toLocaleString()} coins. ${current.revealed ?? ''}`
      + (remaining > 0 ? ` ${remaining} more waiting. Press Escape to dismiss.` : '')
    : '';
  const liveRegion = (
    <div role="status" aria-live="polite" className="sr-only" data-testid="award-live">
      {spoken}
    </div>
  );
  if (!current) return liveRegion;

  return (
    <>
    {liveRegion}
    <div
      data-testid="coin-award-container"
      role="region"
      aria-label="Coins earned"
      style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: 1000,
        maxWidth: 380,
      }}
    >
      <CoinAward
        coins={current.coins}
        revealed={current.revealed}
        teach={current.teach}
        remaining={remaining}
        onOpenKit={openKit}
        onDismiss={dismiss}
      />
      {remaining > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
          <button type="button" className="award-dismiss-all" data-testid="award-dismiss-all"
            onClick={dismissAll}>
            Dismiss all {remaining + 1}
          </button>
        </div>
      )}
    </div>
    </>
  );
};
