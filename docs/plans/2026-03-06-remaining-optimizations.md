# Remaining Optimizations & Fixes

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all remaining CRITICAL, IMPORTANT, and MINOR issues from the codebase review not covered in `2026-03-06-performance-and-security-fixes.md`.

**Architecture:** Fixes are grouped by subsystem for logical commits. Each task is self-contained. No refactoring beyond what is required.

**Tech Stack:** Flask 2.2.5, SQLAlchemy 1.4, Flask-RESTX, Flask-JWT-Extended, Flask-APScheduler, PostgreSQL

---

## Task 1: Fix CORS credentials conflict (CRIT-2)

**Files:**
- Modify: `src/__init__.py:82-91`

`origins="*"` + `supports_credentials=True` is rejected by all browsers per the CORS spec. Fix by removing `supports_credentials` (JWT auth does not require cookies — tokens are in the `Authorization` header).

**Step 1: Update CORS config**

In `src/__init__.py`, replace lines 82-91:
```python
    CORS(app, resources={
        r"/api/*": {
            "origins": "*",  # Allow all origins for development/demo
            "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
            "allow_headers": ["Content-Type", "Authorization", "X-Requested-With"],
            "expose_headers": ["Content-Type", "Authorization"],
            "supports_credentials": True,
            "max_age": 3600
        }
    })
```

with:
```python
    CORS(app, resources={
        r"/api/*": {
            "origins": "*",
            "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
            "allow_headers": ["Content-Type", "Authorization", "X-Requested-With"],
            "expose_headers": ["Content-Type", "Authorization"],
            "max_age": 3600
        }
    })
```

**Step 2: Commit**

```bash
git add src/__init__.py
git commit -m "fix: remove supports_credentials from wildcard CORS config (CRIT-2)"
```

---

## Task 2: Add JWT revocation on logout + prune expired tokens (CRIT-1)

**Files:**
- Modify: `api/v1/auth.py:229-237`
- Modify: `src/models/user.py:146-148`
- Modify: `src/__init__.py` (scheduled tasks section ~line 240)

Two sub-fixes:
1. The logout endpoint doesn't revoke the current token's JTI.
2. `RevokedToken` table grows unbounded — add a nightly prune task.
3. `is_revoked()` uses `.first() is not None` — use a scalar exists query instead.

**Step 1: Fix is_revoked to use scalar exists**

In `src/models/user.py`, replace lines 146-148:
```python
    @classmethod
    def is_revoked(cls, jti):
        return cls.query.filter_by(jti=jti).first() is not None
```

with:
```python
    @classmethod
    def is_revoked(cls, jti):
        from sqlalchemy import exists
        from src.extensions import db
        return db.session.query(exists().where(cls.jti == jti)).scalar()
```

**Step 2: Revoke the current token on logout**

In `api/v1/auth.py`, replace the logout endpoint (lines 229-237):
```python
@ns.route('/logout')
class Logout(Resource):
    @ns.doc('logout', security='Bearer')
    @jwt_required()
    def post(self):
        """Logout (client should discard tokens)"""
        # Note: With JWT, logout is handled client-side by discarding tokens
        # For blacklisting, you'd need to implement a token blocklist
        return {'message': 'Successfully logged out'}, 200
```

with:
```python
@ns.route('/logout')
class Logout(Resource):
    @ns.doc('logout', security='Bearer')
    @jwt_required()
    def post(self):
        """Logout — revokes the current token so it cannot be reused."""
        from flask_jwt_extended import get_jwt
        from src.models.user import RevokedToken
        from src.extensions import db
        jti = get_jwt()['jti']
        try:
            db.session.add(RevokedToken(jti=jti))
            db.session.commit()
        except Exception:
            db.session.rollback()
        return {'message': 'Successfully logged out'}, 200
```

**Step 3: Add nightly prune task for expired revoked tokens**

JWT access tokens expire after 1 day and refresh tokens after 30 days. Any `RevokedToken` older than 31 days is safe to delete.

In `src/__init__.py`, inside `setup_scheduled_tasks(app)`, after the existing scheduled tasks, add:

```python
    @scheduler.task('cron', id='prune_revoked_tokens', hour=4, minute=0)
    def scheduled_prune_revoked_tokens():
        """Delete revoked tokens older than 31 days. Runs daily at 4 AM."""
        with app.app_context():
            try:
                from src.models.user import RevokedToken
                from src.extensions import db
                from datetime import datetime, timedelta
                cutoff = datetime.utcnow() - timedelta(days=31)
                deleted = RevokedToken.query.filter(
                    RevokedToken.revoked_at < cutoff
                ).delete(synchronize_session=False)
                db.session.commit()
                app.logger.info(f"Pruned {deleted} expired revoked token(s)")
            except Exception as e:
                app.logger.error(f"Token prune task failed: {e}")
```

**Step 4: Commit**

```bash
git add api/v1/auth.py src/models/user.py src/__init__.py
git commit -m "fix: revoke JWT on logout, efficient is_revoked check, prune expired tokens (CRIT-1)"
```

---

## Task 3: Cache get_all_user_ids() per request using flask.g (IMP-3)

**Files:**
- Modify: `src/utils/household.py`

`get_all_user_ids()` fires a `SELECT id FROM users` query every time it is called. It is called 4-5 times per dashboard request across multiple services. Cache the result for the duration of the request in `flask.g`.

**Step 1: Update household.py**

Replace the entire file content:
```python
"""
Household utility
One finPal instance = one household. All users share the same data.
"""

from src.models.user import User


def get_all_user_ids():
    """
    Get all user IDs on this instance (the household).
    Result is cached in flask.g for the duration of the request
    to avoid repeated DB hits from multiple callers.
    """
    try:
        from flask import g
        if not hasattr(g, '_household_user_ids'):
            g._household_user_ids = [
                u.id for u in User.query.with_entities(User.id).all()
            ]
        return g._household_user_ids
    except RuntimeError:
        # Outside request context (e.g. scheduled tasks) — query directly
        return [u.id for u in User.query.with_entities(User.id).all()]
```

**Step 2: Commit**

```bash
git add src/utils/household.py
git commit -m "perf: cache get_all_user_ids() in flask.g to avoid repeated queries per request (IMP-3)"
```

---

## Task 4: Cache currency lookups per request (IMP-4)

**Files:**
- Modify: `src/utils/currency_converter.py`

`convert_currency()` fires 3 separate `SELECT` queries per call (from_currency, to_currency, base_currency). Exchange rates only update nightly. Cache all currencies in `flask.g` for the duration of the request.

**Step 1: Update currency_converter.py**

Replace the entire file:
```python
"""
Currency conversion utilities
"""

from src.models.currency import Currency


def _get_currency_map():
    """
    Returns a {code: Currency} dict cached in flask.g for the request lifetime.
    Falls back to a direct query outside request context (scheduled tasks).
    """
    try:
        from flask import g
        if not hasattr(g, '_currency_map'):
            g._currency_map = {c.code: c for c in Currency.query.all()}
        return g._currency_map
    except RuntimeError:
        return {c.code: c for c in Currency.query.all()}


def get_base_currency():
    """Get the base currency"""
    for c in _get_currency_map().values():
        if c.is_base:
            return c
    return None


def convert_currency(amount, from_code, to_code):
    """Convert an amount from one currency to another"""
    if from_code == to_code:
        return amount

    currency_map = _get_currency_map()
    from_currency = currency_map.get(from_code)
    to_currency = currency_map.get(to_code)

    if not from_currency or not to_currency:
        return amount

    base_currency = get_base_currency()
    if not base_currency:
        return amount

    # Convert to base currency first
    if from_code == base_currency.code:
        amount_in_base = amount
    else:
        amount_in_base = amount * from_currency.rate_to_base

    # Convert from base currency to target
    if to_code == base_currency.code:
        return amount_in_base
    else:
        return amount_in_base / to_currency.rate_to_base
```

**Step 2: Commit**

```bash
git add src/utils/currency_converter.py
git commit -m "perf: cache currency lookups in flask.g — avoid 3 DB queries per convert_currency call (IMP-4)"
```

---

## Task 5: Fix N+1 User queries in _calculate_iou_data (IMP-13)

**Files:**
- Modify: `src/services/analytics/service.py:239`

Inside `_calculate_iou_data`, `User.query.filter_by(id=payer_id).first()` is called once per expense where the current user is a split recipient. These lookups should use the `users` dict already available in the caller, which is passed in via `expense_splits`.

The signature already accepts `expenses` and `expense_splits`. The fix is to use `User.query.get(payer_id)` (SQLAlchemy identity map) instead of `filter_by`, and build a local name lookup from data already present in the splits dict.

**Step 1: Remove the User.query call in the IOU loop**

In `src/services/analytics/service.py`, replace line 239:
```python
                payer = User.query.filter_by(id=payer_id).first()
```

with:
```python
                payer = User.query.get(payer_id)
```

`User.query.get()` uses SQLAlchemy's identity map (in-memory cache) when the user was already loaded earlier in the same session, avoiding a DB round-trip.

**Step 2: Commit**

```bash
git add src/services/analytics/service.py
git commit -m "perf: use identity map lookup in _calculate_iou_data instead of filter_by (IMP-13)"
```

---

## Task 6: Collapse _calculate_budget_summary per-budget queries into one (IMP-2)

**Files:**
- Modify: `src/services/analytics/service.py:259-306`

`_calculate_budget_summary()` fires one `Expense.query` per budget (line 281). For a household with 10 budgets, that's 10 round-trips. Replace with a single aggregated query that loads all expenses for the current month once, then groups in Python.

**Step 1: Rewrite _calculate_budget_summary**

In `src/services/analytics/service.py`, replace the entire `_calculate_budget_summary` method (lines 259-315):

```python
    def _calculate_budget_summary(self, user_id, now):
        """Calculate budget summary for the current month using a single expense query."""
        from src.utils.household import get_all_user_ids
        from types import SimpleNamespace

        household_ids = get_all_user_ids()
        budgets = Budget.query.filter(
            Budget.user_id.in_(household_ids), Budget.active == True
        ).all()

        if not budgets:
            return SimpleNamespace(
                total_budgets=0, total_budget=0, total_spent=0,
                over_budget=0, approaching_limit=0, budget_items=[]
            )

        # Collect all category IDs across budgets for a single expense query
        category_ids = list({b.category_id for b in budgets if b.category_id})

        month_start = datetime(now.year, now.month, 1)
        if now.month < 12:
            month_end = datetime(now.year, now.month + 1, 1)
        else:
            month_end = datetime(now.year + 1, 1, 1)

        # One query for all relevant expenses this month
        month_expenses = Expense.query.filter(
            Expense.user_id == user_id,
            Expense.category_id.in_(category_ids),
            Expense.date >= month_start,
            Expense.date < month_end
        ).all()

        # Group by category_id in Python
        by_category = {}
        for e in month_expenses:
            if not hasattr(e, 'transaction_type') or e.transaction_type == 'expense':
                by_category[e.category_id] = by_category.get(e.category_id, 0) + e.amount

        budget_items = []
        total_budget = 0
        total_spent = 0
        over_budget_count = 0
        approaching_limit_count = 0

        for budget in budgets:
            spent = by_category.get(budget.category_id, 0)
            total_budget += budget.amount
            total_spent += spent
            percentage = (spent / budget.amount * 100) if budget.amount > 0 else 0

            if percentage >= 100:
                over_budget_count += 1
            elif percentage >= 80:
                approaching_limit_count += 1

            budget_items.append(SimpleNamespace(
                category=budget.category.name if budget.category else 'Unknown',
                budget=budget.amount,
                spent=spent,
                percentage=percentage
            ))

        return SimpleNamespace(
            total_budgets=len(budgets),
            total_budget=total_budget,
            total_spent=total_spent,
            over_budget=over_budget_count,
            approaching_limit=approaching_limit_count,
            budget_items=budget_items
        )
```

**Step 2: Commit**

```bash
git add src/services/analytics/service.py
git commit -m "perf: collapse per-budget expense queries into single query in _calculate_budget_summary (IMP-2)"
```

---

## Task 7: Fix get_spending_trends to use a single query (IMP-8)

**Files:**
- Modify: `src/services/analytics/service.py:374-389`

`get_spending_trends()` fires one `Expense.query` per month in a loop. Replace with a single query covering the full date range, grouped by month in Python.

**Step 1: Rewrite get_spending_trends**

Replace lines 374-389:
```python
    def get_spending_trends(self, user_id, months=6):
        """Get spending trends over time"""
        from src.utils.household import get_all_user_ids
        household_ids = get_all_user_ids()
        trends = []
        for i in range(months):
            month_date = datetime.now() - timedelta(days=30*i)
            expenses = Expense.query.filter(
                Expense.user_id.in_(household_ids),
                Expense.date >= datetime(month_date.year, month_date.month, 1),
                Expense.date < datetime(month_date.year, month_date.month + 1, 1) if month_date.month < 12
                    else datetime(month_date.year + 1, 1, 1)
            ).all()
            total = sum(e.amount for e in expenses)
            trends.append({'month': month_date.strftime('%Y-%m'), 'total': total})
        return trends
```

with:
```python
    def get_spending_trends(self, user_id, months=6):
        """Get spending trends over time using a single query."""
        from src.utils.household import get_all_user_ids
        from datetime import date

        household_ids = get_all_user_ids()
        now = datetime.now()

        # Compute the start of the oldest month we need
        start_month = now - timedelta(days=30 * (months - 1))
        range_start = datetime(start_month.year, start_month.month, 1)

        # Single query covering the full range
        expenses = Expense.query.filter(
            Expense.user_id.in_(household_ids),
            Expense.date >= range_start,
            Expense.transaction_type == 'expense'
        ).all()

        # Group by YYYY-MM in Python
        totals = {}
        for e in expenses:
            key = e.date.strftime('%Y-%m')
            totals[key] = totals.get(key, 0) + e.amount

        # Build result in chronological order
        trends = []
        for i in range(months - 1, -1, -1):
            month_date = now - timedelta(days=30 * i)
            key = month_date.strftime('%Y-%m')
            trends.append({'month': key, 'total': round(totals.get(key, 0), 2)})

        return trends
```

**Step 2: Commit**

```bash
git add src/services/analytics/service.py
git commit -m "perf: collapse 6 monthly queries into one in get_spending_trends (IMP-8)"
```

---

## Task 8: Fix get_cashflow_data and get_stats_data unbounded expense loads (IMP-1 follow-up)

**Files:**
- Modify: `src/services/analytics/service.py:484-504`, `src/services/analytics/service.py:404-414`

`get_cashflow_data()` (line 494) and `get_stats_data()` (line 404) both load all-time household expenses with no date window — the same problem fixed for `get_dashboard_data()` in the first plan.

**Step 1: Add date window to get_cashflow_data**

In `src/services/analytics/service.py`, replace lines 493-499:
```python
        # Get all transactions for the household
        expenses = Expense.query.filter(
            or_(
                Expense.user_id.in_(household_ids),
                Expense.split_with.like(f'%{user_id}%')
            )
        ).all()
```

with:
```python
        # Fetch transactions bounded to the requested months window + 1 month buffer
        from datetime import datetime as _dt
        window_start = _dt.now() - timedelta(days=31 * months)
        expenses = Expense.query.filter(
            or_(
                Expense.user_id.in_(household_ids),
                Expense.split_with.like(f'%{user_id}%')
            ),
            Expense.date >= window_start
        ).all()
```

**Step 2: Add date window to get_stats_data**

In `src/services/analytics/service.py`, replace lines 403-409:
```python
        # Get all expenses for the household
        expenses = Expense.query.filter(
            or_(
                Expense.user_id.in_(household_ids),
                Expense.split_with.like(f'%{user_id}%')
            )
        ).all()
```

with:
```python
        # Bound to current year to prevent full-history loads
        from datetime import datetime as _dt
        year_start = _dt(_dt.now().year, 1, 1)
        expenses = Expense.query.filter(
            or_(
                Expense.user_id.in_(household_ids),
                Expense.split_with.like(f'%{user_id}%')
            ),
            Expense.date >= year_start
        ).all()
```

**Step 3: Commit**

```bash
git add src/services/analytics/service.py
git commit -m "perf: bound get_cashflow_data and get_stats_data expense queries to date window (IMP-1)"
```

---

## Task 9: Fix get_financial_health and get_networth_trend — avoid full dashboard call (IMP-11)

**Files:**
- Modify: `src/services/analytics/service.py:614-619`, `src/services/analytics/service.py:701-711`

Both `get_financial_health()` and `get_networth_trend()` call `get_dashboard_data()` purely to extract account-level totals. This triggers a full household expense load, split calculations, budget summaries, and investment sync — just to get `total_assets` and `total_debts`.

Replace with a direct lightweight query for account balances.

**Step 1: Add a helper method to get asset/debt totals directly**

In `src/services/analytics/service.py`, add this private method before `get_financial_health`:

```python
    def _get_asset_debt_totals(self, user_id):
        """
        Get total assets and debts directly from the accounts table.
        Much lighter than calling get_dashboard_data() just for these values.
        """
        from src.utils.helpers import get_base_currency
        from src.utils.currency_converter import convert_currency
        from src.models.user import User

        current_user = User.query.get(user_id)
        base = get_base_currency(current_user)
        base_code = base.code if base else 'USD'

        accounts = Account.query.filter_by(user_id=user_id).all()
        total_assets = 0.0
        total_debts = 0.0

        for acc in accounts:
            balance = acc.balance or 0
            currency = acc.currency_code or base_code
            balance_base = convert_currency(balance, currency, base_code)
            if balance_base >= 0:
                total_assets += balance_base
            else:
                total_debts += abs(balance_base)

        return total_assets, total_debts
```

**Step 2: Update get_financial_health to use the helper**

Replace lines 614-624:
```python
    def get_financial_health(self, user_id):
        """Calculate financial health metrics"""
        from datetime import datetime

        # Get dashboard data for base calculations
        dashboard_data = self.get_dashboard_data(user_id)

        total_income = dashboard_data.get('total_income', 0)
        total_expenses = dashboard_data.get('total_expenses_only', 0)
        total_assets = dashboard_data.get('total_assets', 0)
        total_debts = dashboard_data.get('total_debts', 0)
        net_savings = total_income - total_expenses
```

with:
```python
    def get_financial_health(self, user_id):
        """Calculate financial health metrics"""
        from datetime import datetime
        from sqlalchemy import or_
        from src.utils.household import get_all_user_ids

        # Get income/expense totals for the current year directly — avoid full dashboard load
        household_ids = get_all_user_ids()
        year_start = datetime(datetime.now().year, 1, 1)
        year_expenses = Expense.query.filter(
            or_(
                Expense.user_id.in_(household_ids),
                Expense.split_with.like(f'%{user_id}%')
            ),
            Expense.date >= year_start
        ).all()

        total_income = sum(e.amount for e in year_expenses if e.transaction_type == 'income')
        total_expenses = sum(e.amount for e in year_expenses if e.transaction_type in ('expense', None))
        total_assets, total_debts = self._get_asset_debt_totals(user_id)
        net_savings = total_income - total_expenses
```

**Step 3: Update get_networth_trend to use the helper**

Replace lines 701-711:
```python
    def get_networth_trend(self, user_id, months=12):
        """Get net worth trend over time"""
        from datetime import datetime, timedelta
        from calendar import month_abbr

        # Get current data
        dashboard_data = self.get_dashboard_data(user_id)

        current_assets = dashboard_data.get('total_assets', 0)
        current_liabilities = dashboard_data.get('total_debts', 0)
        current_net_worth = current_assets - current_liabilities

        # Get historical asset/debt trends if available
        asset_trends_months = dashboard_data.get('asset_trends_months', [])
        asset_trends = dashboard_data.get('asset_trends', [])
        debt_trends = dashboard_data.get('debt_trends', [])
```

with:
```python
    def get_networth_trend(self, user_id, months=12):
        """Get net worth trend over time"""
        from datetime import datetime, timedelta
        from calendar import month_abbr
        from src.utils.helpers import calculate_asset_debt_trends
        from src.models.user import User

        # Get current totals directly — avoid triggering full dashboard load
        current_assets, current_liabilities = self._get_asset_debt_totals(user_id)
        current_net_worth = current_assets - current_liabilities

        # Get historical asset/debt trends
        current_user = User.query.get(user_id)
        try:
            asset_debt = calculate_asset_debt_trends(current_user)
        except Exception:
            asset_debt = {'months': [], 'assets': [], 'debts': []}

        asset_trends_months = asset_debt.get('months', [])
        asset_trends = asset_debt.get('assets', [])
        debt_trends = asset_debt.get('debts', [])
```

**Step 4: Commit**

```bash
git add src/services/analytics/service.py
git commit -m "perf: get_financial_health and get_networth_trend no longer call full get_dashboard_data (IMP-11)"
```

---

## Task 10: Fix synthetic networth trend data (MIN-7)

**Files:**
- Modify: `src/services/analytics/service.py` (the `else` branch of `get_networth_trend`, around line 736)

The fallback branch fabricates 2% monthly asset growth and 1% debt reduction as "historical" data. This misleads users. Return empty data points instead.

**Step 1: Replace synthetic data with empty trend points**

In `get_networth_trend`, replace the `else` block (lines 736-757):
```python
        else:
            # Generate synthetic trend data based on current values
            # Assume 2% monthly growth in assets and 1% monthly reduction in debt
            now = datetime.now()

            for i in range(months - 1, -1, -1):
                target_date = now - timedelta(days=30*i)

                # Calculate historical values with some growth
                growth_factor = (months - i - 1) * 0.02  # 2% per month
                debt_reduction = (months - i - 1) * 0.01  # 1% per month

                assets = current_assets / (1 + growth_factor) if growth_factor > 0 else current_assets
                liabilities = current_liabilities / (1 - debt_reduction) if debt_reduction < 1 else current_liabilities
                net_worth = assets - liabilities

                trend_data.append({
                    'month': month_abbr[target_date.month],
                    'netWorth': round(net_worth, 2),
                    'assets': round(assets, 2),
                    'liabilities': round(liabilities, 2)
                })
```

with:
```python
        else:
            # No historical data — return current snapshot for latest month only,
            # null values for prior months so the frontend can render gracefully.
            now = datetime.now()
            for i in range(months - 1, -1, -1):
                target_date = now - timedelta(days=30*i)
                is_current = (i == 0)
                trend_data.append({
                    'month': month_abbr[target_date.month],
                    'netWorth': round(current_net_worth, 2) if is_current else None,
                    'assets': round(current_assets, 2) if is_current else None,
                    'liabilities': round(current_liabilities, 2) if is_current else None
                })
```

**Step 2: Commit**

```bash
git add src/services/analytics/service.py
git commit -m "fix: return null historical points instead of fabricated growth data in networth trend (MIN-7)"
```

---

## Task 11: Fix Expense.tags eager-loading (MIN-1)

**Files:**
- Modify: `src/models/transaction.py:36`

`lazy='subquery'` fires a second SELECT for tags on every Expense load, even when tags are never accessed. Change to `lazy='select'` (default lazy) so tags are only fetched when explicitly accessed.

**Step 1: Change lazy strategy**

In `src/models/transaction.py`, replace line 36:
```python
    tags = db.relationship('Tag', secondary=expense_tags, lazy='subquery',
                   backref=db.backref('expenses', lazy=True))
```

with:
```python
    tags = db.relationship('Tag', secondary=expense_tags, lazy='select',
                   backref=db.backref('expenses', lazy=True))
```

**Step 2: Commit**

```bash
git add src/models/transaction.py
git commit -m "perf: change Expense.tags from lazy=subquery to lazy=select to avoid always-eager tag loads (MIN-1)"
```

---

## Task 12: Guard db.create_all() to non-production environments (MIN-6)

**Files:**
- Modify: `src/__init__.py:195-197`

`db.create_all()` on every startup can diverge from Alembic migration state in production. Guard it so it only runs when `DEVELOPMENT_MODE=True` (which is already a config value).

**Step 1: Wrap db.create_all() in a dev-mode guard**

In `src/__init__.py`, replace lines 194-197:
```python
    # Ensure database tables exist and seed demo data if needed
    with app.app_context():
        db.create_all()
        app.logger.info("Database tables verified")
```

with:
```python
    # Ensure database tables exist in development mode.
    # In production, schema is managed exclusively via `flask db upgrade`.
    with app.app_context():
        if app.config.get('DEVELOPMENT_MODE', False):
            db.create_all()
            app.logger.info("Database tables verified (development mode)")
```

**Step 2: Commit**

```bash
git add src/__init__.py
git commit -m "fix: guard db.create_all() to DEVELOPMENT_MODE only — production uses Alembic (MIN-6)"
```

---

## Task 13: Fix scheduler timezone (EST → America/New_York) (MIN-8)

**Files:**
- Modify: `src/config.py:49`
- Modify: `src/extensions.py` (wherever pytz.timezone is called with 'EST')

`'EST'` is a fixed UTC-5 offset that does not observe daylight saving time. The correct identifier is `'America/New_York'`.

**Step 1: Fix config.py**

In `src/config.py`, replace line 49:
```python
    TIMEZONE = 'EST'
```

with:
```python
    TIMEZONE = os.getenv('TIMEZONE', 'America/New_York')
```

**Step 2: Check extensions.py for hardcoded 'EST'**

Read `src/extensions.py` to confirm the scheduler timezone reference, then update any hardcoded `'EST'` to use `app.config.get('TIMEZONE', 'America/New_York')` or `Config.TIMEZONE`.

**Step 3: Commit**

```bash
git add src/config.py src/extensions.py
git commit -m "fix: change scheduler timezone from EST (fixed offset) to America/New_York (DST-aware) (MIN-8)"
```

---

## Task 14: Fix CSV export N+1 on category relationship (MIN-12)

**Files:**
- Modify: `api/v1/accounts.py` (the export_csv query, around line 508)

The CSV export accesses `trans.category.name` in a loop, firing one `SELECT` per transaction for the category. Fix by eager-loading category in the query.

**Step 1: Find the transactions query for the CSV export**

Read `api/v1/accounts.py` around line 490-517 to locate the exact query that fetches `transactions` before the CSV loop.

**Step 2: Add joinedload for category**

The query will look something like:
```python
transactions = Expense.query.filter(...).all()
```

Change to:
```python
from sqlalchemy.orm import joinedload
transactions = Expense.query.options(
    joinedload(Expense.category)
).filter(...).all()
```

**Step 3: Commit**

```bash
git add api/v1/accounts.py
git commit -m "perf: eager-load category in CSV export to eliminate N+1 queries (MIN-12)"
```

---

## Task 15: Fix SimpleFin sync — fetch API once, distribute to all accounts (IMP-7)

**Files:**
- Modify: `src/services/account/service.py:604-631`

`sync_all_accounts()` calls `sync_account()` for each account, and each `sync_account()` call fetches the full SimpleFin payload via HTTP. For N accounts this is N redundant HTTP requests to the same endpoint returning the same data.

Fix: fetch the payload once in `sync_all_accounts()` and pass the raw account data into each account sync.

**Step 1: Refactor sync_account to accept optional raw_data**

In `src/services/account/service.py`, update `sync_account()` signature to accept `raw_account_data=None`:

```python
    def sync_account(self, account_id, user_id, raw_account_data=None):
        """
        Fetch new transactions from SimpleFin for a single account and write
        them to the expenses table.

        raw_account_data: optional pre-fetched account dict from SimpleFin.
                          When provided, skips the HTTP fetch. Used by sync_all_accounts
                          to avoid redundant API calls.
        """
```

Then wrap the HTTP fetch block (lines 527-548) so it is skipped when `raw_account_data` is provided:

```python
        if raw_account_data is not None:
            account_data_list = raw_account_data
        else:
            try:
                sf_client = SimpleFinClient(current_app)
                raw_data = sf_client.get_accounts_with_transactions(
                    settings.access_url, days_back=days_back
                )
                if not raw_data:
                    return False, 'Failed to fetch data from SimpleFin', 0

                account_raw = next(
                    (a for a in raw_data.get('accounts', [])
                     if a.get('id') == account.external_id),
                    None
                )
                if not account_raw:
                    return False, 'Account not found in SimpleFin response', 0

                processed_list = sf_client.process_raw_accounts([account_raw])
                if not processed_list:
                    return True, 'No data returned', 0

                account_data_list = processed_list[0]
            except Exception as e:
                db.session.rollback()
                current_app.logger.error(
                    f"SimpleFin sync error for account {account_id}: {str(e)}"
                )
                return False, str(e), 0

        account_data = account_data_list
```

**Step 2: Update sync_all_accounts to fetch once**

Replace `sync_all_accounts` (lines 604-631):

```python
    def sync_all_accounts(self, user_id):
        """
        Sync all SimpleFin accounts for a user.
        Fetches the SimpleFin payload once and distributes to per-account sync.
        """
        from integrations.simplefin.client import SimpleFin as SimpleFinClient

        sf_accounts = Account.query.filter_by(
            user_id=user_id,
            import_source='simplefin'
        ).all()

        if not sf_accounts:
            return True, 'No SimpleFin accounts to sync', []

        settings = SimpleFin.query.filter_by(user_id=user_id).first()
        if not settings or not settings.access_url:
            return False, 'SimpleFin not connected', []

        # Fetch once for all accounts
        try:
            sf_client = SimpleFinClient(current_app)
            days_back = 30
            raw_data = sf_client.get_accounts_with_transactions(
                settings.access_url, days_back=days_back
            )
        except Exception as e:
            return False, f'SimpleFin fetch failed: {e}', []

        if not raw_data:
            return False, 'Failed to fetch data from SimpleFin', []

        # Build a lookup of pre-processed account data by external_id
        processed_by_external_id = {}
        for account_raw in raw_data.get('accounts', []):
            processed = sf_client.process_raw_accounts([account_raw])
            if processed:
                processed_by_external_id[account_raw.get('id')] = processed[0]

        total_imported = 0
        results = []

        for account in sf_accounts:
            account_data = processed_by_external_id.get(account.external_id)
            if not account_data:
                results.append({
                    'account_id': account.id,
                    'account_name': account.name,
                    'success': False,
                    'message': 'Account not found in SimpleFin response',
                    'imported': 0,
                })
                continue

            success, message, count = self.sync_account(
                account.id, user_id, raw_account_data=account_data
            )
            total_imported += count
            results.append({
                'account_id': account.id,
                'account_name': account.name,
                'success': success,
                'message': message,
                'imported': count,
            })

        return True, f'Synced {total_imported} total transaction(s)', results
```

**Step 3: Update the existing duplicate-check loop to pre-fetch external IDs**

While in `sync_account`, also fix the N+1 duplicate check (CRIT-7 from the review). Before the `for trans in account_data.get('transactions', []):` loop, add:

```python
            # Pre-fetch existing external_ids for this account to avoid N+1 duplicate checks
            existing_external_ids = set(
                row.external_id for row in db.session.query(Expense.external_id).filter(
                    Expense.user_id == user_id,
                    Expense.account_id == account_id,
                    Expense.import_source == 'simplefin',
                    Expense.external_id.isnot(None)
                ).all()
            )
```

Then replace the per-transaction check:
```python
                # Skip duplicates
                if Expense.query.filter_by(
                    user_id=user_id,
                    external_id=external_id,
                    import_source='simplefin'
                ).first():
                    continue
```

with:
```python
                # Skip duplicates (checked against pre-fetched set)
                if external_id in existing_external_ids:
                    continue
```

**Step 4: Commit**

```bash
git add src/services/account/service.py
git commit -m "perf: fetch SimpleFin payload once for all accounts, pre-fetch duplicate IDs set (IMP-7, CRIT-7)"
```

---

## Task 16: Fix pointsPal SYNC_INTERVAL_HOURS config mismatch (IMP-10)

**Files:**
- Modify: `src/config.py:62`

`POINTSPAL_SYNC_INTERVAL_HOURS` defaults to `1` (suggesting hourly sync), but the scheduler hardcodes 3 AM once daily. The config value is never used. Fix the config default to accurately reflect what the scheduler does.

**Step 1: Update the config default**

In `src/config.py`, replace line 62:
```python
    POINTSPAL_SYNC_INTERVAL_HOURS = int(os.getenv('POINTSPAL_SYNC_INTERVAL_HOURS', 1))
```

with:
```python
    # pointsPal program data is synced once daily at 3 AM via the scheduler.
    # This setting is informational only — scheduler interval is not yet runtime-configurable.
    POINTSPAL_SYNC_INTERVAL_HOURS = int(os.getenv('POINTSPAL_SYNC_INTERVAL_HOURS', 24))
```

**Step 2: Commit**

```bash
git add src/config.py
git commit -m "fix: correct POINTSPAL_SYNC_INTERVAL_HOURS default from 1 to 24 to match actual scheduler (IMP-10)"
```

---

## Task 17: Eliminate delete+reinsert in pointsPal sync (MIN-5)

**Files:**
- Modify: `src/modules/pointspal/service.py` (earn categories sync loop ~lines 97-120)

Every nightly sync deletes all `PointsEarnCategory` rows and recreates them, even when nothing changed. Use upsert logic instead.

**Step 1: Read the exact sync loop**

Read `src/modules/pointspal/service.py` lines 90-130 to confirm the exact delete+insert pattern before modifying.

**Step 2: Replace delete+insert with upsert**

Replace the pattern:
```python
PointsEarnCategory.query.filter_by(program_id=program_id).delete()
for ec in p.get('earn_categories', []):
    db.session.add(PointsEarnCategory(...))
```

with:
```python
incoming = {ec['category']: ec for ec in p.get('earn_categories', [])}
existing = {r.category: r for r in PointsEarnCategory.query.filter_by(program_id=program_id).all()}

for category, ec_data in incoming.items():
    if category in existing:
        row = existing[category]
        row.earn_rate = ec_data.get('earn_rate', row.earn_rate)
        row.earn_type = ec_data.get('earn_type', row.earn_type)
    else:
        db.session.add(PointsEarnCategory(
            program_id=program_id,
            category=category,
            earn_rate=ec_data.get('earn_rate'),
            earn_type=ec_data.get('earn_type'),
        ))

# Remove categories no longer in the source
for category, row in existing.items():
    if category not in incoming:
        db.session.delete(row)
```

(Adjust field names to match the actual `PointsEarnCategory` model columns.)

**Step 3: Commit**

```bash
git add src/modules/pointspal/service.py
git commit -m "perf: replace delete+reinsert with upsert in pointsPal earn categories sync (MIN-5)"
```

---

## Execution Order

**Independent tasks (any order):** 1, 3, 4, 11, 12, 13, 16

**Depends on earlier tasks:**
- Task 2 (logout revocation) — independent but logical to do after task 1 (CORS)
- Task 5 (IOU N+1) — independent
- Task 6 (budget summary) — independent
- Task 7 (spending trends) — independent
- Task 8 (cashflow/stats date window) — independent
- Task 9 (financial health / networth) — independent; do after task 8
- Task 10 (synthetic data) — do after task 9 (same method)
- Task 14 (CSV export) — independent but requires reading accounts.py first
- Task 15 (SimpleFin sync consolidation) — independent; large change, do last

**Suggested order:** 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14 → 15 → 16 → 17
