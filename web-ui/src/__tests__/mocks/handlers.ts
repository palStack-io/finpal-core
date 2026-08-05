import { http, HttpResponse } from 'msw';

// MSW 2.x setupServer (Node) requires absolute URLs.
// jsdom origin defaults to http://localhost.
const BASE = 'http://localhost';

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authHandlers = [
  http.post(`${BASE}/api/v1/auth/login`, () =>
    HttpResponse.json({
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
    })
  ),

  http.get(`${BASE}/api/v1/auth/me`, () =>
    HttpResponse.json({
      id: 'test@test.com',
      email: 'test@test.com',
      name: 'Test User',
      default_currency_code: 'USD',
      hasCompletedOnboarding: true,
      modules: ['pointspal'],
    })
  ),

  // NOTE: deliberately no handler for /api/v1/users/me — that route does not
  // exist on the backend (only /api/v1/auth/me does). A mock for it previously
  // hid a live 404 in the OIDC callback. Leave it unmocked so any code that
  // calls it fails loudly.
];

// ── Transactions ──────────────────────────────────────────────────────────────
export const transactionHandlers = [
  // The trailing slash matters. This mock used to be registered on the
  // slash-less path and to return a `pagination` key, while the handler that
  // actually served that URL — the legacy blueprint's — read no query parameters
  // and sent no `pagination` at all. So the contract test asserted a shape the
  // server never produced, and passed. The legacy list handler is gone and the
  // restx handler serves both spellings; this mock now mirrors *its* payload,
  // `summary` included.
  //
  // Registered with a trailing slash only, deliberately: anything still calling
  // a URL this does not match fails loudly rather than matching a stale mock.
  http.get(`${BASE}/api/v1/transactions/`, ({ request }) => {
    const url = new URL(request.url);
    const perPage = Number(url.searchParams.get('per_page') ?? 50);
    const page = Number(url.searchParams.get('page') ?? 1);
    const total = 1;

    return HttpResponse.json({
      success: true,
      transactions: [
        {
          id: 1,
          description: 'Coffee',
          amount: 4.5,
          date: '2026-04-01T10:00:00',
          currency_code: 'USD',
          card_used: 'Cash',
          transaction_type: 'expense',
          category_id: 1,
          account_id: 1,
          user_id: 'test@test.com',
          category: { id: 1, name: 'Food', icon: '🍔' },
          account: { id: 1, name: 'Checking' },
        },
      ],
      summary: {
        total_income: 0,
        total_expense: 4.5,
        net_balance: -4.5,
      },
      pagination: {
        page,
        per_page: perPage,
        total,
        pages: Math.max(1, Math.ceil(total / perPage)),
        has_next: page * perPage < total,
        has_prev: page > 1,
      },
    });
  }),

  http.get(`${BASE}/api/v1/transactions/recent`, () =>
    HttpResponse.json({ success: true, transactions: [] })
  ),

  http.get(`${BASE}/api/v1/transactions/:id`, ({ params }) =>
    HttpResponse.json({
      success: true,
      transaction: {
        id: Number(params.id),
        description: 'Coffee',
        amount: 4.5,
        date: '2026-04-01T10:00:00',
        currency_code: 'USD',
        card_used: 'Cash',
        transaction_type: 'expense',
        category_id: 1,
        account_id: 1,
        user_id: 'test@test.com',
      },
    })
  ),

  http.post(`${BASE}/api/v1/transactions`, () =>
    HttpResponse.json(
      {
        success: true,
        transaction: {
          id: 99,
          description: 'New',
          amount: 10.0,
          date: '2026-04-28T10:00:00',
          currency_code: 'USD',
          card_used: 'Cash',
          transaction_type: 'expense',
          user_id: 'test@test.com',
        },
        message: 'Transaction created successfully',
      },
      { status: 201 }
    )
  ),

  http.put(`${BASE}/api/v1/transactions/:id`, ({ params }) =>
    HttpResponse.json({
      success: true,
      transaction: {
        id: Number(params.id),
        description: 'Updated',
        amount: 5.0,
        date: '2026-04-01T10:00:00',
        currency_code: 'USD',
        card_used: 'Cash',
        transaction_type: 'expense',
        user_id: 'test@test.com',
      },
      message: 'Transaction updated successfully',
    })
  ),

  http.delete(`${BASE}/api/v1/transactions/:id`, () =>
    HttpResponse.json({ success: true, message: 'Transaction deleted successfully' })
  ),
];

// ── Accounts ──────────────────────────────────────────────────────────────────
export const accountHandlers = [
  http.get(`${BASE}/api/v1/accounts`, () =>
    HttpResponse.json({
      success: true,
      accounts: [
        {
          id: 1,
          name: 'Checking',
          account_type: 'checking',
          balance: 1000.0,
          currency_code: 'USD',
          institution: 'Bank of Test',
          is_active: true,
          user_id: 'test@test.com',
          import_source: 'manual',
        },
      ],
    })
  ),

  http.post(`${BASE}/api/v1/accounts`, () =>
    HttpResponse.json(
      {
        success: true,
        account: {
          id: 99,
          name: 'New Account',
          account_type: 'savings',
          balance: 0.0,
          currency_code: 'USD',
          is_active: true,
          user_id: 'test@test.com',
        },
        message: 'Account created successfully',
      },
      { status: 201 }
    )
  ),

  http.put(`${BASE}/api/v1/accounts/:id`, ({ params }) =>
    HttpResponse.json({
      success: true,
      account: {
        id: Number(params.id),
        name: 'Updated Account',
        account_type: 'checking',
        balance: 500.0,
        currency_code: 'USD',
        is_active: true,
        user_id: 'test@test.com',
      },
      message: 'Account updated successfully',
    })
  ),

  http.delete(`${BASE}/api/v1/accounts/:id`, () =>
    HttpResponse.json({ success: true, message: 'Account deleted successfully' })
  ),
];

// ── Budgets ───────────────────────────────────────────────────────────────────
export const budgetHandlers = [
  http.get(`${BASE}/api/v1/budgets`, () =>
    HttpResponse.json({
      success: true,
      budgets: [
        {
          id: 1,
          name: 'Groceries',
          amount: 500.0,
          period: 'monthly',
          start_date: '2026-04-01',
          category_id: 1,
          user_id: 'test@test.com',
          is_active: true,
        },
      ],
    })
  ),

  http.post(`${BASE}/api/v1/budgets`, () =>
    HttpResponse.json(
      {
        success: true,
        budget: {
          id: 99,
          name: 'New Budget',
          amount: 200.0,
          period: 'monthly',
          start_date: '2026-04-01',
          user_id: 'test@test.com',
          is_active: true,
        },
        message: 'Budget created successfully',
      },
      { status: 201 }
    )
  ),
];

// ── Categories ────────────────────────────────────────────────────────────────
export const categoryHandlers = [
  http.get(`${BASE}/api/v1/categories`, () =>
    HttpResponse.json({
      success: true,
      categories: [
        { id: 1, name: 'Food & Dining', icon: '🍔', color: '#f59e0b', parent_id: null, user_id: 'test@test.com' },
        { id: 2, name: 'Restaurants', icon: '🍽', color: '#f59e0b', parent_id: 1, user_id: 'test@test.com' },
      ],
    })
  ),
];

// ── pointsPal ─────────────────────────────────────────────────────────────────
export const pointspalHandlers = [
  http.get(`${BASE}/api/v1/pointspal/alerts`, () => HttpResponse.json([])),

  http.get(`${BASE}/api/v1/pointspal/overview`, () =>
    HttpResponse.json({
      total_cards: 0,
      total_programs: 0,
      active_alerts: 0,
    })
  ),
];

// ── Combined ──────────────────────────────────────────────────────────────────
export const handlers = [
  ...authHandlers,
  ...transactionHandlers,
  ...accountHandlers,
  ...budgetHandlers,
  ...categoryHandlers,
  ...pointspalHandlers,
];
