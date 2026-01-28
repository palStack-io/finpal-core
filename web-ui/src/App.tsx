/**
 * App Component
 * Main application component with routing
 */

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from './contexts/ToastContext';
import { ToastContainer } from './components/common/Toast';
import { ProtectedRoute } from './components/auth/ProtectedRoute';

// Auth Pages
import { Landing } from './pages/Landing';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Onboarding } from './pages/Onboarding';

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

function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

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
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/transactions"
            element={
              <ProtectedRoute>
                <Transactions />
              </ProtectedRoute>
            }
          />
          <Route
            path="/accounts"
            element={
              <ProtectedRoute>
                <Accounts />
              </ProtectedRoute>
            }
          />
          <Route
            path="/budgets"
            element={
              <ProtectedRoute>
                <BudgetsMinimal />
              </ProtectedRoute>
            }
          />
          <Route
            path="/categories"
            element={
              <ProtectedRoute>
                <Categories />
              </ProtectedRoute>
            }
          />
          <Route
            path="/groups"
            element={
              <ProtectedRoute>
                <Groups />
              </ProtectedRoute>
            }
          />
          <Route
            path="/groups/:id"
            element={
              <ProtectedRoute>
                <GroupDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/analytics"
            element={
              <ProtectedRoute>
                <Analytics />
              </ProtectedRoute>
            }
          />
          <Route
            path="/investments"
            element={
              <ProtectedRoute>
                <Investments />
              </ProtectedRoute>
            }
          />
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
                <SimpleFinSetup />
              </ProtectedRoute>
            }
          />

          {/* Catch-all redirect */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>

        {/* Toast Notifications */}
        <ToastContainer />
      </BrowserRouter>
    </ToastProvider>
  );
}

export default App;
