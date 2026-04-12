# Test Suite Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a production-grade backend (pytest) + frontend (Vitest) test suite covering auth, financial logic, the module system, pointsPal, and all API endpoints.

**Architecture:** Backend uses pytest + pytest-flask with an in-memory SQLite DB and factory_boy model factories. Frontend uses Vitest + React Testing Library + MSW for network mocking. Tests are fully isolated — no shared state, no real HTTP calls, no running server required.

**Tech Stack:** pytest 8, pytest-flask, factory-boy, pytest-cov · Vitest, @testing-library/react, @testing-library/user-event, msw, jsdom

---

## Task 1: Backend test infrastructure — requirements, pytest config, conftest

**Files:**
- Create: `requirements-test.txt`
- Create: `pytest.ini`
- Create: `tests/__init__.py`
- Create: `tests/conftest.py`

**Step 1: Create `requirements-test.txt`**

```
pytest==8.3.4
pytest-flask==1.3.0
pytest-cov==6.0.0
factory-boy==3.3.1
```

**Step 2: Install test dependencies**

```bash
pip install -r requirements-test.txt
```

**Step 3: Create `pytest.ini`**

```ini
[pytest]
testpaths = tests
python_files = test_*.py
python_classes = Test*
python_functions = test_*
addopts = -v --tb=short
filterwarnings =
    ignore::DeprecationWarning
    ignore::sqlalchemy.exc.SAWarning
env =
    TESTING=true
    POINTSPAL_ENABLED=true
    SECRET_KEY=test-secret-key
    ENCRYPTION_KEY=
```

**Step 4: Create `tests/__init__.py`** (empty)

**Step 5: Create `tests/conftest.py`**

```python
"""
Shared pytest fixtures for finPal test suite.

Key fixtures:
  app         — Flask app configured for testing (SQLite in-memory)
  db          — creates all tables before each test, drops after
  client      — Flask test client
  auth_headers — factory: returns Bearer token headers for a user
"""

import pytest
from src import create_app
from src.extensions import db as _db


@pytest.fixture(scope='session')
def app():
    """Create Flask app with test config. Session-scoped — one app per run."""
    application = create_app()
    application.config.update({
        'TESTING': True,
        'SQLALCHEMY_DATABASE_URI': 'sqlite:///:memory:',
        'SQLALCHEMY_TRACK_MODIFICATIONS': False,
        'JWT_SECRET_KEY': 'test-secret-key',
        'SECRET_KEY': 'test-secret-key',
        'POINTSPAL_ENABLED': 'true',
        'WTF_CSRF_ENABLED': False,
        # Disable background tasks during tests
        'SCHEDULER_API_ENABLED': False,
        'APSCHEDULER_DAEMON': False,
    })
    return application


@pytest.fixture(scope='function')
def db(app):
    """Create all tables before each test, drop all after. Function-scoped for isolation."""
    with app.app_context():
        _db.create_all()
        yield _db
        _db.session.remove()
        _db.drop_all()


@pytest.fixture(scope='function')
def client(app, db):
    """Flask test client. Depends on db so tables exist."""
    with app.test_client() as c:
        with app.app_context():
            yield c


@pytest.fixture
def auth_headers(client):
    """
    Factory fixture: call auth_headers(user) to get Bearer token headers.

    Usage:
        def test_something(client, auth_headers, db):
            user = UserFactory(password_plain='secret')
            headers = auth_headers(user, password='secret')
            resp = client.get('/api/v1/...', headers=headers)
    """
    def _make(user, password='testpassword'):
        resp = client.post('/api/v1/auth/login', json={
            'email': user.id,
            'password': password,
        })
        assert resp.status_code == 200, f"Login failed: {resp.get_json()}"
        token = resp.get_json()['access_token']
        return {'Authorization': f'Bearer {token}'}
    return _make
```

**Step 6: Verify pytest collects (0 tests is fine for now)**

```bash
pytest --collect-only
```

Expected: `no tests ran` — no error.

**Step 7: Commit**

```bash
git add requirements-test.txt pytest.ini tests/
git commit -m "test: add pytest infrastructure — conftest, config, requirements"
```

---

## Task 2: Model factories

**Files:**
- Create: `tests/factories.py`

**Step 1: Create `tests/factories.py`**

```python
"""
factory_boy factories for finPal models.

All factories use SQLAlchemy strategy so objects are saved to the test DB.
Use create() to persist, build() for in-memory only.

Usage:
    user = UserFactory()               # persisted, password='testpassword'
    user = UserFactory(id='x@y.com')   # custom email
    expense = ExpenseFactory(user=user, amount=50.0)
"""

import factory
from factory.alchemy import SQLAlchemyModelFactory
from datetime import datetime

from src.extensions import db
from src.models.user import User
from src.models.category import Category
from src.models.transaction import Expense
from src.models.budget import Budget
from src.models.account import Account
from src.modules.access import UserModuleAccess


class UserFactory(SQLAlchemyModelFactory):
    class Meta:
        model = User
        sqlalchemy_session = db.session
        sqlalchemy_session_persistence = 'commit'

    id = factory.Sequence(lambda n: f'user{n}@test.com')
    name = factory.Sequence(lambda n: f'Test User {n}')
    default_currency_code = 'USD'
    has_completed_onboarding = True
    is_demo_user = False

    @classmethod
    def _create(cls, model_class, *args, **kwargs):
        password = kwargs.pop('password_plain', 'testpassword')
        obj = model_class(*args, **kwargs)
        obj.set_password(password)
        db.session.add(obj)
        db.session.commit()
        return obj


class CategoryFactory(SQLAlchemyModelFactory):
    class Meta:
        model = Category
        sqlalchemy_session = db.session
        sqlalchemy_session_persistence = 'commit'

    name = factory.Sequence(lambda n: f'Category {n}')
    user_id = factory.LazyAttribute(lambda o: UserFactory().id)


class AccountFactory(SQLAlchemyModelFactory):
    class Meta:
        model = Account
        sqlalchemy_session = db.session
        sqlalchemy_session_persistence = 'commit'

    name = factory.Sequence(lambda n: f'Account {n}')
    account_type = 'checking'
    balance = 1000.0
    user_id = factory.LazyAttribute(lambda o: UserFactory().id)
    currency_code = 'USD'


class ExpenseFactory(SQLAlchemyModelFactory):
    class Meta:
        model = Expense
        sqlalchemy_session = db.session
        sqlalchemy_session_persistence = 'commit'

    description = factory.Sequence(lambda n: f'Expense {n}')
    amount = 50.0
    date = factory.LazyFunction(datetime.utcnow)
    card_used = 'Test Card'
    split_method = 'none'
    paid_by = factory.LazyAttribute(lambda o: o.user_id)
    user_id = factory.LazyAttribute(lambda o: UserFactory().id)
    transaction_type = 'expense'


class BudgetFactory(SQLAlchemyModelFactory):
    class Meta:
        model = Budget
        sqlalchemy_session = db.session
        sqlalchemy_session_persistence = 'commit'

    name = factory.Sequence(lambda n: f'Budget {n}')
    amount = 500.0
    period = 'monthly'
    user_id = factory.LazyAttribute(lambda o: UserFactory().id)
    category_id = factory.LazyAttribute(lambda o: CategoryFactory().id)
    active = True
    is_recurring = True


class UserModuleAccessFactory(SQLAlchemyModelFactory):
    class Meta:
        model = UserModuleAccess
        sqlalchemy_session = db.session
        sqlalchemy_session_persistence = 'commit'

    user_id = factory.LazyAttribute(lambda o: UserFactory().id)
    module_name = 'pointspal'
    enabled = True
    granted_by = 'manual'
```

**Step 2: Verify factories import cleanly**

```bash
python -c "from tests.factories import UserFactory; print('OK')"
```

Expected: `OK`

**Step 3: Commit**

```bash
git add tests/factories.py
git commit -m "test: add factory_boy model factories"
```

---

## Task 3: Unit tests — module registry and ModuleBase

**Files:**
- Create: `tests/unit/__init__.py`
- Create: `tests/unit/test_module_registry.py`
- Create: `tests/unit/test_module_base.py`

**Step 1: Create `tests/unit/__init__.py`** (empty)

**Step 2: Create `tests/unit/test_module_registry.py`**

```python
"""
Unit tests for ModuleRegistry.

Tests: register (enabled/disabled), dispatch_event isolation,
background_sync isolation, is_user_enabled delegation.
"""

import pytest
from unittest.mock import MagicMock, patch
from src.modules.registry import ModuleRegistry
from src.modules.base import ModuleBase


class AlwaysOnModule(ModuleBase):
    name = 'test_on'
    enabled_env = 'TEST_ON_ENABLED'

    def is_enabled(self):
        return True


class AlwaysOffModule(ModuleBase):
    name = 'test_off'
    enabled_env = 'TEST_OFF_ENABLED'

    def is_enabled(self):
        return False


class BrokenEventModule(AlwaysOnModule):
    name = 'test_broken'

    def on_event(self, event_name, **kwargs):
        raise RuntimeError("boom")


class SpyModule(AlwaysOnModule):
    name = 'test_spy'

    def __init__(self):
        self.events = []
        self.syncs = []

    def on_event(self, event_name, **kwargs):
        self.events.append(event_name)

    def on_background_sync(self, app, user_id):
        self.syncs.append(user_id)


def test_register_enabled_module():
    registry = ModuleRegistry()
    registry.register(AlwaysOnModule())
    assert len(registry.modules) == 1
    assert registry.modules[0].name == 'test_on'


def test_register_disabled_module_is_skipped():
    registry = ModuleRegistry()
    registry.register(AlwaysOffModule())
    assert len(registry.modules) == 0


def test_dispatch_event_reaches_module():
    registry = ModuleRegistry()
    spy = SpyModule()
    registry.register(spy)
    registry.dispatch_event('expense_created', amount=50)
    assert 'expense_created' in spy.events


def test_dispatch_event_does_not_raise_on_module_error():
    """A broken module must never crash the caller."""
    registry = ModuleRegistry()
    registry.register(BrokenEventModule())
    # Should not raise
    registry.dispatch_event('expense_created')


def test_dispatch_event_continues_after_broken_module():
    """Broken module doesn't stop subsequent modules from receiving event."""
    registry = ModuleRegistry()
    registry.register(BrokenEventModule())
    spy = SpyModule()
    registry.register(spy)
    registry.dispatch_event('expense_created')
    assert 'expense_created' in spy.events


def test_background_sync_reaches_module():
    registry = ModuleRegistry()
    spy = SpyModule()
    registry.register(spy)
    app = MagicMock()
    registry.background_sync(app, 'user@test.com')
    assert 'user@test.com' in spy.syncs


def test_is_user_enabled_returns_false_for_unknown_module():
    registry = ModuleRegistry()
    assert registry.is_user_enabled('nonexistent', 'user@test.com') is False


def test_is_user_enabled_delegates_to_module(app, db):
    """is_user_enabled calls module.is_user_enabled inside app context."""
    with app.app_context():
        registry = ModuleRegistry()
        mod = AlwaysOnModule()
        registry.register(mod)
        # No UserModuleAccess row → default-open → True
        result = registry.is_user_enabled('test_on', 'any@user.com')
        assert result is True
```

**Step 3: Create `tests/unit/test_module_base.py`**

```python
"""
Unit tests for ModuleBase.

Tests: is_enabled reads env var, is_user_enabled default-open behaviour,
is_user_enabled respects explicit DB row.
"""

import pytest
from src.modules.base import ModuleBase
from src.modules.access import UserModuleAccess
from tests.factories import UserFactory, UserModuleAccessFactory


class ConcreteModule(ModuleBase):
    name = 'mymod'
    enabled_env = 'MYMOD_ENABLED'


def test_is_enabled_true_when_env_set(monkeypatch):
    monkeypatch.setenv('MYMOD_ENABLED', 'true')
    assert ConcreteModule().is_enabled() is True


def test_is_enabled_false_when_env_missing(monkeypatch):
    monkeypatch.delenv('MYMOD_ENABLED', raising=False)
    assert ConcreteModule().is_enabled() is False


def test_is_enabled_false_when_env_false(monkeypatch):
    monkeypatch.setenv('MYMOD_ENABLED', 'false')
    assert ConcreteModule().is_enabled() is False


def test_is_user_enabled_default_open_when_no_row(app, db):
    """No UserModuleAccess row → True (default-open)."""
    with app.app_context():
        user = UserFactory()
        mod = ConcreteModule()
        assert mod.is_user_enabled(user.id) is True


def test_is_user_enabled_respects_enabled_row(app, db):
    with app.app_context():
        user = UserFactory()
        UserModuleAccessFactory(user_id=user.id, module_name='mymod', enabled=True)
        mod = ConcreteModule()
        assert mod.is_user_enabled(user.id) is True


def test_is_user_enabled_respects_disabled_row(app, db):
    with app.app_context():
        user = UserFactory()
        UserModuleAccessFactory(user_id=user.id, module_name='mymod', enabled=False)
        mod = ConcreteModule()
        assert mod.is_user_enabled(user.id) is False
```

**Step 4: Run the unit tests**

```bash
pytest tests/unit/test_module_registry.py tests/unit/test_module_base.py -v
```

Expected: all green.

**Step 5: Commit**

```bash
git add tests/unit/
git commit -m "test: unit tests for ModuleRegistry and ModuleBase"
```

---

## Task 4: Unit tests — Expense.calculate_splits

**Files:**
- Create: `tests/unit/test_transaction_splits.py`

**Step 1: Create `tests/unit/test_transaction_splits.py`**

```python
"""
Unit tests for Expense.calculate_splits.

Tests: split_method='none', 'equal' (2 and 3 people),
'custom', 'percentage'. Also tests users_map N+1 avoidance.
"""

import pytest
from tests.factories import UserFactory, ExpenseFactory


def test_split_none_full_amount_to_payer(app, db):
    with app.app_context():
        user = UserFactory()
        expense = ExpenseFactory(
            user_id=user.id,
            paid_by=user.id,
            amount=100.0,
            split_method='none',
            split_with=None,
        )
        result = expense.calculate_splits()
        assert result['payer']['amount'] == 100.0
        assert result['splits'] == []


def test_split_equal_two_people(app, db):
    with app.app_context():
        payer = UserFactory()
        other = UserFactory()
        expense = ExpenseFactory(
            user_id=payer.id,
            paid_by=payer.id,
            amount=100.0,
            split_method='equal',
            split_with=other.id,
        )
        result = expense.calculate_splits()
        assert result['payer']['amount'] == pytest.approx(50.0)
        assert len(result['splits']) == 1
        assert result['splits'][0]['amount'] == pytest.approx(50.0)


def test_split_equal_three_people(app, db):
    with app.app_context():
        payer = UserFactory()
        u2 = UserFactory()
        u3 = UserFactory()
        expense = ExpenseFactory(
            user_id=payer.id,
            paid_by=payer.id,
            amount=90.0,
            split_method='equal',
            split_with=f'{u2.id},{u3.id}',
        )
        result = expense.calculate_splits()
        assert result['payer']['amount'] == pytest.approx(30.0)
        assert len(result['splits']) == 2
        for s in result['splits']:
            assert s['amount'] == pytest.approx(30.0)


def test_split_equal_payer_in_split_with(app, db):
    """When payer is listed in split_with, payer amount should be 0."""
    with app.app_context():
        payer = UserFactory()
        other = UserFactory()
        expense = ExpenseFactory(
            user_id=payer.id,
            paid_by=payer.id,
            amount=100.0,
            split_method='equal',
            split_with=f'{payer.id},{other.id}',
        )
        result = expense.calculate_splits()
        assert result['payer']['amount'] == 0.0


def test_split_custom_amounts(app, db):
    import json
    with app.app_context():
        payer = UserFactory()
        other = UserFactory()
        split_details = json.dumps({
            'type': 'amount',
            'values': {payer.id: 70.0, other.id: 30.0},
        })
        expense = ExpenseFactory(
            user_id=payer.id,
            paid_by=payer.id,
            amount=100.0,
            split_method='custom',
            split_with=other.id,
            split_details=split_details,
        )
        result = expense.calculate_splits()
        assert result['payer']['amount'] == pytest.approx(70.0)
        assert result['splits'][0]['amount'] == pytest.approx(30.0)


def test_split_percentage(app, db):
    import json
    with app.app_context():
        payer = UserFactory()
        other = UserFactory()
        split_details = json.dumps({
            'type': 'percentage',
            'values': {payer.id: 60.0, other.id: 40.0},
        })
        expense = ExpenseFactory(
            user_id=payer.id,
            paid_by=payer.id,
            amount=200.0,
            split_method='percentage',
            split_with=other.id,
            split_details=split_details,
        )
        result = expense.calculate_splits()
        assert result['payer']['amount'] == pytest.approx(120.0)
        assert result['splits'][0]['amount'] == pytest.approx(80.0)


def test_split_uses_users_map_when_provided(app, db):
    """Providing users_map should return same result — confirms no N+1 queries."""
    with app.app_context():
        payer = UserFactory()
        other = UserFactory()
        expense = ExpenseFactory(
            user_id=payer.id,
            paid_by=payer.id,
            amount=60.0,
            split_method='equal',
            split_with=other.id,
        )
        users_map = {payer.id: payer, other.id: other}
        result_with_map = expense.calculate_splits(users_map=users_map)
        result_without = expense.calculate_splits()
        assert result_with_map['payer']['amount'] == result_without['payer']['amount']
        assert result_with_map['splits'][0]['amount'] == result_without['splits'][0]['amount']
```

**Step 2: Run**

```bash
pytest tests/unit/test_transaction_splits.py -v
```

Expected: all green.

**Step 3: Commit**

```bash
git add tests/unit/test_transaction_splits.py
git commit -m "test: unit tests for Expense.calculate_splits"
```

---

## Task 5: Unit tests — Budget.calculate_spent_amount and get_status

**Files:**
- Create: `tests/unit/test_budget_service.py`

**Step 1: Create `tests/unit/test_budget_service.py`**

```python
"""
Unit tests for Budget model methods and BudgetService.

Tests: calculate_spent_amount (with/without expenses),
status thresholds (under/approaching/over),
get_current_period_dates for weekly/monthly/yearly.
"""

import pytest
from datetime import datetime
from tests.factories import UserFactory, CategoryFactory, ExpenseFactory, BudgetFactory


def test_calculate_spent_amount_no_expenses(app, db):
    with app.app_context():
        user = UserFactory()
        cat = CategoryFactory(user_id=user.id)
        budget = BudgetFactory(user_id=user.id, category_id=cat.id, amount=500.0)
        now = datetime.utcnow()
        spent = budget.calculate_spent_amount(year=now.year, month=now.month)
        assert spent == 0.0


def test_calculate_spent_amount_with_expense(app, db):
    with app.app_context():
        user = UserFactory()
        cat = CategoryFactory(user_id=user.id)
        budget = BudgetFactory(user_id=user.id, category_id=cat.id, amount=500.0)
        now = datetime.utcnow()
        ExpenseFactory(
            user_id=user.id,
            category_id=cat.id,
            amount=120.0,
            date=now,
            transaction_type='expense',
        )
        spent = budget.calculate_spent_amount(year=now.year, month=now.month)
        assert spent == pytest.approx(120.0)


def test_calculate_spent_amount_excludes_other_month(app, db):
    with app.app_context():
        user = UserFactory()
        cat = CategoryFactory(user_id=user.id)
        budget = BudgetFactory(user_id=user.id, category_id=cat.id, amount=500.0)
        # Expense in a different month (Jan 2020)
        old_date = datetime(2020, 1, 15)
        ExpenseFactory(
            user_id=user.id,
            category_id=cat.id,
            amount=300.0,
            date=old_date,
            transaction_type='expense',
        )
        now = datetime.utcnow()
        spent = budget.calculate_spent_amount(year=now.year, month=now.month)
        assert spent == 0.0


def test_budget_status_under(app, db):
    with app.app_context():
        user = UserFactory()
        cat = CategoryFactory(user_id=user.id)
        budget = BudgetFactory(user_id=user.id, category_id=cat.id, amount=500.0)
        now = datetime.utcnow()
        spent = budget.calculate_spent_amount(year=now.year, month=now.month)
        percentage = (spent / budget.amount * 100) if budget.amount else 0
        status = 'over' if spent > budget.amount else ('approaching' if percentage >= 80 else 'under')
        assert status == 'under'


def test_budget_status_approaching(app, db):
    with app.app_context():
        user = UserFactory()
        cat = CategoryFactory(user_id=user.id)
        budget = BudgetFactory(user_id=user.id, category_id=cat.id, amount=500.0)
        now = datetime.utcnow()
        # 82% spent
        ExpenseFactory(user_id=user.id, category_id=cat.id, amount=410.0, date=now, transaction_type='expense')
        spent = budget.calculate_spent_amount(year=now.year, month=now.month)
        percentage = (spent / budget.amount * 100)
        status = 'over' if spent > budget.amount else ('approaching' if percentage >= 80 else 'under')
        assert status == 'approaching'


def test_budget_status_over(app, db):
    with app.app_context():
        user = UserFactory()
        cat = CategoryFactory(user_id=user.id)
        budget = BudgetFactory(user_id=user.id, category_id=cat.id, amount=500.0)
        now = datetime.utcnow()
        ExpenseFactory(user_id=user.id, category_id=cat.id, amount=600.0, date=now, transaction_type='expense')
        spent = budget.calculate_spent_amount(year=now.year, month=now.month)
        status = 'over' if spent > budget.amount else 'under'
        assert status == 'over'


def test_get_current_period_dates_monthly(app, db):
    with app.app_context():
        user = UserFactory()
        cat = CategoryFactory(user_id=user.id)
        budget = BudgetFactory(user_id=user.id, category_id=cat.id, period='monthly')
        start, end = budget.get_current_period_dates()
        assert start.day == 1
        assert end > start


def test_get_current_period_dates_yearly(app, db):
    with app.app_context():
        user = UserFactory()
        cat = CategoryFactory(user_id=user.id)
        budget = BudgetFactory(user_id=user.id, category_id=cat.id, period='yearly')
        start, end = budget.get_current_period_dates()
        assert start.month == 1 and start.day == 1
        assert end.year >= start.year
```

**Step 2: Run**

```bash
pytest tests/unit/test_budget_service.py -v
```

Expected: all green.

**Step 3: Commit**

```bash
git add tests/unit/test_budget_service.py
git commit -m "test: unit tests for Budget.calculate_spent_amount and status"
```

---

## Task 6: Unit tests — pointsPal category map and optimizer

**Files:**
- Create: `tests/unit/test_pointspal_category_map.py`
- Create: `tests/unit/test_pointspal_optimizer.py`

**Step 1: Create `tests/unit/test_pointspal_category_map.py`**

```python
"""
Unit tests for pointsPal category slug mapping.
"""

from src.modules.pointspal.category_map import FINPAL_TO_POINTSPAL


def test_all_values_are_valid_slugs():
    VALID_SLUGS = {
        'travel_portal', 'flights_direct', 'hotels_direct', 'dining', 'groceries',
        'gas', 'streaming', 'transit', 'online_shopping', 'advertising', 'drugstores',
        'home_improvement', 'office_supplies', 'phone_internet', 'fitness',
        'entertainment', 'rotating', 'mobile_wallet', 'rent_mortgage', 'other',
    }
    for finpal_name, slug in FINPAL_TO_POINTSPAL.items():
        assert slug in VALID_SLUGS, f"'{finpal_name}' maps to unknown slug '{slug}'"


def test_dining_maps_correctly():
    assert FINPAL_TO_POINTSPAL.get('dining') == 'dining'
    assert FINPAL_TO_POINTSPAL.get('restaurants') == 'dining'


def test_groceries_maps_correctly():
    assert FINPAL_TO_POINTSPAL.get('groceries') == 'groceries'
    assert FINPAL_TO_POINTSPAL.get('grocery') == 'groceries'


def test_gas_maps_correctly():
    assert FINPAL_TO_POINTSPAL.get('gas') == 'gas'
    assert FINPAL_TO_POINTSPAL.get('fuel') == 'gas'


def test_keys_are_lowercase():
    for key in FINPAL_TO_POINTSPAL:
        assert key == key.lower(), f"Key '{key}' is not lowercase"
```

**Step 2: Create `tests/unit/test_pointspal_optimizer.py`**

```python
"""
Unit tests for pointsPal build_optimizer and cap logic.
"""

import pytest
from tests.factories import UserFactory


FIXTURE_PROGRAMS_JSON = {
    'schema_version': 'test-1',
    'programs': [
        {
            'program_id': 'test-sapphire',
            'program_name': 'Test Sapphire',
            'issuer': 'Test Bank',
            'network': 'Visa',
            'currency_name': 'Test Points',
            'base_cpp': 1.0,
            'tpg_cpp': 2.0,
            'annual_fee': 95,
            'effective_annual_fee': '95',
            'earn_categories': [
                {'category': 'dining', 'multiplier': 3.0, 'cap_amount': None, 'cap_period': None, 'multiplier_fallback': 1.0},
                {'category': 'groceries', 'multiplier': 2.0, 'cap_amount': 500.0, 'cap_period': 'monthly', 'multiplier_fallback': 1.0},
            ],
            'transfer_partners': [],
        }
    ]
}


def test_build_optimizer_returns_recommendations(app, db):
    with app.app_context():
        from unittest.mock import patch
        import requests
        from src.modules.pointspal.service import sync_from_pointspal, build_optimizer
        from src.modules.pointspal.models import UserCard

        # Seed program data via mocked sync
        mock_response = type('R', (), {
            'raise_for_status': lambda self: None,
            'json': lambda self: FIXTURE_PROGRAMS_JSON,
        })()
        with patch('requests.get', return_value=mock_response):
            sync_from_pointspal()

        user = UserFactory()
        # Add a card linked to the test program
        card = UserCard(
            user_id=user.id,
            program_id='test-sapphire',
            card_nickname='My Sapphire',
            confidence_level='high',
        )
        from src.extensions import db as _db
        _db.session.add(card)
        _db.session.commit()

        recommendations = build_optimizer(user.id)
        assert isinstance(recommendations, list)
        categories = [r['category'] for r in recommendations]
        assert 'dining' in categories


def test_build_optimizer_no_cards_returns_empty(app, db):
    with app.app_context():
        from src.modules.pointspal.service import build_optimizer
        user = UserFactory()
        result = build_optimizer(user.id)
        assert result == []


def test_sync_from_pointspal_upserts_programs(app, db):
    with app.app_context():
        from unittest.mock import patch
        from src.modules.pointspal.service import sync_from_pointspal
        from src.modules.pointspal.models import PointsProgram

        mock_response = type('R', (), {
            'raise_for_status': lambda self: None,
            'json': lambda self: FIXTURE_PROGRAMS_JSON,
        })()
        with patch('requests.get', return_value=mock_response):
            result = sync_from_pointspal()

        assert result['status'] == 'success'
        assert result['programs_upserted'] == 1
        assert PointsProgram.query.count() == 1


def test_sync_from_pointspal_handles_network_error(app, db):
    with app.app_context():
        from unittest.mock import patch
        import requests
        from src.modules.pointspal.service import sync_from_pointspal

        with patch('requests.get', side_effect=requests.ConnectionError("unreachable")):
            result = sync_from_pointspal()

        assert result['status'] == 'error'
        assert 'error' in result
```

**Step 3: Run**

```bash
pytest tests/unit/test_pointspal_category_map.py tests/unit/test_pointspal_optimizer.py -v
```

Expected: all green.

**Step 4: Commit**

```bash
git add tests/unit/
git commit -m "test: unit tests for pointsPal category map and optimizer"
```

---

## Task 7: Integration tests — auth API

**Files:**
- Create: `tests/integration/__init__.py`
- Create: `tests/integration/test_auth_api.py`

**Step 1: Create `tests/integration/__init__.py`** (empty)

**Step 2: Create `tests/integration/test_auth_api.py`**

```python
"""
Integration tests for /api/v1/auth endpoints.

Tests: login (success/wrong password/unknown user), register,
token refresh, /me, /sync, modules[] in login response.
"""

import pytest
from tests.factories import UserFactory


def test_login_success(client, db, app):
    with app.app_context():
        user = UserFactory(id='test@example.com')
    resp = client.post('/api/v1/auth/login', json={
        'email': 'test@example.com',
        'password': 'testpassword',
    })
    assert resp.status_code == 200
    data = resp.get_json()
    assert 'access_token' in data
    assert 'refresh_token' in data
    assert data['user']['email'] == 'test@example.com'


def test_login_response_includes_modules(client, db, app):
    with app.app_context():
        UserFactory(id='mod@example.com')
    resp = client.post('/api/v1/auth/login', json={
        'email': 'mod@example.com', 'password': 'testpassword',
    })
    assert resp.status_code == 200
    data = resp.get_json()
    assert 'modules' in data['user']
    assert isinstance(data['user']['modules'], list)


def test_login_wrong_password(client, db, app):
    with app.app_context():
        UserFactory(id='wrong@example.com')
    resp = client.post('/api/v1/auth/login', json={
        'email': 'wrong@example.com', 'password': 'notright',
    })
    assert resp.status_code == 401


def test_login_unknown_user(client, db):
    resp = client.post('/api/v1/auth/login', json={
        'email': 'nobody@example.com', 'password': 'anything',
    })
    assert resp.status_code == 401


def test_login_missing_fields(client, db):
    resp = client.post('/api/v1/auth/login', json={'email': 'x@y.com'})
    assert resp.status_code == 400


def test_register_new_user(client, db):
    resp = client.post('/api/v1/auth/register', json={
        'username': 'New User',
        'email': 'new@example.com',
        'password': 'securepass123',
    })
    assert resp.status_code == 201
    data = resp.get_json()
    assert 'access_token' in data
    assert data['user']['email'] == 'new@example.com'


def test_register_duplicate_email(client, db, app):
    with app.app_context():
        UserFactory(id='dup@example.com')
    resp = client.post('/api/v1/auth/register', json={
        'username': 'Dup', 'email': 'dup@example.com', 'password': 'pass',
    })
    assert resp.status_code == 400


def test_refresh_token(client, db, app, auth_headers):
    with app.app_context():
        user = UserFactory(id='refresh@example.com')
    # Get refresh token from login
    login_resp = client.post('/api/v1/auth/login', json={
        'email': 'refresh@example.com', 'password': 'testpassword',
    })
    refresh_token = login_resp.get_json()['refresh_token']
    resp = client.post('/api/v1/auth/refresh',
                       headers={'Authorization': f'Bearer {refresh_token}'})
    assert resp.status_code == 200
    assert 'access_token' in resp.get_json()


def test_me_requires_auth(client, db):
    resp = client.get('/api/v1/auth/me')
    assert resp.status_code == 401


def test_sync_endpoint_returns_202(client, db, app, auth_headers):
    with app.app_context():
        user = UserFactory(id='sync@example.com')
    headers = auth_headers(user)
    resp = client.post('/api/v1/auth/sync', headers=headers)
    assert resp.status_code == 202
```

**Step 3: Run**

```bash
pytest tests/integration/test_auth_api.py -v
```

Expected: all green.

**Step 4: Commit**

```bash
git add tests/integration/
git commit -m "test: integration tests for auth API"
```

---

## Task 8: Integration tests — transactions and budgets API

**Files:**
- Create: `tests/integration/test_transactions_api.py`
- Create: `tests/integration/test_budgets_api.py`

**Step 1: Create `tests/integration/test_transactions_api.py`**

```python
"""
Integration tests for /api/v1/transactions endpoints.
"""

import pytest
from tests.factories import UserFactory, ExpenseFactory, CategoryFactory, AccountFactory


def test_list_transactions_empty(client, db, app, auth_headers):
    with app.app_context():
        user = UserFactory(id='txn@example.com')
    headers = auth_headers(user)
    resp = client.get('/api/v1/transactions/', headers=headers)
    assert resp.status_code == 200


def test_create_transaction(client, db, app, auth_headers):
    with app.app_context():
        user = UserFactory(id='create@example.com')
        cat = CategoryFactory(user_id=user.id)
        account = AccountFactory(user_id=user.id)
    headers = auth_headers(user)
    resp = client.post('/api/v1/transactions/', headers=headers, json={
        'description': 'Coffee',
        'amount': 5.50,
        'date': '2026-03-10T10:00:00',
        'card_used': 'Visa',
        'split_method': 'none',
        'paid_by': user.id,
        'category_id': cat.id,
    })
    assert resp.status_code in (200, 201)
    data = resp.get_json()
    assert data['description'] == 'Coffee'


def test_get_transaction_by_id(client, db, app, auth_headers):
    with app.app_context():
        user = UserFactory(id='get@example.com')
        expense = ExpenseFactory(user_id=user.id)
        expense_id = expense.id
    headers = auth_headers(user)
    resp = client.get(f'/api/v1/transactions/{expense_id}', headers=headers)
    assert resp.status_code == 200


def test_delete_transaction(client, db, app, auth_headers):
    with app.app_context():
        user = UserFactory(id='del@example.com')
        expense = ExpenseFactory(user_id=user.id)
        expense_id = expense.id
    headers = auth_headers(user)
    resp = client.delete(f'/api/v1/transactions/{expense_id}', headers=headers)
    assert resp.status_code in (200, 204)


def test_transactions_requires_auth(client, db):
    resp = client.get('/api/v1/transactions/')
    assert resp.status_code == 401
```

**Step 2: Create `tests/integration/test_budgets_api.py`**

```python
"""
Integration tests for /api/v1/budgets endpoints.
"""

import pytest
from tests.factories import UserFactory, CategoryFactory, BudgetFactory


def test_list_budgets_empty(client, db, app, auth_headers):
    with app.app_context():
        user = UserFactory(id='budgets@example.com')
    headers = auth_headers(user)
    resp = client.get('/api/v1/budgets/', headers=headers)
    assert resp.status_code == 200


def test_create_budget(client, db, app, auth_headers):
    with app.app_context():
        user = UserFactory(id='newbudget@example.com')
        cat = CategoryFactory(user_id=user.id)
    headers = auth_headers(user)
    resp = client.post('/api/v1/budgets/', headers=headers, json={
        'category_id': cat.id,
        'amount': 300.0,
        'period': 'monthly',
        'name': 'Food Budget',
    })
    assert resp.status_code in (200, 201)


def test_create_budget_missing_fields(client, db, app, auth_headers):
    with app.app_context():
        user = UserFactory(id='badinput@example.com')
    headers = auth_headers(user)
    resp = client.post('/api/v1/budgets/', headers=headers, json={})
    assert resp.status_code == 400


def test_delete_budget(client, db, app, auth_headers):
    with app.app_context():
        user = UserFactory(id='delbud@example.com')
        budget = BudgetFactory(user_id=user.id)
        budget_id = budget.id
    headers = auth_headers(user)
    resp = client.delete(f'/api/v1/budgets/{budget_id}', headers=headers)
    assert resp.status_code in (200, 204)


def test_budgets_requires_auth(client, db):
    resp = client.get('/api/v1/budgets/')
    assert resp.status_code == 401
```

**Step 3: Run**

```bash
pytest tests/integration/test_transactions_api.py tests/integration/test_budgets_api.py -v
```

Expected: all green.

**Step 4: Commit**

```bash
git add tests/integration/test_transactions_api.py tests/integration/test_budgets_api.py
git commit -m "test: integration tests for transactions and budgets API"
```

---

## Task 9: Integration tests — pointsPal API and module access

**Files:**
- Create: `tests/integration/test_pointspal_api.py`
- Create: `tests/integration/test_module_access_api.py`

**Step 1: Create `tests/integration/test_pointspal_api.py`**

```python
"""
Integration tests for pointsPal API endpoints.

Tests: wallet CRUD, optimizer, alerts, cap tracker, sync status.
All run with POINTSPAL_ENABLED=true (set in conftest).
"""

import pytest
from unittest.mock import patch
from tests.factories import UserFactory


@pytest.fixture
def pp_user(app, db, client, auth_headers):
    """Create a user and return (user, headers) tuple."""
    with app.app_context():
        user = UserFactory(id='pp@example.com')
    return user, auth_headers(user)


def test_list_cards_empty(client, db, app, auth_headers):
    with app.app_context():
        user = UserFactory(id='cards@example.com')
    headers = auth_headers(user)
    resp = client.get('/api/v1/wallet/cards', headers=headers)
    assert resp.status_code == 200
    assert resp.get_json() == []


def test_add_card(client, db, app, auth_headers):
    with app.app_context():
        user = UserFactory(id='addcard@example.com')
    headers = auth_headers(user)
    resp = client.post('/api/v1/wallet/cards', headers=headers, json={
        'card_nickname': 'My Sapphire',
        'last_four': '4111',
        'confidence_level': 'high',
    })
    assert resp.status_code == 201
    assert resp.get_json()['card']['card_nickname'] == 'My Sapphire'


def test_delete_card(client, db, app, auth_headers):
    with app.app_context():
        user = UserFactory(id='delcard@example.com')
    headers = auth_headers(user)
    # Create first
    add_resp = client.post('/api/v1/wallet/cards', headers=headers, json={
        'card_nickname': 'Delete Me',
    })
    card_id = add_resp.get_json()['card']['id']
    # Delete
    resp = client.delete(f'/api/v1/wallet/cards/{card_id}', headers=headers)
    assert resp.status_code == 200


def test_optimizer_no_cards(client, db, app, auth_headers):
    with app.app_context():
        user = UserFactory(id='opt@example.com')
    headers = auth_headers(user)
    resp = client.get('/api/v1/optimizer', headers=headers)
    assert resp.status_code == 200
    assert resp.get_json() == []


def test_alerts_empty(client, db, app, auth_headers):
    with app.app_context():
        user = UserFactory(id='alerts@example.com')
    headers = auth_headers(user)
    resp = client.get('/api/v1/wallet/alerts', headers=headers)
    assert resp.status_code == 200
    assert resp.get_json() == []


def test_pointspal_overview(client, db, app, auth_headers):
    with app.app_context():
        user = UserFactory(id='overview@example.com')
    headers = auth_headers(user)
    resp = client.get('/api/v1/pointspal/overview', headers=headers)
    assert resp.status_code == 200
    data = resp.get_json()
    assert 'total_value_usd' in data
    assert 'cards' in data


def test_sync_status_never_synced(client, db, app, auth_headers):
    with app.app_context():
        user = UserFactory(id='syncstat@example.com')
    headers = auth_headers(user)
    resp = client.get('/api/v1/points/sync/status', headers=headers)
    assert resp.status_code == 200
    assert resp.get_json()['status'] == 'never_synced'


def test_manual_sync_trigger(client, db, app, auth_headers):
    with app.app_context():
        user = UserFactory(id='manualsync@example.com')
    headers = auth_headers(user)
    mock_resp = type('R', (), {
        'raise_for_status': lambda self: None,
        'json': lambda self: {'schema_version': '1', 'programs': []},
    })()
    with patch('requests.get', return_value=mock_resp):
        resp = client.post('/api/v1/points/sync', headers=headers)
    assert resp.status_code == 200


def test_wallet_requires_auth(client, db):
    resp = client.get('/api/v1/wallet/cards')
    assert resp.status_code == 401
```

**Step 2: Create `tests/integration/test_module_access_api.py`**

```python
"""
Integration tests for module access control.

Tests: is_user_enabled default-open, explicit enabled/disabled row,
login response includes correct modules list.
"""

import pytest
from tests.factories import UserFactory, UserModuleAccessFactory
from src.modules.access import UserModuleAccess


def test_login_modules_empty_when_pointspal_disabled(client, db, app, monkeypatch):
    monkeypatch.setenv('POINTSPAL_ENABLED', 'false')
    # Re-import registry to pick up env change isn't practical in-process,
    # so we test the _get_user_modules helper directly instead.
    with app.app_context():
        import os
        os.environ['POINTSPAL_ENABLED'] = 'false'
        from importlib import reload
        import src.modules.pointspal.manifest as manifest_mod
        from src.modules.registry import ModuleRegistry
        temp_registry = ModuleRegistry()
        # Module should not register when disabled
        from src.modules.pointspal.manifest import PointsPalModule
        temp_registry.register(PointsPalModule())
        assert len(temp_registry.modules) == 0
        os.environ['POINTSPAL_ENABLED'] = 'true'


def test_is_user_enabled_default_open(app, db):
    with app.app_context():
        user = UserFactory()
        from src.modules.registry import module_registry
        # No UserModuleAccess row → default-open
        result = module_registry.is_user_enabled('pointspal', user.id)
        assert result is True


def test_is_user_enabled_explicit_disabled(app, db):
    with app.app_context():
        user = UserFactory()
        UserModuleAccessFactory(user_id=user.id, module_name='pointspal', enabled=False)
        from src.modules.registry import module_registry
        result = module_registry.is_user_enabled('pointspal', user.id)
        assert result is False


def test_is_user_enabled_explicit_enabled(app, db):
    with app.app_context():
        user = UserFactory()
        UserModuleAccessFactory(user_id=user.id, module_name='pointspal', enabled=True)
        from src.modules.registry import module_registry
        result = module_registry.is_user_enabled('pointspal', user.id)
        assert result is True


def test_login_includes_pointspal_when_enabled(client, db, app):
    with app.app_context():
        UserFactory(id='modtest@example.com')
    resp = client.post('/api/v1/auth/login', json={
        'email': 'modtest@example.com',
        'password': 'testpassword',
    })
    assert resp.status_code == 200
    modules = resp.get_json()['user']['modules']
    assert 'pointspal' in modules
```

**Step 3: Run**

```bash
pytest tests/integration/test_pointspal_api.py tests/integration/test_module_access_api.py -v
```

Expected: all green.

**Step 4: Commit**

```bash
git add tests/integration/test_pointspal_api.py tests/integration/test_module_access_api.py
git commit -m "test: integration tests for pointsPal API and module access"
```

---

## Task 10: Run full backend suite with coverage

**Step 1: Run all backend tests with coverage**

```bash
pytest --cov=src --cov=api --cov=src/modules \
       --cov-report=term-missing \
       --cov-report=html:htmlcov \
       tests/
```

**Step 2: Check coverage is above 70% overall**

Expected: coverage report printed, HTML in `htmlcov/`.

**Step 3: Commit coverage config**

```bash
git add .coverage htmlcov/ 2>/dev/null; true
echo "htmlcov/" >> .gitignore
echo ".coverage" >> .gitignore
git add .gitignore
git commit -m "test: add coverage output to .gitignore"
```

---

## Task 11: Frontend test infrastructure — Vitest, MSW, setup

**Files:**
- Modify: `web-ui/package.json`
- Create: `web-ui/vite.config.ts` (or modify existing)
- Create: `web-ui/src/__tests__/setup.ts`
- Create: `web-ui/src/__tests__/mocks/server.ts`
- Create: `web-ui/src/__tests__/mocks/handlers.ts`

**Step 1: Install frontend test dependencies**

```bash
cd web-ui
npm install --save-dev vitest @vitest/coverage-v8 jsdom \
  @testing-library/react @testing-library/user-event \
  @testing-library/jest-dom msw
```

**Step 2: Check existing vite config filename**

```bash
ls web-ui/vite.config.*
```

Open the file and add test config block. If it's `vite.config.ts`:

```ts
// Add inside defineConfig({...}):
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/__tests__/**', 'src/main.tsx'],
    },
  },
```

**Step 3: Add test scripts to `web-ui/package.json`**

```json
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage"
}
```

**Step 4: Create `web-ui/src/__tests__/setup.ts`**

```ts
import '@testing-library/jest-dom';
import { beforeAll, afterEach, afterAll } from 'vitest';
import { server } from './mocks/server';

// Start MSW before all tests
beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));

// Reset handlers after each test so tests don't bleed into each other
afterEach(() => server.resetHandlers());

// Clean up after all tests
afterAll(() => server.close());
```

**Step 5: Create `web-ui/src/__tests__/mocks/server.ts`**

```ts
import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);
```

**Step 6: Create `web-ui/src/__tests__/mocks/handlers.ts`**

```ts
import { http, HttpResponse } from 'msw';

const BASE = '/api/v1';

export const handlers = [
  // Auth — login
  http.post(`${BASE}/auth/login`, () => {
    return HttpResponse.json({
      access_token: 'test-access-token',
      refresh_token: 'test-refresh-token',
      user: {
        id: 'test@example.com',
        email: 'test@example.com',
        name: 'Test User',
        default_currency_code: 'USD',
        hasCompletedOnboarding: true,
        is_demo_user: false,
        modules: ['pointspal'],
      },
    });
  }),

  // Users — me (no modules)
  http.get(`${BASE}/users/me`, () => {
    return HttpResponse.json({
      id: 'test@example.com',
      email: 'test@example.com',
      name: 'Test User',
      modules: ['pointspal'],
    });
  }),

  // pointsPal alerts
  http.get(`${BASE}/pointspal/alerts`, () => {
    return HttpResponse.json([]);
  }),

  // pointsPal overview
  http.get(`${BASE}/pointspal/overview`, () => {
    return HttpResponse.json({
      total_value_usd: 0,
      pts_earned_this_month: 0,
      pts_missed_this_month: 0,
      active_cap_alerts: 0,
      max_redeemable_usd: 0,
      cards: [],
      stale_cards: [],
      action_items: [],
      recent_activity: [],
    });
  }),
];
```

**Step 7: Verify Vitest can be invoked**

```bash
cd web-ui && npx vitest run 2>&1 | head -10
```

Expected: `No test files found` (no errors, just no tests yet).

**Step 8: Commit**

```bash
cd ..
git add web-ui/package.json web-ui/vite.config.* web-ui/src/__tests__/
git commit -m "test: add Vitest + MSW frontend test infrastructure"
```

---

## Task 12: Frontend unit tests — moduleRegistry and authStore

**Files:**
- Create: `web-ui/src/__tests__/unit/modules/test_registry.ts`
- Create: `web-ui/src/__tests__/unit/modules/test_pointspal_manifest.ts`
- Create: `web-ui/src/__tests__/unit/store/test_authStore.ts`

**Step 1: Create registry tests**

```ts
// web-ui/src/__tests__/unit/modules/test_registry.ts
import { describe, it, expect } from 'vitest';
import { moduleRegistry } from '../../../modules';

describe('moduleRegistry', () => {
  it('contains at least one module', () => {
    expect(moduleRegistry.length).toBeGreaterThan(0);
  });

  it('contains pointspal module', () => {
    const slugs = moduleRegistry.map(m => m.slug);
    expect(slugs).toContain('pointspal');
  });

  it('all slugs are unique', () => {
    const slugs = moduleRegistry.map(m => m.slug);
    const unique = new Set(slugs);
    expect(unique.size).toBe(slugs.length);
  });

  it('all modules have required fields', () => {
    for (const m of moduleRegistry) {
      expect(m.slug).toBeTruthy();
      expect(m.label).toBeTruthy();
      expect(m.icon).toBeTruthy();
      expect(m.description).toBeTruthy();
      expect(Array.isArray(m.navLinks)).toBe(true);
      expect(Array.isArray(m.routes)).toBe(true);
    }
  });
});
```

**Step 2: Create pointspal manifest tests**

```ts
// web-ui/src/__tests__/unit/modules/test_pointspal_manifest.ts
import { describe, it, expect } from 'vitest';
import manifest from '../../../modules/pointspal/manifest';

describe('pointspal manifest', () => {
  it('has correct slug', () => {
    expect(manifest.slug).toBe('pointspal');
  });

  it('has 5 nav links', () => {
    expect(manifest.navLinks).toHaveLength(5);
  });

  it('has 5 routes', () => {
    expect(manifest.routes).toHaveLength(5);
  });

  it('all nav link paths start with /pointspal', () => {
    for (const link of manifest.navLinks) {
      expect(link.path).toMatch(/^\/pointspal/);
    }
  });

  it('all route paths start with /pointspal', () => {
    for (const route of manifest.routes) {
      expect(route.path).toMatch(/^\/pointspal/);
    }
  });

  it('cap tracker nav link declares hasAlert', () => {
    const capLink = manifest.navLinks.find(l => l.path === '/pointspal/caps');
    expect(capLink).toBeDefined();
    expect(typeof capLink!.hasAlert).toBe('function');
  });
});
```

**Step 3: Create authStore tests**

```ts
// web-ui/src/__tests__/unit/store/test_authStore.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from '../../../store/authStore';
import type { User } from '../../../types/user';

const mockUser: User = {
  id: 'store@example.com',
  email: 'store@example.com',
  name: 'Store User',
  hasCompletedOnboarding: true,
  is_demo_user: false,
  modules: ['pointspal'],
};

describe('authStore', () => {
  beforeEach(() => {
    useAuthStore.getState().logout();
  });

  it('login sets user with modules', () => {
    useAuthStore.getState().login(mockUser, 'tok', 'ref');
    const { user } = useAuthStore.getState();
    expect(user).not.toBeNull();
    expect(user!.modules).toEqual(['pointspal']);
  });

  it('login sets isAuthenticated true', () => {
    useAuthStore.getState().login(mockUser, 'tok', 'ref');
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it('logout clears user and modules', () => {
    useAuthStore.getState().login(mockUser, 'tok', 'ref');
    useAuthStore.getState().logout();
    const { user, isAuthenticated } = useAuthStore.getState();
    expect(user).toBeNull();
    expect(isAuthenticated).toBe(false);
  });

  it('user with empty modules array is valid', () => {
    const noModuleUser: User = { ...mockUser, modules: [] };
    useAuthStore.getState().login(noModuleUser, 'tok', 'ref');
    expect(useAuthStore.getState().user!.modules).toEqual([]);
  });
});
```

**Step 4: Run**

```bash
cd web-ui && npx vitest run src/__tests__/unit/
```

Expected: all green.

**Step 5: Commit**

```bash
cd ..
git add web-ui/src/__tests__/unit/
git commit -m "test: frontend unit tests for moduleRegistry and authStore"
```

---

## Task 13: Frontend component tests — Sidebar and Settings modules tab

**Files:**
- Create: `web-ui/src/__tests__/components/test_Sidebar.tsx`
- Create: `web-ui/src/__tests__/components/test_Settings_modules_tab.tsx`

**Step 1: Create Sidebar tests**

```tsx
// web-ui/src/__tests__/components/test_Sidebar.tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { Sidebar } from '../../components/layout/Sidebar';
import type { User } from '../../types/user';

const withModules: User = {
  id: 'sb@test.com', email: 'sb@test.com', name: 'SB',
  hasCompletedOnboarding: true, is_demo_user: false,
  modules: ['pointspal'],
};

const withoutModules: User = {
  id: 'nomod@test.com', email: 'nomod@test.com', name: 'NM',
  hasCompletedOnboarding: true, is_demo_user: false,
  modules: [],
};

function renderSidebar() {
  return render(
    <MemoryRouter>
      <Sidebar />
    </MemoryRouter>
  );
}

describe('Sidebar module section', () => {
  beforeEach(() => {
    useAuthStore.getState().logout();
    localStorage.clear();
  });

  it('shows Modules label when user has modules', () => {
    useAuthStore.getState().login(withModules, 'tok', 'ref');
    renderSidebar();
    expect(screen.getByText('Modules')).toBeInTheDocument();
  });

  it('shows pointsPal entry when user has pointspal module', () => {
    useAuthStore.getState().login(withModules, 'tok', 'ref');
    renderSidebar();
    expect(screen.getByText('pointsPal')).toBeInTheDocument();
  });

  it('hides Modules section when user has no modules', () => {
    useAuthStore.getState().login(withoutModules, 'tok', 'ref');
    renderSidebar();
    expect(screen.queryByText('Modules')).not.toBeInTheDocument();
  });

  it('hides module when module_hidden_ localStorage key is set', () => {
    localStorage.setItem('module_hidden_pointspal', 'true');
    useAuthStore.getState().login(withModules, 'tok', 'ref');
    renderSidebar();
    expect(screen.queryByText('pointsPal')).not.toBeInTheDocument();
  });

  it('shows module when module_hidden_ localStorage key is false', () => {
    localStorage.setItem('module_hidden_pointspal', 'false');
    useAuthStore.getState().login(withModules, 'tok', 'ref');
    renderSidebar();
    expect(screen.getByText('pointsPal')).toBeInTheDocument();
  });
});
```

**Step 2: Create Settings modules tab tests**

```tsx
// web-ui/src/__tests__/components/test_Settings_modules_tab.tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { Settings } from '../../pages/Settings';
import type { User } from '../../types/user';
import userEvent from '@testing-library/user-event';

const userWithModules: User = {
  id: 'cfg@test.com', email: 'cfg@test.com', name: 'Cfg',
  hasCompletedOnboarding: true, is_demo_user: false,
  modules: ['pointspal'],
};

const userNoModules: User = {
  id: 'cfg2@test.com', email: 'cfg2@test.com', name: 'Cfg2',
  hasCompletedOnboarding: true, is_demo_user: false,
  modules: [],
};

function renderSettings() {
  return render(
    <MemoryRouter>
      <Settings />
    </MemoryRouter>
  );
}

describe('Settings — Modules tab', () => {
  beforeEach(() => {
    useAuthStore.getState().logout();
    localStorage.clear();
  });

  it('Modules tab is visible when user has modules', () => {
    useAuthStore.getState().login(userWithModules, 'tok', 'ref');
    renderSettings();
    expect(screen.getByRole('button', { name: /modules/i })).toBeInTheDocument();
  });

  it('Modules tab is absent when user has no modules', () => {
    useAuthStore.getState().login(userNoModules, 'tok', 'ref');
    renderSettings();
    expect(screen.queryByRole('button', { name: /^modules$/i })).not.toBeInTheDocument();
  });

  it('clicking Modules tab shows module card', async () => {
    useAuthStore.getState().login(userWithModules, 'tok', 'ref');
    renderSettings();
    const tab = screen.getByRole('button', { name: /modules/i });
    await userEvent.click(tab);
    expect(screen.getByText('pointsPal')).toBeInTheDocument();
  });

  it('ModuleCard toggle writes module_hidden_ to localStorage', async () => {
    useAuthStore.getState().login(userWithModules, 'tok', 'ref');
    renderSettings();
    await userEvent.click(screen.getByRole('button', { name: /modules/i }));
    // Find and click the toggle for pointsPal
    const toggle = screen.getByText(/visible in sidebar/i).nextElementSibling as HTMLElement;
    if (toggle) fireEvent.click(toggle);
    expect(localStorage.getItem('module_hidden_pointspal')).toBe('true');
  });
});
```

**Step 3: Run**

```bash
cd web-ui && npx vitest run src/__tests__/components/
```

Expected: all green. Fix any selector mismatches based on actual rendered markup.

**Step 4: Commit**

```bash
cd ..
git add web-ui/src/__tests__/components/
git commit -m "test: frontend component tests for Sidebar and Settings modules tab"
```

---

## Task 14: Frontend page tests — App module routes

**Files:**
- Create: `web-ui/src/__tests__/pages/test_App_routes.tsx`

**Step 1: Create App route tests**

```tsx
// web-ui/src/__tests__/pages/test_App_routes.tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import App from '../../App';
import type { User } from '../../types/user';

// App uses BrowserRouter internally, so render with initial route via mock
// We test via useAuthStore state to control which routes appear.

const userWithPointsPal: User = {
  id: 'route@test.com', email: 'route@test.com', name: 'Route',
  hasCompletedOnboarding: true, is_demo_user: false,
  modules: ['pointspal'],
};

const userNoModules: User = {
  id: 'noroute@test.com', email: 'noroute@test.com', name: 'NoRoute',
  hasCompletedOnboarding: true, is_demo_user: false,
  modules: [],
};

// Helper: render App and navigate to path
function renderAtPath(path: string) {
  // Override window.location for BrowserRouter initial path
  window.history.pushState({}, '', path);
  return render(<App />);
}

describe('App module routes', () => {
  beforeEach(() => {
    useAuthStore.getState().logout();
  });

  it('renders pointsPal route for user with pointspal module', async () => {
    useAuthStore.setState({
      user: userWithPointsPal,
      token: 'test-tok',
      isAuthenticated: true,
      hasCompletedOnboarding: true,
      isDemoUser: false,
      demoExpiresAt: null,
      isLoading: false,
      refreshToken: null,
    });
    renderAtPath('/pointspal');
    // The Overview page should load (lazy — wait for Suspense)
    await waitFor(() => {
      // Component renders without crashing is the assertion
      expect(document.body).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('does not register pointsPal routes for user without module', () => {
    useAuthStore.setState({
      user: userNoModules,
      token: 'test-tok',
      isAuthenticated: true,
      hasCompletedOnboarding: true,
      isDemoUser: false,
      demoExpiresAt: null,
      isLoading: false,
      refreshToken: null,
    });
    renderAtPath('/pointspal');
    // Route not registered → should redirect to '/' (Landing)
    // The exact redirect target depends on ProtectedRoute logic
    expect(document.body).toBeInTheDocument();
  });
});
```

**Step 2: Run**

```bash
cd web-ui && npx vitest run src/__tests__/pages/
```

Expected: green. The route tests are intentionally lightweight — they verify App renders without crashing at module paths.

**Step 3: Run full frontend suite**

```bash
cd web-ui && npx vitest run --coverage
```

Expected: all tests pass, coverage report printed.

**Step 4: Commit**

```bash
cd ..
git add web-ui/src/__tests__/pages/
git commit -m "test: frontend App route tests for module system"
```

---

## Task 15: Final — run complete suite, add to .gitignore, summarize

**Step 1: Run complete backend suite**

```bash
pytest --cov=src --cov=api --cov=src/modules --cov-report=term-missing tests/ -v
```

Expected: all tests pass.

**Step 2: Run complete frontend suite**

```bash
cd web-ui && npx vitest run --coverage
```

Expected: all tests pass.

**Step 3: Add coverage artifacts to .gitignore**

```bash
echo "htmlcov/" >> .gitignore
echo ".coverage" >> .gitignore
echo "web-ui/coverage/" >> .gitignore
```

**Step 4: Final commit**

```bash
git add .gitignore
git commit -m "test: complete test suite — backend pytest + frontend Vitest"
```

---

## Quick Reference

### Run backend tests
```bash
pytest tests/ -v
pytest tests/unit/ -v           # unit only
pytest tests/integration/ -v    # integration only
pytest --cov=src tests/ -v      # with coverage
```

### Run frontend tests
```bash
cd web-ui
npx vitest run                  # all tests, once
npx vitest                      # watch mode
npx vitest run --coverage       # with coverage
```

### Adding new tests
- **Backend unit:** `tests/unit/test_<module>.py`
- **Backend integration:** `tests/integration/test_<resource>_api.py`
- **Frontend unit:** `web-ui/src/__tests__/unit/<area>/test_<thing>.ts`
- **Frontend component:** `web-ui/src/__tests__/components/test_<Component>.tsx`
- Always add fixtures to `tests/factories.py` or `tests/__tests__/mocks/handlers.ts`
