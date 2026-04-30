import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { api } from '../services/api';

export const OidcCallback: React.FC = () => {
  const navigate = useNavigate();
  const { setToken, setRefreshToken, login } = useAuthStore();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');

    if (!accessToken || !refreshToken) {
      setError('Authentication failed: no tokens received.');
      return;
    }

    // Store tokens so the api interceptor can use them immediately
    setToken(accessToken);
    setRefreshToken(refreshToken);

    // Fetch user info with the new token
    api.get('/api/v1/users/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(({ data }) => {
        const user = data.user ?? data;
        login(user, accessToken, refreshToken);
        // Clear the fragment before navigating
        window.history.replaceState(null, '', window.location.pathname);
        navigate(user.hasCompletedOnboarding ? '/dashboard' : '/onboarding', { replace: true });
      })
      .catch(() => {
        setError('Authentication failed: could not load user profile.');
      });
  }, []);

  if (error) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
        background: 'var(--bg-primary)',
        color: 'var(--text-primary)'
      }}>
        <p style={{ color: '#ef4444', fontSize: '16px' }}>{error}</p>
        <button
          onClick={() => navigate('/login')}
          style={{
            padding: '10px 20px',
            background: '#15803d',
            border: 'none',
            borderRadius: '8px',
            color: 'white',
            cursor: 'pointer',
            fontWeight: '600'
          }}
        >
          Back to Login
        </button>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-primary)'
    }}>
      <div style={{
        width: '40px',
        height: '40px',
        border: '3px solid var(--border-light)',
        borderTop: '3px solid #22c55e',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite'
      }} />
      <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default OidcCallback;
