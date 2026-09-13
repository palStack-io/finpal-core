import { api } from '../api';

/**
 * `/api/v1/review` — everything finPal guessed, in one place.
 *
 * *** THE COUNTS COME FROM THE SERVER AND ARE NEVER DERIVED HERE. *** A confirm
 * answers with the whole refreshed page, so the badge and the list are always
 * the same number from the same query. Decrementing a local count after a
 * successful POST is the shape where two open tabs disagree about how much is
 * left to do — D-101, one layer up.
 *
 * *** THERE IS NO `limit` ON THE WIRE, AND NOTHING HERE MAY ADD ONE. *** The
 * server sends the honest count and a capped list on purpose: "3 to review",
 * never "3 of 47". A page size would let a client reconstruct the denominator
 * this page exists without.
 *
 * *** NO TRAILING SLASH. *** `/api/v1/review`, matching the rest of web-ui — a
 * trailing slash has already split this API once, with web-ui omitting it and
 * mobile including it.
 */

/** A category whose spending group finPal guessed. */
export interface ReviewCategoryRow {
  id: number;
  name: string;
  parent_name: string | null;
  spending_type: string | null;
  /** Why finPal guessed. A guess rendered without its reason asks the user to
   *  re-derive the question (D-77, D-108). */
  reason: string;
}

/** An account whose type finPal inferred rather than being told (D-191). */
export interface ReviewAccountRow {
  id: number;
  name: string;
  type: string | null;
  balance: number | null;
  reason: string;
}

/** A transaction with no category. finPal has no opinion about these. */
export interface ReviewTransactionRow {
  id: number;
  description: string | null;
  amount: number | null;
  currency_code: string | null;
  date: string | null;
  transaction_type: string | null;
}

/**
 * The verb a section takes.
 *
 * *** `choose` IS NOT `confirm` AND MUST NOT BE RENDERED AS ONE. *** The first
 * two sections ask "finPal decided X — was it right?"; the third says finPal has
 * no opinion, so there is nothing to agree with. Giving an uncategorised
 * transaction a Confirm button would be a control that cannot mean anything.
 */
export type ReviewAction = 'confirm' | 'choose';

export interface ReviewSection<Row> {
  action: ReviewAction;
  rows: Row[];
}

export interface ReviewPayload {
  total: number;
  counts: { categories: number; accounts: number; uncategorised: number };
  sections: {
    categories: ReviewSection<ReviewCategoryRow>;
    accounts: ReviewSection<ReviewAccountRow>;
    uncategorised: ReviewSection<ReviewTransactionRow>;
  };
  /** Present only on a confirm reply: whether that call changed a row.
   *  `false` is not an error — two tabs open, or a second click. */
  changed?: boolean;
}

export const reviewApi = {
  get: async (): Promise<ReviewPayload> => {
    const { data } = await api.get<ReviewPayload>('/api/v1/review');
    return data;
  },

  /**
   * Confirm a guessed spending group.
   *
   * Household-scoped on the server: categories have no owner (D-20), so any
   * member may settle one. The account call below is the OPPOSITE rule, and a
   * 403 from it is expected rather than exceptional.
   */
  confirmCategory: async (categoryId: number): Promise<ReviewPayload> => {
    const { data } = await api.post<ReviewPayload>(
      `/api/v1/review/categories/${categoryId}/confirm`);
    return data;
  },

  /**
   * Confirm an inferred account type.
   *
   * *** A 403 HERE IS A NORMAL OUTCOME, NOT A BUG. *** The page shows every
   * household account on purpose — narrowing the read would put a row in the
   * list that its viewer cannot open (D-43) — but only the owner or an admin may
   * write one. The caller must render `error` from the response rather than
   * treating a rejection as a failed request.
   */
  confirmAccount: async (accountId: number): Promise<ReviewPayload> => {
    const { data } = await api.post<ReviewPayload>(
      `/api/v1/review/accounts/${accountId}/confirm`);
    return data;
  },
};
