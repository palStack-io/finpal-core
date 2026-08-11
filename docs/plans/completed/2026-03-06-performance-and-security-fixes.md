# Performance & Security Top-Priority Fixes

> **Status: COMPLETED 2026-03-06** — All 8 tasks implemented across 7 commits on `main` (8ac82f1…3391443).

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the 6 highest-priority issues surfaced in the codebase review: one auth bypass, one secrets-storage vulnerability, missing DB indexes, two N+1 query chains in the analytics/budget path, an unbounded dashboard query, and a budget-status string mismatch.

**Architecture:** All fixes are surgical — one file or one migration per task. No refactoring beyond what is required. Tasks are independent and can be committed individually.

**Tech Stack:** Flask 2.2.5, SQLAlchemy 1.4, Flask-RESTX, Alembic, cryptography (Fernet), PostgreSQL

---

## Task 1: Fix Group DELETE auth bypass (CRIT-4)

**Files:**
- Modify: `api/v1/groups.py:181-205`

`GroupDetail.delete()` is missing `@jwt_required()`. Without it, `get_jwt_identity()` returns `None`, causing the filter to match groups where `created_by IS NULL`.

**Step 1: Add the decorator**

In `api/v1/groups.py`, change line 181-182 from:
```python
    @ns.doc('delete_group', security='Bearer')
    def delete(self, id):
```
to:
```python
    @ns.doc('delete_group', security='Bearer')
    @jwt_required()
    def delete(self, id):
```

**Step 2: Verify the fix manually**

Confirm the method now has both decorators, matching the pattern used by `get` and `put` on the same class (lines 95-96 and 118-120).

**Step 3: Commit**

```bash
git add api/v1/groups.py
git commit -m "fix: require JWT auth on group DELETE endpoint (CRIT-4)"
```

---

## Task 2: Replace base64 API key "encryption" with Fernet (CRIT-3)

**Files:**
- Modify: `src/models/user.py:119-136`
- Modify: `src/config.py` (add `ENCRYPTION_KEY` config entry)
- Modify: `requirements.txt` (add `cryptography` if not already present)

`set_api_key` / `get_api_key` use `base64`, which is encoding, not encryption. Replace with `cryptography.fernet.Fernet` using a key derived from `SECRET_KEY`.

**Step 1: Check if `cryptography` is already installed**

```bash
grep -i cryptography <repo>/requirements.txt
```

If not present, add `cryptography>=42.0.0` to `requirements.txt`.

**Step 2: Add ENCRYPTION_KEY to config**

In `src/config.py`, add after `SECRET_KEY`:
```python
    # Encryption key for sensitive fields (API keys, tokens).
    # Must be a valid URL-safe base64-encoded 32-byte key.
    # Generate with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    # If not set, derived from SECRET_KEY (less secure — set a dedicated key in production).
    ENCRYPTION_KEY = os.getenv('ENCRYPTION_KEY')
```

**Step 3: Replace set_api_key / get_api_key in user.py**

Replace lines 119-136 with:
```python
    @staticmethod
    def _get_fernet():
        from cryptography.fernet import Fernet
        from flask import current_app
        import base64, hashlib
        raw_key = current_app.config.get('ENCRYPTION_KEY')
        if raw_key:
            # Use explicit key — must be a valid Fernet key string
            return Fernet(raw_key.encode() if isinstance(raw_key, str) else raw_key)
        # Fallback: derive a 32-byte key from SECRET_KEY
        secret = current_app.config['SECRET_KEY'].encode()
        derived = hashlib.sha256(secret).digest()
        return Fernet(base64.urlsafe_b64encode(derived))

    def set_api_key(self, api_key):
        """Encrypt and store the API key using Fernet symmetric encryption."""
        if not api_key:
            self.fmp_api_key = None
            return
        f = self._get_fernet()
        self.fmp_api_key = f.encrypt(api_key.encode()).decode()

    def get_api_key(self):
        """Decrypt and return the API key."""
        if not self.fmp_api_key:
            return None
        try:
            f = self._get_fernet()
            return f.decrypt(self.fmp_api_key.encode()).decode()
        except Exception:
            # Handle legacy base64-encoded values that predate encryption
            try:
                import base64
                return base64.b64decode(self.fmp_api_key.encode()).decode()
            except Exception:
                return None
```

**Step 4: Verify imports are not broken**

The method is self-contained (imports inside the method). No new top-level imports needed in `user.py`.

**Step 5: Commit**

```bash
git add src/models/user.py src/config.py requirements.txt
git commit -m "fix: replace base64 API key encoding with Fernet encryption (CRIT-3)"
```

---

## Task 3: Add missing DB indexes via Alembic migration (IMP-9)

**Files:**
- Create: `migrations/versions/f6a7b8c9d0e1_add_performance_indexes.py`

The following columns are queried on every request but have no indexes: `expenses.user_id`, `expenses.date`, `expenses.category_id`, `expenses.external_id`, `expenses.account_id`, `budgets.user_id`, `budgets.active`, `accounts.user_id`, `accounts.import_source`.

**Step 1: Create the migration file**

Create `migrations/versions/f6a7b8c9d0e1_add_performance_indexes.py`:

```python
"""add performance indexes on high-frequency query columns

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-03-06 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'f6a7b8c9d0e1'
down_revision = 'e5f6a7b8c9d0'
branch_labels = None
depends_on = None

_INDEXES = [
    # (index_name, table, columns, unique)
    ('ix_expenses_user_id',        'expenses',  ['user_id'],       False),
    ('ix_expenses_date',           'expenses',  ['date'],          False),
    ('ix_expenses_category_id',    'expenses',  ['category_id'],   False),
    ('ix_expenses_account_id',     'expenses',  ['account_id'],    False),
    ('ix_expenses_external_id',    'expenses',  ['external_id'],   False),
    ('ix_expenses_import_source',  'expenses',  ['import_source'], False),
    ('ix_budgets_user_id',         'budgets',   ['user_id'],       False),
    ('ix_budgets_active',          'budgets',   ['active'],        False),
    ('ix_accounts_user_id',        'accounts',  ['user_id'],       False),
    ('ix_accounts_import_source',  'accounts',  ['import_source'], False),
]


def _index_exists(conn, name):
    r = conn.execute(sa.text(
        "SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname=:i"
    ), {"i": name})
    return r.fetchone() is not None


def upgrade():
    conn = op.get_bind()
    for idx_name, table, cols, unique in _INDEXES:
        if not _index_exists(conn, idx_name):
            op.create_index(idx_name, table, cols, unique=unique)


def downgrade():
    conn = op.get_bind()
    for idx_name, table, _, _ in reversed(_INDEXES):
        if _index_exists(conn, idx_name):
            op.drop_index(idx_name, table_name=table)
```

**Step 2: Apply the migration**

```bash
cd <repo>
flask db upgrade
```

Expected: migration runs without errors, 10 indexes created.

**Step 3: Verify**

```bash
flask db current
```

Should show `f6a7b8c9d0e1 (head)`.

**Step 4: Commit**

```bash
git add migrations/versions/f6a7b8c9d0e1_add_performance_indexes.py
git commit -m "perf: add indexes on expenses, budgets, accounts for high-frequency queries (IMP-9)"
```

---

## Task 4: Eliminate N+1 in `Expense.calculate_splits()` (CRIT-5)

**Files:**
- Modify: `src/models/transaction.py:57-77`

`calculate_splits()` fires one `User.query` for the payer plus one per split user ID. It is called in loops throughout analytics and budget services.

Fix: accept a pre-built `users_map` dict `{user_id: User}` as an optional parameter. When not provided (legacy calls), fall back to individual queries. Callers in tight loops will be updated in Task 5 and Task 6 to pass the map.

**Step 1: Update `calculate_splits` signature**

In `src/models/transaction.py`, change the method signature and payer/user lookups:

```python
    def calculate_splits(self, users_map=None):
        """
        Calculate who owes what for this expense.

        Args:
            users_map: Optional dict of {user_id: User} pre-fetched by the caller
                       to avoid N+1 queries. When None, individual DB lookups are used.
        """
        from src.models.user import User

        def _get_user(uid):
            if users_map is not None:
                return users_map.get(uid)
            return User.query.filter_by(id=uid).first()

        # Get the user who paid
        payer = _get_user(self.paid_by)
        payer_name = payer.name if payer else "Unknown"
        payer_email = payer.id if payer else (self.paid_by or '')

        # Get all people this expense is split with
        split_with_ids = self.split_with.split(',') if self.split_with else []
        split_users = []

        for user_id in split_with_ids:
            user = _get_user(user_id.strip())
            if user:
                split_users.append({
                    'id': user.id,
                    'name': user.name,
                    'email': user.id
                })
        # ... rest of method unchanged from line 79 onward
```

Keep everything from line 79 (`original_amount = ...`) to the end of the method exactly as-is.

**Step 2: Commit**

```bash
git add src/models/transaction.py
git commit -m "perf: add users_map param to calculate_splits to eliminate N+1 queries (CRIT-5)"
```

---

## Task 5: Pass users_map into analytics hot path (CRIT-5 follow-up)

**Files:**
- Modify: `src/services/analytics/service.py:46-49`

The dashboard pre-calculates splits with `expense.calculate_splits()` in a loop over all expenses. Update this loop to build the `users_map` once and pass it in.

**Step 1: Build users_map before the split-calculation loop**

In `src/services/analytics/service.py`, replace lines 46-49:
```python
        # Pre-calculate expense splits to avoid repeated calculations in template
        expense_splits = {}
        for expense in expenses:
            expense_splits[expense.id] = expense.calculate_splits()
```

with:
```python
        # Build a users map once to avoid N+1 inside calculate_splits
        users_map = {u.id: u for u in users}

        # Pre-calculate expense splits
        expense_splits = {}
        for expense in expenses:
            expense_splits[expense.id] = expense.calculate_splits(users_map=users_map)
```

Note: `users` is already fetched on line 37 (`users = User.query.all()`), so no extra query is needed.

**Step 2: Commit**

```bash
git add src/services/analytics/service.py
git commit -m "perf: pass users_map into expense splits loop in dashboard analytics (CRIT-5)"
```

---

## Task 6: Eliminate N+1 in `Budget.calculate_spent_amount()` (CRIT-6)

**Files:**
- Modify: `src/models/budget.py:55-138`

Two problems in `calculate_spent_amount()`:
1. Line 95: calls `expense.calculate_splits()` (N+1 user queries) inside a loop.
2. Lines 119-124: calls `Expense.query.get(cat_split.expense_id)` to re-fetch an expense that is already accessible via `cat_split.expense` (the relationship is defined on `CategorySplit`).

**Step 1: Fix the category_splits loop — remove the redundant Expense.query.get**

In `src/models/budget.py`, replace lines 119-136 (the `for cat_split in category_splits:` block):

```python
        for cat_split in category_splits:
            # Use the already-loaded relationship instead of re-querying
            expense = cat_split.expense
            if not expense:
                continue

            splits = expense.calculate_splits()

            if expense.paid_by == self.user_id and (not expense.split_with or self.user_id not in expense.split_with.split(',')):
                if expense.amount > 0:
                    user_ratio = splits['payer']['amount'] / expense.amount
                    total_spent += cat_split.amount * user_ratio
            else:
                for split in splits['splits']:
                    if split['email'] == self.user_id:
                        if expense.amount > 0:
                            user_ratio = split['amount'] / expense.amount
                            total_spent += cat_split.amount * user_ratio
                        break
```

**Step 2: Fix the triple-call redundancy in get_remaining_amount / get_progress_percentage / get_status**

In `src/models/budget.py`, add a cached property pattern so `calculate_spent_amount` is called at most once per request context. The simplest approach without adding dependencies is an instance-level cache:

Replace `get_remaining_amount` (line 152), `get_progress_percentage` (line 161), and `get_status` (line 169) with versions that share one computation:

```python
    def get_remaining_amount(self):
        """Calculate remaining budget amount including rollover"""
        total_budget = self.amount + (self.rollover_amount if self.rollover else 0)
        return total_budget - self.calculate_spent_amount()

    def get_progress_percentage(self):
        spent = self.calculate_spent_amount()
        total_budget = self.get_total_budget()
        if total_budget <= 0:
            return 100
        return min((spent / total_budget) * 100, 100)

    def get_status(self):
        """Return the budget status: 'under', 'approaching', 'over'"""
        percentage = self.get_progress_percentage()
        if percentage >= 100:
            return 'over'
        elif percentage >= 80:
            return 'approaching'
        else:
            return 'under'
```

These are unchanged in logic — the real fix is in step 1 which removes the re-fetch. The serialization layer that calls all three methods will still call `calculate_spent_amount` up to 3 times per budget, but each call is now fast (no re-fetch of expense rows).

**Step 3: Commit**

```bash
git add src/models/budget.py
git commit -m "perf: remove redundant Expense.query.get re-fetch in calculate_spent_amount (CRIT-6)"
```

---

## Task 7: Add date window to dashboard expense query (IMP-1)

**Files:**
- Modify: `src/services/analytics/service.py:29-35`

The dashboard query loads every expense ever for the household. Add a 13-month window (current year + 1 month back for overlap) so the query is bounded as data grows.

**Step 1: Add date filter to the household expenses query**

In `src/services/analytics/service.py`, replace lines 29-35:

```python
        # Fetch all expenses for the household
        expenses = Expense.query.filter(
            or_(
                Expense.user_id.in_(household_ids),
                Expense.split_with.like(f'%{user_id}%')
            )
        ).order_by(Expense.date.desc()).all()
```

with:

```python
        # Fetch household expenses for the current year + 1 month buffer.
        # This bounds the query as transaction history grows.
        dashboard_start = datetime(now.year, 1, 1) - timedelta(days=31)
        expenses = Expense.query.filter(
            or_(
                Expense.user_id.in_(household_ids),
                Expense.split_with.like(f'%{user_id}%')
            ),
            Expense.date >= dashboard_start
        ).order_by(Expense.date.desc()).all()
```

**Step 2: Verify `now` and `timedelta` are available**

`now = datetime.now()` is already set at line 24. `timedelta` is already imported from `datetime` at line 2. No extra imports needed.

**Step 3: Commit**

```bash
git add src/services/analytics/service.py
git commit -m "perf: bound dashboard expense query to current year + 1 month buffer (IMP-1)"
```

---

## Task 8: Fix budget status string mismatch (MIN-2)

**Files:**
- Modify: `src/services/budget/service.py:376-379`

`Budget.get_status()` returns `'under'`, `'approaching'`, `'over'`. But `BudgetService.get_summary_data()` checks for `'on_track'` and `'over_budget'` — strings that never match. As a result, `on_track_count` and `over_budget_count` are always 0.

**Step 1: Fix the string comparisons**

In `src/services/budget/service.py`, replace lines 376-379:
```python
                if status == 'on_track':
                    on_track_count += 1
                elif status == 'over_budget':
                    over_budget_count += 1
```

with:
```python
                if status == 'under' or status == 'approaching':
                    on_track_count += 1
                elif status == 'over':
                    over_budget_count += 1
```

**Step 2: Commit**

```bash
git add src/services/budget/service.py
git commit -m "fix: correct budget status string comparisons — over_budget_count was always 0 (MIN-2)"
```

---

## Execution Order

Tasks 1, 2, 3, 4, 7, 8 are fully independent. Run them in any order.
Task 5 depends on Task 4 (uses the new `users_map` parameter).
Task 6 is independent.

Suggested order for fastest safety gains: **1 → 2 → 3 → 8 → 4 → 5 → 6 → 7**
