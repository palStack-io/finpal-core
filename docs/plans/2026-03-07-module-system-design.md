# finPal Module System — Design Document

**Date:** 2026-03-07
**Status:** Brainstorm / Pre-implementation
**Scope:** Internal — finPal core team

---

## Problem

Today, adding a module to finPal requires manually editing 4+ core files:

| File | What you touch |
|---|---|
| `src/__init__.py` | Add startup seed block + scheduled task block |
| `api/__init__.py` | Add feature-flag conditional + namespace registration |
| `src/models/transaction.py` | Add hardcoded SQLAlchemy event listener |
| `api/v1/auth.py` | Add hardcoded background sync call |

Every module pierces the same core files. There is no standard interface. There are no developer guardrails. This does not scale as we add more palStack modules.

**Goal:** Drop a folder into `src/modules/`, add one line to `src/modules/__init__.py`, and the module is fully wired in — routes, tasks, events, startup hooks, and per-user access control.

---

## Design Overview

Three layers control whether a module is active:

```
Layer 1 — Is it deployed?    env var (e.g. POINTSPAL_ENABLED=true)
Layer 2 — Does the user have access?   user_module_access DB table
Layer 3 — Module code                  src/modules/<name>/
```

Layer 1 is a hard deployment gate — if the env var is off, the module code is never loaded.
Layer 2 is runtime per-user access — controlled by adminPal via HMAC-signed API calls.
Layer 3 is the module itself — self-contained, no edits to core files.

---

## Core Components

### `src/modules/base.py` — ModuleBase

Every module subclasses `ModuleBase`. All methods have no-op defaults so modules only implement what they need.

```python
class ModuleBase:
    name: str            # unique slug, e.g. 'pointspal'
    enabled_env: str     # env var name, e.g. 'POINTSPAL_ENABLED'
    version: str = '1.0.0'

    # --- Enablement ---
    def is_enabled(self) -> bool:
        # Reads self.enabled_env from environment
        ...

    def is_user_enabled(self, user_id: str) -> bool:
        # Checks user_module_access table for this user + self.name
        # Falls back to is_enabled() if no row exists (default-open)
        ...

    # --- Integration hooks ---
    def get_namespaces(self) -> list[tuple]:
        # Return [(namespace_object, '/url-path'), ...]
        return []

    def register_tasks(self, scheduler, app) -> None:
        # Register APScheduler cron jobs
        pass

    def on_startup(self, app) -> None:
        # Called inside app_context after db.create_all()
        # Use for: first-run seeding, table checks, cache warming
        pass

    def on_event(self, event_name: str, **kwargs) -> None:
        # React to named core events fired by the registry
        # e.g. event_name='expense_created', kwargs={'connection': ..., 'expense': ...}
        pass

    def on_background_sync(self, app, user_id: str) -> None:
        # Called from the background sync thread on user login
        # Must be non-blocking and handle its own errors
        pass
```

---

### `src/modules/registry.py` — ModuleRegistry

Singleton that holds all registered modules and exposes the coordinator API used by core files.

```python
class ModuleRegistry:
    def register(self, module: ModuleBase) -> None
    def startup(self, app) -> None
    def register_api_namespaces(self, api) -> None
    def register_tasks(self, scheduler, app) -> None
    def dispatch_event(self, event_name: str, **kwargs) -> None
    def background_sync(self, app, user_id: str) -> None
    def is_user_enabled(self, module_name: str, user_id: str) -> bool

module_registry = ModuleRegistry()  # singleton, importable everywhere
```

`dispatch_event` and `background_sync` are wrapped in try/except per module — a failing module never blocks the caller.

---

### `src/modules/__init__.py` — Central Registration

The **only** file you edit when adding a new module:

```python
from src.modules.registry import module_registry
from src.modules.pointspal.manifest import PointsPalModule

module_registry.register(PointsPalModule())

# To add a new module:
# from src.modules.cryptopal.manifest import CryptoPalModule
# module_registry.register(CryptoPalModule())
```

---

## Module Folder Structure

Every module lives in `src/modules/<name>/` and follows this layout:

```
src/modules/
  base.py              <- ModuleBase class
  registry.py          <- ModuleRegistry singleton
  __init__.py          <- register all modules here (the one file you edit)

  <module_name>/
    __init__.py        <- empty
    manifest.py        <- ModuleBase subclass — the entry point
    models.py          <- SQLAlchemy ORM models
    service.py         <- business logic, no Flask request context
    routes.py          <- Flask-RESTX namespaces (NOT in api/v1/)
    migrations/        <- (optional) module-specific migration notes
```

**Routes live inside the module.** `routes.py` is where you define Flask-RESTX `Namespace` objects. The manifest's `get_namespaces()` imports from there. Nothing in `api/v1/` needs to be touched.

---

## Manifest Example (pointsPal)

`src/modules/pointspal/manifest.py`:

```python
from src.modules.base import ModuleBase

class PointsPalModule(ModuleBase):
    name = 'pointspal'
    enabled_env = 'POINTSPAL_ENABLED'
    version = '1.0.0'

    def get_namespaces(self):
        from src.modules.pointspal.routes import wallet_ns, points_ns, optimizer_ns, pointspal_ns
        return [
            (wallet_ns,     '/wallet'),
            (points_ns,     '/points'),
            (optimizer_ns,  '/optimizer'),
            (pointspal_ns,  '/pointspal'),
        ]

    def register_tasks(self, scheduler, app):
        @scheduler.task('cron', id='pointspal_sync', hour=3, minute=0)
        def nightly_sync():
            with app.app_context():
                from src.modules.pointspal.service import sync_from_pointspal
                sync_from_pointspal()

    def on_startup(self, app):
        from src.modules.pointspal.models import PointsProgram
        from src.modules.pointspal.service import sync_from_pointspal
        if PointsProgram.query.count() == 0:
            sync_from_pointspal()

    def on_event(self, event_name, **kwargs):
        if event_name == 'expense_created':
            from src.modules.pointspal.simplefin_bridge import handle_new_transaction
            handle_new_transaction(kwargs['connection'], kwargs['expense'])

    def on_background_sync(self, app, user_id):
        from src.modules.pointspal.models import PointsProgram
        from src.modules.pointspal.service import sync_from_pointspal
        from datetime import datetime, timedelta
        newest = PointsProgram.query.order_by(PointsProgram.updated_at.desc()).first()
        if not newest or (datetime.utcnow() - newest.updated_at) > timedelta(hours=23):
            sync_from_pointspal()
```

---

## Per-User Access Control (adminPal Integration)

### New DB table: `user_module_access`

```
user_id      String(120) FK → users.id
module_name  String(100)
enabled      Boolean, default False
granted_by   String(50)   — 'adminpal' | 'manual'
granted_at   DateTime
```

Primary key: `(user_id, module_name)`

### Admin API endpoints

finPal exposes HMAC-verified admin endpoints that adminPal calls using the same `X-PalStack-Sig` scheme from palstack-manager's `ProductClient`:

```
POST /api/admin/modules/<user_id>/<module_name>/enable
POST /api/admin/modules/<user_id>/<module_name>/disable
GET  /api/admin/modules/<user_id>
```

Verification flow:
1. finPal reads `X-PalStack-Sig`, `X-PalStack-Ts`, `X-PalStack-Staff-Id` headers
2. Reconstructs `message = "{METHOD}:{path}:{ts}"`
3. Verifies HMAC-SHA256 against `PALSTACK_MANAGER_SECRET` env var
4. Rejects requests where `ts` is > 60 seconds old (replay protection)
5. Updates `user_module_access` on success

### ModuleBase.is_user_enabled()

Default behaviour:
- If a row exists in `user_module_access` for this user + module → return `enabled` column
- If no row exists → return `True` (default-open; all existing users get access unless explicitly revoked)

Modules can override `is_user_enabled()` to add custom logic (e.g. check a subscription tier column on the User model).

### Checking access in routes

In any module route that needs per-user gating:

```python
from src.modules.registry import module_registry
from flask_jwt_extended import get_jwt_identity

user_id = get_jwt_identity()
if not module_registry.is_user_enabled('pointspal', user_id):
    return {'message': 'Module not available on your plan'}, 403
```

---

## Changes to Core Files

These are the only core file changes needed to migrate to the new system. After this, core files are never touched again for new modules.

| File | Remove | Add |
|---|---|---|
| `src/__init__.py` | pointspal startup seed block; pointspal scheduled task block | `module_registry.startup(app)`; `module_registry.register_tasks(scheduler, app)` |
| `api/__init__.py` | pointspal env-flag block + 4 `add_namespace` calls | `module_registry.register_api_namespaces(api)` |
| `src/models/transaction.py` | `_pointspal_on_expense_insert` event listener function | `module_registry.dispatch_event('expense_created', connection=connection, expense=target)` |
| `api/v1/auth.py` | pointspal-specific block inside `_background_sync` | `module_registry.background_sync(app, user_id)` |
| `api/v1/pointspal.py` | entire file (delete) | routes move to `src/modules/pointspal/routes.py` |

---

## Core Event Reference

Events dispatched via `module_registry.dispatch_event(name, **kwargs)`:

| Event name | When fired | kwargs |
|---|---|---|
| `expense_created` | After a new `Expense` is inserted (SQLAlchemy after_insert) | `connection`, `expense` |
| `user_login` | After successful login | `user_id`, `app` |

To add a new event, fire it from the relevant core location and document it here.

---

## How to Build a New Module

**Step 1 — Create the folder**

```
src/modules/<name>/
  __init__.py      (empty)
  manifest.py
  models.py
  service.py
  routes.py        (if it has API endpoints)
```

**Step 2 — Write manifest.py**

Subclass `ModuleBase`. Set `name` and `enabled_env`. Override only the hooks you need:

- No API routes? Skip `get_namespaces()`.
- No scheduled tasks? Skip `register_tasks()`.
- No startup seed? Skip `on_startup()`.
- No reaction to core events? Skip `on_event()`.
- No background sync? Skip `on_background_sync()`.

**Step 3 — Add models to Alembic**

Import your models in `src/models/__init__.py` so Alembic detects them:

```python
# src/models/__init__.py
from src.modules.mymodule.models import MyModel  # noqa: F401
```

Then generate a migration:

```bash
flask db migrate -m "add mymodule tables"
```

**Step 4 — Register in `src/modules/__init__.py`**

```python
from src.modules.mymodule.manifest import MyModule
module_registry.register(MyModule())
```

**Step 5 — Add the env var**

In `.env` and `ENV_REFERENCE.md`:

```
MYMODULE_ENABLED=true
```

**That's it.** No other core files need to change.

---

## Module Checklist

Use this when reviewing a new module PR:

- [ ] `manifest.py` subclasses `ModuleBase` with `name` and `enabled_env` set
- [ ] All hooks that can fail are wrapped in try/except
- [ ] `on_background_sync` is non-blocking (no long HTTP calls without timeout)
- [ ] Models imported in `src/models/__init__.py`
- [ ] Migration file generated and tested
- [ ] Routes defined in `routes.py` inside the module (not in `api/v1/`)
- [ ] Registered in `src/modules/__init__.py`
- [ ] Env var documented in `docs/ENV_REFERENCE.md`
- [ ] Per-user gating used in routes if module is subscription-gated

---

## Future Considerations

- **adminPal dashboard**: once palstack-manager adds finPal as a product, the module enable/disable UI can be added to the Manager Dashboard to control per-user access without touching the DB directly.
- **Module versioning**: `version` field on `ModuleBase` is reserved for future compatibility checks between finPal core and module versions.
- **Cross-palStack reuse**: the `ModuleBase` + `ModuleRegistry` pattern is portable. Other palStack services (propertyPal, etc.) can adopt the same pattern with their own base classes.
- **Module dependencies**: if a future module depends on another (e.g. `rewardspal` requires `pointspal`), add a `depends_on: list[str]` field to `ModuleBase` and have the registry validate before startup.

---

## Frontend Module System

**Date added:** 2026-03-07

The frontend mirrors the backend's self-registration pattern. Adding a module to the frontend is: create folder, write manifest, add one import to `index.ts`. `App.tsx` and `Sidebar.tsx` never change again for new modules.

---

### Access Model

Three layers mirror the backend:

```
Layer 1 — Does the user have backend access?   user.modules string[] (from /api/v1/users/me)
Layer 2 — Has the user hidden it?              localStorage('module_hidden_<slug>')
Layer 3 — Module frontend code                 web-ui/src/modules/<name>/
```

`user.modules` is populated on login and auth/me — no extra API call. It contains the slugs the user has access to per `user_module_access` on the backend. If a slug is absent, the module's routes and nav never render.

---

### Folder Structure

Every module lives in `web-ui/src/modules/<name>/` and mirrors the backend:

```
web-ui/src/modules/
  index.ts                  ← the one file you edit to add a module
  registry.ts               ← ModuleManifest type definition

  pointspal/
    manifest.ts             ← ModuleManifest object — entry point
    pages/
      Overview.tsx
      CapTracker.tsx
      BestCard.tsx
      MyCards.tsx
      Redeem.tsx
    components/
      CardFace.tsx
      CapProgressCard.tsx
      RecommendTable.tsx
      StaleCardBanner.tsx
    service.ts
```

---

### ModuleManifest Interface

```ts
// web-ui/src/modules/registry.ts

export interface NavLink {
  label: string;
  path: string;
  hasAlert?: (user: User) => boolean;
}

export interface ModuleManifest {
  slug: string;              // matches backend module name, e.g. 'pointspal'
  label: string;             // display name, e.g. 'pointsPal'
  icon: string;              // emoji or icon, e.g. '✦'
  description: string;       // short description for Settings modules tab
  navLinks: NavLink[];
  routes: {
    path: string;
    component: React.LazyExoticComponent<any>;
  }[];
}
```

---

### pointsPal Manifest Example

```ts
// web-ui/src/modules/pointspal/manifest.ts
import { lazy } from 'react';
import type { ModuleManifest } from '../registry';

const manifest: ModuleManifest = {
  slug: 'pointspal',
  label: 'pointsPal',
  icon: '✦',
  description: 'Track credit card points, spending caps, and get card recommendations.',
  navLinks: [
    { label: 'Overview',    path: '/pointspal' },
    { label: 'Cap Tracker', path: '/pointspal/caps', hasAlert: () => true },
    { label: 'Best Card',   path: '/pointspal/recommend' },
    { label: 'My Cards',    path: '/pointspal/cards' },
    { label: 'Redeem',      path: '/pointspal/redeem' },
  ],
  routes: [
    { path: '/pointspal',           component: lazy(() => import('./pages/Overview')) },
    { path: '/pointspal/caps',      component: lazy(() => import('./pages/CapTracker')) },
    { path: '/pointspal/recommend', component: lazy(() => import('./pages/BestCard')) },
    { path: '/pointspal/cards',     component: lazy(() => import('./pages/MyCards')) },
    { path: '/pointspal/redeem',    component: lazy(() => import('./pages/Redeem')) },
  ],
};

export default manifest;
```

---

### Central Registration

```ts
// web-ui/src/modules/index.ts
import pointspal from './pointspal/manifest';

export const moduleRegistry = [pointspal];

// To add a new module:
// import cryptopal from './cryptopal/manifest';
// export const moduleRegistry = [pointspal, cryptopal];
```

---

### App.tsx — Dynamic Routes

Replaces hardcoded pointsPal route block. Iterates the registry filtered by `user.modules`:

```tsx
import { Suspense } from 'react';
import { moduleRegistry } from './modules';

// Inside <Routes>, after existing routes:
{moduleRegistry
  .filter(m => user?.modules?.includes(m.slug))
  .flatMap(m => m.routes.map(r => (
    <Route
      key={r.path}
      path={r.path}
      element={
        <ProtectedRoute>
          <AppLayout>
            <Suspense fallback={<Loading />}>
              <r.component />
            </Suspense>
          </AppLayout>
        </ProtectedRoute>
      }
    />
  )))
}
```

---

### Sidebar.tsx — Dynamic Nav

User hide preference stored in `localStorage('module_hidden_<slug>')`. A `storage` event listener keeps Sidebar in sync when Settings toggles the preference.

```tsx
// Replaces hardcoded pointsPal block in sidebar nav:
{moduleRegistry
  .filter(m => user?.modules?.includes(m.slug))
  .map(m => <ModuleNavSection key={m.slug} manifest={m} />)
}
```

`ModuleNavSection` is an extracted component that handles expand/collapse toggle (persisted to `localStorage('module_nav_open_<slug>')`), renders sub-links, and drives alert badges via `navLink.hasAlert`.

The "Modules" label above the section only renders if at least one module is active.

---

### Settings — Modules Tab

A new **"Modules"** tab is added to the Settings `tabs` array. It is hidden entirely if `user.modules` is empty.

Each card shows:
- Module icon + name + description
- **"Hide in sidebar"** toggle — writes `localStorage('module_hidden_<slug>')` and fires a `storage` event so Sidebar updates live without reload

No enable/disable control — that is adminPal's responsibility. Users can only control visibility.

---

### Backend Change Required

`GET /api/v1/users/me` response gains one field:

```json
{
  "modules": ["pointspal"]
}
```

The list contains slugs where `module_registry.is_user_enabled(slug, user_id)` returns `True`. Computed once per request, no extra DB call beyond what the registry already does.

The `User` TypeScript type in `useAuthStore` gains `modules: string[]`.

---

### Migration Path (pointsPal)

1. Move `web-ui/src/pages/pointspal/*` → `web-ui/src/modules/pointspal/pages/`
2. Move `web-ui/src/components/pointspal/*` → `web-ui/src/modules/pointspal/components/`
3. Move `web-ui/src/services/pointspalService.ts` → `web-ui/src/modules/pointspal/service.ts`
4. Write `web-ui/src/modules/pointspal/manifest.ts`
5. Create `web-ui/src/modules/index.ts` and `web-ui/src/modules/registry.ts`
6. Strip hardcoded pointsPal blocks from `App.tsx` and `Sidebar.tsx`
7. Add `modules: string[]` to `/api/v1/users/me` backend response

---

### Frontend Module Checklist

Use this when reviewing a new frontend module PR:

- [ ] Module lives in `web-ui/src/modules/<name>/`
- [ ] `manifest.ts` exports a valid `ModuleManifest` with `slug`, `label`, `icon`, `description`, `navLinks`, `routes`
- [ ] All page imports use `React.lazy()`
- [ ] Module registered in `web-ui/src/modules/index.ts`
- [ ] Sidebar hide preference uses `localStorage('module_hidden_<slug>')`
- [ ] Nav open/close state uses `localStorage('module_nav_open_<slug>')`
- [ ] No direct imports of module internals from `App.tsx`, `Sidebar.tsx`, or `Settings.tsx`

---

## Implementation TODO

Full implementation plan: `docs/plans/2026-03-07-frontend-module-system.md`

### Backend
- [ ] Task 1: Add `modules: string[]` to login response (`api/v1/auth.py`) via `_get_user_modules()` helper calling `module_registry`
- [ ] *(depends on backend module system)* Create `src/modules/base.py`, `src/modules/registry.py`, `src/modules/__init__.py`
- [ ] Migrate `api/v1/pointspal.py` routes into `src/modules/pointspal/routes.py`
- [ ] Strip pointsPal-specific blocks from `src/__init__.py`, `api/__init__.py`, `src/models/transaction.py`, `api/v1/auth.py`
- [ ] Add admin endpoints: `POST /api/admin/modules/<user_id>/<module_name>/enable|disable`
- [ ] Create `user_module_access` DB table + migration

### Frontend
- [ ] Task 2: Add `modules?: string[]` to `User` type (`web-ui/src/types/user.ts`)
- [ ] Task 3: Create `web-ui/src/modules/registry.ts` — `ModuleManifest` interface
- [ ] Task 4: `git mv` all pointsPal files into `web-ui/src/modules/pointspal/`, fix relative imports
- [ ] Task 5: Write `web-ui/src/modules/pointspal/manifest.ts` with lazy routes
- [ ] Task 6: Create `web-ui/src/modules/index.ts` — central registry
- [ ] Task 7: Wire `App.tsx` — dynamic routes from registry, remove hardcoded pointsPal block
- [ ] Task 8: Wire `Sidebar.tsx` — `ModuleNavSection` component, remove hardcoded pointsPal block
- [ ] Task 9: Add Modules tab to `Settings.tsx` with per-module sidebar hide toggle
- [ ] Task 10: Remove dead `pointspal_enabled` localStorage key
