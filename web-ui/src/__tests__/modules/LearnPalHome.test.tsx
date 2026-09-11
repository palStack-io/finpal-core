/**
 * learnPal's home page — the surface, and the four states it must not collapse.
 *
 * *** THE ABSENCES ARE ASSERTED, NOT ASSUMED. *** Three things must NOT be on
 * this page and each has a test: a points figure (learnPal has none, so a tile
 * would read 0 for ever — owner decision 2026-09-11), a band for a user who has
 * climbed nothing (no band is not band zero), and the string "None" where a
 * lesson has no goal behind it.
 */
import React from 'react';
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { api } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import Home from '../../modules/learnpal/pages/Home';
import { ThemeProvider } from '../../contexts/ThemeContext';
import type { LearnStats } from '../../types/learnpal';

const BASE = '*';

beforeAll(() => { api.defaults.adapter = 'http'; });
beforeEach(() => {
  useAuthStore.setState({
    user: { id: 'alice@test.com', name: 'Alice' } as never,
    token: 'tok', refreshToken: 'r', isAuthenticated: true,
  });
});

const EMPTY: LearnStats = {
  lessons: { read: 0, total: 8, without_body: 8 },
  gear: { earned: 0, total: 8 },
  highest: null,
  recent: [],
  next: [],
};

const serve = (stats: LearnStats) =>
  server.use(http.get(`${BASE}/api/v1/learnpal/stats`, () =>
    HttpResponse.json({ success: true, stats })));

const draw = () => render(
  <MemoryRouter><ThemeProvider><Home /></ThemeProvider></MemoryRouter>
);

describe('the learnPal home', () => {
  it('SHOWS NO POINTS FIGURE OF ANY KIND', async () => {
    // Owner decision 2026-09-11: learnPal has no points, so a tile fed by a
    // figure nothing can increment would read 0 for ever.
    serve({ ...EMPTY, lessons: { read: 3, total: 8, without_body: 5 } });
    const { container } = draw();
    await screen.findByText('Lessons read');
    expect(container.textContent?.toLowerCase()).not.toContain('point');
  });

  it('reports lessons and gear as a FRACTION, which says what is left', async () => {
    serve({
      ...EMPTY,
      lessons: { read: 3, total: 8, without_body: 5 },
      gear: { earned: 2, total: 8 },
    });
    draw();
    await screen.findByText('Lessons read');
    expect(screen.getByText('Gear earned')).toBeTruthy();
    // Both counters render `read` then `of total`, so assert the pair.
    expect(screen.getAllByText(/of 8/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('5 have no write-up yet')).toBeTruthy();
  });

  it('DRAWS NO MOUNTAIN AT ALL for a user who has climbed nothing', async () => {
    /*
     * *** `highest: null` IS NOT BAND ZERO. *** A user with no goals, or only
     * paydown goals on cards with no stated rate, has no band — and answering
     * "Table Mountain" is the molehill the whole design refuses to draw
     * (parent-spec trap 3, and D-77/D-108 are what it looks like shipped).
     */
    serve(EMPTY);
    const { container } = draw();
    await screen.findByText('Nothing yet');
    expect(screen.queryByTestId('learnpal-highest')).toBeNull();
    expect(container.textContent).not.toContain('Table Mountain');
    expect(container.textContent).not.toContain('band 1 of 6');
  });

  it('names the hardest mountain, its band and the goal it was', async () => {
    serve({
      ...EMPTY,
      highest: {
        band: 3, band_total: 6,
        mountain: {
          slug: 'mount-rainier', name: 'Mount Rainier', elevation_m: 4392,
          fact: 'Rainier carries more glacier ice than any other peak in the '
              + 'lower 48 states.',
          summit_note: 'You stood on the hardest one you ever faced.',
        },
        goal_id: 1, goal_name: 'Pay off the Visa', goal_status: 'active',
      },
    });
    draw();
    await screen.findByTestId('learnpal-highest');
    expect(screen.getByText('Mount Rainier')).toBeTruthy();
    // The band is 0-indexed on the wire and 1-indexed in the sentence: "band 4
    // of 6" is what a human counts, and off-by-one here is the kind of thing a
    // green typecheck is perfectly happy with.
    expect(screen.getByText(/band 4 of 6/)).toBeTruthy();
    expect(screen.getByText(/4,392 m/)).toBeTruthy();
  });

  it('SAYS A FINISHED GOAL IS FINISHED instead of implying it is under way',
    async () => {
      /*
       * The figure deliberately includes archived and achieved goals — a
       * lifetime statistic that falls when somebody tidies up is the one thing
       * it must never do — so the sentence has to be honest about which it is.
       */
      serve({
        ...EMPTY,
        highest: {
          band: 4, band_total: 6,
          mountain: { slug: 'aconcagua', name: 'Aconcagua', elevation_m: 6961,
                      fact: null, summit_note: null },
          goal_id: 7, goal_name: 'Clear the Amex', goal_status: 'archived',
        },
      });
      draw();
      await screen.findByTestId('learnpal-highest');
      expect(screen.getByText(/a goal you have since finished/)).toBeTruthy();
    });

  it('does not claim a finished goal when the goal is still ACTIVE', async () => {
    // The inverse of the test above, because a sentence appended
    // unconditionally would pass that one and be wrong every other time.
    serve({
      ...EMPTY,
      highest: {
        band: 4, band_total: 6,
        mountain: { slug: 'aconcagua', name: 'Aconcagua', elevation_m: 6961,
                    fact: null, summit_note: null },
        goal_id: 7, goal_name: 'Clear the Amex', goal_status: 'active',
      },
    });
    const { container } = draw();
    await screen.findByTestId('learnpal-highest');
    expect(container.textContent).not.toContain('since finished');
  });

  it('NEVER PRINTS "None" for a lesson with no goal behind it', async () => {
    /*
     * *** `goal_name` IS NULL TWICE OVER AND BOTH ARE ORDINARY. *** A
     * predicate-gated lesson has no goal, and `unlocked_by_goal_id` is
     * `ondelete='SET NULL'`, so a lesson unlocked by a goal the user has since
     * deleted keeps the unlock and loses the attribution.
     */
    serve({
      ...EMPTY,
      recent: [
        { slug: 'where-your-money-goes', title: 'Where your money goes',
          gear_slug: 'boots', has_body: true, verified_by: 'read',
          unlocked_at: '2026-09-02T08:14:00', goal_id: null, goal_name: null },
      ],
    });
    const { container } = draw();
    await screen.findByText('Where your money goes');
    /*
     * *** THE FIRST VERSION OF THIS ASSERTION WAS THE WRONG STRING AND A
     * SABOTAGE PROVED IT. *** It checked for "None", which is what the DEFECT
     * is called and not what it would print. Rendering `{row.goal_name}`
     * unconditionally emits nothing for null, so the real failure is a dangling
     * preposition — "Unlocked by " with no name — and `String(null)` gives
     * "null". Both are asserted now, and the dangling "by" is the one that
     * would actually ship.
     */
    expect(container.textContent).not.toContain('Unlocked by');
    expect(container.textContent).not.toContain('None');
    expect(container.textContent).not.toContain('null');
    expect(container.textContent).not.toContain('undefined');
    // The label and the date share one element, so this matches the rendered
    // run rather than an element whose whole text is "Unlocked".
    expect(container.textContent).toMatch(/Unlocked\s*·/);
  });

  it('names the goal that unlocked a lesson when there is one', async () => {
    serve({
      ...EMPTY,
      recent: [
        { slug: 'what-your-apr-costs', title: 'What your APR actually costs',
          gear_slug: 'headlamp', has_body: true, verified_by: 'read',
          unlocked_at: '2026-09-02T08:14:00',
          goal_id: 1, goal_name: 'Pay off the Visa' },
      ],
    });
    draw();
    await screen.findByText('What your APR actually costs');
    expect(screen.getByText('Pay off the Visa')).toBeTruthy();
  });

  it('SAYS SO when an unlocked lesson has no write-up yet', async () => {
    // Eleven approved drafts are unseeded and four are deliberately unwritten,
    // so this is expected rather than broken — and offering a reader that
    // opens onto blank space is what looks broken.
    serve({
      ...EMPTY,
      recent: [
        { slug: 'what-your-apr-costs', title: 'What your APR actually costs',
          gear_slug: 'headlamp', has_body: false, verified_by: 'read',
          unlocked_at: '2026-09-02T08:14:00', goal_id: 1, goal_name: 'Visa' },
      ],
    });
    draw();
    await screen.findByText('What your APR actually costs');
    expect(screen.getByText('no write-up yet')).toBeTruthy();
  });

  it('prints the SERVER\'s reason for a lock and never derives its own',
    async () => {
      serve({
        ...EMPTY,
        next: [
          { slug: 'avalanche-vs-snowball', title: 'Avalanche or snowball',
            gear_slug: 'compass', surface: 'mountain', has_body: false,
            unlock_at_progress: 0.25, applies_to_direction: 'paydown',
            gate: 'altitude', reason: 'Reach 25% on Pay off the Visa',
            goal_id: 1, goal_name: 'Pay off the Visa', goal_progress: 0.1812 },
        ],
      });
      draw();
      await screen.findByText('Avalanche or snowball');
      expect(screen.getByText('Reach 25% on Pay off the Visa')).toBeTruthy();
      // Rounded, not truncated: 18.12% is 18%, and `toFixed` on a ratio is how
      // a percentage ends up reading 0%.
      expect(screen.getByText('18% now')).toBeTruthy();
    });

  it('SAYS IT CANNOT EXPLAIN a lock the server would not explain', async () => {
    /*
     * *** `reason: null` IS FAIL-CLOSED, NOT A BUG TO PAPER OVER. ***
     * `checks.check_reason` returns null for a `check_type` this build does not
     * implement, exactly as `run_check` refuses to unlock one. Rendering a
     * plausible sentence about a condition nothing tests would be worse than
     * saying nothing — and rendering literally nothing looks like a bug.
     */
    serve({
      ...EMPTY,
      next: [
        { slug: 'mystery', title: 'A lesson gated on something new',
          gear_slug: null, surface: 'mountain', has_body: false,
          unlock_at_progress: null, applies_to_direction: null,
          gate: null, reason: null,
          goal_id: null, goal_name: null, goal_progress: null },
      ],
    });
    const { container } = draw();
    await screen.findByText('A lesson gated on something new');
    expect(screen.getByText(/we cannot say what moves it yet/)).toBeTruthy();
    expect(container.textContent).not.toContain('null');
  });

  it('RENDERS NOTHING BUT A NOTE when the module is not installed', async () => {
    // A 404 means learnPal is not installed, which is not an error state. A red
    // banner here would appear on every deployment that simply does not use it.
    server.use(http.get(`${BASE}/api/v1/learnpal/stats`, () =>
      HttpResponse.json({ success: false }, { status: 404 })));
    draw();
    await screen.findByText(/learnPal is not enabled on this instance/);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('draws an empty bar rather than NaN% when the seeder has not run',
    async () => {
      // `total: 0` is a real state on an instance whose milestone seed has not
      // run. 0/0 is NaN, and `$NaN` rendered eight times on a page both gates
      // called clean is D-107.
      serve({ ...EMPTY, lessons: { read: 0, total: 0, without_body: 0 },
              gear: { earned: 0, total: 0 } });
      draw();
      await screen.findByText('Lessons read');
      /*
       * *** ASSERTED ON THE WIDTH, NOT ON THE ABSENCE OF THE STRING "NaN". ***
       * `width: 'NaN%'` is an invalid CSS value, so the DOM drops it and
       * `innerHTML` never carries it — the markup assertion this replaced
       * passed with the bug present, which a sabotage found. A dropped width is
       * a bar rendered at its container's full width: 0 of 0 drawn as complete.
       */
      for (const bar of screen.getAllByTestId('counter-bar')) {
        expect((bar as HTMLElement).style.width).toBe('0%');
      }
    });

  it('links to the range at its NEW path, not at the module root', async () => {
    // `/learnpal` is the home now. A link left at the old path sends the user
    // back to the page they are standing on.
    serve(EMPTY);
    draw();
    const link = await screen.findByText('See your whole range');
    expect(link.getAttribute('href')).toBe('/learnpal/range');
  });
});
