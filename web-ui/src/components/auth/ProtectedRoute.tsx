/**
 * Protected Route Component
 * Authentication guard for protected routes
 */

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { Loading } from '../common/Loading';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireOnboarding?: boolean;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requireOnboarding = true,
}) => {
  const { isAuthenticated, hasCompletedOnboarding, isLoading } = useAuthStore();
  const location = useLocation();

  if (isLoading) {
    return <Loading fullScreen text="Loading..." />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requireOnboarding && !hasCompletedOnboarding) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
};
