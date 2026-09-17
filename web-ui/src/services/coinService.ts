import { api } from './api';

/**
 * Coins — earned for making a figure about your own money true.
 *
 * *** THESE TYPES WERE CAPTURED FROM A REAL RESPONSE, NOT DERIVED FROM THE
 * MODEL. *** `analyticsService.ts` in this directory invented an analytics
 * payload five separate times and every one typechecked green, because an
 * interface is a claim about a server rather than a check of one. Verbatim from
 * `GET /api/v1/coins` on 2026-09-14:
 *
 *   {
 *     "earned": 6500,
 *     "balance": 6500,
 *     "acts": [
 *       { "slug": "bank_connected", "title": "Connect your bank",
 *         "coins": 0, "revealed": null },
 *       { "slug": "debt_rates", "title": "Know what your debt costs",
 *         "coins": 1200,
 *         "revealed": "Visa is at 19.99%, which costs you $13.33 a month. Of
 *                      your $35.00 minimum only $21.67 comes off the balance —
 *                      38% of what you pay is rent on the debt." }
 *     ],
 *     "gear": [ { "slug": "map", "price": 100, "owned": true } ]
 *   }
 *
 * *** THERE IS NO `total`, NO `ceiling` AND NO `coverage` ON THIS PAYLOAD, AND
 * THAT IS DELIBERATE. *** Design decision 5: no denominator unless the user
 * chose the target. A count still on the wire is one render away from becoming
 * "14 of 35", so the fields are absent rather than merely unrendered, and
 * `test_no_denominator_on_the_wire.py` keeps them absent. **Do not add one to
 * this interface to make a progress bar easier.**
 *
 * The one price that IS sent is gear's, because a gear price is a target the
 * user chose — the only place a progress bar is honest.
 *
 * *** THE PATHS HERE ARE FULL, AND THE FIRST VERSION WAS NOT. *** `api`'s
 * `baseURL` is the EMPTY STRING (`config/api.ts`: "empty string uses relative
 * URLs through nginx proxy"), so every service in this directory writes
 * `/api/v1/...` in full. Writing `/coins` made Vite serve `index.html`, axios
 * handed back a 608-character HTML STRING instead of an object, and the page
 * crashed on `wallet.gear.filter`. **Typecheck was green throughout** — the
 * interface was a claim about a server nobody had asked. The e2e run is what
 * caught it.
 *
 * *** A DORMANT ACT IS ABSENT FROM `acts`, NOT PRESENT WITH A ZERO. *** A
 * debt-free user has no `debt_rates` entry at all. Render the list you are
 * given; never pad it from a known list of slugs.
 */

/** One earnable act, as the server reports it for this user. */
export interface CoinAct {
  slug: string;
  title: string;
  /** Coins earned so far. A rising count, never a fraction. */
  coins: number;
  /**
   * The one sentence the award carries, built from the user's own figures.
   *
   * *** `null` MEANS RENDER NOTHING — NOT AN EMPTY BOX, NOT A PLACEHOLDER. ***
   * The server returns null when it cannot compute the consequence, and four
   * payoffs were caught bluffing here on 2026-09-14: they returned copy
   * claiming an act was done beside `coins: 0`. Treating null as "no sentence"
   * is what keeps that fix visible.
   */
  revealed: string | null;
}

/** One piece of gear in the shop. */
export interface CoinGear {
  slug: string;
  price: number;
  owned: boolean;
}

export interface CoinWallet {
  /** Lifetime. *** NEVER FALLS *** — it is summed from a table with no delete path. */
  earned: number;
  /** What is left to spend. Falls when gear is bought. */
  balance: number;
  acts: CoinAct[];
  gear: CoinGear[];
  /**
   * Awards the user has earned and NOT yet been shown.
   *
   * *** THIS IS HOW AN OVERNIGHT AWARD GETS ITS MOMENT. *** The nightly pass
   * runs at 04:30 while the user is asleep; without this the award simply
   * never happened as far as they could tell.
   */
  unseen: CoinAwardItem[];
}

/** One award, as `/coins/refresh` and the wallet's `unseen` both send it. */
export interface CoinAwardItem {
  slug: string;
  title: string;
  coins: number;
  /**
   * The sentence the act revealed, or `null`.
   *
   * *** NULL IS A REAL ANSWER AND MUST NOT BE PAPERED OVER. *** The server
   * returns it when it cannot compute the consequence, and `CoinAward`
   * renders nothing at all in that case. Four payoffs were caught on
   * 2026-09-14 claiming an act was done beside `coins: 0`; a fallback string
   * here would put that straight back.
   */
  revealed: string | null;
  /**
   * The one-time explanation of what this reward IS, or `null`.
   *
   * *** ONCE PER REWARD TYPE, AND THE SERVER DECIDES. *** Not "the first N
   * awards": a count spends itself badly, since three awards in one evening
   * can all be coins. The client never tracks this — it renders what arrives.
   */
  teach: CoinTeachPanel | null;
}

export interface CoinTeachPanel {
  topic: string;
  title: string;
  body: string;
}

export interface CoinRefreshResult {
  awarded: CoinAwardItem[];
  earned: number;
  balance: number;
}

/**
 * The surfaces the server recognises.
 *
 * *** THE SERVER OWNS THE SURFACE-TO-ACTS MAP; THIS IS ONLY THE NAME. *** A
 * client that decided WHICH acts a page can move would be a second list to
 * keep in step with `src/services/literacy/acts.py`, and drift is this
 * project's recurring failure. An unknown surface awards nothing and does not
 * error, so a client one release ahead is harmless.
 */
export type CoinSurface =
  | 'accounts' | 'transactions' | 'categories' | 'budgets' | 'recurring'
  | 'rules' | 'goals' | 'review' | 'investments' | 'groups' | 'settings';

export const coinService = {
  async getWallet(): Promise<CoinWallet> {
    const { data } = await api.get<CoinWallet>('/api/v1/coins');
    return data;
  },

  /**
   * Award anything the user just made true on this surface.
   *
   * *** SAFE TO CALL TWICE. *** `upsert_award` is a ratchet, so a repeat
   * awards nothing and returns an empty `awarded`. That is what makes the
   * client's job non-critical: forgetting to call this loses the MOMENT,
   * never the COINS — the 04:30 pass collects them.
   */
  async refresh(surface: CoinSurface): Promise<CoinRefreshResult> {
    const { data } = await api.post<CoinRefreshResult>(
      '/api/v1/coins/refresh', { surface }
    );
    return data;
  },

  /** Mark one award as shown. Ratchet-only; it can never un-show. */
  async ack(actSlug: string): Promise<void> {
    await api.post('/api/v1/coins/ack', { act_slug: actSlug });
  },

  /**
   * Buy one piece of gear.
   *
   * *** 402 AND 409 ARE DIFFERENT ANSWERS AND THE CALLER MUST NOT COLLAPSE
   * THEM. *** *You cannot afford this yet* and *you already own this* ask the
   * user for completely different things. The server distinguishes them
   * deliberately; a single catch-all message throws that away.
   */
  async buy(gearSlug: string): Promise<{ gear_slug: string; balance: number }> {
    const { data } = await api.post('/api/v1/coins/purchase', { gear_slug: gearSlug });
    return data;
  },
};
