/**
 * `App.tsx` mounts the award provider AND its container.
 *
 * *** THIS GATE IS THE PRICE OF `useSurfaceCoins` NOT THROWING. *** That hook
 * sits on eleven pages and deliberately no-ops when no provider is mounted, so
 * that adding a reward feature can never blank a page. The cost is that a
 * missing provider becomes INVISIBLE: every page renders, nothing errors, the
 * 04:30 cron still pays the coins, and no award is ever shown again.
 *
 * That is exactly D-187's shape — a reader with no writer — and exactly how
 * `CoinAward.tsx` came to ship with zero consumers in the first place. So the
 * mount is asserted rather than assumed.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const app = readFileSync('src/App.tsx', 'utf8');

describe('App mounts the award moment', () => {
  it('imports and mounts CoinAwardProvider', () => {
    expect(app).toContain('CoinAwardProvider');
    expect(app).toMatch(/<CoinAwardProvider>/);
  });

  it('imports and mounts CoinAwardContainer', () => {
    expect(app).toContain('CoinAwardContainer');
    expect(app).toMatch(/<CoinAwardContainer\s*\/>/);
  });

  it('puts the container INSIDE the provider', () => {
    // Otherwise the container throws on `useCoinAwards` and the whole app
    // fails to render — the loud failure, but still worth pinning.
    const openProvider = app.indexOf('<CoinAwardProvider>');
    const container = app.indexOf('<CoinAwardContainer');
    const closeProvider = app.indexOf('</CoinAwardProvider>');
    expect(openProvider).toBeGreaterThan(-1);
    expect(container).toBeGreaterThan(openProvider);
    expect(container).toBeLessThan(closeProvider);
  });
});
