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
import { coinService, type CoinAwardItem, type CoinGear, type CoinSurface } from '../services/coinService';
import { useAuthStore } from '../store/authStore';

interface CoinAwardContextType {
  /** The award currently on screen, or `null`. */
  current: CoinAwardItem | null;
  /**
   * How many more are queued behind it.
   *
   * *** THE PILE-UP IS REAL AND WAS FOUND ON THE DEMO. *** demo1 arrives with
   * twelve unseen awards, each dismissed by hand, so a panel sits over the
   * page twelve times with nothing saying why. A real user earning one or two
   * at a time never sees it; a returning user after the 04:30 pass can.
   *
   * This is the smallest honest fix: SAY how many are waiting. It is not an
   * auto-advance and not a timer — both would dismiss an award the user has
   * not read, and the payoff sentence IS the reward.
   */
  remaining: number;
  /** Award anything this surface just made true, then queue what came back. */
  refresh: (surface: CoinSurface) => Promise<void>;
  /** Dismiss the current award and acknowledge it server-side. */
  dismiss: () => void;
  /** Spendable balance, for the nav purse. `null` until first loaded. */
  balance: number | null;
  /** Pull `unseen` from the wallet — the overnight awards. */
  loadUnseen: () => Promise<void>;
  /**
   * Surfaces with at least one act still open, for the cairn.
   *
   * *** DERIVED FROM A BIT THE SERVER SENDS, NOT FROM A FRACTION. *** The
   * client cannot compute this: no ceiling goes on the wire, so `coins: 600`
   * is indistinguishable from finished. `act.open` is one boolean per act.
   */
  openSurfaces: ReadonlySet<string>;
  /**
   * Where the user stands on the shared climb, or `null` until loaded.
   *
   * *** RATCHETED SERVER-SIDE, SO IT NEVER FALLS. *** The raw fraction
   * genuinely drops when a user's circumstances widen the denominator —
   * opening a first credit card activates three dormant debt acts — and the
   * server stores the best-ever figure rather than today's.
   */
  everest: { altitude_m: number; summit_m: number; at_summit: boolean } | null;
  /** Gear the climber actually owns, so the drawing can show what coins bought. */
  ownedGear: CoinGear[];
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
  const [openSurfaces, setOpenSurfaces] = useState<ReadonlySet<string>>(
    () => new Set<string>()
  );
  const [everest, setEverest] = useState<
    { altitude_m: number; summit_m: number; at_summit: boolean } | null
  >(null);
  const [ownedGear, setOwnedGear] = useState<CoinGear[]>([]);

  // *** A REF, NOT STATE. *** Two mutations in quick succession would both
  // read a stale `queue` from the closure and the second would drop the
  // first's award. The ref is the queue's identity; state only drives paint.
  const seen = useRef<Set<string>>(new Set());

  const userId = useAuthStore((st) => st.user?.id ?? null);

  /**
   * *** EVERYTHING RESETS WHEN THE USER CHANGES OR GOES AWAY, AND SHIPPING
   * WITHOUT THIS WAS A REAL LEAK. *** The owner caught a coin award rendering
   * on the SIGNED-OUT login page — and the figure in it was in EUROS, so it
   * was a previous persona's award still sitting in this provider's state.
   *
   * Two separate faults, both fixed here: the queue survived a logout, and the
   * `seen` ref survived a user change, which would also have suppressed the
   * next user's first award for an act the previous one had already been shown.
   *
   * On a public demo where four personas are switched between constantly, this
   * is not an edge case.
   */
  useEffect(() => {
    setQueue([]);
    seen.current = new Set();
    setBalance(null);
    setOpenSurfaces(new Set<string>());
    setEverest(null);
    setOwnedGear([]);
  }, [userId]);

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

      // *** A DORMANT ACT IS ABSENT FROM `acts`, SO IT RAISES NO CAIRN. ***
      // That is the point: a debt-free user must not be told there is work
      // waiting on Accounts for debt they do not have.
      const open = new Set<string>();
      for (const act of wallet.acts ?? []) {
        if (!act.open) continue;
        for (const surface of act.surfaces ?? []) open.add(surface);
      }
      setOpenSurfaces(open);
      setEverest(wallet.everest ?? null);
      setOwnedGear((wallet.gear ?? []).filter((g) => g.owned));
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
      value={{
        current: queue[0] ?? null, remaining: Math.max(0, queue.length - 1),
        refresh, dismiss, balance, loadUnseen,
        openSurfaces, everest, ownedGear,
      }}
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

/**
 * The spendable balance for the nav purse, or `null`.
 *
 * *** SAFE WITHOUT A PROVIDER, FOR THE SAME REASON `useSurfaceCoins` IS. ***
 * The sidebar renders in tests that mount no provider, and a purse is not
 * worth breaking a nav rail over. `null` means "not asked yet" and MUST NOT
 * render as 0 — the Review badge beside it carries that exact rule, because a
 * confident zero is a claim the app has not earned.
 */
export const useCoinBalance = (): number | null => {
  const context = useContext(CoinAwardContext);
  return context?.balance ?? null;
};

/**
 * Does this surface still have an act open on it?
 *
 * *** SAFE WITHOUT A PROVIDER, LIKE THE OTHER READ HOOKS. *** Returns `false`,
 * so a missing provider means no cairn rather than a broken rail. The mount
 * itself is gated by `appMountsTheAwardMoment.test.tsx`.
 */
export const useSurfaceHasOpenAct = (surface: string | null): boolean => {
  const context = useContext(CoinAwardContext);
  if (!surface || !context) return false;
  return context.openSurfaces.has(surface);
};

/** Stable identity, so a consumer's `useMemo` does not thrash on every paint. */
const EMPTY_SURFACES: ReadonlySet<string> = new Set<string>();

/**
 * Every surface with an act still open, or an empty set.
 *
 * `useSurfaceHasOpenAct` answers for one surface; the nav needs the whole set
 * because it renders a list and cannot call a hook per row.
 *
 * Safe without a provider, like the other read hooks: an empty set means no
 * cairns rather than a broken rail.
 */
export const useOpenSurfaces = (): ReadonlySet<string> => {
  const context = useContext(CoinAwardContext);
  return context?.openSurfaces ?? EMPTY_SURFACES;
};

/**
 * Where the user stands on the shared climb, or `null`.
 *
 * *** SAFE WITHOUT A PROVIDER, LIKE EVERY OTHER READ HOOK HERE — AND THIS IS
 * THE THIRD TIME THAT MATTERED. *** `useSurfaceCoins`, `useCoinBalance` and
 * `useOpenSurfaces` all degrade for the same reason: page components render in
 * tests that mount no provider, and a reward feature must never be able to
 * blank a page it is bolted onto. `useCoinAwards` still throws, because the
 * award CONTAINER genuinely cannot work without the queue. The convention is:
 * a READ degrades, the queue does not.
 */
export const useEverest = () => {
  const context = useContext(CoinAwardContext);
  return context?.everest ?? null;
};

/**
 * The dearest piece of gear the climber owns, or `null`.
 *
 * Safe without a provider, like every other read hook here. Used to put the
 * kit a user actually bought onto the mountain they are climbing — the loop
 * closing in one place: acts pay coins, coins buy kit, kit rides up with you.
 */
export const useBestGear = (): string | null => {
  const context = useContext(CoinAwardContext);
  const owned = context?.ownedGear ?? [];
  if (!owned.length) return null;
  return [...owned].sort((a, b) => b.price - a.price)[0].slug;
};
