/**
 * The award moment, as one queue for the whole app.
 *
 * *** WHY A PROVIDER AND NOT A PER-PAGE COMPONENT. *** Eleven surfaces can
 * earn, and a page that forgets to render the award earns coins invisibly —
 * which is the defect this whole milestone exists to fix (`CoinAward.tsx`
 * shipped with ZERO consumers). One provider, one container mounted beside
 * `ToastContainer`, and a page's only job is to say WHICH surface it is.
 *
 * *** THE SURFACE NAME IS ALL THE CLIENT DECIDES. *** The server owns which
 * acts a surface can move. A client-side map would be a second list to keep in
 * step with `acts.py`.
 *
 * *** AND FORGETTING TO CALL `refresh` IS NOT A CORRECTNESS BUG. *** The
 * 04:30 pass collects anything a client misses, and `unseen` hands it over on
 * the next visit. A missed call costs the moment, never the coins.
 */

import React, {
  createContext, useCallback, useContext, useEffect, useRef, useState,
} from 'react';
import { coinService, type CoinAwardItem, type CoinSurface } from '../services/coinService';

interface CoinAwardContextType {
  /** The award currently on screen, or `null`. */
  current: CoinAwardItem | null;
  /** Award anything this surface just made true, then queue what came back. */
  refresh: (surface: CoinSurface) => Promise<void>;
  /** Dismiss the current award and acknowledge it server-side. */
  dismiss: () => void;
  /** Spendable balance, for the nav purse. `null` until first loaded. */
  balance: number | null;
  /** Pull `unseen` from the wallet — the overnight awards. */
  loadUnseen: () => Promise<void>;
}

const CoinAwardContext = createContext<CoinAwardContextType | undefined>(undefined);

export const useCoinAwards = () => {
  const context = useContext(CoinAwardContext);
  if (!context) {
    throw new Error('useCoinAwards must be used within CoinAwardProvider');
  }
  return context;
};

export const CoinAwardProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [queue, setQueue] = useState<CoinAwardItem[]>([]);
  const [balance, setBalance] = useState<number | null>(null);

  // *** A REF, NOT STATE. *** Two mutations in quick succession would both
  // read a stale `queue` from the closure and the second would drop the
  // first's award. The ref is the queue's identity; state only drives paint.
  const seen = useRef<Set<string>>(new Set());

  const enqueue = useCallback((items: CoinAwardItem[]) => {
    const fresh = items.filter(
      (a) => a.coins > 0 && a.revealed && !seen.current.has(a.slug)
    );
    if (!fresh.length) return;
    fresh.forEach((a) => seen.current.add(a.slug));
    setQueue((prev) => [...prev, ...fresh]);
  }, []);

  const refresh = useCallback(async (surface: CoinSurface) => {
    try {
      const result = await coinService.refresh(surface);
      setBalance(result.balance);
      enqueue(result.awarded);
    } catch {
      // *** SILENT ON PURPOSE. *** The coins are already earned server-side or
      // will be by morning; an error toast here would interrupt a user who
      // succeeded at the thing they were actually doing.
    }
  }, [enqueue]);

  const loadUnseen = useCallback(async () => {
    try {
      const wallet = await coinService.getWallet();
      setBalance(wallet.balance);
      enqueue(wallet.unseen ?? []);
    } catch {
      /* same reasoning as refresh */
    }
  }, [enqueue]);

  const dismiss = useCallback(() => {
    setQueue((prev) => {
      const [head, ...rest] = prev;
      if (head) void coinService.ack(head.slug).catch(() => { /* best effort */ });
      return rest;
    });
  }, []);

  return (
    <CoinAwardContext.Provider
      value={{ current: queue[0] ?? null, refresh, dismiss, balance, loadUnseen }}
    >
      {children}
    </CoinAwardContext.Provider>
  );
};

/**
 * Call the refresh once, when a surface mounts, and again on demand.
 *
 * Returns the same `refresh` bound to this page's surface, so a page calls
 * `earned()` after a mutation without repeating its own name.
 */
export const useSurfaceCoins = (surface: CoinSurface) => {
  // *** DELIBERATELY DOES NOT THROW WITHOUT A PROVIDER, UNLIKE
  // `useCoinAwards`. *** This hook goes on ELEVEN pages, and a page must never
  // break because a cross-cutting reward feature is not mounted around it.
  // That is not a dodge: the design already says a client which fails to call
  // refresh loses the MOMENT, never the COINS — the 04:30 pass collects them.
  // So the honest failure mode here is "no award animation", not a blank page.
  //
  // *** THE RISK THIS CREATES IS A SILENTLY MISSING PROVIDER, AND
  // `appMountsTheAwardMoment.test.tsx` IS WHAT COVERS IT. *** Without that
  // gate this would be D-187 again: a reader with no writer, looking fine.
  const context = useContext(CoinAwardContext);
  const refresh = context?.refresh;
  const earned = useCallback(
    async () => { if (refresh) await refresh(surface); },
    [refresh, surface]
  );

  // *** FIRES ON MOUNT AS WELL AS ON DEMAND, AND THAT IS THE POINT. ***
  // Hooking only the mutation handlers would mean finding every one of them on
  // nine large pages, and a handler somebody misses earns coins invisibly —
  // D-106's shape exactly, where three screens bypassed a helper while 494
  // tests stayed green. Firing on mount makes the page itself the trigger, so
  // no mutation can be missed: whatever the user just did, the next paint of
  // that surface collects it.
  //
  // Calling `earned()` after a mutation is then an OPTIMISATION for immediacy,
  // not the mechanism. Safe either way, because refresh is idempotent.
  useEffect(() => {
    void earned();
  }, [earned]);

  return earned;
};

export default CoinAwardContext;
