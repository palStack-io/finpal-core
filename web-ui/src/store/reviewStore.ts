/**
 * How much is left to review, in one place, so the badge and the page agree.
 *
 * *** THE ONLY WRITE PATH IS A SERVER PAYLOAD. *** There is deliberately no
 * `decrement()`. Every endpoint that changes a row answers with the whole
 * refreshed page, so the store is always set from a number the server just
 * computed — and two tabs, or the page and the sidebar, cannot drift apart the
 * way they do when each subtracts one locally (D-101).
 *
 * *** AND IT IS NOT PERSISTED. *** A stale badge restored from localStorage
 * would announce chores that were cleared on another device. It is cheap to
 * re-ask; it is not cheap to be wrong about.
 */
import { create } from 'zustand';

import { reviewApi, type ReviewPayload } from '../services/api/review';

interface ReviewStore {
  /** `null` until the first successful load — which is NOT the same as zero.
   *  Rendering "0 to review" before asking would claim an all-clear the app has
   *  not earned yet. */
  total: number | null;
  /** Set from any server payload. The single write path, on purpose. */
  setFromPayload: (payload: ReviewPayload) => void;
  /** Ask the server. Silent on failure: a badge is not worth an error banner,
   *  and the page itself surfaces the problem if the user goes looking. */
  refresh: () => Promise<void>;
  /** On logout, so the next account never sees the last one's count. */
  clear: () => void;
}

export const useReviewStore = create<ReviewStore>((set) => ({
  total: null,

  setFromPayload: (payload) => set({ total: payload.total }),

  refresh: async () => {
    try {
      const payload = await reviewApi.get();
      set({ total: payload.total });
    } catch {
      // Leave whatever was there. Replacing a known count with zero on a failed
      // request would silently retire a chore list that still exists.
    }
  },

  clear: () => set({ total: null }),
}));
