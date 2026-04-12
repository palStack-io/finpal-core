# Frontend Module System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace hardcoded pointsPal frontend wiring with a self-registering module system — drop a folder into `web-ui/src/modules/`, add one import to `index.ts`, and the module's routes, sidebar nav, and Settings card are fully wired.

**Architecture:** A typed `ModuleManifest` object per module declares its slug, nav links, and lazy-loaded routes. A central registry (`moduleRegistry` array) is iterated by `App.tsx` and `Sidebar.tsx` filtered by `user.modules` (string slugs returned from the login API). User sidebar-hide preference is stored in `localStorage('module_hidden_<slug>')` and kept in sync via `storage` events.

**Tech Stack:** React 18, React Router v6, TypeScript, Zustand (authStore), Flask-RESTX (backend)

---

## Prerequisites

- Read `docs/plans/2026-03-07-module-system-design.md` (Frontend Module System section) — this plan implements it exactly.
- Key files to understand before starting:
  - `web-ui/src/App.tsx` — hardcoded pointsPal routes to remove
  - `web-ui/src/components/layout/Sidebar.tsx` — hardcoded pointsPal nav to replace
  - `web-ui/src/pages/Settings.tsx` — tabs array, needs Modules tab added
  - `web-ui/src/types/user.ts` — `User` interface, needs `modules?: string[]`
  - `api/v1/auth.py` — login response dict (lines 156–168), needs `modules` field
  - `src/modules/registry.py` — backend `module_registry.is_user_enabled()` to call

---

## Task 1: Backend — Add `modules` to login response

The frontend needs to know which modules the user has access to. This comes from the login response — no extra API call.

**Files:**
- Modify: `api/v1/auth.py` (login response dict, ~line 156)

**Step 1: Locate the login response dict**

Open `api/v1/auth.py`. Find the `response_data` dict starting around line 156:

```python
response_data = {
    'access_token': access_token,
    'refresh_token': refresh_token,
    'user': {
        'id': user.id,
        'name': user.name,
        'email': user.id,
        'default_currency_code': user.default_currency_code,
        'is_demo_user': is_demo,
        'hasCompletedOnboarding': user.has_completed_onboarding,
        'profile_emoji': user.profile_emoji,
    }
}
```

**Step 2: Add `modules` to the user dict**

Replace the `'user'` dict inside `response_data` with:

```python
        'user': {
            'id': user.id,
            'name': user.name,
            'email': user.id,
            'default_currency_code': user.default_currency_code,
            'is_demo_user': is_demo,
            'hasCompletedOnboarding': user.has_completed_onboarding,
            'profile_emoji': user.profile_emoji,
            'modules': _get_user_modules(user.id),
        }
```

**Step 3: Add the `_get_user_modules` helper at the bottom of `api/v1/auth.py`**

Add this function after all the route classes (before or after any existing helpers at the bottom of the file):

```python
def _get_user_modules(user_id: str) -> list:
    """Return list of module slugs enabled for this user."""
    try:
        from src.modules.registry import module_registry
        return [
            m.name for m in module_registry.modules
            if m.is_enabled() and m.is_user_enabled(user_id)
        ]
    except Exception:
        return []
```

> **Note:** `module_registry.modules` is the list of registered `ModuleBase` instances. This requires the backend module system to be implemented first. If it isn't yet, return `['pointspal']` as a hardcoded fallback temporarily:
> ```python
> def _get_user_modules(user_id: str) -> list:
>     try:
>         from src.modules.registry import module_registry
>         return [m.name for m in module_registry.modules if m.is_enabled() and m.is_user_enabled(user_id)]
>     except Exception:
>         import os
>         return ['pointspal'] if os.getenv('POINTSPAL_ENABLED', 'false').lower() == 'true' else []
> ```

**Step 4: Verify manually**

Start the Flask dev server and log in. Check the login response includes `user.modules`:

```bash
curl -s -X POST http://localhost:5000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"your@email.com","password":"yourpassword"}' | python3 -m json.tool | grep -A3 modules
```

Expected: `"modules": ["pointspal"]` (or `[]` if POINTSPAL_ENABLED is false)

**Step 5: Commit**

```bash
git add api/v1/auth.py
git commit -m "feat: add modules[] to login response for frontend module gating"
```

---

## Task 2: Add `modules` to the TypeScript `User` type

**Files:**
- Modify: `web-ui/src/types/user.ts`

**Step 1: Open `web-ui/src/types/user.ts` and find the `User` interface**

It currently ends with:
```ts
  // Demo mode fields
  is_demo_user?: boolean;
}
```

**Step 2: Add the `modules` field**

```ts
  // Demo mode fields
  is_demo_user?: boolean;
  // Module system — slugs granted by adminPal
  modules?: string[];
}
```

**Step 3: Verify TypeScript compiles**

```bash
cd web-ui && npx tsc --noEmit
```

Expected: no errors

**Step 4: Commit**

```bash
git add web-ui/src/types/user.ts
git commit -m "feat: add modules?: string[] to User type"
```

---

## Task 3: Create `web-ui/src/modules/registry.ts`

This file defines the `ModuleManifest` interface — the contract every frontend module must satisfy.

**Files:**
- Create: `web-ui/src/modules/registry.ts`

**Step 1: Create the file**

```ts
// web-ui/src/modules/registry.ts
import type { LazyExoticComponent, ComponentType } from 'react';
import type { User } from '../types/user';

export interface NavLink {
  label: string;
  path: string;
  /** Return true if this link should show an alert badge */
  hasAlert?: (user: User | null) => boolean;
}

export interface ModuleRoute {
  path: string;
  component: LazyExoticComponent<ComponentType<any>>;
}

export interface ModuleManifest {
  /** Matches the backend module slug, e.g. 'pointspal' */
  slug: string;
  /** Display name shown in sidebar and Settings, e.g. 'pointsPal' */
  label: string;
  /** Emoji or symbol shown in sidebar, e.g. '✦' */
  icon: string;
  /** One-line description shown in Settings Modules tab */
  description: string;
  navLinks: NavLink[];
  routes: ModuleRoute[];
}
```

**Step 2: Verify TypeScript compiles**

```bash
cd web-ui && npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add web-ui/src/modules/registry.ts
git commit -m "feat: add ModuleManifest interface for frontend module system"
```

---

## Task 4: Move pointsPal files into module folder

Physically migrate all existing pointsPal frontend code into `web-ui/src/modules/pointspal/`.

**Files to move:**

| From | To |
|---|---|
| `web-ui/src/pages/pointspal/PointsPalOverview.tsx` | `web-ui/src/modules/pointspal/pages/Overview.tsx` |
| `web-ui/src/pages/pointspal/CapTracker.tsx` | `web-ui/src/modules/pointspal/pages/CapTracker.tsx` |
| `web-ui/src/pages/pointspal/BestCard.tsx` | `web-ui/src/modules/pointspal/pages/BestCard.tsx` |
| `web-ui/src/pages/pointspal/MyCards.tsx` | `web-ui/src/modules/pointspal/pages/MyCards.tsx` |
| `web-ui/src/pages/pointspal/Redeem.tsx` | `web-ui/src/modules/pointspal/pages/Redeem.tsx` |
| `web-ui/src/components/pointspal/CardFace.tsx` | `web-ui/src/modules/pointspal/components/CardFace.tsx` |
| `web-ui/src/components/pointspal/CapProgressCard.tsx` | `web-ui/src/modules/pointspal/components/CapProgressCard.tsx` |
| `web-ui/src/components/pointspal/RecommendTable.tsx` | `web-ui/src/modules/pointspal/components/RecommendTable.tsx` |
| `web-ui/src/components/pointspal/StaleCardBanner.tsx` | `web-ui/src/modules/pointspal/components/StaleCardBanner.tsx` |
| `web-ui/src/services/pointspalService.ts` | `web-ui/src/modules/pointspal/service.ts` |

**Step 1: Create the folder structure**

```bash
mkdir -p web-ui/src/modules/pointspal/pages
mkdir -p web-ui/src/modules/pointspal/components
```

**Step 2: Move files using git mv (preserves history)**

```bash
cd web-ui/src

git mv pages/pointspal/PointsPalOverview.tsx modules/pointspal/pages/Overview.tsx
git mv pages/pointspal/CapTracker.tsx        modules/pointspal/pages/CapTracker.tsx
git mv pages/pointspal/BestCard.tsx          modules/pointspal/pages/BestCard.tsx
git mv pages/pointspal/MyCards.tsx           modules/pointspal/pages/MyCards.tsx
git mv pages/pointspal/Redeem.tsx            modules/pointspal/pages/Redeem.tsx

git mv components/pointspal/CardFace.tsx        modules/pointspal/components/CardFace.tsx
git mv components/pointspal/CapProgressCard.tsx modules/pointspal/components/CapProgressCard.tsx
git mv components/pointspal/RecommendTable.tsx  modules/pointspal/components/RecommendTable.tsx
git mv components/pointspal/StaleCardBanner.tsx modules/pointspal/components/StaleCardBanner.tsx

git mv services/pointspalService.ts modules/pointspal/service.ts
```

**Step 3: Update internal imports in moved files**

Each moved page/component may import from relative paths that are now broken. For every moved file, check its import statements and fix relative paths.

Common patterns to fix:

- In pages (now at `modules/pointspal/pages/`):
  - `../../services/pointspalService` → `../service`
  - `../../components/pointspal/CardFace` → `../components/CardFace`
  - `../../components/pointspal/CapProgressCard` → `../components/CapProgressCard`
  - `../../components/pointspal/RecommendTable` → `../components/RecommendTable`
  - `../../components/pointspal/StaleCardBanner` → `../components/StaleCardBanner`
  - `../../store/authStore` → `../../../store/authStore`
  - `../../services/api` → `../../../services/api`
  - `../../components/common/Loading` → `../../../components/common/Loading`

- In components (now at `modules/pointspal/components/`):
  - `../../services/pointspalService` → `../service`
  - `../../store/authStore` → `../../../store/authStore`

Go through each file methodically. Read it, fix all broken relative imports, verify with `npx tsc --noEmit`.

**Step 4: Remove empty old directories**

```bash
rmdir web-ui/src/pages/pointspal 2>/dev/null || true
rmdir web-ui/src/components/pointspal 2>/dev/null || true
```

**Step 5: Verify TypeScript compiles**

```bash
cd web-ui && npx tsc --noEmit
```

Fix any remaining import errors before proceeding.

**Step 6: Commit**

```bash
cd web-ui/src
git add modules/pointspal/
git add -u  # stages deletes for moved files
git commit -m "refactor: move pointspal files into modules/pointspal/"
```

---

## Task 5: Create `web-ui/src/modules/pointspal/manifest.ts`

**Files:**
- Create: `web-ui/src/modules/pointspal/manifest.ts`

**Step 1: Create the file**

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
    { label: 'Cap Tracker', path: '/pointspal/caps',      hasAlert: () => true },
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

**Step 2: Verify TypeScript compiles**

```bash
cd web-ui && npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add web-ui/src/modules/pointspal/manifest.ts
git commit -m "feat: add pointsPal ModuleManifest"
```

---

## Task 6: Create `web-ui/src/modules/index.ts`

The one file that wires all modules into the registry.

**Files:**
- Create: `web-ui/src/modules/index.ts`

**Step 1: Create the file**

```ts
// web-ui/src/modules/index.ts
import pointspal from './pointspal/manifest';
import type { ModuleManifest } from './registry';

export const moduleRegistry: ModuleManifest[] = [
  pointspal,
];

// To add a new module:
// import cryptopal from './cryptopal/manifest';
// Add cryptopal to the array above.
```

**Step 2: Verify TypeScript compiles**

```bash
cd web-ui && npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add web-ui/src/modules/index.ts
git commit -m "feat: create moduleRegistry — central frontend module registration"
```

---

## Task 7: Wire `App.tsx` — dynamic routes from registry

Replace the hardcoded pointsPal route block with registry-driven routes.

**Files:**
- Modify: `web-ui/src/App.tsx`

**Step 1: Read the current file and locate the pointsPal block**

The block looks like:
```tsx
{/* pointsPal Module */}
import PointsPalOverview from './pages/pointspal/PointsPalOverview';
import CapTracker        from './pages/pointspal/CapTracker';
// ... etc
```
And in Routes:
```tsx
{/* pointsPal Module */}
<Route path="/pointspal" element={...} />
<Route path="/pointspal/caps" element={...} />
// ... etc
```

**Step 2: Remove the pointsPal import block at the top of App.tsx**

Delete these lines:
```tsx
// pointsPal Module
import PointsPalOverview from './pages/pointspal/PointsPalOverview';
import CapTracker        from './pages/pointspal/CapTracker';
import BestCard          from './pages/pointspal/BestCard';
import MyCards           from './pages/pointspal/MyCards';
import Redeem            from './pages/pointspal/Redeem';
```

**Step 3: Add registry and Suspense imports**

```tsx
import { Suspense } from 'react';
import { moduleRegistry } from './modules';
import { Loading } from './components/common/Loading';
```

**Step 4: Add `useAuthStore` to the App component** (if not already imported at the top level — check whether it's already imported)

The `useAuthStore` is already imported in `AppLayout`. To access `user` in the route filter, call `useAuthStore` inside the `App` function body:

```tsx
function App() {
  const { user } = useAuthStore();
  // ... rest of App
```

**Step 5: Replace the hardcoded pointsPal route block in `<Routes>` with the dynamic block**

Remove all `<Route>` elements with paths starting with `/pointspal`.

Add this block after all the existing named routes, before the catch-all:

```tsx
{/* Module routes — driven by moduleRegistry, gated by user.modules */}
{moduleRegistry
  .filter(m => user?.modules?.includes(m.slug))
  .flatMap(m =>
    m.routes.map(r => (
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
    ))
  )
}
```

**Step 6: Verify TypeScript compiles**

```bash
cd web-ui && npx tsc --noEmit
```

**Step 7: Start the dev server and test manually**

```bash
cd web-ui && npm run dev
```

- Log in as a user who has `modules: ['pointspal']` in the login response
- Navigate to `/pointspal` — should render the Overview page
- Log in as a user without pointspal — `/pointspal` should redirect (no route registered)

**Step 8: Commit**

```bash
git add web-ui/src/App.tsx
git commit -m "feat: wire App.tsx routes from moduleRegistry — removes hardcoded pointspal block"
```

---

## Task 8: Wire `Sidebar.tsx` — dynamic nav from registry

Replace the hardcoded pointsPal sidebar section with a `ModuleNavSection` component driven by the registry.

**Files:**
- Modify: `web-ui/src/components/layout/Sidebar.tsx`

**Step 1: Read Sidebar.tsx in full**

Understand the existing hardcoded pointsPal block (lines ~38–194). It has:
- `ppOpen` state for expand/collapse
- `ppEnabled` state from localStorage
- Alert count from `pointspalService.getAlerts()`
- Hardcoded sub-links array

**Step 2: Create `ModuleNavSection` as a separate component at the top of Sidebar.tsx (before `Sidebar`)**

This component handles one module's nav section: header row with expand/collapse, sub-links, and alert badges.

```tsx
import { moduleRegistry } from '../../modules';
import { useAuthStore } from '../../store/authStore';

interface ModuleNavSectionProps {
  manifest: import('../../modules/registry').ModuleManifest;
}

const ModuleNavSection: React.FC<ModuleNavSectionProps> = ({ manifest }) => {
  const { user } = useAuthStore();
  const openKey = `module_nav_open_${manifest.slug}`;

  const [open, setOpen] = useState<boolean>(() => {
    try { return localStorage.getItem(openKey) === 'true'; } catch { return false; }
  });
  const [alertCount, setAlertCount] = useState(0);

  // Fetch alert count for any nav link that declares hasAlert
  useEffect(() => {
    const hasAlertLinks = manifest.navLinks.some(l => l.hasAlert);
    if (!hasAlertLinks) return;
    // pointsPal-specific: import service and fetch alerts
    // Generic modules without alerts skip this
    if (manifest.slug === 'pointspal') {
      import('../../modules/pointspal/service').then(({ pointspalService }) => {
        pointspalService.getAlerts().then(alerts => {
          setAlertCount(alerts.filter((a: any) => !a.dismissed).length);
        }).catch(() => {});
      });
    }
  }, [manifest.slug, manifest.navLinks]);

  const toggle = () => {
    setOpen(prev => {
      const next = !prev;
      try { localStorage.setItem(openKey, String(next)); } catch {}
      return next;
    });
  };

  return (
    <>
      {/* Parent row */}
      <div
        onClick={toggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 16px', cursor: 'pointer', borderRadius: 8,
          margin: '1px 8px', color: 'rgba(148,163,184,0.85)',
          transition: 'background 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        <span style={{ fontSize: 14, lineHeight: 1 }}>{manifest.icon}</span>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, fontFamily: "'Bricolage Grotesque', sans-serif" }}>
          {manifest.label}
        </span>
        <ChevronRight
          size={14}
          style={{ transition: 'transform 0.2s', transform: open ? 'rotate(90deg)' : 'rotate(0deg)', opacity: 0.6 }}
        />
      </div>

      {/* Sub-links */}
      {open && (
        <div style={{ paddingLeft: 8 }}>
          {manifest.navLinks.map(link => {
            const showAlert = link.hasAlert?.(user ?? null) && alertCount > 0;
            return (
              <NavLink
                key={link.path}
                to={link.path}
                end={link.path === `/${manifest.slug}`}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                style={({ isActive }) => ({
                  paddingLeft: 28, fontSize: 12, position: 'relative',
                  ...(isActive ? { color: 'var(--g400)' } : {}),
                })}
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span style={{
                        position: 'absolute', left: 14, top: '50%',
                        transform: 'translateY(-50%)', width: 6, height: 6,
                        borderRadius: '50%', background: 'var(--g500)',
                      }} />
                    )}
                    <span>{link.label}</span>
                    {showAlert && (
                      <span style={{
                        marginLeft: 'auto', background: 'var(--re600)', color: '#fff',
                        borderRadius: 20, fontSize: 10, fontWeight: 700,
                        padding: '1px 6px', fontFamily: "'Bricolage Grotesque', sans-serif",
                      }}>
                        {alertCount}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            );
          })}
        </div>
      )}
    </>
  );
};
```

**Step 3: Replace the hardcoded pointsPal block inside `Sidebar`**

Find and delete everything inside the `{/* ── Modules section ── */}` comment block (the `ppEnabled` state declarations, `ppSubLinks` array, the entire conditional block).

Replace with:

```tsx
{/* ── Modules section ── */}
{(() => {
  const activeModules = moduleRegistry.filter(m => user?.modules?.includes(m.slug));
  const hiddenSlugs = activeModules.filter(m => {
    try { return localStorage.getItem(`module_hidden_${m.slug}`) === 'true'; } catch { return false; }
  }).map(m => m.slug);
  const visibleModules = activeModules.filter(m => !hiddenSlugs.includes(m.slug));
  if (visibleModules.length === 0) return null;
  return (
    <>
      <div style={{ padding: '4px 12px 2px', fontSize: 10, fontWeight: 700, color: 'rgba(148,163,184,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: "'Bricolage Grotesque', sans-serif" }}>
        Modules
      </div>
      {visibleModules.map(m => <ModuleNavSection key={m.slug} manifest={m} />)}
    </>
  );
})()}
```

**Step 4: Add a `storage` event listener in `Sidebar` to re-render when hide preferences change**

Inside the `Sidebar` function body, add:

```tsx
const [, forceUpdate] = useState(0);

useEffect(() => {
  const handler = (e: StorageEvent) => {
    if (e.key?.startsWith('module_hidden_') || e.key?.startsWith('module_nav_open_')) {
      forceUpdate(n => n + 1);
    }
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}, []);
```

**Step 5: Remove now-unused imports and state from Sidebar.tsx**

Remove:
- `import { pointspalService } from '../../services/pointspalService';` (file no longer exists at that path)
- `const PP_STORAGE_KEY = ...`
- `const ppSubLinks = ...`
- `const [ppOpen, setPpOpen] = ...`
- `const [ppEnabled, setPpEnabled] = ...`
- `const [alertCount, setAlertCount] = ...`
- The `useEffect` that fetched alerts
- The `useEffect` that listened for `pointspal_enabled` storage events
- The `togglePp` function

**Step 6: Add import for moduleRegistry at top of Sidebar.tsx**

```tsx
import { moduleRegistry } from '../../modules';
```

**Step 7: Verify TypeScript compiles**

```bash
cd web-ui && npx tsc --noEmit
```

**Step 8: Test manually**

- Log in, verify pointsPal section appears in sidebar under "Modules"
- Expand/collapse persists in localStorage
- Navigate to sub-pages, verify active state highlighting works
- Alert badge appears on Cap Tracker if alerts exist

**Step 9: Commit**

```bash
git add web-ui/src/components/layout/Sidebar.tsx
git commit -m "feat: wire Sidebar.tsx nav from moduleRegistry — removes hardcoded pointspal block"
```

---

## Task 9: Add Modules tab to Settings

**Files:**
- Modify: `web-ui/src/pages/Settings.tsx`

**Step 1: Read Settings.tsx — find the `tabs` array**

It currently looks like:
```tsx
const tabs = [
  { id: 'profile', label: 'Profile', icon: <User size={18} /> },
  { id: 'security', label: 'Security', icon: <Lock size={18} /> },
  ...(user?.is_admin ? [{ id: 'household', ... }] : []),
  { id: 'integrations', ... },
  // ...
];
```

**Step 2: Add import for moduleRegistry**

At the top of Settings.tsx:
```tsx
import { moduleRegistry } from '../modules';
```

**Step 3: Add Modules tab conditionally (only if user has at least one module)**

In the `tabs` array, add after the `integrations` entry:

```tsx
...(user?.modules && user.modules.length > 0
  ? [{ id: 'modules', label: 'Modules', icon: <Zap size={18} /> }]
  : []),
```

(`Zap` is already imported in Settings.tsx.)

**Step 4: Add the Modules tab panel**

Find where the other tab panels are rendered (a series of `{activeTab === 'profile' && (...)}` blocks). Add after the integrations panel:

```tsx
{activeTab === 'modules' && (
  <div>
    <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Modules</h2>
    <p style={{ color: 'var(--text-secondary)', marginBottom: 24, fontSize: 14 }}>
      Modules are features granted by your plan. You can hide them from the sidebar without losing access.
    </p>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {moduleRegistry
        .filter(m => user?.modules?.includes(m.slug))
        .map(m => {
          const hiddenKey = `module_hidden_${m.slug}`;
          const [hidden, setHidden] = React.useState<boolean>(() => {
            try { return localStorage.getItem(hiddenKey) === 'true'; } catch { return false; }
          });
          const toggle = () => {
            const next = !hidden;
            setHidden(next);
            try {
              localStorage.setItem(hiddenKey, String(next));
              // Notify Sidebar to re-render
              window.dispatchEvent(new StorageEvent('storage', { key: hiddenKey, newValue: String(next) }));
            } catch {}
          };
          return (
            <div key={m.slug} style={{
              display: 'flex', alignItems: 'center', gap: 16,
              padding: '16px 20px', borderRadius: 12,
              background: 'var(--card-bg)', border: '1px solid var(--border-color)',
            }}>
              <span style={{ fontSize: 24 }}>{m.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{m.label}</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>{m.description}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  {hidden ? 'Hidden in sidebar' : 'Visible in sidebar'}
                </span>
                <div
                  onClick={toggle}
                  style={{
                    width: 44, height: 24, borderRadius: 12, cursor: 'pointer',
                    background: hidden ? 'var(--border-color)' : 'var(--g500)',
                    position: 'relative', transition: 'background 0.2s',
                  }}
                >
                  <div style={{
                    position: 'absolute', top: 3, borderRadius: '50%',
                    width: 18, height: 18, background: '#fff',
                    left: hidden ? 3 : 23, transition: 'left 0.2s',
                  }} />
                </div>
              </div>
            </div>
          );
        })}
    </div>
  </div>
)}
```

> **Note:** Using inline `React.useState` inside `.map()` violates Rules of Hooks. Extract the module card to a small component called `ModuleCard`:

```tsx
const ModuleCard: React.FC<{ manifest: import('../modules/registry').ModuleManifest }> = ({ manifest }) => {
  const hiddenKey = `module_hidden_${manifest.slug}`;
  const [hidden, setHidden] = React.useState<boolean>(() => {
    try { return localStorage.getItem(hiddenKey) === 'true'; } catch { return false; }
  });

  const toggle = () => {
    const next = !hidden;
    setHidden(next);
    try {
      localStorage.setItem(hiddenKey, String(next));
      window.dispatchEvent(new StorageEvent('storage', { key: hiddenKey, newValue: String(next) }));
    } catch {}
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16,
      padding: '16px 20px', borderRadius: 12,
      background: 'var(--card-bg)', border: '1px solid var(--border-color)',
    }}>
      <span style={{ fontSize: 24 }}>{manifest.icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>{manifest.label}</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>{manifest.description}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {hidden ? 'Hidden in sidebar' : 'Visible in sidebar'}
        </span>
        <div
          onClick={toggle}
          style={{
            width: 44, height: 24, borderRadius: 12, cursor: 'pointer',
            background: hidden ? 'var(--border-color)' : 'var(--g500)',
            position: 'relative', transition: 'background 0.2s',
          }}
        >
          <div style={{
            position: 'absolute', top: 3, borderRadius: '50%',
            width: 18, height: 18, background: '#fff',
            left: hidden ? 3 : 23, transition: 'left 0.2s',
          }} />
        </div>
      </div>
    </div>
  );
};
```

Then the tab panel simplifies to:
```tsx
{activeTab === 'modules' && (
  <div>
    <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Modules</h2>
    <p style={{ color: 'var(--text-secondary)', marginBottom: 24, fontSize: 14 }}>
      Modules are features granted by your plan. You can hide them from the sidebar without losing access.
    </p>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {moduleRegistry
        .filter(m => user?.modules?.includes(m.slug))
        .map(m => <ModuleCard key={m.slug} manifest={m} />)}
    </div>
  </div>
)}
```

Define `ModuleCard` at the top of `Settings.tsx` (before the `Settings` function).

**Step 5: Verify TypeScript compiles**

```bash
cd web-ui && npx tsc --noEmit
```

**Step 6: Test manually**

- Go to Settings → Modules tab (only appears if user has modules)
- Toggle "Hide in sidebar" for pointsPal — sidebar should update live (without page reload)
- Refresh page — hidden state should persist

**Step 7: Commit**

```bash
git add web-ui/src/pages/Settings.tsx
git commit -m "feat: add Modules tab to Settings with per-module sidebar hide toggle"
```

---

## Task 10: Clean up old `localStorage` key

The old Sidebar used `pointspal_enabled` as the localStorage key. The new system uses `module_hidden_pointspal`. The old key is now dead weight.

**Files:**
- Modify: `web-ui/src/components/layout/Sidebar.tsx` (already done in Task 8)

**Step 1: Search for any remaining references to `pointspal_enabled`**

```bash
grep -r "pointspal_enabled" web-ui/src/
```

If any remain, remove them.

**Step 2: No migration needed**

The old `pointspal_enabled=true` key meant "show pointsPal". The new `module_hidden_pointspal` key means "hide pointsPal" — inverted. Existing users with no `module_hidden_pointspal` key will default to visible (correct behaviour).

**Step 3: Commit (if any files changed)**

```bash
git add -u
git commit -m "chore: remove dead pointspal_enabled localStorage references"
```

---

## Task 11: Final verification

**Step 1: TypeScript compile check**

```bash
cd web-ui && npx tsc --noEmit
```

Expected: zero errors.

**Step 2: Start dev server and run through the full user flow**

```bash
cd web-ui && npm run dev
```

Checklist:
- [ ] Log in → `user.modules` is populated from API response
- [ ] pointsPal nav section appears under "Modules" in sidebar (if user has access)
- [ ] Sidebar section is absent if `user.modules` is empty
- [ ] Expand/collapse works, persists to localStorage
- [ ] Alert badge appears on Cap Tracker if alerts exist
- [ ] Navigate to all 5 pointsPal pages — they load correctly
- [ ] Settings → Modules tab appears
- [ ] Toggle hide → sidebar section disappears live
- [ ] Toggle show → sidebar section reappears live
- [ ] localStorage `module_hidden_pointspal` is set correctly
- [ ] Refresh page — hide state persists
- [ ] User without `pointspal` in `user.modules` → no nav, no routes, no Settings tab entry

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete frontend module system — registry-driven routes, nav, and settings"
```

---

## Adding a New Module (Reference)

When a second module (e.g. `cryptoPal`) is ready:

1. Create `web-ui/src/modules/cryptopal/` with `pages/`, `components/`, `service.ts`
2. Create `web-ui/src/modules/cryptopal/manifest.ts` — set `slug: 'cryptopal'`
3. Add to `web-ui/src/modules/index.ts`:
   ```ts
   import cryptopal from './cryptopal/manifest';
   export const moduleRegistry = [pointspal, cryptopal];
   ```
4. Backend: ensure `CRYPTOPAL_ENABLED=true` env var and module registered in `src/modules/__init__.py`

No changes to `App.tsx`, `Sidebar.tsx`, or `Settings.tsx`.
