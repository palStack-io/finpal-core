/**
 * App Component
 * Main application component with routing
 */

import React, { Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from './contexts/ToastContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastContainer } from './components/common/Toast';
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
import BudgetsMinimal from './pages/BudgetsMinimal';
import { Categories } from './pages/Categories';
import { Groups } from './pages/Groups';
import { GroupDetail } from './pages/GroupDetail';
import { Analytics } from './pages/Analytics';
import { Investments } from './pages/Investments';
import { Settings } from './pages/Settings';
import { SimpleFinSetup } from './pages/SimpleFinSetup';
import { OidcCallback } from './pages/OidcCallback';

/** Layout wrapper that adds sidebar for authenticated pages */
const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isDemoUser } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated || isDemoUser) return;
    if (sessionStorage.getItem('bg_sync_fired')) return;
    sessionStorage.setItem('bg_sync_fired', '1');
    api.post('/api/v1/auth/sync').catch(() => {}); // fire-and-forget
  }, [isAuthenticated, isDemoUser]);

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <main className="main-content">
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
              path="/categories"
              element={
                <ProtectedRoute>
                  <AppLayout><Categories /></AppLayout>
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
            <Route
              path="/simplefin"
              element={
                <ProtectedRoute>
                  <AppLayout><SimpleFinSetup /></AppLayout>
                </ProtectedRoute>
              }
            />

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

            {/* Catch-all redirect */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>

          {/* Toast Notifications */}
          <ToastContainer />
        </BrowserRouter>
      </ToastProvider>
    </ThemeProvider>
  );
}

export default App;
