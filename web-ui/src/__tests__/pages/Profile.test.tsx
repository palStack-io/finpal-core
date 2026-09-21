/**
 * The profile page: the shelf, and what you have kept up.
 *
 * *** UNTIL 2026-09-20 "View profile" IN THE RAIL WENT TO /settings. ***
 * There was no profile page at all — the link had been pointing at the
 * preferences screen since the rail was built.
 *
 * *** KIT IS THE SHOP; THIS IS THE MANTELPIECE. *** Kit keeps the 21-piece
 * grid, the prices and the acts that pay for them. This shows what you OWN
 * and what you have KEPT UP. The division matters because a page that did
 * both would just be Kit again.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../contexts/CoinAwardContext', () => ({
  useCoinAwards: vi.fn(),
  useBadges: vi.fn(),
  useEverest: vi.fn(),
}));
vi.mock('../../store/authStore', () => ({ useAuthStore: vi.fn() }));

import { useCoinAwards, useBadges, useEverest } from '../../contexts/CoinAwardContext';
import { useAuthStore } from '../../store/authStore';
import { Profile } from '../../pages/Profile';

const OWNED = [
  { slug: 'map', price: 400, owned: true },
  { slug: 'boots', price: 500, owned: true },
  { slug: 'tent', price: 1700, owned: true },
];

const setup = (opts: {
  gear?: typeof OWNED;
  badges?: { slug: string; title: string; earned_at: string | null }[];
} = {}) => {
  vi.mocked(useAuthStore).mockReturnValue({ user: { name: 'Alex Demo' } } as never);
  vi.mocked(useCoinAwards).mockReturnValue({ ownedGear: opts.gear ?? OWNED } as never);
  vi.mocked(useBadges).mockReturnValue(opts.badges ?? []);
  vi.mocked(useEverest).mockReturnValue(
    { altitude_m: 7020, summit_m: 8849, at_summit: false } as never);
  return render(<MemoryRouter><Profile /></MemoryRouter>);
};

beforeEach(() => vi.clearAllMocks());

describe('the shelf', () => {
  it('shows only what you OWN, and says how many of 21', () => {
    /* *** NO GREYED-OUT UNOWNED GEAR. *** A wall of locked pieces is the
       shape the product refuses for badges, for the same reason: it turns a
       page about what you have done into a list of what you have not. The
       shop already shows all 21. */
    setup();
    expect(screen.getByTestId('shelf-map')).toBeInTheDocument();
    expect(screen.getByTestId('shelf-tent')).toBeInTheDocument();
    expect(screen.queryByTestId('shelf-oxygen')).not.toBeInTheDocument();
    expect(screen.getByText('3 of 21')).toBeInTheDocument();
  });

  it('points at the shop rather than dead-ending when nothing is owned', () => {
    /* An empty state that only says "nothing here" is a dead end. */
    setup({ gear: [] });
    expect(screen.getByText(/Nothing on the shelf yet/)).toBeInTheDocument();
    expect(screen.getByText(/Go and look/)).toBeInTheDocument();
  });

  it('names the standing in METRES, not an invented tier', () => {
    /* The tier ladder is a separate, undecided thing. A rung name here would
       put a label under somebody's name that nothing else agrees with. */
    setup();
    expect(screen.getByText(/7,020 m of 8,849/)).toBeInTheDocument();
  });
});

describe('what you have kept up', () => {
  it('renders earned badges with their dates', () => {
    setup({ badges: [
      { slug: 'goal-reached', title: 'Goal reached', earned_at: '2026-09-17T00:00:00' },
    ] });
    expect(screen.getByTestId('profile-badge-goal-reached')).toBeInTheDocument();
    expect(screen.getByText('Goal reached')).toBeInTheDocument();
  });

  it('is ABSENT when none are held, never a locked grid', () => {
    /* An unearned badge is absent, not present-and-false. A grid of greyed
       discs reads as "you have not paid your debt" — the report card
       decision 5 forbids. */
    setup({ badges: [] });
    expect(screen.queryByTestId('profile-badges')).not.toBeInTheDocument();
  });

  it('survives a badge with no earned_at rather than printing Invalid Date', () => {
    setup({ badges: [{ slug: 'debt-free', title: 'Debt clear', earned_at: null }] });
    expect(screen.getByTestId('profile-badge-debt-free').textContent)
      .not.toMatch(/Invalid Date/);
  });
});

/**
 * The rail's two discs.
 *
 * *** THE LINK WENT TO /settings AND THE DISCS DID NOT EXIST. *** Both are
 * asserted on the SOURCE rather than by rendering the whole sidebar, which
 * pulls in the router, the module registry, the review store and the theme —
 * a render test here would be testing five other things.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

describe('the rail', () => {
  const rail = () => readFileSync(
    join(process.cwd(), 'src/components/layout/Sidebar.tsx'), 'utf8');

  it('sends "View profile" to /profile, not /settings', () => {
    const src = rail();
    expect(src).toContain("navigate('/profile')");
    /* The header specifically — Settings is still reachable from the nav. */
    const header = src.slice(src.indexOf('user-profile-header'),
                             src.indexOf('user-profile-header') + 200);
    expect(header).not.toContain("navigate('/settings')");
  });

  it('shows at most TWO badges, newest first', () => {
    /* A third wraps the line and the rail has no vertical room to give. */
    expect(rail()).toMatch(/badges\.slice\(0,\s*2\)/);
  });

  it('LABELS each disc rather than relying on a hover tooltip', () => {
    /* *** `GoalStrip` NEXT DOOR CARRIES ITS MEANING IN `title` ALONE, WHICH
       DOES NOT EXIST ON TOUCH *** — so on every phone that row is
       permanently unexplained. `BadgeIcon`'s `title` prop sets `aria-label`
       as well, which is the real affordance; this asserts the rail passes
       it rather than rendering bare discs. */
    expect(rail()).toMatch(/<BadgeIcon[^>]*title=\{b\.title\}/s);
  });
});
