# finPal Test Suite — Design Document

**Date:** 2026-03-10
**Status:** Approved — ready for implementation
**Scope:** Backend (pytest) + Frontend (Vitest)

---

## Problem

finPal has zero automated tests. The codebase has grown to include complex financial logic (budget calculations, expense splits, pointsPal optimizer), a module system, and a full REST API. Changes to any of these areas carry silent regression risk.

**Goal:** A production-grade test suite that acts as a regression safety net, CI gate, and development confidence tool — all three simultaneously.

---

## Approach: pytest + factory_boy + Vitest + MSW

Option B from the design session. No Playwright E2E for now (can be layered on later).

- **Backend:** pytest + pytest-flask + SQLite in-memory + factory_boy factories
- **Frontend:** Vitest + React Testing Library + MSW (Mock Service Worker)

---

## Backend Design

### Stack

| Package | Version | Purpose |
|---|---|---|
| `pytest` | 8.3.4 | Test runner |
| `pytest-flask` | 1.3.0 | Flask app fixture integration |
| `pytest-cov` | 6.0.0 | Coverage reporting |
| `factory-boy` | 3.3.1 | Model fixture factories |

Installed via `requirements-test.txt` (separate from prod).

### Folder Structure

```
tests/
  conftest.py              — app, db, client, auth_headers fixtures
  factories.py             — factory_boy factories for all models
  unit/
    test_budget_service.py          — calculate_spent, get_status, rollover logic
    test_transaction_splits.py      — calculate_splits (equal / % / custom)
    test_module_registry.py         — register, dispatch_event, background_sync, is_user_enabled
    test_module_base.py             — is_enabled, is_user_enabled default-open behaviour
    test_pointspal_optimizer.py     — build_optimizer, cap status (ok/warning/capped)
    test_pointspal_category_map.py  — FINPAL_TO_POINTSPAL slug mapping correctness
  integration/
    test_auth_api.py                — login, register, refresh, /me, /sync endpoints
    test_transactions_api.py        — transaction CRUD, split creation, category splits
    test_accounts_api.py            — account CRUD, SimpleFin connect/disconnect
    test_budgets_api.py             — budget CRUD, spent amount via API
    test_pointspal_api.py           — wallet cards, optimizer, alerts, cap tracker
    test_module_access_api.py       — user_module_access gating (enabled/disabled)
```

### Key Fixtures (`conftest.py`)

```python
@pytest.fixture(scope='session')
def app():
    app = create_app()
    app.config.update({
        'TESTING': True,
        'SQLALCHEMY_DATABASE_URI': 'sqlite:///:memory:',
        'POINTSPAL_ENABLED': 'true',
        'JWT_SECRET_KEY': 'test-secret',
    })
    return app

@pytest.fixture(scope='function')
def db(app):
    with app.app_context():
        _db.create_all()
        yield _db
        _db.session.remove()
        _db.drop_all()

@pytest.fixture
def client(app, db):
    return app.test_client()

@pytest.fixture
def auth_headers(client):
    def _make(user):
        resp = client.post('/api/v1/auth/login', json={
            'email': user.id, 'password': 'testpassword'
        })
        token = resp.get_json()['access_token']
        return {'Authorization': f'Bearer {token}'}
    return _make
```

### Factories (`factories.py`)

One factory per key model:
- `UserFactory` — email=id, hashed password, default currency USD
- `ExpenseFactory` — amount, category, user, split_method='none'
- `BudgetFactory` — amount, period, linked category
- `CategoryFactory` — name, user
- `AccountFactory` — name, type, balance, user
- `UserCardFactory` — card_nickname, last_four, user (pointsPal)
- `PointsProgramFactory` — program_id, issuer, tpg_cpp, earn categories

### External Mocks

All external HTTP calls mocked with `unittest.mock.patch`:
- `sync_from_pointspal` → mocked `requests.get` returning fixture JSON
- `SimpleFinService.sync_all_accounts` → no-op mock
- `yfinance` price calls → mocked return value

---

## Frontend Design

### Stack

| Package | Purpose |
|---|---|
| `vitest` | Vite-native test runner (fast, no Babel) |
| `@vitest/coverage-v8` | Coverage via V8 |
| `jsdom` | Browser DOM environment |
| `@testing-library/react` | Component rendering |
| `@testing-library/user-event` | Realistic user interactions |
| `@testing-library/jest-dom` | Custom matchers (`toBeInTheDocument`, etc.) |
| `msw` | Network-level API mocking (intercepts fetch) |

### Folder Structure

```
web-ui/src/__tests__/
  setup.ts                           — MSW server lifecycle, RTL config
  mocks/
    handlers.ts                      — MSW request handlers for all API routes
    server.ts                        — MSW node server instance
  unit/
    modules/
      test_registry.ts               — moduleRegistry shape, slug uniqueness
      test_pointspal_manifest.ts     — navLinks, routes, lazy component imports
    store/
      test_authStore.ts              — login sets user.modules, logout clears state
  components/
    test_Sidebar.tsx                 — module section renders/hides per user.modules;
                                       localStorage hide pref respected
    test_Settings_modules_tab.tsx    — Modules tab conditional; ModuleCard toggle
                                       writes localStorage + fires storage event
  pages/
    test_App_routes.tsx              — /pointspal renders for user with access;
                                       absent (no route) for user without modules
```

### MSW Handlers

Mock all API routes used by components under test:
- `POST /api/v1/auth/login` → returns `{ user: { modules: ['pointspal'] }, access_token }`
- `GET /api/v1/users/me` → returns user with modules
- `GET /api/v1/pointspal/alerts` → returns empty array (default)
- `GET /api/v1/pointspal/overview` → returns stub overview

### What Gets Tested

| Area | Assertions |
|---|---|
| `moduleRegistry` | Has pointspal entry; slug='pointspal'; 5 navLinks; 5 routes |
| `authStore.login` | `user.modules` populated from API response |
| `Sidebar` | Modules section visible when `user.modules=['pointspal']`; hidden when `[]` |
| `Sidebar` | Hide pref: `module_hidden_pointspal=true` removes module from nav |
| `Settings` | Modules tab absent when `user.modules=[]`; present when populated |
| `Settings` | ModuleCard toggle writes `module_hidden_*` to localStorage |
| `App` | `/pointspal` route renders Overview when user has access |
| `App` | `/pointspal` redirects when user has no pointspal module |

---

## Coverage Targets

| Layer | Target |
|---|---|
| Backend unit tests | 90% |
| Backend integration tests | 80% |
| Frontend components | 80% |
| Frontend store + modules | 90% |

---

## Out of Scope (v1)

- Playwright E2E tests
- Email service (requires SMTP mock infrastructure)
- yfinance / FMP investment price fetching (external, flaky)
- CSV import edge cases beyond happy path
- Admin API endpoints (`/api/admin/modules/...`)

---

## Run Commands

```bash
# Backend
pytest --cov=src --cov=api --cov=src/modules --cov-report=term-missing

# Frontend
cd web-ui && npx vitest run --coverage
```

---

## Implementation Notes

- All tests must pass with `POINTSPAL_ENABLED=true` and `POINTSPAL_ENABLED=false`
- No test may make real HTTP requests (mock everything external)
- Each test must be fully isolated — no shared state between tests
- Backend tests use SQLite in-memory; never require a running Postgres
- Frontend tests use jsdom; never require a running dev server
