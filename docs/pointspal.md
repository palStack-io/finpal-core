# pointsPal — How It Works

pointsPal is finPal's credit card rewards optimizer. It tracks which cards users hold, maps transactions to the correct earn-rate categories, calculates points earned vs. missed due to caps, and recommends the best card to use for each spending category.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Program Data & Sync](#program-data--sync)
3. [Data Model](#data-model)
4. [Category Mapping](#category-mapping)
5. [Earn Rate Resolution](#earn-rate-resolution)
6. [Points Calculation](#points-calculation)
7. [Caps](#caps)
8. [Points to Dollars (CPP)](#points-to-dollars-cpp)
9. [Optimizer](#optimizer)
10. [Cap Alerts](#cap-alerts)
11. [SimpleFin Linking](#simplefin-linking)
12. [Community Contributions](#community-contributions)
13. [Feature Flag & Scheduled Sync](#feature-flag--scheduled-sync)

---

## Architecture Overview

```
SimpleFin sync
     |
     v
  Expense inserted
     |
     v
  simplefin_bridge.handle_new_transaction()   <-- SQLAlchemy after_insert event
     |
     +-- Find SimpleFin card link for the account
     +-- Map finPal category → pointsPal slug
     +-- Resolve earn rates (override > program > default)
     +-- Compute pts_earned / pts_missed (cap-aware)
     +-- Upsert spend_period_totals (monthly + quarterly + annual)
     +-- Check and fire cap alerts (80% / 95% / 100%)
```

The bridge fires automatically on every new expense, running entirely via raw SQL on the existing connection to avoid ORM session re-entrancy. A failure in the bridge never rolls back the user's transaction.

---

## Program Data & Sync

Card program data lives in the open-source **palStack-io/pointsPal** GitHub repository at:

```
https://raw.githubusercontent.com/palStack-io/pointsPal/main/dist/programs.json
```

The nightly sync job (`pointspal_sync`, runs at 3:00 AM) calls `sync_from_pointspal()` which:

1. Fetches `programs.json` from GitHub
2. Upserts each program into `points_programs`
3. Replaces all `points_earn_categories` rows for that program (delete + re-insert)
4. Replaces all `points_transfer_partners` rows for that program
5. Writes a `pointspal_sync_log` record (success/error, programs upserted, schema version)

The sync URL can be overridden via the `POINTSPAL_SYNC_URL` env var.

---

## Data Model

### `points_programs`
One row per card program (e.g. "Chase Sapphire Reserve").

| Field | Description |
|---|---|
| `program_id` | Unique slug, e.g. `chase-sapphire-reserve` |
| `program_name` | Display name |
| `issuer` | Bank/issuer name |
| `network` | Visa / Mastercard / Amex / Discover |
| `currency_name` | Name of the points currency (e.g. "Ultimate Rewards") |
| `annual_fee` | Stated annual fee |
| `effective_annual_fee` | Net fee after credits (string, may be "0" or "negative") |
| `base_cpp` | Base cents-per-point at face value |
| `tpg_cpp` | The Points Guy estimated cents-per-point (used for valuations) |
| `has_transfer_fee` | Whether the program charges transfer fees |
| `expiry_policy` | How points expire |
| `welcome_bonus` | JSON object with bonus details |
| `foreign_transaction_fee_pct` | FX fee percentage (null = no FX fee) |
| `is_stale` | Flagged when data may be outdated |

### `points_earn_categories`
One row per earning category per program.

| Field | Description |
|---|---|
| `program_id` | FK to `points_programs` |
| `category` | pointsPal slug (e.g. `dining`, `groceries`) |
| `multiplier` | Earn rate when not capped (e.g. `3.0` = 3x points per $1) |
| `cap_amount` | Spend cap in dollars before rate drops to fallback (nullable) |
| `cap_period` | Period the cap applies to: `monthly`, `quarterly`, or `annual` |
| `multiplier_fallback` | Rate after cap is hit (usually `1.0`) |
| `card_variant` | Optional — for card variants with different earn rates |

### `points_transfer_partners`
One row per transfer partner per program.

| Field | Description |
|---|---|
| `partner_name` | Airline or hotel name |
| `ratio` | Transfer ratio string, e.g. `"1:1"` or `"2:1"` |
| `type` | `airline` or `hotel` |
| `est_cpp` | Estimated CPP when transferred to this partner |

### `user_cards`
Cards the user has added to their wallet.

| Field | Description |
|---|---|
| `program_id` | FK to `points_programs` (nullable — card can be unidentified) |
| `card_nickname` | User-facing name |
| `last_four` | Last 4 digits for matching against SimpleFin accounts |
| `association_source` | `pointspal_sync`, `user_manual`, or `partial` |
| `earn_override` | JSON `{slug: multiplier}` — user-specified rates that take priority |
| `confidence_level` | `high`, `medium`, or `low` — low cards excluded from optimizer |
| `user_last_verified_at` | When the user last confirmed card details |
| `user_stale_flag` | True when the underlying program data has changed since last verification |

### `simplefin_card_links`
Maps SimpleFin accounts (credit card accounts imported via SimpleFin) to `user_cards`.

| Field | Description |
|---|---|
| `simplefin_account_id` | `accounts.external_id` from the accounts table |
| `user_card_id` | FK to `user_cards` (nullable — can be unlinked) |
| `match_source` | How the match was made: `last4`, `fuzzy_name`, or `manual` |
| `match_confidence` | Float 0–1 confidence score |
| `is_credit_card` | Whether the SimpleFin account is a credit card |

### `spend_period_totals`
Accumulated spend and points per card, category, and period. Updated on every new transaction.

| Field | Description |
|---|---|
| `user_card_id` | FK to `user_cards` |
| `category` | pointsPal slug |
| `period_type` | `monthly`, `quarterly`, or `annual` |
| `period_key` | Human-readable key: `2026-03`, `2026-Q1`, or `2026` |
| `total_spent` | Total dollars spent in this category/period |
| `total_pts_earned` | Total points earned (raw points, not dollars) |
| `total_pts_missed` | Points forfeited due to caps |

### `optimizer_alerts`
Threshold alerts for cap tracking.

| Field | Description |
|---|---|
| `alert_type` | `warning_80`, `warning_95`, or `capped` |
| `pct_used` | Percentage of the cap consumed at time of alert |
| `dismissed` | Whether the user has dismissed the alert |

---

## Category Mapping

finPal categories are user-defined free text. pointsPal uses a fixed set of slugs. The bridge maps between them via `category_map.py`:

```
finPal category name  →  pointsPal slug
─────────────────────────────────────────────
groceries / grocery / supermarket  →  groceries
dining / restaurants / food        →  dining
gas / fuel / transportation        →  gas
transit / rideshare / uber / lyft  →  transit
shopping / online shopping         →  online_shopping
utilities / phone / internet       →  phone_internet
healthcare / pharmacy / medical    →  drugstores
travel                             →  travel_portal
flights / airlines                 →  flights_direct
hotels / hotel                     →  hotels_direct
streaming / music                  →  streaming
entertainment / gaming             →  entertainment
fitness / gym                      →  fitness
rent / mortgage                    →  rent_mortgage
advertising                        →  advertising
office supplies                    →  office_supplies
home improvement / hardware        →  home_improvement
(everything else)                  →  other
```

Valid slugs: `travel_portal`, `flights_direct`, `hotels_direct`, `dining`, `groceries`, `gas`, `streaming`, `transit`, `online_shopping`, `advertising`, `drugstores`, `home_improvement`, `office_supplies`, `phone_internet`, `fitness`, `entertainment`, `rotating`, `mobile_wallet`, `rent_mortgage`, `other`.

---

## Earn Rate Resolution

For any card + category combination, the earn rate is resolved in this priority order:

1. **User earn override** (`user_cards.earn_override`) — if the user has manually set a multiplier for this category slug, it is used as-is with no cap.
2. **Program earn category** (`points_earn_categories`) — the matched row for this `program_id` + `category` slug, including any cap.
3. **Default** — `1.0x` with no cap (every card earns at least 1 point per dollar).

When an override is active, the cap from the program definition is ignored — overrides are treated as uncapped.

---

## Points Calculation

For each new expense transaction, the bridge computes points across all three period granularities (monthly, quarterly, annual):

```
pts_earned = multiplier × amount          (when not capped)
pts_earned = multiplier_fallback × amount (when capped)
pts_missed = (multiplier - multiplier_fallback) × amount  (when capped, else 0)
```

**Example — no cap:**
> Chase Sapphire Reserve, dining category, 3x multiplier, $50 restaurant charge
> `pts_earned = 3.0 × 50 = 150 points`
> `pts_missed = 0`

**Example — capped:**
> Amex Gold, groceries, 4x up to $25,000/year (1x fallback), $100 grocery charge after cap hit
> `pts_earned = 1.0 × 100 = 100 points`
> `pts_missed = (4.0 - 1.0) × 100 = 300 points`

Points are stored as raw points (not dollars). CPP conversion happens at query/display time.

---

## Caps

Caps limit the bonus earn rate to a maximum dollar amount of spend per period. After the cap is hit, the card earns at `multiplier_fallback` (usually 1x).

### How caps are tracked

Each transaction upserts a row in `spend_period_totals` for each of the three period types. The cap only applies to the period matching `cap_period` — for example, a monthly cap only affects the monthly row.

### Cap check logic (per transaction)

```
pre_spend = existing total_spent for (card, category, cap_period, period_key)

if pre_spend >= cap_amount:
    # Cap already hit before this transaction
    pts_earned = multiplier_fallback × amount
    pts_missed = (multiplier - multiplier_fallback) × amount

else:
    # Cap not yet hit
    pts_earned = multiplier × amount
    pts_missed = 0
```

Note: partial-cap transactions (where `pre_spend + amount` crosses the cap mid-transaction) are not currently split — the check is against pre-existing spend before this charge. This is a deliberate simplification that slightly over-credits in the edge case where a single transaction straddles the cap boundary.

### Period keys

| Period type | Format | Example |
|---|---|---|
| `monthly` | `YYYY-MM` | `2026-03` |
| `quarterly` | `YYYY-QN` | `2026-Q1` |
| `annual` | `YYYY` | `2026` |

---

## Points to Dollars (CPP)

CPP = **cents per point**. It converts raw points into an estimated dollar value.

### CPP sources

| Field | Description |
|---|---|
| `base_cpp` | Face value of 1 point (e.g. 1.0¢ for straight cash back) |
| `tpg_cpp` | The Points Guy's estimated redemption value — used for all optimizer calculations |
| `est_cpp` (transfer partner) | Estimated CPP when transferred to a specific airline/hotel |

### Effective CPP

```
effective_cpp = multiplier × tpg_cpp
```

This is the cents of value earned per dollar spent, and is what the optimizer uses to rank cards.

**Example:**
> Chase Sapphire Reserve, dining, 3x points, tpg_cpp = 2.05¢
> `effective_cpp = 3 × 2.05 = 6.15¢ per dollar spent`

**Example — capped card after cap hit:**
> Card drops to 1x fallback
> `effective_cpp = 1 × 2.05 = 2.05¢ per dollar spent`

### Dollar value of stored points

```
dollar_value = (total_pts_earned / 100) × tpg_cpp
```

Since `tpg_cpp` is in cents, dividing by 100 converts to dollars.

**Example:**
> `total_pts_earned = 5,000`, `tpg_cpp = 2.05`
> `dollar_value = (5000 / 100) × 2.05 = $102.50`

---

## Optimizer

`build_optimizer(user_id)` returns a ranked list of category recommendations telling the user which card to use for each spending category.

### How it works

1. Collects all `user_cards` for the user where `confidence_level != 'low'`
2. Unions all categories across those cards (from earn_overrides and earn_categories)
3. For each category, scores every eligible card by `effective_cpp`
4. Checks the current period's cap status for each card
5. Sorts cards within a category: non-capped first, then by `effective_cpp` descending
6. Returns the best card per category, plus all options

### Cap status values

| Status | Meaning |
|---|---|
| `ok` | Under 80% of cap (or no cap) |
| `warning` | 80–99% of cap consumed |
| `capped` | 100%+ of cap consumed — card drops to fallback rate |

When a card is `capped`, its effective_cpp is recalculated using `multiplier_fallback`.

### Output shape (per category)

```json
{
  "category": "dining",
  "urgency": "ok",
  "best_card": {
    "user_card_id": 1,
    "card_nickname": "Sapphire Reserve",
    "multiplier": 3.0,
    "effective_cpp": 6.15,
    "tpg_cpp": 2.05,
    "cap_amount": null,
    "cap_period": null,
    "cap_pct": null,
    "cap_status": "ok",
    "spent_in_period": 0.0,
    "rate_source": "earn_categories"
  },
  "all_options": [...]
}
```

Results are sorted by urgency: `capped` → `warning` → `ok`.

---

## Cap Alerts

After each transaction, `_check_cap_alerts()` inspects the updated `total_spent` against the cap and fires alerts at threshold crossings:

| Threshold | `alert_type` |
|---|---|
| >= 80% | `warning_80` |
| >= 95% | `warning_95` |
| >= 100% | `capped` |

Only the **highest applicable threshold** fires per transaction (e.g. if spend jumps from 70% to 105%, only `capped` is inserted, not all three).

Alerts use `ON CONFLICT DO NOTHING` — a given `(card, category, period, alert_type)` combination only alerts once. Users can dismiss alerts.

---

## SimpleFin Linking

For pointsPal to track spend, SimpleFin credit card accounts must be linked to `user_cards`. There are two paths:

### Auto-match

`auto_match_simplefin_accounts(user_id)` runs against all SimpleFin accounts not yet linked:

1. **Last-four match** — extracts a 4-digit sequence from the account display name (e.g. "Sapphire Reserve 4111") and matches against `user_cards.last_four`. Confidence threshold: `POINTSPAL_AUTO_LINK_THRESHOLD` (default 0.95).
2. **Fuzzy name match** — uses `rapidfuzz.fuzz.token_sort_ratio` to compare the account name against card nicknames and program names. Confidence threshold: `POINTSPAL_AUTO_MATCH_THRESHOLD` (default 0.75).

`match_source` is set to `last4` or `fuzzy_name` accordingly.

### Manual link

Users can manually assign any SimpleFin account to any card via the API (`POST /api/v1/wallet/links`). Manual links always get `match_confidence = 1.0` and `match_source = manual`.

---

## Community Contributions

Users can contribute their card earn-rate data back to the pointsPal open-source dataset. `generate_pr_url(card_id, user_id)` builds a pre-filled GitHub issue URL targeting `palStack-io/pointsPal` with the card's earn rates formatted as JSON following the `programs.json` schema.

The card is marked `submitted_to_community = True` and the URL is stored on the card record.

---

## Feature Flag & Scheduled Sync

pointsPal is gated behind the `POINTSPAL_ENABLED` env var:

```
POINTSPAL_ENABLED=True   # enables the module and scheduled sync
```

### Sync triggers

There are three ways the program database gets refreshed:

| Trigger | When | Behaviour |
|---|---|---|
| **First startup** | App boots with empty `points_programs` table | `sync_from_pointspal()` runs synchronously before the first request is served |
| **User login** | Non-demo user authenticates | Background daemon thread syncs SimpleFin for that user + pointsPal if data is > 23 hours old |
| **App open** | Frontend mounts `AppLayout` (already authenticated) | Same background thread, fired once per browser session via `sessionStorage` guard |
| **Nightly cron** | 3:00 AM daily | Full `sync_from_pointspal()` for all programs regardless of staleness |

The background sync on login / app-open is non-blocking — the response is returned immediately and the sync runs in a daemon thread. Demo users are excluded from all background syncs.

### Staleness check

The background trigger only runs `sync_from_pointspal()` when the most recently updated `PointsProgram.updated_at` is older than 23 hours, avoiding redundant syncs on repeated logins within the same day.

### Sync endpoint

`POST /api/v1/auth/sync` (JWT required) — called by the frontend on app open. Returns `202 Accepted` immediately.
