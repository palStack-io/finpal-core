import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { Kit } from '../../pages/Kit';

vi.mock('../../services/coinService', () => ({
  coinService: {
    getWallet: vi.fn(),
    buy: vi.fn(),
  },
}));

import { coinService } from '../../services/coinService';

const WALLET = {
  earned: 6500,
  balance: 540,
  acts: [
    // *** `open` IS PART OF THE PAYLOAD AND WAS MISSING FROM THIS FIXTURE. ***
    // The cast below hides that from TypeScript, so the shape has to be kept
    // honest by hand: the server sends it for every act, and the kit now reads
    // it to decide which list a row belongs in.
    { slug: 'debt_rates', title: 'Know what your debt costs', coins: 1200,
      open: false, surfaces: ['accounts'],
      revealed: 'Visa is at 19.99%, which costs you $13.33 a month.' },
    { slug: 'has_a_goal', title: 'Name what you are working toward', coins: 0,
      open: true, surfaces: ['goals'],
      revealed: null },
    // *** DELIBERATELY WITHOUT `open`. *** The first version of the split read
    // `coins === 0 && a.open`, so this act belonged to neither list and simply
    // stopped being drawn — the failure the exhaustiveness assertion below
    // exists for, found by looking at a rendered capture rather than here.
    { slug: 'taught_a_rule', title: 'Teach finPal a rule', coins: 0,
      surfaces: ['rules'], revealed: null },
  ],
  gear: [
    { slug: 'map', price: 100, owned: true },
    { slug: 'headlamp', price: 700, owned: false },
    { slug: 'oxygen', price: 900, owned: false },
  ],
};

describe('Your kit', () => {
  beforeEach(() => {
    vi.mocked(coinService.getWallet).mockResolvedValue(WALLET as never);
  });

  it('renders at all', async () => {
    render(<Kit />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Your kit' }))
      .toBeTruthy();
  });

  it('shows NO denominator anywhere except the price you are saving toward',
    async () => {
      render(<Kit />);
      await screen.findByRole('heading', { level: 1, name: 'Your kit' });
      // `540 / 700` is permitted — a price is a target the user chose. The
      // banned shape is the WORD "of", which is what all six live instances used.
      expect(document.body.textContent).not.toMatch(/\b\d[\d,]*\s+of\s+\d/);
    });

  it('*** RENDERS NOTHING FOR AN ACT WHOSE PAYOFF IS NULL ***', async () => {
    /* Not a placeholder, not "well done". Four payoffs were caught on
       2026-09-14 returning copy that claimed an act was done beside
       `coins: 0`; a fallback here would put that straight back. */
    render(<Kit />);
    await screen.findByRole('heading', { level: 1, name: 'Your kit' });

    // It lives in the "what else" list now (FINPAL-30) — the point stands
    // wherever it is drawn: the title, and not one word finPal cannot justify.
    const row = screen.getByTestId('act-open-has_a_goal');
    expect(row.textContent).toContain('Name what you are working toward');
    expect(row.querySelector('p')).toBeNull();
  });

  it('*** NEVER FILES AN UNEARNED ACT UNDER "WHAT YOUR COINS CAME FROM" ***',
    async () => {
      /* FINPAL-30, and D-102's shape: every act was rendered under that one
         heading, so a thing the user has never done sat under a caption saying
         it paid them, with a dash where its figure would be. The two lists are
         the fix, and this asserts the MEMBERSHIP rather than the headings —
         a heading can be re-worded, but a row in the wrong list is the defect.

         It also pins the second list's silence about worth: no ceiling goes on
         the wire, so a figure beside an unearned act could only be invented. */
      render(<Kit />);
      await screen.findByRole('heading', { level: 1, name: 'Your kit' });

      // Earned: in the first list, with its figure. Never in the second.
      expect(screen.getByTestId('act-debt_rates').textContent).toContain('+1,200');
      expect(screen.queryByTestId('act-open-debt_rates')).toBeNull();

      // Unearned: in the second list, and NOT in the first.
      expect(screen.queryByTestId('act-has_a_goal')).toBeNull();
      const open = screen.getByTestId('acts-open');
      expect(open.textContent).toContain('Name what you are working toward');
      expect(open.textContent).not.toMatch(/[+\d]/);
    });

  it('*** DRAWS EVERY ACT SOMEWHERE — NO ROW MAY FALL BETWEEN THE LISTS ***',
    async () => {
      /* A row in the wrong list is visible and gets reported. A row in NO list
         is not, and this page is the only inventory of what earns coins there
         is. The split's first version read `coins === 0 && a.open`, which
         dropped any act the server sent without that flag. */
      render(<Kit />);
      await screen.findByRole('heading', { level: 1, name: 'Your kit' });

      for (const a of WALLET.acts) {
        const drawn = screen.queryByTestId(`act-${a.slug}`)
          ?? screen.queryByTestId(`act-open-${a.slug}`);
        expect(drawn, `${a.slug} is drawn in neither list`).toBeTruthy();
      }
    });

  it('*** DRAWS NO HEADING OVER AN EMPTY LIST ***', async () => {
    /* A brand-new user has every act at zero coins — base camp's own audience —
       and "What your coins came from" over nothing is the empty-caption half of
       the defect the split exists to fix. The heading is inside the guard, not
       beside it. */
    vi.mocked(coinService.getWallet).mockResolvedValue({
      ...WALLET,
      earned: 0,
      acts: WALLET.acts.map((a) => ({ ...a, coins: 0, revealed: null })),
    } as never);
    render(<Kit />);
    await screen.findByRole('heading', { level: 1, name: 'Your kit' });

    expect(screen.queryByRole('heading', { name: 'What your coins came from' }))
      .toBeNull();
    expect(screen.getByRole('heading', { name: 'What else earns coins' }))
      .toBeTruthy();
  });

  it('offers Buy only for gear the balance can actually cover', async () => {
    render(<Kit />);
    await screen.findByRole('heading', { level: 1, name: 'Your kit' });

    // 540 covers nothing here: map is owned, headlamp is 700, oxygen is 900.
    expect(screen.queryAllByRole('button', { name: 'Buy' })).toHaveLength(0);
    expect(screen.getByTestId('gear-map').textContent).toContain('owned');
    // The cheapest unowned piece is the one being saved for, and it is the ONE
    // progress bar the product allows.
    await waitFor(() => expect(screen.getByTestId('gear-saving-bar')).toBeTruthy());
  });

  it('*** SHOWS NO SAVINGS BAR FOR GEAR THE BALANCE ALREADY COVERS ***', async () => {
    /* The bug this test exists for: `nextUp` took the cheapest UNOWNED piece
       outright, so a user with 7,853 coins saw "7,853 / 200" under a 200-coin
       item they could buy twice over. A bar for something already in reach is
       noise, not progress.

       *** THE FOUR TESTS ABOVE ALL PASSED WITH THE BUG PRESENT, *** because
       every one of their fixtures has a balance BELOW the cheapest price — so
       the broken branch was never reached. It was found by looking at the
       deployed demo, and this is the fixture that would have caught it. */
    vi.mocked(coinService.getWallet).mockResolvedValue({
      ...WALLET,
      balance: 7853,
    } as never);

    render(<Kit />);
    await screen.findByRole('heading', { level: 1, name: 'Your kit' });

    expect(screen.queryByTestId('gear-saving-bar')).toBeNull();
    // And everything unowned is buyable, so every one offers the button.
    expect(screen.getAllByRole('button', { name: 'Buy' })).toHaveLength(2);
    expect(document.body.textContent).not.toMatch(/7,853\s*\/\s*\d/);
  });
});

/**
 * *** THE WALLET HAS SENT `badges` SINCE THE ECONOMY SHIPPED AND NO CLIENT
 * READ IT — AUDIT D-274. *** Seven badges were earned, stored and invisible:
 * `earned_badges` is in the payload at `api/v1/coins.py`, and a grep of
 * `web-ui/src` and `mobile/src` for it found the word only in comments. That
 * is D-187's shape — a payload is not proof anything renders it — and it is
 * what would have made `on-plan-3` and `on-plan-6` dead rows on arrival.
 */
describe('badges', () => {
  it('renders the earned ones', async () => {
    vi.mocked(coinService.getWallet).mockResolvedValue({
      ...WALLET,
      badges: [
        { slug: 'on-plan-3', title: 'Three months on plan', earned_at: '2026-09-01T00:00:00' },
        { slug: 'goal-reached', title: 'Goal reached', earned_at: null },
      ],
    } as never);
    render(<Kit />);

    expect(await screen.findByTestId('badge-on-plan-3')).toBeTruthy();
    expect(screen.getByText('Three months on plan')).toBeTruthy();
    /* `earned_at: null` is a real case — the badge still renders, without a
       date, rather than printing "Invalid Date". */
    expect(screen.getByTestId('badge-goal-reached').textContent)
      .not.toMatch(/Invalid Date/);
  });

  it('draws NO section when none are held, never a locked grid', async () => {
    /* An unearned badge is absent, not present-and-false. A grid of greyed
       discs would read as *you have not paid your debt*, which is the report
       card decision 5 forbids. */
    vi.mocked(coinService.getWallet).mockResolvedValue({ ...WALLET, badges: [] } as never);
    render(<Kit />);

    await screen.findByRole('heading', { level: 1, name: 'Your kit' });
    expect(screen.queryByTestId('badges')).toBeNull();
  });

  it('does not throw on a backend that predates the key', async () => {
    /* `WALLET` has no `badges`, which is exactly a deployed backend older than
       `earned_badges`. `.length` on `undefined` is what throws. */
    render(<Kit />);
    await screen.findByRole('heading', { level: 1, name: 'Your kit' });
    expect(screen.queryByTestId('badges')).toBeNull();
  });
});
