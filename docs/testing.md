# finPal Test Suite

## Overview

finPal has a production-grade test suite covering backend (pytest) and frontend (Vitest). Tests run fully offline — no running server, no real HTTP calls, no Postgres required.

---

## Backend (pytest)

### Setup

```bash
source venv/bin/activate
pip install -r requirements-test.txt
```

### Run

```bash
# All tests
pytest

# With coverage report
pytest --cov=src --cov=api --cov=src/modules --cov-report=term-missing

# Specific file or test
pytest tests/unit/test_budget_service.py -v
pytest tests/integration/test_auth_api.py::test_login_success -v
```

### Structure

```
tests/
  conftest.py              — app, db, client, auth_headers fixtures (SQLite in-memory)
  factories.py             — factory_boy factories for all models
  unit/
    test_module_registry.py      — ModuleRegistry: register, dispatch_event, background_sync
    test_module_base.py          — ModuleBase: is_enabled, is_user_enabled (default-open)
    test_transaction_splits.py   — Expense.calculate_splits (equal / % / custom)
    test_budget_service.py       — Budget.calculate_spent_amount, get_status, period dates
    test_pointspal_category_map.py — finPal → pointsPal slug mapping
    test_pointspal_optimizer.py  — build_optimizer: ok / warning / capped status
  integration/
    test_auth_api.py             — login, register, /me, /sync
    test_transactions_api.py     — transaction CRUD
    test_budgets_api.py          — budget CRUD, overview, progress
    test_pointspal_api.py        — wallet cards, optimizer, alerts, overview
    test_module_access_api.py    — user_module_access gating
```

### Key Design Decisions

- **SQLite in-memory** — each test gets a fresh database via the `db` fixture; no Postgres needed
- **factory_boy** — `UserFactory()`, `ExpenseFactory()`, etc. create persisted model instances
- **No nested `app_context()`** — the `client` fixture already provides one; create factories directly in test functions and save `.id` to a plain string immediately to avoid `DetachedInstanceError`
- **All external calls mocked** — no real HTTP, no SimpleFin, no yfinance

---

## Frontend (Vitest)

### Setup

```bash
cd web-ui
npm install
```

### Run

```bash
# All tests
npx vitest run

# With coverage
npx vitest run --coverage

# Watch mode (development)
npx vitest
```

### Structure

```
web-ui/src/__tests__/
  setup.ts                          — MSW server lifecycle + jest-dom matchers
  mocks/
    handlers.ts                     — MSW request handlers for all API routes
    server.ts                       — MSW node server instance
  unit/
    modules/
      registry.test.ts              — moduleRegistry shape, slug uniqueness
      pointspal_manifest.test.ts    — navLinks, routes, lazy component imports
    store/
      authStore.test.ts             — login sets user.modules, logout clears state
  components/
    Sidebar.test.tsx                — modules section renders/hides per user.modules
                                      localStorage hide pref respected
    Settings_modules.test.tsx       — Modules tab conditional on user.modules
                                      ModuleCard toggle writes localStorage
  pages/
    App_routes.test.tsx             — moduleRegistry filtering by user.modules
```

### Key Design Decisions

- **MSW** intercepts `fetch` at the network level — no component changes needed for mocking
- **ThemeContext / ToastContext mocked** — prevents missing provider errors in isolated renders
- **Lazy module pages stubbed** with `vi.mock(...)` — avoids Suspense/bundle issues in tests
- **MemoryRouter** wraps all component renders — no real browser URL needed

---

## Coverage Targets

| Layer | Target |
|---|---|
| Backend unit tests | 90% of tested modules |
| Backend integration tests | 80% of API paths |
| Frontend components | 80% |
| Frontend store + modules | 90% |

---

## CI Gate

Both suites must pass before merging. Add to your CI pipeline:

```bash
# Backend
source venv/bin/activate
pip install -r requirements-test.txt
pytest --cov=src --cov=api --cov=src/modules

# Frontend
cd web-ui
npm ci
npx vitest run
```

---

## Out of Scope (v1)

- Playwright E2E tests
- Email service (requires SMTP mock infrastructure)
- yfinance / FMP investment price fetching (external, flaky)
- CSV import edge cases beyond happy path
- Admin API endpoints
