import { http, HttpResponse } from 'msw';

export const handlers = [
  http.post('/api/v1/auth/login', () => {
    return HttpResponse.json({
      access_token: 'test-access-token',
      refresh_token: 'test-refresh-token',
      user: {
        id: 'test@test.com',
        email: 'test@test.com',
        name: 'Test User',
        default_currency_code: 'USD',
        hasCompletedOnboarding: true,
        modules: ['pointspal'],
        profile_emoji: '👤',
        timezone: 'UTC',
      },
    });
  }),

  http.get('/api/v1/auth/me', () => {
    return HttpResponse.json({
      id: 'test@test.com',
      email: 'test@test.com',
      name: 'Test User',
      default_currency_code: 'USD',
      hasCompletedOnboarding: true,
      modules: ['pointspal'],
    });
  }),

  http.get('/api/v1/users/me', () => {
    return HttpResponse.json({
      id: 'test@test.com',
      email: 'test@test.com',
      name: 'Test User',
      modules: ['pointspal'],
    });
  }),

  http.get('/api/v1/pointspal/alerts', () => {
    return HttpResponse.json([]);
  }),

  http.get('/api/v1/pointspal/overview', () => {
    return HttpResponse.json({
      total_cards: 0,
      total_programs: 0,
      active_alerts: 0,
    });
  }),
];
