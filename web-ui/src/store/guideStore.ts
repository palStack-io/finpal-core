import { create } from 'zustand';
import { useAuthStore } from './authStore';
import {
  onboardingService,
  type GuideCopy, type GuidePage, type GuidesState,
} from '../services/onboardingService';

/**
 * One source of truth for the page guides, shared by the card, Nova's header button
 * and the tour, so the three cannot disagree about what is dismissed.
 *
 * *** A FAILED LOAD IS NO GUIDE AT ALL. *** A blip is far more often a flaky network
 * than a new user, and showing a card at someone who already dismissed it is worse
 * than a missing one. `load()` can be retried.
 */
type Status = 'idle' | 'loading' | 'ready' | 'failed';

interface GuideStore extends GuidesState {
  status: Status;
  pages: Partial<Record<GuidePage, GuideCopy>>;
  /** The language the copy was fetched in; a different one means fetch again. */
  lang: string | null;
  /** A dismissed page whose card the user has asked to see again. Never persisted. */
  reopened: GuidePage | null;
  touring: GuidePage | null;
  load: (lang?: string) => Promise<void>;
  dismiss: (page: GuidePage) => Promise<void>;
  reopen: (page: GuidePage) => void;
  closeReopened: () => void;
  startTour: (page: GuidePage) => void;
  finishTour: (page: GuidePage) => Promise<void>;
  reset: () => void;
}

const INITIAL = {
  status: 'idle' as Status, pages: {}, lang: null as string | null, dismissed: [] as GuidePage[], toured: [] as GuidePage[],
  reopened: null as GuidePage | null, touring: null as GuidePage | null,
};

let inflight: Promise<void> | null = null;

export const useGuideStore = create<GuideStore>((set, get) => ({
  ...INITIAL,

  load: async (lang) => {
    if (get().status === 'ready' && get().lang === (lang ?? null)) return;
    if (inflight) return inflight;
    set({ status: 'loading' });
    inflight = (async () => {
      try {
        const payload = await onboardingService.getGuides(lang);
        // A 200 that is not a guides payload (an odd proxy, an old backend) must not crash
        // every component that reads the store: anything malformed is "no guides".
        const ok = payload && typeof payload === 'object';
        const pages = ok && payload.pages && typeof payload.pages === 'object' ? payload.pages : {};
        const list = (v: unknown) => (Array.isArray(v) ? (v as GuidePage[]) : []);
        set({ status: 'ready', lang: lang ?? null, pages, dismissed: list(ok && payload.dismissed), toured: list(ok && payload.toured) });
      } catch {
        set({ status: 'failed', pages: {} });
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  },

  dismiss: async (page) => {
    // A reopened card was already dismissed once: closing it must not write again.
    if (get().dismissed.includes(page)) { set({ reopened: null }); return; }
    try {
      const state = await onboardingService.dismissGuide(page);
      set({ dismissed: state.dismissed, toured: state.toured, reopened: null });
    } catch {
      // Left up, so the click can be retried; a card that vanished without being
      // stored would come back on the next visit.
    }
  },

  reopen: (page) => set({ reopened: page }),
  closeReopened: () => set({ reopened: null }),
  startTour: (page) => set({ touring: page }),

  finishTour: async (page) => {
    set({ touring: null });
    try {
      const state = await onboardingService.completeTour(page);
      set({ dismissed: state.dismissed, toured: state.toured });
    } catch {
      // The tour is an offer, not a gate: not recording it just means it is offered again.
    }
  },

  reset: () => { inflight = null; set({ ...INITIAL }); },
}));

/**
 * *** FORGET EVERYTHING WHEN THE SIGNED-IN USER CHANGES. *** The Sidebar's logout is a
 * `navigate`, not a page reload, so a module-level store survives it: the next user
 * would see the last one's dismissals and language. Subscribing here covers every
 * logout path and a different login in the same tab, instead of each caller remembering.
 */
// (Guarded: a test that replaces the auth store with a bare mock has no `subscribe`.)
if (typeof useAuthStore.subscribe === 'function') {
  useAuthStore.subscribe((state, prev) => {
    if (state.user?.id !== prev.user?.id || state.isAuthenticated !== prev.isAuthenticated) {
      useGuideStore.getState().reset();
    }
  });
}
