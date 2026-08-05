# Backend wiring audit — every page, every section

**Date:** 2026-08-04
**Method:** each frontend call traced to the Flask route that actually wins in
`app.url_map`, then probed live against the deployed instance with a real bearer
token. Status is based on returned payloads, not on HTTP codes — every bug in the
"fixed" list below returned `200`.

**Legend**

| | Meaning |
|---|---|
| **LIVE** | Calls a real endpoint, reads keys that exist, shows real data |
| **EMPTY-BUT-OK** | Wired correctly; the test account simply has no data |
| **BROKEN** | Calls a real endpoint but gets the wrong data, or silently drops parameters |
| **STUBBED** | Displays values the app never computed |
| **DEAD** | Service method exists, points at a route that 404s, nothing calls it |

> Statuses marked ✅ were fixed on 2026-08-04 (PRs #38 / #39 / #40 / #41, and the
> transactions/analytics branch below). Everything else is still open.

**Update 2026-08-04, second pass.** The Transactions rows, `/analytics/stats` and
every DEAD service method are now closed. One row in this file was **wrong**, not
merely out of date: GroupDetail was recorded as ✅ LIVE on the grounds that it used
the with-slash route. It did — but that handler never read `group_id`, so the page
showed the user's whole history as the group's. The lesson is the one this file
already ends on: reaching the right handler is not the same as getting the right
data, and only the payload says which.

Two findings this file has no section for, tracked in `AUDIT.md` Part 5 instead:
household-vs-per-user scoping mixed inside a single payload (D-01), and
`account_number` / `is_active` on `/accounts` existing only in the swagger model
(D-05).

---

## Analytics

| Section | Source | Status |
|---|---|---|
| Overview: Income / Expenses / Net Savings / Savings Rate | `/analytics/health` | ✅ was **LIVE but mislabelled** — values were year-to-date while labelled "This month", and ignored the range entirely. Now scoped to the selected window. |
| Overview + Cash Flow: all 7 "vs last period" deltas | none | ✅ was **STUBBED** — literals `+12.5%`, `+8.3%`, `+15.2%`, `+2.1%`, `+5.2%`, `+3.1%`, `+8.7%`. Now computed against the equal-length prior window; renders "No previous period to compare" when there is no baseline. |
| Spending by Category (pie + legend) | `/analytics/categories/top` | ✅ was **BROKEN** — handler never touched `request.args`, so `limit`/`start_date`/`end_date` were discarded, and the service hard-filtered to `datetime.now().month`. Uncategorised spending was dropped entirely, so slices summed to less than the total beside them. |
| Spending Distribution + Category Breakdown | same | ✅ same root cause |
| Income Sources pie | none | ✅ was **STUBBED (fabricated)** — a literal 75 / 20 / 5 split of real income across invented "Primary"/"Secondary"/"Other" labels. Now charts real income categories via `type=income`. |
| Income vs Expenses bar chart | `/analytics/cashflow` | ✅ was **LIVE, range ignored** — `months` was accepted by the service method and never sent. |
| Cash Flow Trend area chart | same | ✅ same, plus the subtitle printed "Last 7 days" over 6 months of data |
| Health: Investment Return | `/analytics/health` | ✅ was **misleading** — returned `7.5` with zero holdings, landing exactly on the `>= 7` "good" threshold. Now `null` → "Not enough data". |
| Health: Debt-to-Income / Emergency Fund / Liquidity | `/analytics/health` | ⚠️ **partially fixed.** The false green is gone (a ratio that collapses to 0 for lack of a denominator now renders "Not enough data" instead of a green tick). **The heuristics behind them are still guesses:** monthly debt payment = 5% of total debt, liquid assets = 30% of assets, current liabilities = 50% of debts, and YTD expenses divided by 12 regardless of elapsed year. Replacing these needs real inputs — liability minimum payments and an `is_liquid` account flag. |
| Health: Net Worth Trend | `/analytics/networth` | ✅ was **STUBBED + INVERTED** — a synthetic 12-month series fired for every user (the real branch needed ≥12 months and the underlying trend only emits months containing transactions). `growth_factor = (months-i-1)*0.02` gave the oldest month factor 0 and today 0.22, so net worth appeared to *fall* to the present and the final point contradicted `total_assets`. Now returns only real months, newest pinned to the reported totals. The separate backwards-history bug in `calculate_asset_debt_trends` is also fixed. |
| Health: "Financial Health Insights" (4 items) | none | ✅ was **STUBBED** — 4 static strings; the first asserted "your savings rate is above the recommended 20% threshold" to a user at 0% with negative net savings. Now derived, each guarded by the data it describes. |
| Export button | none | ✅ was **STUBBED** — `alert('Export functionality coming soon')`. Now writes a real CSV of the loaded figures. |
| week / month / year toggle | — | ✅ was **INERT** — only the label changed. Two params dropped frontend-side, one ignored backend-side. |
| Error handling | — | ✅ was **BROKEN (silent)** — `console.error` only, so a failed load left every metric at `0` while the health ratios reported "good". An outage rendered as a clean bill of health. Now an alert with retry. |
| `/analytics/stats` | — | ✅ was **BROKEN but DEAD.** 500'd on every call: `convert_to_dict` recursed into `obj.__dict__`, reaching `_sa_instance_state` on the live SQLAlchemy instances the service returns. Reproduced against the shipped code, then rewritten to serialize explicitly through the same helper `/dashboard` uses. 4 tests assert real figures and that no ORM internals reach the body. |
| `getIncomeTrends`, `getCategoryBreakdown`, `getNetWorthTrend`, `generateReport` | — | ✅ **DEAD, removed.** All four 404 live and were absent from `url_map`. `CategoryBreakdown` went with them — no endpoint returns that shape and they were its only consumers. |

## Dashboard

| Section | Source | Status |
|---|---|---|
| Stat cards | `/analytics/dashboard` | ✅ was **LIVE but mislabelled** — cards saying "Monthly Income"/"Monthly Expenses" were fed year-to-date `total_income` / `total_expenses_only`, so by December they were ~12× the truth and the savings rate below them inherited the error. `current_month_expenses_only` already existed; `current_month_income` did not, so it was added to the service and payload and the cards now read both. |
| Cash flow + monthly breakdown | `dashboardData.expenses`, filtered client-side | ❌ **LIVE, truncated.** The query is bounded to `Jan 1 of current year − 31 days`, so the "Year" toggle can never see 12 months. |
| Spending by Category | `dashboardData.top_categories` | ⚠️ Now includes uncategorised spending, but still current-month-only by design. Fine for a "this month" card; wrong if the range toggle is meant to apply. |
| Budget Progress | `/budgets` | ✅ **LIVE** — `BudgetSchema.spent` is a dumped `fields.Method`, key matches |
| Accounts list | `/accounts` | ✅ was **STUBBED** trend (`trend: 2.3` literal on every account). Removed. |
| Recent Transactions | `/api/v1/transactions` (legacy) | ✅ **LIVE** |
| Cash Flow chart empty state | — | ✅ rendered 280px of blank axes; now an empty state |

## Transactions

| Section | Source | Status |
|---|---|---|
| List + summary | `/api/v1/transactions/` → restx | ✅ was **LIVE but unpaginated and unfiltered.** The legacy handler won the slash-less rule and read **zero** query params, so the whole history loaded on every render and all filtering was client-side. That handler is retired; since the app sets `url_map.strict_slashes = False`, the restx rule now serves both spellings. `summary` was added to it, computed over the **whole filtered query** rather than the page — and excluding `transfer` rows, which the legacy version counted as spending. |
| `transactionService.getTransactions(filters)` | same | ✅ was **latent BROKEN** — built `page`/`per_page`/`start_date`/`search` and had them all discarded. Now sends them to the slash form. The MSW mock sat on the slash-less path returning a `pagination` key the winning handler never sent, so the contract test was green on a shape that did not exist; it now mirrors the real payload, `summary` included, and is registered on one spelling only so a stale URL fails loudly. |
| Pagination UI | — | ✅ was **absent.** With the list bounded to one page the rest of the history would have been unreachable rather than merely off-screen. Pager added, and the heading reads "Transactions 1–50 of 120" rather than a bare count that would read as the whole history. |
| `BudgetsMinimal` spending totals | same | ✅ was **at risk.** It called `getAll()` with no arguments and totalled the result per category; against a paginating endpoint that silently becomes the newest 50 rows, under-reporting every budget with no error anywhere. Now fetches only the window the budgets cover, pages through it, and says so if it hits its bound instead of showing a partial total. |
| Create / edit / delete | POST legacy, PUT/DELETE restx | ✅ **LIVE** (mixed but functional) |
| `split`, `bulk`, `export` service methods | — | ✅ **DEAD, removed.** Verified absent from `url_map` under any verb and 404 live before deleting. |

## Accounts

| Section | Source | Status |
|---|---|---|
| List + totals | `/accounts` | ✅ **LIVE** |
| Per-card trend % | none | ✅ was **STUBBED** — `{ value: 2.3, direction: 'up' }` on every account. Removed; shows last-sync/institution instead. |
| "Sync All" | none | ✅ was **STUBBED with false success** — `// TODO: Implement sync` then a "Accounts synced successfully" toast. `/accounts/simplefin/sync-all` existed and was never called. Now wired, reports the server's own answer. |

## Budgets, Investments, Groups, Recurring, Categories, Rules

| Page | Source | Status |
|---|---|---|
| Budgets (`BudgetsMinimal.tsx`) | `/budgets/overview` | ✅ **EMPTY-BUT-OK** |
| `budgetService.getBudgetSpending` | `/budgets/{id}/spending` | ✅ **DEAD, removed** |
| Investments | `/investments/portfolios`, `/holdings`, `/transactions`, `/exchanges` | ✅ **EMPTY-BUT-OK.** Totals computed client-side. Price refresh was **broken** independently — yfinance 0.2.18 got `429` on every quote; fixed by the 1.5.2 upgrade. **No CSV/folder-watch import path exists for brokerage data** (see below). |
| Groups list | `/api/v1/groups` (legacy) | ✅ **EMPTY-BUT-OK** |
| Groups "you are owed / you owe" cards | none | ✅ was **STUBBED** — `totalOwed = 0; totalOwe = 0`, "mock for now". Cards removed. `/groups/{id}/balances` exists but keys simplified debts by **display name, not user id**, so aggregating across groups needs a backend change first. |
| GroupDetail | `/groups/{id}`, `/balances`, `/transactions/?group_id=` | ✅ was **BROKEN** — this row previously read "LIVE (uses the *with-slash* route, so it does get pagination)". It did reach the paginating handler, but that handler contained **no occurrence of `group_id`**, so the parameter was discarded and the page rendered the user's entire transaction history as the group's. Filter added; 15 integration tests now assert group scoping from the payload. |
| `groupService` expenses / settle / settlements / removeMember | — | ✅ **DEAD, removed.** `teamService.removeMember` was kept: it looks like the same method but `/api/v1/team/members/<id>` DELETE exists and `TeamManagement.tsx` calls it. |
| Recurring (mounted inside Settings) | `/recurring`, `/detect`, `/toggle`, `/create-from-pattern`, `/ignore` | ✅ **EMPTY-BUT-OK.** Note: **no `/recurring` route in `App.tsx`** — reachable only via Settings. |
| Categories | `/api/v1/categories` (legacy) | ✅ **LIVE.** Errors are `console.error`-only, so a failure shows an empty list with no message. |
| `categoryService` spending / mappings / bulk-categorize | — | ✅ **DEAD, removed** — 4 URLs, 5 methods |
| Transaction Rules | `/transaction-rules` legacy; `/stats`, `/suggest`, `/bulk-apply` restx | ✅ **LIVE.** `api.transaction-rules_transaction_rule_list` and `..._test_rule` **are genuinely shadowed** by the legacy blueprint — the only true route shadowing in the app, and therefore unreachable dead code. |
| OIDC callback | `/api/v1/users/me` | ✅ was **BROKEN** — that route does not exist in `url_map` (the real one is `/api/v1/auth/me`), so every SSO login failed at the last step. An MSW mock for the nonexistent URL was hiding it. |

---

## Not wired at all: investment import

Investments are **manual entry only**. The folder-watch importer cannot ingest
brokerage exports:

- `src/services/csv_import/mapper.py` targets date / amount / description /
  account / category
- `src/services/csv_import/heuristics.py` has no symbol / shares / price detection
- `src/services/csv_import/adapters/` contains exactly one adapter (`local_folder.py`)

Dropping a brokerage CSV into the watch folder will fail, or import positions as
expenses. An adapter needs: symbol/shares/price/trade-date detection, a
`transaction_type` mapping for buy/sell/dividend/split, and a mapping UI. This is a
feature, not a wiring fix.

## Standing rule this audit produced

**Assert on rendered output or the database, never the status code.** Every BROKEN
and STUBBED row above returned `200` and rendered without visible error. Two MSW
mocks were actively papering over real backend shapes (`/users/me`, and the
`pagination` key on `/api/v1/transactions`), so the test suite was green on
fiction.
