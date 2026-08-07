/**
 * OIDC callback regression test.
 *
 * The callback used to GET /api/v1/users/me, which does not exist on the backend
 * (the real route is /api/v1/auth/me, served by auth_api.get_current_user). The
 * request 404'd and the component's .catch() turned it into
 * "Authentication failed: could not load user profile." for every SSO login.
 *
 * These tests pin the URL and assert the success path, so repointing it at a
 * nonexistent route fails here instead of silently in production.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { api } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { OidcCallback } from '../../pages/OidcCallback';

const navigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<any>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

// A WILDCARD ORIGIN, not a hardcoded one. `*/api/v1/x` matches that path on ANY
// origin, which is what makes these tests independent of whatever base URL the
// environment hands axios.
//
// `http://localhost` worked on a developer's machine and matched NOTHING in CI,
// where the requests arrive relative — the very first CI run of this suite failed
// for exactly that reason. A bare path (`''`) is not the fix either: MSW resolves
// it against the jsdom origin, which put it back on one specific base and broke
// 51 tests. Only the wildcard is origin-agnostic.
const BASE = '*';

beforeAll(() => {
  // MSW in Node intercepts http/https, not the XHR adapter jsdom uses.
  api.defaults.adapter = 'http';
});

beforeEach(() => {
  navigate.mockReset();
  useAuthStore.setState({ user: null, token: null, refreshToken: null, isAuthenticated: false });
  window.location.hash = '#access_token=at-123&refresh_token=rt-456';
});

const renderCallback = () =>
  render(
    <MemoryRouter initialEntries={['/auth/callback']}>
      <OidcCallback />
    </MemoryRouter>
  );

describe('OidcCallback', () => {
  it('fetches the profile from /api/v1/auth/me, not /api/v1/users/me', async () => {
    const requested: string[] = [];
    server.events.on('request:start', ({ request }) => {
      requested.push(new URL(request.url).pathname);
    });

    renderCallback();

    await waitFor(() => expect(navigate).toHaveBeenCalled());

    expect(requested).toContain('/api/v1/auth/me');
    expect(requested).not.toContain('/api/v1/users/me');
  });

  it('logs the user in and routes to /dashboard when onboarding is complete', async () => {
    renderCallback();

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith('/dashboard', { replace: true })
    );
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().user?.email).toBe('test@test.com');
  });

  it('routes to /onboarding when the profile says onboarding is incomplete', async () => {
    server.use(
      http.get(`${BASE}/api/v1/auth/me`, () =>
        HttpResponse.json({
          id: 'new@test.com',
          email: 'new@test.com',
          name: 'New User',
          hasCompletedOnboarding: false,
        })
      )
    );

    renderCallback();

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith('/onboarding', { replace: true })
    );
  });

  it('surfaces an error if the profile request fails', async () => {
    server.use(
      http.get(`${BASE}/api/v1/auth/me`, () =>
        HttpResponse.json({ error: 'nope' }, { status: 404 })
      )
    );

    renderCallback();

    expect(
      await screen.findByText('Authentication failed: could not load user profile.')
    ).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });
});
