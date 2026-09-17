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

describe('the award queue is honest about what is waiting', () => {
  const award = readFileSync('src/components/coins/CoinAward.tsx', 'utf8');
  const ctx = readFileSync('src/contexts/CoinAwardContext.tsx', 'utf8');

  it('says how many more are queued', () => {
    // *** THE PILE-UP WAS FOUND ON THE DEMO. *** demo1 arrives with twelve
    // unseen awards, each dismissed by hand, so a panel returned twelve times
    // with nothing saying why.
    expect(ctx).toMatch(/remaining: Math\.max\(0, queue\.length - 1\)/);
    expect(award).toMatch(/remaining\?: number/);
    expect(award).toMatch(/coin-award-remaining/);
  });

  it('does NOT auto-dismiss or auto-advance', () => {
    // A timer would clear an award the user has not read, and the payoff
    // sentence IS the reward (decision 6). Hurrying it along throws away the
    // only thing the award is for.
    expect(award).not.toMatch(/setTimeout|setInterval/);
    expect(ctx).not.toMatch(/setTimeout\(\s*\(\)\s*=>\s*dismiss/);
  });

  it('anchors the count to the CARD, not the viewport', () => {
    // Absolute positioning without a positioned ancestor lands it in the
    // corner of the screen, inside the fixed container.
    expect(award).toMatch(/position: 'relative'/);
  });
});
