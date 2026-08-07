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
 * **The Dashboard's per-figure map used to live here and was retired by D-18
 * item E (2026-08-06).** It said `netWorth: 'yours'`, `monthlyIncome:
 * 'household'`, `monthlyExpenses: 'yours'` and `savingsRate: 'mixed'` — all true
 * at the time, and all false now. Every dashboard figure describes the same
 * people and follows one member filter, so the page states its scope once, in
 * words, beside the control the user set. A tag alongside a filter would state it
 * twice and disagree the moment either drifted.
 *
 * The vocabulary above stays: `Investments` and the pointsPal pages still carry
 * genuine per-figure tags, and the Analytics page still tags its charts
 * `household` because it has no filter of its own yet (its own AUDIT row).
 *
 * `web-ui/src/__tests__/pages/DashboardMemberFilter.test.tsx` is where the
 * dashboard's answer is asserted now — on the request and the rendered figures,
 * not on a lookup table that could go on being true about nothing.
 */
