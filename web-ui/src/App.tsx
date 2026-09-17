/**
 * App Component
 * Main application component with routing
 */

import React, { Suspense, useEffect, useRef, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { ToastProvider } from './contexts/ToastContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastContainer } from './components/common/Toast';
import { CoinAwardProvider } from './contexts/CoinAwardContext';
import { CoinAwardContainer } from './components/coins/CoinAwardContainer';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { Sidebar } from './components/layout/Sidebar';
import { useAuthStore } from './store/authStore';
import { api } from './services/api';
import { moduleRegistry } from './modules';
import { Loading } from './components/common/Loading';
import './styles/finpal-theme.css';

// Auth Pages
import { Landing } from './pages/Landing';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Onboarding } from './pages/Onboarding';
import { ForgotPassword } from './pages/ForgotPassword';
import { ResetPassword } from './pages/ResetPassword';

// Main Pages
import { Dashboard } from './pages/Dashboard';
import { Transactions } from './pages/Transactions';
import { Accounts } from './pages/Accounts';
import { Goals } from './pages/Goals';
import Review from './pages/Review';
import { Kit } from './pages/Kit';
import BudgetsMinimal from './pages/BudgetsMinimal';
// The canonical categories UI is the component Settings used to host, NOT the
// 441-line `pages/Categories.tsx` that used to answer this route — that page was
// unreachable (nothing linked to it) and materially less capable. Deleted.
import { CategoryManagement } from './components/CategoryManagement';
import { RecurringTransactions } from './components/RecurringTransactions';
import { TransactionRules } from './components/TransactionRules';
import { Groups } from './pages/Groups';
import { GroupDetail } from './pages/GroupDetail';
import { Analytics } from './pages/Analytics';
import { Investments } from './pages/Investments';
import { Settings } from './pages/Settings';
import { OidcCallback } from './pages/OidcCallback';
import NotFound from './pages/NotFound';

/** Layout wrapper that adds sidebar for authenticated pages */
const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isDemoUser } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated || isDemoUser) return;
    if (sessionStorage.getItem('bg_sync_fired')) return;
    sessionStorage.setItem('bg_sync_fired', '1');
    api.post('/api/v1/auth/sync').catch(() => {}); // fire-and-forget
  }, [isAuthenticated, isDemoUser]);

  /**
   * The drawer state lives HERE and not in `Sidebar`, which is the whole point.
   * `Sidebar` reading its own state is exactly why #74’s props were ignored and
   * D-46 deleted them: the trigger, the scrim and the rail all have to agree, and
   * three components cannot agree about state that only one of them owns.
   *
   * Only mounted below --bp-phone in effect — `.sidebar-trigger` and
   * `.sidebar-scrim` are `display: none` above it — so at tablet and desktop
   * widths this is inert and the sidebar is simply persistent.
   */
  const [drawerOpen, setDrawerOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const location = useLocation();

  // Close on route change. Without this the drawer stays open over the page you
  // just navigated to, which reads as the link having failed.
  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setDrawerOpen(false); return; }
      if (e.key !== 'Tab') return;
      // Focus trap. A drawer that covers the page while Tab walks the page behind
      // it is a screen-reader trap in the other direction — the focus ring goes
      // somewhere the user cannot see.
      const rail = document.getElementById('app-sidebar');
      if (!rail) return;
      const focusable = rail.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    document.getElementById('app-sidebar')?.querySelector<HTMLElement>('a[href], button')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  const closeDrawer = () => {
    setDrawerOpen(false);
    // Restored to the control that opened it, not left on a node that just left
    // the accessibility tree.
    triggerRef.current?.focus();
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <button
        ref={triggerRef}
        type="button"
        className="sidebar-trigger"
        aria-label="Open navigation"
        aria-expanded={drawerOpen}
        aria-controls="app-sidebar"
        onClick={() => setDrawerOpen((v) => !v)}
      >
        <Menu size={20} />
      </button>

      {drawerOpen && (
        <button
          type="button"
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={closeDrawer}
        />
      )}

      <Sidebar isOpen={drawerOpen} onClose={closeDrawer} />
      {/* Hidden from assistive tech while the drawer covers it, so a screen
          reader does not read the page underneath the open navigation. */}
      <main className="main-content" aria-hidden={drawerOpen || undefined}>
        {children}
      </main>
    </div>
  );
};

function App() {
  const { user, features } = useAuthStore();
  return (
    <ThemeProvider>
      <ToastProvider>
        <CoinAwardProvider>
        <BrowserRouter>
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/auth/callback" element={<OidcCallback />} />

            {/* Onboarding Route - requires auth but not onboarding completion */}
            <Route
              path="/onboarding"
              element={
                <ProtectedRoute requireOnboarding={false}>
                  <Onboarding />
                </ProtectedRoute>
              }
            />

            {/* Protected Routes - require auth and onboarding */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <AppLayout><Dashboard /></AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/transactions"
              element={
                <ProtectedRoute>
                  <AppLayout><Transactions /></AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/accounts"
              element={
                <ProtectedRoute>
                  <AppLayout><Accounts /></AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/budgets"
              element={
                <ProtectedRoute>
                  <AppLayout><BudgetsMinimal /></AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/goals"
              element={
                <ProtectedRoute>
                  <AppLayout><Goals /></AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/review"
              element={
                <ProtectedRoute>
                  <AppLayout><Review /></AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/kit"
              element={
                <ProtectedRoute>
                  <AppLayout><Kit /></AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/categories"
              element={
                <ProtectedRoute>
                  <AppLayout><CategoryManagement /></AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/recurring"
              element={
                <ProtectedRoute>
                  <AppLayout><RecurringTransactions /></AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/rules"
              element={
                <ProtectedRoute>
                  <AppLayout><TransactionRules /></AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/groups"
              element={
                <ProtectedRoute>
                  <AppLayout><Groups /></AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/groups/:id"
              element={
                <ProtectedRoute>
                  <AppLayout><GroupDetail /></AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/analytics"
              element={
                <ProtectedRoute>
                  <AppLayout><Analytics /></AppLayout>
                </ProtectedRoute>
              }
            />
            {features?.investments !== false && (
              <Route
                path="/investments"
                element={
                  <ProtectedRoute>
                    <AppLayout><Investments /></AppLayout>
                  </ProtectedRoute>
                }
              />
            )}
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <Settings />
                </ProtectedRoute>
              }
            />
            {/* /simplefin is DELETED, not moved. It rendered a 425-line page that
                nothing linked to, duplicating `SimpleFinSettings` which is live in
                Settings → Integrations. SimpleFin is configuration, not a daily
                surface, so it stays there. D-46's precedent: delete the dead
                control rather than build what it implies. */}

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

            {/* *** A SIGNED-IN USER MUST NOT BE DROPPED ON THE MARKETING PAGE.
                *** This sent everything unmatched to `/`, which is `Landing` —
                "Your Money, Your Rules", "Get Started Today", a Sign-up button.
                So a logged-in user who followed a stale `/learnpal` link, or who
                hid a module and then used a bookmark to one of its pages, was
                shown the signed-out pitch for the product they are already
                inside. Found by `every-page.spec.ts`, which walks the module
                routes; the older smoke sweep called the same behaviour a SKIP
                ("route likely absent from this build"), which is the reading
                that hid it.

                Signed in -> the dashboard, which is where they were going.
                Signed out -> the landing page, unchanged.

                *** AND AS OF 2026-09-16 IT IS A PAGE, NOT A REDIRECT. *** Both
                halves of the note above are about WHERE to send someone; the
                unexamined half was whether to send them anywhere silently. A
                stale bookmark, a truncated link and a deleted group all read as
                "finPal moved me for no reason". `NotFound` says what happened,
                says nothing is wrong with their data, and offers the same two
                destinations this redirect chose between. See
                `docs/mockups/entry-web.html`. */}
            <Route path="*" element={<NotFound />} />
          </Routes>

          {/* Toast Notifications */}
          <ToastContainer />

          {/* The award moment. One container, app-wide: an earning page's only
              job is to name its surface, so no page can earn invisibly. */}
          <CoinAwardContainer />
        </BrowserRouter>
        </CoinAwardProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

export default App;
