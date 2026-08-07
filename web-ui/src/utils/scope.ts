/**
 * Whose money a figure describes.
 *
 * `src/utils/household.py` says "One finPal instance = one household. All users
 * share the same data", and `get_all_user_ids()` returns every user on the
 * instance. `/accounts`, `/budgets`, `/categories`, `/investments` and
 * `/analytics/dashboard` are household-scoped. What was wrong is that nothing on
 * screen said which one a total covered — the same dashboard payload reported
 * `$0.00` of expenses directly above two other members' expenses.
 *
 * The owner's decision (2026-08-04, AUDIT.md D-01) was to keep both scopings and
 * label them rather than change which query a handler uses.
 *
 * **`/api/v1/transactions/` no longer filters to the caller — D-18 items B+D,
 * 2026-08-06.** It is household-scoped, keyed to the owner of each row's account,
 * and takes a `member_id` filter. On the transactions page the tags are therefore
 * **retired in favour of the filter**: with a control on screen the scope is a
 * choice the user made, and `Transactions.tsx` derives the tag from it rather than
 * hardcoding one. Note there is deliberately no tag for "a housemate's rows" —
 * filtering to someone else is neither `yours` nor `household`, so that case shows
 * no tag and names the member in the subtitle instead.
 *
 * The Dashboard's tags stay exactly as they are. `api/v1/analytics.py` takes no
 * member parameter, so the dashboard cannot offer the same filter yet; that is
 * item E, and until then labelling is still the only honest thing there.
 *
 * The scoping is per field, not per endpoint, and the authority for it is
 * `tests/integration/test_dashboard_scope_mix.py`, which asserts it against the
 * live handler with two users. The mobile app carries the same vocabulary in
 * `mobile/src/utils/scope.ts`; keep the three in step.
 */

export type Scope =
  /** The signed-in user's own rows, or their share of a split. */
  | 'yours'
  /** Every member of the household. */
  | 'household'
  /**
   * Terms with different owners, so no single answer is true. Never rendered as
   * a one-word tag — the caller has to spell the composition out.
   */
  | 'mixed';

export const SCOPE_TAG: Record<Exclude<Scope, 'mixed'>, string> = {
  yours: 'YOURS',
  household: 'HOUSEHOLD',
};

export const SCOPE_TITLE: Record<Scope, string> = {
  yours: 'Your own transactions and accounts only',
  household: 'Everyone sharing this finPal instance',
  mixed: 'Combines figures with different owners',
};

/**
 * The scope of each figure the Dashboard shows.
 *
 * `savingsRate` derives from `net_cash_flow`, which subtracts the caller's own
 * expense share from the household's income (AUDIT.md D-18). A member who has
 * entered nothing therefore sees a 100% savings rate. Labelling cannot fix a
 * figure whose two terms have different owners; it needs an owner decision.
 */
export const DASHBOARD_FIGURE_SCOPE = {
  /** `calculate_asset_debt_trends` filters to the caller's own accounts. */
  netWorth: 'yours',
  /** The income loop applies no user filter and takes no split share. */
  monthlyIncome: 'household',
  /** The expense loop takes the caller's share of each split. */
  monthlyExpenses: 'yours',
  savingsRate: 'mixed',
} as const satisfies Record<string, Scope>;

/** What a `mixed` figure is made of, in words, since no tag fits it. */
export const MIXED_SCOPE_CAPTION = {
  savingsRate: 'Of household income, after your expenses',
} as const;
