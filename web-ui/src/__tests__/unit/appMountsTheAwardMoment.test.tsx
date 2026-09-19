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
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
import { fireEvent, render, screen } from '@testing-library/react';

import { CoinAward } from '../../components/coins/CoinAward';

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

describe('no award is ever shown to a signed-out visitor', () => {
  const ctx = readFileSync('src/contexts/CoinAwardContext.tsx', 'utf8');
  const container = readFileSync(
    'src/components/coins/CoinAwardContainer.tsx', 'utf8');

  it('clears the queue when the user changes or goes away', () => {
    // *** THE OWNER CAUGHT THIS ON THE DEMO: a coin award rendering on the
    // SIGNED-OUT login page, and the figure was in EUROS — a previous
    // persona's award still sitting in this provider's state. Two faults: the
    // queue survived a logout, and the `seen` ref survived a user change,
    // which would also have suppressed the NEXT user's first award for an act
    // the previous one had been shown.
    expect(ctx).toMatch(/const userId = useAuthStore/);
    expect(ctx).toMatch(/seen\.current = new Set\(\)/);
    expect(ctx).toMatch(/\}, \[userId\]\)/);
  });

  it('refuses to paint an award with no user, as well', () => {
    expect(container).toMatch(/if \(!user \|\| !current\) return null/);
  });
});

describe('login is the index', () => {
  const app = readFileSync('src/App.tsx', 'utf8');

  it('serves Login at /', () => {
    expect(app).toMatch(/<Route path="\/" element=\{<Login \/>\} \/>/);
  });

  it('keeps Landing reachable at /welcome rather than deleting it', () => {
    expect(app).toMatch(/<Route path="\/welcome" element=\{<Landing \/>\} \/>/);
  });

  it('does not leave the auth back-link pointing at itself', () => {
    // `/` is the login page now, so a back-link to `/` would make the login
    // page link to itself — the dead end that shared link exists to remove.
    const shell = readFileSync('src/components/auth/AuthShell.tsx', 'utf8');
    expect(shell).toMatch(/to="\/welcome" className="auth-entry-back"/);
    expect(shell).not.toMatch(/to="\/" className="auth-entry-back"/);
  });
});

describe('the award leads somewhere other than away (FINPAL-27)', () => {
  /**
   * *** EVERY CONTROL ON THE AWARD USED TO MAKE IT GO AWAY. *** The reporter's
   * words were *"I can't interact with this pop-up"*: the × was the only thing
   * on it, so the one page that answers "coins for what?" was reachable only by
   * somebody who already knew the Kit existed.
   *
   * *** THE LINK FAILING IS SILENT, WHICH IS WHY THIS IS A GATE. *** Drop the
   * prop in the container and the award still renders, still dismisses, still
   * pays — it just quietly goes back to being a dead end. Nothing throws and no
   * other test notices.
   */
  const container = readFileSync('src/components/coins/CoinAwardContainer.tsx', 'utf8');

  it('hands the award a way to the Kit', () => {
    expect(container).toMatch(/onOpenKit=\{/);
    expect(container).toMatch(/navigate\('\/kit'\)/);
  });

  it('acks the award it just acted on', () => {
    // It is fixed to the corner of the VIEWPORT, so an un-acked award would
    // ride along on top of the very page it just sent the user to.
    const openKit = container.slice(container.indexOf('const openKit'));
    expect(openKit.slice(0, 200)).toMatch(/dismiss\(\)/);
  });

  it('draws a control that says where it goes', async () => {
    const onOpenKit = vi.fn();
    render(
      <CoinAward
        coins={600}
        revealed="Your Visa is at 19.99%."
        onOpenKit={onOpenKit}
        onDismiss={() => {}}
      />
    );
    // Named, not a tappable card: a card that silently navigates is a card
    // whose destination you learn by losing your place.
    const link = screen.getByTestId('coin-award-kit');
    expect(link.textContent).toContain('earns coins');
    fireEvent.click(link);
    expect(onOpenKit).toHaveBeenCalledTimes(1);
  });

  it('draws no link at all when there is nowhere to send them', () => {
    render(<CoinAward coins={600} revealed="Your Visa is at 19.99%." />);
    expect(screen.queryByTestId('coin-award-kit')).toBeNull();
  });
});
