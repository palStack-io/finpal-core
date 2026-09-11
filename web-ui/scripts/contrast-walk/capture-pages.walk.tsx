/**
 * Captures the Dashboard and Budgets pages so the contrast walk covers them too.
 *
 * *** THE WALK ONLY EVER SAW TRANSACTIONS, AND "UNMEASURED" IS NOT "CLEAN". ***
 * The palette adoption took that page to zero AA failures, which says nothing
 * about the two pages nobody had rendered.
 */
import { it, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from 'fs';
import { join } from 'path';
import { http, HttpResponse } from 'msw';
import { server } from '../../src/__tests__/mocks/server';
import { api } from '../../src/services/api';
import { useAuthStore } from '../../src/store/authStore';
import { Dashboard } from '../../src/pages/Dashboard';
import { Accounts } from '../../src/pages/Accounts';
import BudgetsMinimal from '../../src/pages/BudgetsMinimal';
import Goals from '../../src/pages/Goals';
import { Investments } from '../../src/pages/Investments';
import LearnPalHome from '../../src/modules/learnpal/pages/Home';
import LearnPalRange from '../../src/modules/learnpal/pages/Range';
import PointsPalOverview from '../../src/modules/pointspal/pages/Overview';
import CapTracker from '../../src/modules/pointspal/pages/CapTracker';
import BestCard from '../../src/modules/pointspal/pages/BestCard';
import MyCards from '../../src/modules/pointspal/pages/MyCards';
import Redeem from '../../src/modules/pointspal/pages/Redeem';
import { CategoryManagement } from '../../src/components/CategoryManagement';
import { ToastProvider } from '../../src/contexts/ToastContext';
import { ThemeProvider } from '../../src/contexts/ThemeContext';

const OUT = join(__dirname, 'captured');

/* Stale captures are worse than none: the walk sweeps the directory, so a file
   left from an earlier experiment gets measured as if it were today's code and
   reports failures that were already fixed. Cleared on every run. */
beforeAll(() => {
  if (existsSync(OUT)) {
    for (const f of readdirSync(OUT)) {
      if (f.endsWith('.html') && f !== 'transactions.html') rmSync(join(OUT, f));
    }
  }
});

beforeAll(() => { api.defaults.adapter = 'http'; });
beforeEach(() => {
  useAuthStore.setState({
    user: { id: 'alice@test.com', name: 'Alice', default_currency_code: 'GBP' } as any,
    token: 'tok', refreshToken: 'r', isAuthenticated: true,
  });
});

/* The two endpoints the shared handlers do not carry. Realistic shapes, because
   a page rendered from empty data has no colours to measure. */
beforeEach(() => {
  server.use(
    http.get('*/api/v1/analytics/dashboard', () => HttpResponse.json({
      success: true,
      net_worth: 46125, monthly_income: 6180, monthly_expenses: 2904,
      savings_rate: 53,
      cash_flow: [{ month: 'Mar', income: 6180, expenses: 2904 }],
      category_breakdown: [
        { name: 'Groceries', total: 420, color: '#15803d' },
        { name: 'Bills', total: 380, color: '#3F7D5C' },
        { name: 'Eating out', total: 210, color: '#AB5437' },
      ],
      accounts: [{ id: 1, name: 'Everyday Current', balance: 1104.55, type: 'checking' }],
    })),
    http.get('*/api/v1/goals', () => HttpResponse.json({
      success: true,
      goals: [
        // *** GOAL 1 SPANS TWO CARDS (B12), AND ITS `account_name` IS THE
        // SERVER'S DEGRADED "2 accounts". *** A single-account fixture would
        // walk the page without ever rendering the longest string this page can
        // produce, which at 390px is the one at risk.
        { id: 1, user_id: 'demo@finpal.app', name: 'Pay off Chase Amazon',
          kind: 'payoff', scope: 'household', account_id: 7,
          account_name: '2 accounts',
          accounts: [
            { id: 7, name: 'Chase Amazon', start_amount: -1125.41 },
            { id: 9, name: 'Barclaycard Rewards', start_amount: -524.59 },
          ],
          target_amount: 0, start_amount: -1650,
          current_manual: null, currency_code: 'USD', start_date: '2026-01-01',
          target_date: '2027-06-30', status: 'active', achieved_at: null,
          current_amount: -450, direction: 'paydown', progress: 0.7272,
          // C1c. *** COST SCALE, AND `apr` IS NULL BECAUSE IT SPANS TWO CARDS. ***
          // The server refuses to print one rate for a goal at two rates, so
          // this fixture carries the real multi-account shape rather than the
          // easy one.
          peak: { scale: 'cost', magnitude: 312.5, unmeasured: false, band: 5,
                  mountain: { slug: 'everest', name: 'Everest', elevation_m: 8849,
                              fact: null, summit_note: null },
                  hardest_band: 5,
                  hardest_mountain: { slug: 'everest', name: 'Everest',
                                      elevation_m: 8849, fact: null,
                                      summit_note: null },
                  apr: null } },
        // Deliberately left single-account, so both shapes are on the page at
        // once and the walk measures the pair rather than one of them.
        { id: 2, user_id: 'demo@finpal.app', name: 'Emergency fund',
          kind: 'savings', scope: 'personal', account_id: 8,
          account_name: 'Ally Savings',
          accounts: [{ id: 8, name: 'Ally Savings', start_amount: 1000 }],
          target_amount: 10000, start_amount: 1000,
          current_manual: null, currency_code: 'USD', start_date: '2026-01-01',
          target_date: null, status: 'active', achieved_at: null,
          current_amount: 4000, direction: 'accumulate', progress: 0.3333,
          // BUILD scale, so both colours are on the page at once and the
          // contrast walk measures the pair rather than one of them.
          peak: { scale: 'build', magnitude: 6000, unmeasured: false, band: 3,
                  mountain: { slug: 'mount-rainier', name: 'Mount Rainier',
                              elevation_m: 4392, fact: null, summit_note: null },
                  hardest_band: 3,
                  hardest_mountain: { slug: 'mount-rainier',
                                      name: 'Mount Rainier', elevation_m: 4392,
                                      fact: null, summit_note: null },
                  apr: 24.99 } },
        { id: 3, user_id: 'demo@finpal.app', name: 'New laptop', kind: 'savings',
          scope: 'personal', account_id: null, account_name: null,
          target_amount: 2000, start_amount: 0, current_manual: 2100,
          currency_code: 'USD', start_date: '2026-01-01', target_date: null,
          status: 'achieved', achieved_at: '2026-08-01T00:00:00',
          current_amount: 2100, direction: 'accumulate', progress: 1.05,
          // *** ACHIEVED, SO THE SUMMIT NOTE RENDERS — AND IT IS THE LONGEST
          // STRING THIS PAGE CAN PRODUCE. *** The note plus "Hardest it ever
          // got: …" on one line is the thing that fits at 1440 and can overflow
          // at 390, which is exactly what the responsive walk exists to catch,
          // and a short fixture cannot make one. The watermark is deliberately
          // FOUR bands above the current one, because the note must read the
          // watermark and not where the goal ended.
          peak: { scale: 'build', magnitude: 0, unmeasured: false, band: 0,
                  mountain: { slug: 'table-mountain', name: 'Table Mountain',
                              elevation_m: 1085, fact: null, summit_note: null },
                  hardest_band: 4,
                  hardest_mountain: {
                    slug: 'aconcagua', name: 'Aconcagua', elevation_m: 6961,
                    fact: null,
                    summit_note: 'You started at Aconcagua, the highest mountain '
                               + 'outside Asia. That whole climb is behind you now.',
                  },
                  apr: null } },
        // *** THE UNMEASURED STATE, WHICH HAD NO FIXTURE UNTIL C1c. *** A flat
        // grey ridge and an italic prompt, and it must be measurable in both
        // themes: the muted colour on a card is the pair most likely to fall
        // under 4.5:1, and "we do not know your rate" is not allowed to be the
        // one line nobody checked.
        { id: 4, user_id: 'demo@finpal.app',
          name: 'Clear the John Lewis Partnership Card', kind: 'payoff',
          scope: 'personal', account_id: 12, account_name: 'John Lewis Partnership Card',
          accounts: [{ id: 12, name: 'John Lewis Partnership Card',
                       start_amount: -980.5 }],
          target_amount: 0, start_amount: -980.5, current_manual: null,
          currency_code: 'USD', start_date: '2026-02-01', target_date: null,
          status: 'active', achieved_at: null, current_amount: -612.25,
          direction: 'paydown', progress: 0.3755,
          peak: { scale: 'cost', magnitude: null, unmeasured: true, band: null,
                  mountain: null, hardest_band: null, hardest_mountain: null,
                  apr: null } },
      ],
    })),
    /*
     * B12. The Goals page loads accounts to build its picker and its
     * "add another account" list, and without this handler that list is empty —
     * so the walk would capture the panel's explainer and never its stack of
     * full-width buttons, which is the widest thing on the page at 390px.
     *
     * `Barclaycard Rewards` is deliberately long: a name that fits at 1440 and
     * overflows at 390 is exactly what the responsive walk exists to catch, and
     * a fixture of short names cannot produce one.
     */
    http.get('*/api/v1/accounts', () => HttpResponse.json({
      success: true,
      accounts: [
        { id: 7, name: 'Chase Amazon', type: 'credit', balance: -1125.41,
          currency_code: 'USD', user_id: 'demo@finpal.app' },
        { id: 9, name: 'Barclaycard Rewards', type: 'credit', balance: -524.59,
          currency_code: 'USD', user_id: 'demo@finpal.app' },
        { id: 11, name: 'Marcus Online Savings Account', type: 'savings',
          balance: 8200, currency_code: 'USD', user_id: 'demo@finpal.app' },
        // Goal 4's card. Long on purpose, same reason as Barclaycard above.
        { id: 12, name: 'John Lewis Partnership Card', type: 'credit',
          balance: -612.25, currency_code: 'USD', user_id: 'demo@finpal.app' },
      ],
    })),
    /*
     * C1c. *** THE GOALS PAGE REQUESTS THIS NOW, AND WITHOUT A HANDLER THE
     * WHOLE CAPTURE FAILS. *** MSW's `onUnhandledRequest: 'error'` raises, the
     * goals capture times out, and CI goes red -- which is precisely how this
     * was found: I ran the full vitest suite after adding the fetch and did NOT
     * re-run the walk captures, then pushed with SKIP_PREFLIGHT=1. CI was the
     * backstop, which is what it is for.
     *
     * *** POPULATED RATHER THAN A 404, BECAUSE A 404 WOULD CAPTURE NOTHING
     * NEW. *** The banner and the per-goal strips are new UI, and a page being
     * in the walk is not the walk seeing what changed (D-165). The strip's
     * lesson title is deliberately LONG: it has to be a string that fits at
     * 1440 and can overflow at 390.
     */
    /**
     * *** learnPal's HOME PAYLOAD, AND EVERY STRING IN IT IS DELIBERATELY LONG.
     * *** A name that fits at 1440 and overflows at 390 is the entire point of
     * the responsive walk, and a short fixture cannot produce one (D-165). So
     * the goal names and lesson titles here are as long as anything a real user
     * would type, and `fact` carries a full sentence because the card renders it.
     *
     * *** THE MOUNTAIN FACT IS SEEDED CONTENT AND IS QUOTED, NOT INVENTED. ***
     * Ben Nevis's summit observatory ran 1883-1904 and the sentence below is
     * the approved one from `seed_mountains.py`. A fixture that makes up a fact
     * teaches the walk to render a claim nobody checked, which is D-107's shape
     * one layer up: an investments fixture invented three keys and the page
     * drew `$NaN` eight times while both gates called it clean.
     */
    http.get('*/api/v1/learnpal/stats', () => HttpResponse.json({
      success: true,
      stats: {
        lessons: { read: 3, total: 8, without_body: 5 },
        gear: { earned: 3, total: 8 },
        highest: {
          band: 3, band_total: 6,
          mountain: {
            slug: 'mount-rainier', name: 'Mount Rainier', elevation_m: 4392,
            fact: 'Rainier carries more glacier ice than any other peak in the '
                + 'lower 48 states.',
            summit_note: 'You stood on the hardest one you ever faced.',
          },
          goal_id: 1,
          goal_name: 'Clear the John Lewis Partnership Mastercard before the '
                   + 'balance transfer offer expires',
          goal_status: 'archived',
        },
        recent: [
          { slug: 'what-your-apr-costs',
            title: 'What your APR actually costs you every single month',
            gear_slug: 'headlamp', has_body: true, verified_by: 'read',
            unlocked_at: '2026-09-02T08:14:00',
            goal_id: 1,
            goal_name: 'Clear the John Lewis Partnership Mastercard before the '
                     + 'balance transfer offer expires' },
          // *** NO GOAL NAME, ON PURPOSE. *** A predicate-gated lesson has none,
          // and the FK is SET NULL, so "unlocked by None" is the string this
          // fixture exists to make impossible to ship.
          { slug: 'where-your-money-goes',
            title: 'Where your money actually goes, once you look at it properly',
            gear_slug: 'boots', has_body: false, verified_by: 'read',
            unlocked_at: '2026-08-28T19:02:00',
            goal_id: null, goal_name: null },
        ],
        next: [
          { slug: 'avalanche-vs-snowball',
            title: 'Avalanche or snowball, and which one clears it sooner',
            gear_slug: 'compass', surface: 'mountain', has_body: false,
            unlock_at_progress: 0.25, applies_to_direction: 'paydown',
            gate: 'altitude',
            reason: 'Reach 25% on Clear the John Lewis Partnership Mastercard '
                  + 'before the balance transfer offer expires',
            goal_id: 1,
            goal_name: 'Clear the John Lewis Partnership Mastercard before the '
                     + 'balance transfer offer expires',
            goal_progress: 0.1812 },
          { slug: 'utilisation-and-your-score',
            title: 'Utilisation, and what it actually touches',
            gear_slug: 'gloves', surface: 'mountain', has_body: false,
            unlock_at_progress: null, applies_to_direction: null,
            gate: 'check',
            reason: 'Get your card utilisation below 30%',
            goal_id: null, goal_name: null, goal_progress: null },
          // *** `reason: null` IS A REAL STATE AND IS IN THE FIXTURE. *** The
          // server is fail-closed for a `check_type` this build does not
          // implement, so the page must render "we cannot say" rather than
          // printing nothing or `null`.
          { slug: 'what-finpal-cannot-tell-you',
            title: 'What finPal cannot tell you, and where to ask instead',
            gear_slug: 'guidebook', surface: 'mountain', has_body: false,
            unlock_at_progress: null, applies_to_direction: null,
            gate: null, reason: null,
            goal_id: null, goal_name: null, goal_progress: null },
        ],
      },
    })),
    http.get('*/api/v1/learnpal/range', () => HttpResponse.json({
      success: true,
      range: {
        cost: {
          heading: "What's costing you", unit: 'a month, in interest',
          total: 312.5,
          peaks: [{
            goal_id: 1, name: 'Clear the John Lewis Partnership Mastercard',
            currency_code: 'USD', progress: 0.7272, status: 'active',
            peak: { scale: 'cost', magnitude: 312.5, unmeasured: false, band: 5,
                    mountain: { slug: 'everest', name: 'Everest',
                                elevation_m: 8849, fact: null, summit_note: null },
                    hardest_band: 5,
                    hardest_mountain: { slug: 'everest', name: 'Everest',
                                        elevation_m: 8849, fact: null,
                                        summit_note: null },
                    apr: null },
            strip: {
              read: 3, total: 4,
              next: { slug: 'avalanche-vs-snowball',
                      title: 'Avalanche or snowball, and which clears it sooner',
                      unlock_at_progress: 0.25, gear_slug: 'compass' },
              gear: [
                { slug: 'headlamp', milestone_slug: 'what-your-apr-costs',
                  title: 'What your APR actually costs', earned: true },
                { slug: 'ice-axe', milestone_slug: 'why-minimums-barely-move-it',
                  title: 'Why the minimum barely moves it', earned: true },
                { slug: 'rope', milestone_slug: 'a-starter-buffer',
                  title: 'The rope you tie on first', earned: true },
                { slug: 'compass', milestone_slug: 'avalanche-vs-snowball',
                  title: 'Avalanche or snowball', earned: false },
              ],
            },
          }],
        },
        build: {
          heading: "What you're building", unit: 'still to save', total: 6000,
          peaks: [{
            goal_id: 2, name: 'Emergency fund', currency_code: 'USD',
            progress: 0.3333, status: 'active',
            peak: { scale: 'build', magnitude: 6000, unmeasured: false, band: 3,
                    mountain: { slug: 'mount-rainier', name: 'Mount Rainier',
                                elevation_m: 4392, fact: null, summit_note: null },
                    hardest_band: 3,
                    hardest_mountain: { slug: 'mount-rainier',
                                        name: 'Mount Rainier', elevation_m: 4392,
                                        fact: null, summit_note: null },
                    apr: 24.99 },
            strip: { read: 0, total: 2, next: null, gear: [] },
          }],
        },
        ground: { total: 1623, recurring: 1588, minimums: 35 },
        lessons: { read: 3, total: 8 },
        kit: [],
      },
    })),
    http.get('*/api/v1/goals/1/contributions', () => HttpResponse.json({
      success: true, currency_code: 'USD',
      contributions: [
        { user_id: 'harun@test.com', display_name: 'Harun', amount: 400, imported: false },
        { user_id: 'rachel@test.com', display_name: 'Rachel', amount: 300, imported: true },
      ],
    })),
    /**
     * *** THE BUDGETS PAGE WAS ALREADY IN THE WALK, WHICH IS NOT THE SAME AS THE
     * WALK SEEING THE SPENDING GROUPS. *** D-165. The old fixture had three flat
     * budgets named 'Groceries', 'Bills' and 'Fun' and no `groups` key at all, so
     * the page would render its empty-list branch and both walks would report a
     * page that contains none of their subjects.
     *
     * *** THE NAMES ARE DELIBERATELY LONG. *** A category name that fits at 1440
     * and overflows at 390 is the entire point of the responsive walk, and a
     * fixture full of six-letter words cannot produce one. These are the widest
     * strings the page can hold: a long name, beside a group control, beside
     * three money figures.
     *
     * The states most likely to be styled carelessly are all present on purpose:
     * an OVERSPENT flexible group (negative remaining in clay), an EMPTY
     * non-monthly group, a FIXED card that reports instead of scoring, and an
     * Unsorted section with two categories and their controls.
     */
    /**
     * *** THE CATEGORY SCREEN WAS NEVER IN THE WALK AT ALL. *** Not "captured
     * without the new control" -- absent, so neither walk had ever measured a
     * page that has shipped for as long as the app has. The spending-group
     * control lands there (spec §1 decision 3), which is what surfaced it.
     *
     * Long names on purpose: a category name sits beside a `<select>` and two
     * icon buttons on one row, which is the narrowest thing on this page and
     * the first to overflow at 390.
     */
    http.get('*/api/v1/categories/', () => HttpResponse.json({ categories: WALK_CATEGORIES })),
    http.get('*/api/v1/categories', () => HttpResponse.json({ categories: WALK_CATEGORIES })),
    http.get('*/api/v1/budgets/overview', () => HttpResponse.json({
      success: true,
      total_budget: 2000, total_spent: 1450, total_remaining: 550, percentage_used: 72,
      budget_count: 3,
      budgets: [
        budgetWalkRow(1, 'Rent, service charge and ground rent for the flat', 1300, 1300),
        budgetWalkRow(2, 'Groceries, household supplies and the corner shop', 500, 723),
        budgetWalkRow(3, 'Presents, birthdays and seasonal giving', 200, 60),
      ],
      groups: [
        { spending_type: 'fixed', label: 'Fixed', planned: 1300, actual: 1300, remaining: 0,
          budgets: [budgetWalkRow(1, 'Rent, service charge and ground rent for the flat', 1300, 1300)] },
        { spending_type: 'flexible', label: 'Flexible', planned: 500, actual: 723, remaining: -223,
          budgets: [budgetWalkRow(2, 'Groceries, household supplies and the corner shop', 500, 723)] },
        // Deliberately EMPTY: the group still renders, and its empty state is a
        // full-width line of prose that nothing else on the page produces.
        { spending_type: 'non_monthly', label: 'Non-Monthly', planned: 0, actual: 0, remaining: 0,
          budgets: [] },
      ],
      unsorted: {
        count: 2,
        actual: 241.99,
        categories: [
          { id: 901, name: 'Gym membership and physiotherapy appointments', actual: 229.99 },
          { id: 902, name: 'Monthly bank account maintenance fee', actual: 12 },
        ],
        budget_count: 0,
        budgets: [],
      },
      totals: { planned: 2000, actual: 2083, remaining: -83 },
      income: 4200,
      left_to_budget: 2200,
    })),
  );
});

/**
 * *** THE TIER 2 AND TIER 3 PAGES WERE NOT IN THE CAPTURE LIST AT ALL. ***
 *
 * The responsive pass (2026-08-11) targets three two-pane pointsPal layouts and
 * two data tables that reflow badly — and not one of those pages was captured,
 * so the overflow gate would have swept four pages that contain none of its
 * subjects and reported green forever. That is this file's own header comment
 * happening a second time: "unmeasured" is not "clean".
 *
 * Realistic payloads, not empty ones. A pointsPal page with zero cards renders
 * an empty state, which has no grid to measure — an empty capture passes an
 * overflow gate exactly the way a correct one does.
 */
const WALK_CATEGORIES = [
  { id: 1, name: 'Housing, rent and everything the landlord bills for', icon: '🏠',
    color: '#3498db', parent_id: null, is_system: false, spending_type: 'fixed' },
  { id: 2, name: 'Home maintenance and occasional emergency repairs', icon: '🔧',
    color: '#3498db', parent_id: 1, is_system: false, spending_type: 'non_monthly' },
  { id: 3, name: 'Buildings and contents insurance', icon: '🛡️',
    color: '#3498db', parent_id: 1, is_system: false, spending_type: null },
  { id: 4, name: 'Food, drink and the weekly supermarket run', icon: '🍽️',
    color: '#e74c3c', parent_id: null, is_system: false, spending_type: 'flexible' },
  { id: 5, name: 'Gym membership and physiotherapy appointments', icon: '💪',
    color: '#1abc9c', parent_id: null, is_system: false, spending_type: null },
  { id: 6, name: 'Other', icon: '❓',
    color: '#95a5a6', parent_id: null, is_system: true, spending_type: null },
];

const budgetWalkRow = (id: number, name: string, amount: number, spent: number) => ({
  id, name, amount, spent,
  remaining: amount - spent,
  percentage: amount > 0 ? (spent / amount) * 100 : 0,
  category_id: id + 100,
  category_name: name,
  category_icon: '\u{1F3F7}\u{FE0F}',
  category_color: '#6c757d',
  category: { name },
  period: 'monthly',
  is_active: true,
});

const cardFace = (id: number, name: string, program: string, color: string) => ({
  id, card_name: name, program, issuer_color: color, points: 84210,
  est_value_usd: 1263.15, annual_fee: 95, expiry_alert: null, stale: false,
});

beforeEach(() => {
  server.use(
    http.get('*/api/v1/pointspal/overview', () => HttpResponse.json({
      total_value_usd: 2481.4, pts_earned_this_month: 12480,
      pts_missed_this_month: 3120, active_cap_alerts: 2, max_redeemable_usd: 1980.25,
      cards: [
        cardFace(1, 'Sapphire Preferred', 'Chase Ultimate Rewards', 'chase'),
        cardFace(2, 'Gold Card', 'Amex Membership Rewards', 'amex'),
        cardFace(3, 'Double Cash', 'Citi ThankYou', 'citi'),
      ],
      stale_cards: [{ id: 3, card_name: 'Double Cash', stale_status: 'stale',
        issuer_updated_at: '2025-11-02' }],
      action_items: [
        { type: 'capped', emoji: '🚫', title: 'Groceries cap reached on Gold Card',
          description: 'Switch to Sapphire Preferred for the rest of the quarter.',
          value: '4,200', value_label: 'pts at risk', link_to: '/pointspal/caps' },
        { type: 'opportunity', emoji: '✨', title: 'Transfer bonus to Flying Blue',
          description: '25% bonus ends in nine days.', value: '$312',
          value_label: 'extra value', link_to: '/pointspal/redeem' },
      ],
      recent_activity: [
        { card_name: 'Sapphire Preferred', dot_color: '#3b82f6',
          description: 'Whole Foods Market', subtitle: 'Groceries · 12 Aug',
          pts_earned: 428, pts_missed: 0 },
        { card_name: 'Gold Card', dot_color: '#f59e0b', description: 'Delta Air Lines',
          subtitle: 'Travel · 11 Aug', pts_earned: 1240, pts_missed: 310 },
      ],
    })),
    http.get('*/api/v1/pointspal/caps', () => HttpResponse.json([
      { category: 'Groceries', emoji: '🛒', card_name: 'Gold Card', cap_amount: 25000,
        cap_period: 'yearly', spent: 24100, cap_pct: 96.4, status: 'warning',
        effective_rate: 4, normal_rate: 4, room_left: 900, resets_at: '2027-01-01',
        recommended_switch: { card_name: 'Sapphire Preferred', rate: 3, cap: null } },
      { category: 'Dining', emoji: '🍽️', card_name: 'Sapphire Preferred', cap_amount: null,
        cap_period: 'none', spent: 1840, cap_pct: 0, status: 'ok', effective_rate: 3,
        normal_rate: 3, room_left: 0, resets_at: '', recommended_switch: null },
      { category: 'Travel', emoji: '✈️', card_name: 'Double Cash', cap_amount: 6000,
        cap_period: 'quarterly', spent: 6000, cap_pct: 100, status: 'capped',
        effective_rate: 1, normal_rate: 5, room_left: 0, resets_at: '2026-10-01',
        recommended_switch: { card_name: 'Gold Card', rate: 4, cap: 25000 } },
    ])),
    http.get('*/api/v1/pointspal/caps/summary', () => HttpResponse.json({
      period: 'monthly', pts_earned: 12480, pts_at_normal: 15600, pts_at_fallback: 2100,
      pts_missed: 3120, value_missed_usd: 46.8, active_alerts: 2,
      upcoming_resets: [
        { category: 'Travel', card_name: 'Double Cash', resets_at: '2026-10-01', period: 'quarterly' },
        { category: 'Groceries', card_name: 'Gold Card', resets_at: '2027-01-01', period: 'yearly' },
      ],
    })),
    http.get('*/api/v1/pointspal/cards', () => HttpResponse.json([
      { id: 1, card_name: 'Sapphire Preferred', issuer: 'Chase',
        program: 'Chase Ultimate Rewards', issuer_color: 'chase', last_four: '4021',
        points: 84210, est_value_usd: 1263.15, annual_fee: 95, avg_rate_ytd: 2.8,
        verified_at: '2026-08-01', stale_status: 'fresh', expiry_alert: null,
        earn_caps: [
          { category: 'Dining', rate: 3, cap_amount: null, cap_period: null },
          { category: 'Travel', rate: 2, cap_amount: null, cap_period: null },
        ], submitted_to_community: false },
      { id: 2, card_name: 'Gold Card', issuer: 'American Express',
        program: 'Amex Membership Rewards', issuer_color: 'amex', last_four: '1007',
        points: 51340, est_value_usd: 1027.0, annual_fee: 250, avg_rate_ytd: 3.4,
        verified_at: '2026-07-18', stale_status: 'fresh', expiry_alert: null,
        earn_caps: [
          { category: 'Groceries', rate: 4, cap_amount: 25000, cap_period: 'yearly' },
          { category: 'Dining', rate: 4, cap_amount: null, cap_period: null },
        ], submitted_to_community: true },
    ])),
    http.get('*/api/v1/pointspal/cards/:id/transactions', () => HttpResponse.json([
      { id: 11, date: '2026-08-12', description: 'Whole Foods Market',
        category: 'Groceries', amount: 107.02, rate: 4, pts_earned: 428 },
      { id: 12, date: '2026-08-11', description: 'Delta Air Lines',
        category: 'Travel', amount: 620.0, rate: 2, pts_earned: 1240 },
    ])),
    http.get('*/api/v1/pointspal/recommend', () => HttpResponse.json({
      category: 'groceries', amount: 250,
      winner: { card_name: 'Gold Card', pts_earned: 1000, value_usd: 20.0,
        effective_rate: 4, cap_note: '900 of cap left' },
      displaced_winner: { card_name: 'Double Cash', normal_rate: 5,
        status: 'capped', cap_note: 'Quarterly cap reached' },
      all_cards: [
        { card_name: 'Gold Card', program: 'Amex Membership Rewards', nominal_rate: 4,
          effective_rate: 4, pts_earned: 1000, value_usd: 20.0, status: 'ok',
          cap_pct: 96.4, tag: 'best' },
        { card_name: 'Sapphire Preferred', program: 'Chase Ultimate Rewards',
          nominal_rate: 3, effective_rate: 3, pts_earned: 750, value_usd: 15.0,
          status: 'ok', cap_pct: null, tag: 'good' },
        { card_name: 'Double Cash', program: 'Citi ThankYou', nominal_rate: 5,
          effective_rate: 1, pts_earned: 250, value_usd: 2.5, status: 'capped',
          cap_pct: 100, tag: 'capped' },
      ],
    })),
    http.get('*/api/v1/pointspal/redeem', () => HttpResponse.json({
      total_value_usd: 2481.4, max_redeemable_usd: 1980.25, total_points: 135550,
      card_count: 3,
      programs: [
        { program_name: 'Chase Ultimate Rewards', points: 84210, dot_color: '#3b82f6',
          options: [
            { partner: 'Hyatt', description: 'Transfer 1:1 to World of Hyatt',
              type: 'Transfer', cpp: 2.3, tag: 'Best' },
            { partner: 'Travel portal', description: 'Book flights at 1.25c',
              type: 'Portal', cpp: 1.25, tag: 'Good' },
            { partner: 'Statement credit', description: 'Cash out at 1c',
              type: 'Cash', cpp: 1.0, tag: 'Avoid' },
          ] },
        { program_name: 'Amex Membership Rewards', points: 51340, dot_color: '#f59e0b',
          options: [
            { partner: 'Flying Blue', description: 'Transfer 1:1, 25% bonus live',
              type: 'Transfer', cpp: 2.1, tag: 'Best' },
            { partner: 'Amex Travel', description: 'Book flights at 1c',
              type: 'Portal', cpp: 1.0, tag: 'OK' },
          ] },
      ],
      tips: [{ type: 'transfer', title: 'Transfer partners beat the portal',
        body: 'Both live programs redeem for more than 2c through airline and hotel partners.' }],
    })),
    http.get('*/api/v1/points/programs', () => HttpResponse.json([
      { program_id: 'chase-ur', program_name: 'Chase Ultimate Rewards', issuer: 'Chase',
        network: 'Visa', annual_fee: 95, effective_annual_fee: '$95', base_cpp: 1.0,
        tpg_cpp: 2.05, data_as_of: '2026-08-01', is_stale: false },
    ])),
    http.get('*/api/v1/investments/portfolios', () => HttpResponse.json({
      success: true,
      portfolios: [{ id: 1, name: 'Main', total_value: 48210.55, total_cost: 39000,
        total_gain_loss: 9210.55, total_gain_loss_percent: 23.6 }],
    })),
    http.get('*/api/v1/investments/holdings', () => HttpResponse.json({
      success: true,
      /**
       * *** THESE KEYS ARE COPIED FROM THE DEPLOYED PAYLOAD, NOT INVENTED. ***
       * The previous fixture sent `average_cost`, `market_value` and
       * `gain_loss_percent` — three names this API has never sent. The page reads
       * `purchase_price`, so `costBasis` was `undefined * shares` = **NaN**, and
       * this capture rendered **`$NaN` eight times**. `NaN >= 0` is false, so every
       * figure also took the RED branch and printed a red "+0.00%".
       *
       * Both gates called that page fine: NaN text still has a contrast ratio and a
       * NaN does not overflow. So investments' contrast numbers — and the responsive
       * pass's overflow numbers — were measured against a page in an error state.
       * Verified against the real endpoint with a token: `purchase_price`,
       * `current_price`, `current_value`, `gain_loss`, `gain_loss_percentage`.
       */
      holdings: [
        { id: 1, symbol: 'VWRP', name: 'Vanguard FTSE All-World Acc', shares: 210,
          purchase_price: 98.4, current_price: 121.2, current_value: 25452,
          gain_loss: 4788, gain_loss_percentage: 23.2, portfolio_id: 1 },
        { id: 2, symbol: 'AAPL', name: 'Apple Inc.', shares: 60, purchase_price: 168.2,
          current_price: 224.9, current_value: 13494, gain_loss: 3402,
          gain_loss_percentage: 33.7, portfolio_id: 1 },
        { id: 3, symbol: 'MSFT', name: 'Microsoft Corporation', shares: 22,
          purchase_price: 331.0, current_price: 421.6, current_value: 9275.2,
          gain_loss: 1993.2, gain_loss_percentage: 27.4, portfolio_id: 1 },
      ],
    })),
  );
});

/**
 * `drive` runs after the page has settled, for pages whose measurable layout only
 * exists after an interaction. BestCard's `<RecommendTable>` — one of the five real
 * `<table>` elements Tier 3 covers — is behind a form submit, so capturing the page
 * as it first paints captures the empty state and measures nothing.
 */
type Case = [string, React.FC, ((c: HTMLElement) => Promise<void>)?];

const cases: Case[] = [
  ['dashboard', Dashboard as React.FC],
  /**
   * *** CAPTURED AFTER TOUCHING A GROUP CONTROL, NOT AS IT FIRST PAINTS. ***
   * Same reason goals is captured with its panel open. The `<select>` carries
   * four options and sits inline beside a long category name and three money
   * figures -- it is the widest row this page can produce, and a focused
   * control is also the only state in which its border and text are measurable
   * against the card behind it.
   */
  ['budgets', BudgetsMinimal as React.FC, async () => {
    await screen.findByRole('heading', { level: 2, name: 'Fixed' });
    const controls = await screen.findAllByLabelText('Spending group');
    controls[0].focus();
    // Collapse one group so the walk sees a COLLAPSED header too: that is the
    // state a returning user lands in, and it is styled separately.
    await userEvent.click(
      await screen.findByRole('heading', { level: 2, name: 'Non-Monthly' }));
  }],
  /**
   * Captured with a spending-group control FOCUSED. A `<select>` inline beside
   * a long category name and two icon buttons is the widest row this page can
   * produce, and focus is the only state in which the control's own border and
   * text are measurable against the card behind it.
   */
  ['categories', CategoryManagement as React.FC, async () => {
    const controls = await screen.findAllByLabelText('Spending group');
    controls[0].focus();
  }],
  // Accounts is walked at ONE realistic count. It was measured at 2/8/20 once,
  // to answer a density question; those captures then lingered in `captured/`
  // and the sweep dutifully walked three stale copies of the same page. The
  // capture now clears the directory, and the page is here as itself.
  ['accounts', Accounts as React.FC],
  /**
   * Captured with its contributions row EXPANDED, not as it first paints: the
   * breakdown is the only part of this page with a two-column money layout, and
   * capturing the collapsed state measures a progress bar and nothing else. Same
   * reason pointspal-mycards is captured with its modal open.
   *
   * *** AND WITH THE B12 "MANAGE ACCOUNTS" PANEL OPEN, FOR THE SAME REASON. ***
   * It is a row of account chips, each carrying a name AND a money figure, above
   * a stack of full-width buttons — the widest content this page can hold, and
   * none of it exists in the collapsed state. Left closed, the walk would report
   * the goals page green having measured the version of it that shipped before
   * this feature.
   */
  ['goals', Goals as React.FC, async () => {
    /*
     * *** THE ACCOUNTS CONTROL USED TO BE CLICKED HERE AND HAS MOVED INTO THE
     * EDIT PANEL. *** This interaction opened it on the card; the owner asked for
     * account changes to happen while editing, so it now lives in a `SlidePanel`
     * — which PORTALS to `document.body` while this walk writes
     * `container.innerHTML`, so it is unreachable from here by construction
     * (D-165). Its coverage did not vanish: `slidepanel-goal-edit` in the MODAL
     * walk renders that panel, accounts control included, at four widths in both
     * themes.
     *
     * *** THIS WALK'S OWN INTERACTION IS WHAT CAUGHT THE MOVE, *** by failing on
     * a button that no longer exists — which is the argument for adding the
     * interaction and not just the fixture.
     *
     * The contributions table stays: it is on the card and nowhere else. The
     * FIRST goal specifically, because `getByRole` refuses an ambiguous match
     * rather than picking, and only goal 1 has a contributions fixture.
     */
    const first = await screen.findByTestId('goal-1');
    await userEvent.click(within(first).getByRole('button', { name: /Who contributed/ }));
    await screen.findByText('Rachel');
  }],
  /**
   * *** learnPal's HOME AND RANGE HAD NEVER BEEN RENDERED BY ANY WALK. *** Both
   * are new: the range shipped in #176 and the home in this branch, and until
   * now the only learnPal thing either walk saw was the BANNER on the goals
   * page — which is a different component reading a different payload. A module
   * being mocked for another page's benefit is not the same as its own pages
   * being measured.
   *
   * Neither needs an interaction: every state worth measuring is on first
   * paint, and the one thing behind a click (a lesson reader) is a `SlidePanel`
   * that portals to `document.body` and is therefore unreachable from a walk
   * writing `container.innerHTML` (D-165). It belongs to the MODAL walk.
   */
  ['learnpal-home', LearnPalHome as React.FC],
  ['learnpal-range', LearnPalRange as React.FC],
  ['investments', Investments as React.FC],
  ['pointspal-overview', PointsPalOverview as React.FC],
  ['pointspal-caps', CapTracker as React.FC],
  /**
   * MyCards is captured with the Add-Card modal OPEN, because that is the only place
   * its `130px 52px 90px 90px 52px` earn-rate grid — Tier 3's headline subject, 414px
   * of fixed track — actually renders. Capturing the page as it first paints captures
   * the wallet list and none of the thing the tier exists to fix.
   */
  ['pointspal-mycards', MyCards as React.FC, async () => {
    await userEvent.click(screen.getByRole('button', { name: /Add Card/ }));
    // No program is selected on open, so the manual earn-rate grid renders straight
    // away. Waiting on its last column header rather than on the modal, because the
    // modal opens whether or not that section is in it.
    await screen.findByText('Fallbk');
  }],
  ['pointspal-redeem', Redeem as React.FC],
  ['pointspal-bestcard', BestCard as React.FC, async () => {
    await userEvent.type(screen.getByPlaceholderText('0.00'), '250');
    await userEvent.click(screen.getByRole('button', { name: /Find Best/ }));
    // The RecommendTable is the point of the capture, so wait for a cell in it —
    // not for the button to re-enable, which happens whether or not it rendered.
    await screen.findByText('Sapphire Preferred', undefined, { timeout: 6000 });
  }],
];

it.each(cases)('captures %s', async (name, Page, drive) => {
  const { container } = render(
    <MemoryRouter><ThemeProvider><ToastProvider><Page /></ToastProvider></ThemeProvider></MemoryRouter>
  );
  // Wait for the loading spinner to go, or we capture a spinner and report zero.
  /**
   * *** WAIT FOR THE PAGE TO EXIST, NOT FOR A SPINNER TO STOP EXISTING. ***
   *
   * This used to be `expect(container.querySelector('.animate-spin')).toBeNull()`,
   * and that check is VACUOUS on any page whose loading state is not that spinner.
   * `Investments.tsx:170` renders a plain "Loading investment data..." div — two
   * elements, no `.animate-spin` — so the wait resolved on its FIRST tick and the
   * capture raced the fetch. It won that race on this machine nine times out of
   * nine and lost it on a CI runner, which is the worst possible distribution: the
   * page serialized as a two-element stub, and a stub overflows nowhere and has no
   * contrast pairs, so BOTH walks would have reported it clean.
   *
   * A check for the absence of something is satisfied by that something never
   * having existed. The condition below is positive and page-agnostic — it waits
   * for the property the captures actually need — and it makes the `painted < 50`
   * guard underneath an assertion rather than a coin toss.
   */
  // Enough of a shell to interact with. A driven page is deliberately BELOW the
  // final bar here — BestCard's empty state is a form and no results — so the full
  // threshold cannot be applied until after the drive.
  await waitFor(() => {
    expect(container.querySelectorAll('*').length).toBeGreaterThanOrEqual(20);
    expect(container.querySelector('.animate-spin')).toBeNull();
  }, { timeout: 6000 });

  if (drive) await drive(container);

  // The real readiness gate, applied to every page once it is in its final state.
  await waitFor(() => {
    expect(container.querySelectorAll('*').length).toBeGreaterThanOrEqual(50);
  }, { timeout: 6000 });

  const painted = container.querySelectorAll('*').length;
  if (painted < 50) throw new Error(`${name}: only ${painted} elements — captured a stub`);

  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `${name}.html`), container.innerHTML, 'utf8');
  // eslint-disable-next-line no-console
  console.log(`CAPTURED ${name}: ${painted} elements`);
});
