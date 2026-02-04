/**
 * Demo Timer Hook
 * Manages demo session countdown and auto-logout
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import { useNavigate } from 'react-router-dom';

interface UseDemoTimerReturn {
  remainingSeconds: number;
  isDemo: boolean;
  formattedTime: string;
  isExpired: boolean;
}

export function useDemoTimer(): UseDemoTimerReturn {
  const { isDemoUser, demoExpiresAt, logout } = useAuthStore();
  const navigate = useNavigate();
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [isExpired, setIsExpired] = useState(false);

  const calculateRemaining = useCallback(() => {
    if (!demoExpiresAt) return 0;
    const expiryTime = new Date(demoExpiresAt).getTime();
    const now = Date.now();
    return Math.max(0, Math.floor((expiryTime - now) / 1000));
  }, [demoExpiresAt]);

  const formatTime = useCallback((seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }, []);

  useEffect(() => {
    if (!isDemoUser || !demoExpiresAt) {
      setRemainingSeconds(0);
      return;
    }

    // Initial calculation
    setRemainingSeconds(calculateRemaining());

    // Update every second
    const interval = setInterval(() => {
      const remaining = calculateRemaining();
      setRemainingSeconds(remaining);

      if (remaining <= 0) {
        setIsExpired(true);
        clearInterval(interval);
        // Auto-logout
        logout();
        navigate('/login', {
          state: { message: 'Your demo session has expired. Thank you for trying finPal!' }
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isDemoUser, demoExpiresAt, calculateRemaining, logout, navigate]);

  return {
    remainingSeconds,
    isDemo: isDemoUser,
    formattedTime: formatTime(remainingSeconds),
    isExpired,
  };
}

export default useDemoTimer;
