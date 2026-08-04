import { describe, expect, it } from 'vitest';
import { MAX_PAGE_SIZE, TOOLS } from '../src/tools.js';
import type { ScrubContext } from '../src/scrub.js';

const ctx: ScrubContext = { ownerId: 'owner@example.com' };

/** A client that records calls and returns canned bodies. */
function fakeClient(body: unknown = {}) {
  const calls: Array<{ path: string; params: Record<string, unknown> }> = [];
  return {
    calls,
    get: async (path: string, params: Record<string, unknown> = {}) => {
      calls.push({ path, params });
      return body;
    },
  };
}

const tool = (name: string) => {
  const found = TOOLS.find((t) => t.name === name);
  if (!found) throw new Error(`no tool named ${name}`);
  return found;
};

describe('tool surface', () => {
  it('exposes exactly the seven read tools', () => {
    expect(TOOLS.map((t) => t.name).sort()).toEqual([
      'get_budget_status',
      'get_net_worth_trend',
      'get_recurring_transactions',
      'get_spending_summary',
      'list_accounts',
      'list_categories',
      'search_transactions',
    ]);
  });

  it('gives every tool a description and a schema', () => {
    for (const t of TOOLS) {
      expect(t.description.length).toBeGreaterThan(20);
      expect(t.inputSchema).toHaveProperty('type', 'object');
    }
  });

  it('has no tool whose name suggests a write', () => {
    // Read-only phase: a write tool here would be reachable before the
    // guardrails are wired to a live endpoint.
    for (const t of TOOLS) {
      expect(t.name).not.toMatch(/create|update|delete|set_|remove/);
    }
  });
});

describe('search_transactions', () => {
  it('calls the transactions endpoint with a trailing slash', async () => {
    // No trailing slash resolves to a different, legacy handler in finpal_core.
    const client = fakeClient({ transactions: [] });
    await tool('search_transactions').run(client, {}, ctx);
    expect(client.calls[0].path).toBe('/api/v1/transactions/');
  });

  it('caps the page size', async () => {
    const client = fakeClient({ transactions: [] });
    await tool('search_transactions').run(client, { per_page: 5000 }, ctx);
    expect(client.calls[0].params.per_page).toBe(MAX_PAGE_SIZE);
  });

  it('passes filters through', async () => {
    const client = fakeClient({ transactions: [] });
    await tool('search_transactions').run(client, {
      search: 'tesco', start_date: '2026-03-01', category_id: 3,
    }, ctx);
    expect(client.calls[0].params).toMatchObject({
      search: 'tesco', start_date: '2026-03-01', category_id: 3,
    });
  });

  it('scrubs the result', async () => {
    const client = fakeClient({
      transactions: [{ card_used: 'Visa ...4242', notes: 'acct 999988887777' }],
    });
    const out = JSON.stringify(await tool('search_transactions').run(client, {}, ctx));
    expect(out).not.toContain('4242');
    expect(out).not.toContain('999988887777');
  });
});

describe('get_spending_summary', () => {
  it('requires a date range in its schema', () => {
    expect(tool('get_spending_summary').inputSchema.required)
      .toEqual(expect.arrayContaining(['start_date', 'end_date']));
  });

  it('calls the summary endpoint', async () => {
    const client = fakeClient({ groups: [], total: 0 });
    await tool('get_spending_summary').run(client, {
      start_date: '2026-03-01', end_date: '2026-03-31', group_by: 'category',
    }, ctx);
    expect(client.calls[0].path).toBe('/api/v1/analytics/spending-summary');
    expect(client.calls[0].params).toMatchObject({ group_by: 'category' });
  });

  it('says that merchant means the description', () => {
    // There is no merchant column; promising one would mislead the model.
    expect(tool('get_spending_summary').description).toMatch(/description/i);
  });
});

describe('the remaining read tools', () => {
  it.each([
    ['list_accounts', '/api/v1/accounts'],
    ['list_categories', '/api/v1/categories/'],
    ['get_budget_status', '/api/v1/budgets/'],
    ['get_net_worth_trend', '/api/v1/analytics/networth'],
    ['get_recurring_transactions', '/api/v1/recurring/'],
  ])('%s calls %s', async (name, path) => {
    const client = fakeClient({});
    await tool(name).run(client, {}, ctx);
    expect(client.calls[0].path).toBe(path);
  });

  it('scrubs list_accounts, which carries the last four digits', async () => {
    const client = fakeClient({ accounts: [{ name: 'Chase ...4242' }] });
    const out = JSON.stringify(await tool('list_accounts').run(client, {}, ctx));
    expect(out).not.toContain('4242');
    expect(out).toContain('Chase');
  });
});
