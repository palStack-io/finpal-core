import { afterEach, describe, expect, it } from 'vitest';
import { FinpalClient, FinpalError } from '../src/client.js';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

function stubFetch(status: number, body: unknown, capture?: (u: string, o: RequestInit) => void) {
  globalThis.fetch = (async (url: string, opts: RequestInit = {}) => {
    capture?.(url, opts);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as Response;
  }) as typeof fetch;
}

const client = () => new FinpalClient('http://finpal:8094', 'fp_live_abc');

describe('FinpalClient', () => {
  it('sends the token as X-API-Key', async () => {
    let seenUrl = '';
    let seenHeaders: Record<string, string> = {};
    stubFetch(200, { success: true }, (u, o) => {
      seenUrl = u;
      seenHeaders = (o.headers ?? {}) as Record<string, string>;
    });

    await client().get('/api/v1/accounts');

    expect(seenUrl).toBe('http://finpal:8094/api/v1/accounts');
    expect(seenHeaders['X-API-Key']).toBe('fp_live_abc');
  });

  it('appends query params and skips undefined ones', async () => {
    let seenUrl = '';
    stubFetch(200, {}, (u) => { seenUrl = u; });

    await client().get('/api/v1/analytics/spending-summary', {
      start_date: '2026-03-01', group_by: undefined as unknown as string, page: 2,
    });

    expect(seenUrl).toContain('start_date=2026-03-01');
    expect(seenUrl).toContain('page=2');
    expect(seenUrl).not.toContain('group_by');
  });

  it('never puts the token in the url', async () => {
    let seenUrl = '';
    stubFetch(200, {}, (u) => { seenUrl = u; });
    await client().get('/api/v1/accounts');
    expect(seenUrl).not.toContain('fp_live_abc');
  });

  // Each of these is a sentence the user can act on. An agent that cannot tell
  // "expired" from "wrong URL" cannot tell its operator what to fix.
  it.each([
    ['token_expired', /expired/i],
    ['token_revoked', /revoked/i],
    ['invalid_token', /did not recognise/i],
  ])('turns %s into an actionable message', async (code, matcher) => {
    stubFetch(401, { error: code });
    await expect(client().get('/api/v1/accounts')).rejects.toThrow(matcher);
  });

  it('reports insufficient_scope as a missing read scope, not a refused write', async () => {
    // The client only issues GETs. A message about "cannot make that change"
    // sends the user hunting for a write they never attempted.
    stubFetch(403, { error: 'insufficient_scope' });
    const call = client().get('/api/v1/accounts');
    await expect(call).rejects.toThrow(/cannot read/i);
    await expect(call).rejects.toThrow(/read scope/i);
  });

  it('carries the code on the error for programmatic checks', async () => {
    stubFetch(401, { error: 'token_expired' });
    try {
      await client().get('/api/v1/accounts');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(FinpalError);
      expect((err as FinpalError).code).toBe('token_expired');
    }
  });

  it('names the url when the instance is unreachable', async () => {
    globalThis.fetch = (async () => { throw new TypeError('fetch failed'); }) as typeof fetch;
    await expect(client().get('/api/v1/accounts'))
      .rejects.toThrow(/http:\/\/finpal:8094/);
  });

  it('does not leak the token into an error message', async () => {
    stubFetch(500, { error: 'boom' });
    await expect(client().get('/api/v1/accounts'))
      .rejects.toThrow(/^(?!.*fp_live_abc).*$/s);
  });
});
