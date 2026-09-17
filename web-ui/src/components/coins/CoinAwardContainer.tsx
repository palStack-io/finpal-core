import React, { useEffect } from 'react';
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
  const { current, remaining, dismiss, loadUnseen } = useCoinAwards();
  const user = useAuthStore((s) => s.user);

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
  if (!user || !current) return null;

  return (
    <div
      data-testid="coin-award-container"
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
        onDismiss={dismiss}
      />
    </div>
  );
};
