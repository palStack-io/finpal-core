/**
 * Captures MODALS — opened, at each state that has its own layout — so the
 * overflow gate can see them.
 *
 * *** THE GAP THIS CLOSES IS NOT "NOBODY ADDED MODALS TO THE LIST". ***
 *
 * It is that adding them to the list would not have worked. `contrast-walk/
 * capture-pages.walk.tsx` serializes `container.innerHTML`, and `Modal.tsx` and
 * `SlidePanel.tsx` both `createPortal(..., document.body)` — so their markup is a
 * SIBLING of RTL's container, not inside it. Measured before this file was
 * written, driving Accounts' Add-Account panel open:
 *
 *     dialog in document   true
 *     dialog in container  false     <- what the page capture writes
 *     container 115 elements, body 187
 *
 * Every consumer of those two shells is therefore uncapturable by that harness:
 * Accounts, Transactions, BudgetsMinimal, Groups, GroupDetail, Investments
 * (AddHolding, StockDetail), CategoryManagement, TransactionRules. The one modal
 * the walks do see — MyCards' Add-Card dialog, which `MUST_SCROLL_AT_390` asserts
 * on — is visible only because it is written INLINE rather than portalled. So the
 * coverage that exists is an accident of one component's implementation, which is
 * exactly the shape D-127 names: a gate sees only the spellings somebody used.
 *
 * Run:
 *   WALK_CAPTURE=scripts/modal-walk/capture-modals.walk.tsx \
 *     npx vitest run --config scripts/contrast-walk/vitest.walk.config.ts
 *   node scripts/modal-walk/run.mjs
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
import { Accounts } from '../../src/pages/Accounts';
import LearnPalLessons from '../../src/modules/learnpal/pages/Lessons';
import { Transactions } from '../../src/pages/Transactions';
import { Investments } from '../../src/pages/Investments';
import { Goals } from '../../src/pages/Goals';
import { CategoryManagement } from '../../src/components/CategoryManagement';
import { TransactionRules } from '../../src/components/TransactionRules';
import { ToastProvider } from '../../src/contexts/ToastContext';
import { ThemeProvider } from '../../src/contexts/ThemeContext';

/**
 * `a-starter-buffer`'s approved body, copied from `lesson_bodies.py`. Kept here
 * as the literal text rather than imported: the walk renders the CLIENT, and a
 * capture that reached into the Python package would couple a browser fixture
 * to the backend's import graph.
 */
const LESSON_BODY = [
    '### The rope you tie on first',
    '',
    'There\'s a common piece of advice that you want three to six months of expenses saved before',
    'anything else. It\'s a reasonable target and it is completely out of reach for a lot of people,',
    'which makes it easy to hear as "don\'t bother starting".',
    '',
    'Here\'s the part that gets left out: **most of the protection comes from the first small bit.**',
    'The gap between nothing and a few hundred is the difference between a flat tyre being annoying',
    'and a flat tyre going on the credit card at 22%. The gap between four months and six months is',
    'real, but it is nothing like as sharp.',
    '',
    'So the number to aim at first isn\'t three months. It\'s whatever covers the next thing that',
    'breaks.',
    '',
    'If money is tight enough that even that feels far away, that isn\'t a failure of yours. Rent,',
    'food and borrowing have all outrun wages in most places for years, and "save more" is advice',
    'written for a world with more slack in it than this one has. Saying so isn\'t giving up — it\'s',
    'the reason the target here is the next thing that breaks rather than three months of expenses.',
    'What\'s still yours is where anything spare goes, and this is the highest-value place to send',
    'the first of it.',
    '',
    '> **Where the 3–6 months figure comes from:** it\'s a widely repeated rule of thumb in personal',
    '> finance guidance, not a rule finPal applies and not a threshold anyone checks you against.',
    '',
].join('\n');

const OUT = join(__dirname, 'captured');

/* Stale captures are worse than none: the walk sweeps the directory, so a file
   left from an earlier experiment is measured as if it were today's code. Same
   reasoning, and the same bug, as contrast-walk's capture. */
beforeAll(() => {
  if (existsSync(OUT)) {
    for (const f of readdirSync(OUT)) if (f.endsWith('.html')) rmSync(join(OUT, f));
  }
});

beforeAll(() => { api.defaults.adapter = 'http'; });
beforeEach(() => {
  useAuthStore.setState({
    user: { id: 'alice@test.com', name: 'Alice', default_currency_code: 'GBP' } as any,
    token: 'tok', refreshToken: 'r', isAuthenticated: true,
  });
});

/**
 * The endpoints the shared handlers do not carry. Realistic shapes, because an
 * empty modal has no layout to measure — `capture-pages.walk.tsx` learned that
 * twice, most expensively when an investments fixture sent three keys the API has
 * never sent and the page rendered `$NaN` eight times while both gates called it
 * clean (D-107). These key names are taken from that file, which verified them
 * against the deployed endpoint with a token.
 */
beforeEach(() => {
  server.use(
    http.post('*/api/v1/csv-import/import', () =>
      HttpResponse.json({ success: true, imported: 42, skipped: 3 })),
    /*
     * C1c. *** THE GOALS PANEL IS A PORTAL, SO THE PAGE CAPTURE CANNOT SEE IT
     * (D-165). *** Goals moved its create form out of an inline card and into
     * `SlidePanel`, and added an EDIT mode to the same panel -- so both states
     * are new surface that only this walk can reach. The goal name is long on
     * purpose: it has to be a string that fits at 1440 and can overflow at 390,
     * and a short fixture cannot produce one.
     */
    http.get('*/api/v1/goals', () => HttpResponse.json({
      success: true,
      goals: [{
        id: 1, user_id: 'alice@test.com',
        name: 'Clear the John Lewis Partnership Mastercard',
        kind: 'payoff', scope: 'household', account_id: 7,
        account_name: '2 accounts',
        accounts: [{ id: 7, name: 'Barclaycard Platinum Cashback', start_amount: -1125.41 },
                   { id: 9, name: 'John Lewis Partnership Card', start_amount: -524.59 }],
        target_amount: 0, start_amount: -1650, current_manual: null,
        currency_code: 'GBP', start_date: '2026-01-01',
        target_date: '2027-06-30T00:00:00', status: 'active', achieved_at: null,
        current_amount: -450, direction: 'paydown', progress: 0.7272,
        peak: { scale: 'cost', magnitude: 312.5, unmeasured: false, band: 5,
                mountain: { slug: 'everest', name: 'Everest', elevation_m: 8849,
                            fact: null, summit_note: null },
                hardest_band: 5,
                hardest_mountain: { slug: 'everest', name: 'Everest',
                                    elevation_m: 8849, fact: null, summit_note: null },
                apr: null },
      }],
    })),
    /*
     * *** THE TWO WALKS HAVE SEPARATE CAPTURE FILES WITH SEPARATE HANDLERS, SO
     * A REQUEST ADDED TO A PAGE MUST BE HANDLED IN BOTH. *** This walk renders
     * the Goals page for the two panel states, so it makes the same
     * `/learnpal/range` request the page capture does -- and without a handler
     * MSW's `onUnhandledRequest: 'error'` raises and `captures
     * slidepanel-goal-edit` times out at 5s.
     *
     * *** THIS IS THE SECOND TIME THE SAME OMISSION SHIPPED, ONE LAYER OVER. ***
     * I added the handler to the page capture, then ran
     * `node scripts/modal-walk/run.mjs` and read it as "the modal walk is
     * green" -- but `run.mjs` MEASURES already-captured HTML. The CAPTURE step
     * (`WALK_CAPTURE=...capture-modals...`) is the one that renders the page,
     * and it is a different command. Running the measurement proves nothing
     * about the capture.
     *
     * A minimal-but-real payload: this walk roots at the DIALOG, so the banner
     * and the card strips are out of frame here. It exists so the page renders
     * without raising, not to be measured.
     */
    /**
     * *** THE WHOLE POINT OF THIS CAPTURE IS THE PANEL, NOT THE LIST. *** The
     * lesson reader is a `SlidePanel`, so a fixture alone measures nineteen
     * rows and none of `LessonBody` -- D-165 exactly, and the same miss the
     * `recurring` case above records. The drive below opens one.
     *
     * *** THE ROWS AND THE PROSE ARE THE REAL ONES. *** Titles come from
     * `seed.py` and the body is `a-starter-buffer`'s approved draft, verbatim,
     * because this walk exists to measure a paragraph of real length wrapping
     * at 390px and a fixture sentence cannot make one (D-107's inverse: a
     * fixture kinder than the data hides what the data does). The longest title
     * in the list, "When consolidating helps, and when it doesn't", is likewise
     * the seeded one rather than a padded string.
     *
     * Six of nineteen are `earned` so both states are on screen: the rows that
     * offer a Read button and the rows that show an unlock caption.
     */
    http.get('*/api/v1/learnpal/lessons', () => HttpResponse.json({
      success: true,
      read: 6,
      total: 19,
      lessons: [
      { slug: 'what-a-goal-tracks', title: 'What a goal tracks', gear_slug: 'map',
        surface: 'setup', applies_to_direction: null,
        unlock_at_progress: null, earned: true, has_body: true },
      { slug: 'where-your-money-goes', title: 'Where your money goes', gear_slug: 'boots',
        surface: 'mountain', applies_to_direction: null,
        unlock_at_progress: null, earned: true, has_body: true },
      { slug: 'a-starter-buffer', title: 'The rope you tie on first', gear_slug: 'rope',
        surface: 'mountain', applies_to_direction: null,
        unlock_at_progress: 0.1, earned: true, has_body: true },
      { slug: 'what-your-apr-costs', title: 'What your APR actually costs', gear_slug: 'headlamp',
        surface: 'mountain', applies_to_direction: 'paydown',
        unlock_at_progress: 0.0, earned: true, has_body: true },
      { slug: 'why-minimums-barely-move-it', title: 'Why the minimum barely moves it', gear_slug: 'ice-axe',
        surface: 'mountain', applies_to_direction: 'paydown',
        unlock_at_progress: 0.15, earned: true, has_body: true },
      { slug: 'utilisation-and-your-score', title: 'Utilisation, and what it touches', gear_slug: 'gloves',
        surface: 'mountain', applies_to_direction: null,
        unlock_at_progress: null, earned: true, has_body: true },
      { slug: 'avalanche-vs-snowball', title: 'Avalanche or snowball', gear_slug: 'compass',
        surface: 'mountain', applies_to_direction: 'paydown',
        unlock_at_progress: 0.25, earned: false, has_body: true },
      { slug: 'fixed-vs-flexible', title: 'Fixed, flexible, and the ones that are neither', gear_slug: 'trekking-poles',
        surface: 'setup', applies_to_direction: null,
        unlock_at_progress: null, earned: false, has_body: true },
      { slug: 'income-vs-what-lands', title: 'Income vs what lands', gear_slug: 'pack-scale',
        surface: 'mountain', applies_to_direction: null,
        unlock_at_progress: null, earned: false, has_body: true },
      { slug: 'debt-to-income', title: 'Debt to income', gear_slug: 'slope-gauge',
        surface: 'mountain', applies_to_direction: null,
        unlock_at_progress: null, earned: false, has_body: true },
      { slug: 'when-consolidating-helps-and-when-it-doesnt', title: 'When consolidating helps, and when it doesn\'t', gear_slug: 'carabiner',
        surface: 'mountain', applies_to_direction: null,
        unlock_at_progress: null, earned: false, has_body: true },
      { slug: 'why-a-buffer-comes-first', title: 'Why a buffer comes first', gear_slug: 'bivvy',
        surface: 'mountain', applies_to_direction: null,
        unlock_at_progress: null, earned: false, has_body: true },
      { slug: 'how-much-is-enough', title: 'How much is enough', gear_slug: 'water-bottle',
        surface: 'mountain', applies_to_direction: 'accumulate',
        unlock_at_progress: 0.5, earned: false, has_body: true },
      { slug: 'sinking-funds', title: 'Sinking funds', gear_slug: 'cache',
        surface: 'mountain', applies_to_direction: null,
        unlock_at_progress: null, earned: false, has_body: true },
      { slug: 'paying-yourself-first', title: 'Paying yourself first', gear_slug: 'alpine-start',
        surface: 'mountain', applies_to_direction: null,
        unlock_at_progress: null, earned: false, has_body: true },
      { slug: 'what-inflation-does-to-cash', title: 'What inflation does to cash', gear_slug: 'thermometer',
        surface: 'mountain', applies_to_direction: 'accumulate',
        unlock_at_progress: 0.75, earned: false, has_body: true },
      { slug: 'when-to-stop-saving-and-start-paying-down', title: 'When to stop saving and start paying down', gear_slug: 'signpost',
        surface: 'mountain', applies_to_direction: null,
        unlock_at_progress: null, earned: false, has_body: true },
      { slug: 'insurance-as-risk-transfer', title: 'Insurance as risk transfer', gear_slug: 'helmet',
        surface: 'mountain', applies_to_direction: null,
        unlock_at_progress: 0.9, earned: false, has_body: true },
      { slug: 'what-finpal-cannot-tell-you', title: 'What finPal cannot tell you', gear_slug: 'guidebook',
        surface: 'mountain', applies_to_direction: null,
        unlock_at_progress: null, earned: false, has_body: true },
      ],
    })),
    http.get('*/api/v1/learnpal/lessons/:slug', ({ params }) => HttpResponse.json({
      success: true,
      lesson: {
        slug: params.slug, title: 'The rope you tie on first',
        gear_slug: 'rope', surface: 'mountain', earned: true, locked: false,
        body_md: LESSON_BODY,
      },
    })),
    http.get('*/api/v1/learnpal/range', () => HttpResponse.json({
      success: true,
      range: {
        cost: { heading: "What's costing you", unit: 'a month, in interest',
                total: 0, peaks: [] },
        build: { heading: "What you're building", unit: 'still to save',
                 total: 0, peaks: [] },
        ground: { total: 1623, recurring: 1588, minimums: 35 },
        lessons: { read: 3, total: 8 },
        kit: [],
      },
    })),
    http.get('*/api/v1/goals/1/contributions', () => HttpResponse.json({
      success: true, contributions: [],
    })),
    http.get('*/api/v1/transaction-rules', () => HttpResponse.json({
      success: true,
      rules: [{ id: 1, name: 'Groceries -> Food', field: 'description', operator: 'contains',
        value: 'WHOLE FOODS', category_id: 3, category_name: 'Groceries', account_id: null,
        priority: 1, is_active: true, match_count: 41, created_at: '2026-07-01' }],
    })),
    http.get('*/api/v1/transaction-rules/stats', () => HttpResponse.json({
      success: true,
      stats: { total_rules: 1, active_rules: 1, inactive_rules: 0, total_matches: 41, most_used_rules: [] },
    })),
    http.get('*/api/v1/investments/portfolios', () => HttpResponse.json({
      success: true,
      portfolios: [{ id: 1, name: 'Main', total_value: 48210.55, total_cost: 39000,
        total_gain_loss: 9210.55, total_gain_loss_percent: 23.6 }],
    })),
    http.get('*/api/v1/investments/holdings', () => HttpResponse.json({
      success: true,
      holdings: [
        { id: 1, symbol: 'VWRP', name: 'Vanguard FTSE All-World Acc', shares: 210,
          purchase_price: 98.4, current_price: 121.2, current_value: 25452,
          gain_loss: 4788, gain_loss_percentage: 23.2, portfolio_id: 1 },
        { id: 2, symbol: 'AAPL', name: 'Apple Inc.', shares: 60, purchase_price: 168.2,
          current_price: 224.9, current_value: 13494, gain_loss: 3402,
          gain_loss_percentage: 33.7, portfolio_id: 1 },
      ],
    })),
    http.get('*/api/v1/groups', () => HttpResponse.json({ success: true, groups: [] })),
    /*
      Choosing `credit` makes `AddAccountForm` fetch the pointsPal wallet, which
      no other state reaches — MSW is configured `onUnhandledRequest: 'error'`, so
      the capture succeeded while the run reported an unhandled rejection. Two
      cards rather than none, because the empty branch renders a one-line hint
      where the populated one renders a `<select>`, and the taller of the two is
      what the overflow walk should be measuring.
    */
    http.get('*/api/v1/pointspal/cards', () => HttpResponse.json([
      /*
        A BARE ARRAY, not `{success, cards}`. `pointspalService.getCards()` returns
        `response.data` whole, so an envelope here made `walletCards` a non-array
        and `walletCards.map` threw inside render, unmounting the entire panel --
        the walk then reported "unable to find role=dialog" and the capture would
        have been of nothing at all. *** THE FIXTURE'S SHAPE WAS READ OFF THE
        SERVICE, NOT GUESSED, ON THE SECOND ATTEMPT *** -- which is D-107's lesson
        (an investments fixture sent three keys the API has never sent and the page
        rendered `$NaN` eight times while both gates called it clean).
      */
      { id: 1, card_name: 'Barclaycard Platinum Cashback Plus', last_four: '4417',
        program: 'Cashback Rewards' },
      { id: 2, card_name: 'Amex British Airways Premium Plus', last_four: '1009',
        program: 'Avios' },
    ])),
    /*
      C1a. The shared handler serves ONE checking account, and the card/loan terms
      block only renders for `credit` and `loan` — so without this the two states
      below would open a panel with no terms in it and the walk would report clean
      on a control it had never drawn. *** A PAGE BEING IN THE WALK IS NOT THE SAME
      AS THE WALK SEEING WHAT YOU CHANGED *** (D-165's shape, and it cost a near-miss
      in B12 task 8).

      The name is DELIBERATELY LONG. A short fixture cannot produce the failure
      these widths exist to find: a string that fits at 1440 and overflows at 390.
      The terms themselves are the widest realistic values too — a five-digit limit
      and a four-character APR — because `999.99` is the ceiling the column imposes
      and a three-column `auto-fit` grid is exactly where that overflows first.
    */
    http.get('*/api/v1/accounts', () => HttpResponse.json({
      success: true,
      accounts: [{
        id: 1,
        name: 'Barclaycard Platinum Cashback Plus Rewards Mastercard',
        account_type: 'credit',
        balance: -1284.55,
        currency_code: 'GBP',
        institution: 'Barclays Bank UK PLC — Personal Banking Division',
        is_active: true,
        user_id: 'alice@test.com',
        import_source: 'manual',
        credit_limit: 12500,
        apr: 999.99,
        min_payment: 250,
        owners: [],
      }],
    })),
    http.get('*/api/v1/investments/exchanges', () => HttpResponse.json({ success: true, exchanges: [] })),
    http.get('*/api/v1/investments/quote/:symbol', ({ params }) => HttpResponse.json({
      success: true,
      quote: { symbol: params.symbol, price: 224.9, change: 3.42, change_percent: 1.54,
        previous_close: 221.48, currency: 'USD', name: 'Apple Inc.' },
    })),
    http.get('*/api/v1/investments/transactions', () => HttpResponse.json({ success: true, transactions: [] })),
    http.get('*/api/v1/investments/history/:symbol', () => HttpResponse.json({ success: true, history: [] })),
  );
});

/**
 * *** A REAL BANK EXPORT, NOT A MINIMAL ONE. ***
 *
 * Three short columns fit anything and would prove nothing; this is the shape a
 * user actually drops on the import modal — Monzo, Amex and Chase all export a
 * date, a long free-text description, a signed amount, a running balance and a
 * category. The descriptions are real-length merchant strings because the mapping
 * step renders `e.g., <first row value>` under each header, and the width of that
 * sample is part of what the layout has to survive. Five columns, not fifty: this
 * is a plausible export, not an adversarial one.
 */
const CSV = [
  'Transaction Date,Description,Amount,Running Balance,Category',
  '2026-08-12,WHOLE FOODS MARKET #10382 LONDON GB,-107.02,1104.55,Groceries',
  '2026-08-11,DELTA AIR LINES TICKET 0062193847561,-620.00,1211.57,Travel',
  '2026-08-10,TRANSFERWISE PAYMENT REF 88213904,-250.00,1831.57,Transfers',
  '2026-08-09,ACME CORPORATION SALARY AUGUST 2026,+3180.00,2081.57,Income',
].join('\n');

/**
 * jsdom's `Blob` has no `.text()` — measured, `typeof file.text === 'undefined'` —
 * and `CSVImportModal.processFile` calls exactly that. Without this the upload
 * step never advances and the capture times out looking like a broken test rather
 * than a missing environment method. Given to the FIXTURE rather than patched onto
 * `Blob.prototype`, so nothing else in the run sees an environment the browser and
 * jsdom disagree about.
 */
const csvFile = () => {
  const f = new File([CSV], 'monzo-august-2026.csv', { type: 'text/csv' });
  Object.defineProperty(f, 'text', { value: () => Promise.resolve(CSV) });
  return f;
};

/**
 * *** THE MODAL ROOT IS DERIVED FROM THE APP, NOT FROM A SELECTOR I CHOSE. ***
 *
 * Keying on `[role="dialog"]` would have been the obvious thing and it is a trap:
 * `CSVImportModal` — the subject of the issue this walk was written for — does not
 * set `role="dialog"` at all, so the gate would have skipped its own reason for
 * existing and reported green. That is D-127 again, one level down.
 *
 * So the root is found structurally: from an element the drive step waited for,
 * walk up to the OUTERMOST ancestor the component itself positioned `fixed`. All
 * three shells in this app (Modal, SlidePanel, CSVImportModal) write that inline,
 * so it is readable in jsdom, which has no layout. It throws rather than falling
 * back — a capture that silently marked the wrong element would measure the page
 * behind the modal and pass.
 */
const markModalRoot = (anchor: HTMLElement, name: string): HTMLElement => {
  let root: HTMLElement | null = null;
  for (let n: HTMLElement | null = anchor; n; n = n.parentElement) {
    if (n.style?.position === 'fixed') root = n;
  }
  if (!root) throw new Error(`${name}: no position:fixed ancestor above the anchor — the modal root could not be identified`);
  root.setAttribute('data-fp-modal', name);
  return root;
};

/**
 * The shell is rebuilt from `App.tsx`'s real `AppLayout`, exactly as
 * `responsive-walk/run.mjs` does and for the same reason — an INLINE modal
 * (CSVImportModal is one) renders inside `.main-content`, and `.main-content` is
 * `overflow-x: hidden`, so measuring it outside the shell would measure a
 * containing block no user has. Portalled markup goes back as a body sibling,
 * which is where React put it.
 */
const assemble = (page: string, portals: string) =>
  `<div style="display:flex;min-height:100vh"><aside class="sidebar"></aside>` +
  `<main class="main-content">${page}</main></div>${portals}`;

type Case = {
  name: string;
  Page: React.FC;
  /** Drives the app to the state, and returns an element INSIDE the modal. */
  open: () => Promise<HTMLElement>;
};

const openImportModal = async () => {
  await screen.findByRole('button', { name: /Import CSV/ }, { timeout: 6000 });
  await userEvent.click(screen.getByRole('button', { name: /Import CSV/ }));
  return screen.findByText('Upload your transaction history');
};

const toMappingStep = async () => {
  await openImportModal();
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error('no file input on the upload step');
  await userEvent.upload(input, csvFile());
  // Wait for a cell of the PREVIEW TABLE, not for the step heading. The heading
  // changes the moment `setStep('mapping')` runs; the table is rendered from
  // `csvPreview`, which is the thing being measured.
  return screen.findByText('WHOLE FOODS MARKET #10382 LONDON GB', undefined, { timeout: 6000 });
};

const cases: Case[] = [
  {
    name: 'csvimport-upload',
    Page: Accounts as React.FC,
    open: openImportModal,
  },
  {
    /**
     * The step the issue is most likely about: it is the only one with a grid AND
     * a table, and it is the only step whose modal card widens (`maxWidth` goes
     * 600px -> 900px at `CSVImportModal.tsx:251`).
     */
    name: 'csvimport-mapping',
    Page: Accounts as React.FC,
    open: toMappingStep,
  },
  {
    name: 'csvimport-complete',
    Page: Accounts as React.FC,
    open: async () => {
      await toMappingStep();
      await userEvent.click(screen.getByRole('button', { name: /Import Transactions/ }));
      return screen.findByText('Import complete!', undefined, { timeout: 6000 });
    },
  },
  {
    /*
     * *** C1d: NINETEEN LESSONS OF PROSE, AND THIS IS THE ONLY WALK THAT CAN
     * SEE ANY OF IT. *** The reader is a `SlidePanel`, so it portals to
     * `document.body` and the page capture -- which writes
     * `container.innerHTML` -- serializes the list and none of the body
     * (D-165). `learnpal-lessons` in `capture-pages.walk.tsx` measures the list
     * and stops there ON PURPOSE; the paragraph wrapping at 390px is measured
     * here.
     *
     * The body is `a-starter-buffer`'s approved text verbatim -- six paragraphs
     * and an aside -- because a one-line fixture wraps nowhere and would report
     * this panel clean at every width.
     */
    name: 'slidepanel-lesson-reader',
    Page: LearnPalLessons as React.FC,
    open: async () => {
      const reads = await screen.findAllByRole(
        'button', { name: /^Read$/ }, { timeout: 6000 });
      await userEvent.click(reads[2]);
      // Wait for a sentence INSIDE the body, not for the dialog: the panel
      // opens whether or not `LessonBody` rendered anything.
      await screen.findByText(/whatever covers the next thing that breaks/,
                              undefined, { timeout: 6000 });
      return (await screen.findByRole('dialog')) as HTMLElement;
    },
  },
  {
    /**
     * *** THE FIRST PORTALLED ONE, AND THE POINT OF THE WHOLE FILE. ***
     *
     * `SlidePanel`'s content div is `overflowY: 'scroll'` with an EXPLICIT
     * `overflowX: 'hidden'` — a clipper with no scrollbar, which is the failure
     * `.main-content`'s own comment and `measure.js`'s header both name. It is on
     * Accounts, Transactions, Budgets, Groups and GroupDetail, so it is far more
     * surface than the import modal, and not one pixel of it has ever been walked.
     */
    /*
     * C1c. Goals' create panel. It was an INLINE CARD pushed into the page until
     * this slice, so no walk has ever measured it -- and the page capture never
     * could, because `SlidePanel` portals to `document.body` while the page
     * capture writes `container.innerHTML` (D-165).
     */
    name: 'slidepanel-goal-create',
    Page: Goals as React.FC,
    open: async () => {
      await screen.findByRole('button', { name: /New goal/ }, { timeout: 6000 });
      await userEvent.click(screen.getByRole('button', { name: /New goal/ }));
      return (await screen.findByRole('dialog')) as HTMLElement;
    },
  },
  {
    /*
     * The SAME panel in EDIT mode, and it is a genuinely different shape rather
     * than the same one prefilled: the account picker is absent (the server
     * discards account changes on a PUT), so the panel is shorter and its field
     * order differs. Opening only the create state would measure neither.
     */
    name: 'slidepanel-goal-edit',
    Page: Goals as React.FC,
    open: async () => {
      const edit = await screen.findByRole(
        'button', { name: /Edit Clear the John Lewis Partnership Mastercard/ },
        { timeout: 6000 });
      await userEvent.click(edit);
      return (await screen.findByRole('dialog')) as HTMLElement;
    },
  },
  {
    name: 'slidepanel-add-account',
    Page: Accounts as React.FC,
    open: async () => {
      await screen.findByRole('button', { name: /Add Account/ }, { timeout: 6000 });
      await userEvent.click(screen.getByRole('button', { name: /Add Account/ }));
      const dialog = await screen.findByRole('dialog');
      return dialog as HTMLElement;
    },
  },
  {
    /*
      C1a — the SAME panel, with a type selected. The state above opens on
      `checking`, where the terms block does not exist, so it cannot measure the
      three inputs this slice adds. Selecting the type IS the interaction; adding
      the fixture without it would have captured nothing new.
    */
    name: 'slidepanel-add-account-credit-terms',
    Page: Accounts as React.FC,
    open: async () => {
      await screen.findByRole('button', { name: /Add Account/ }, { timeout: 6000 });
      await userEvent.click(screen.getByRole('button', { name: /Add Account/ }));
      const dialog = await screen.findByRole('dialog');
      // Reached through its OPTION, not by accessible name: the Account Type
      // `<label>` in `AddAccountForm` carries no `htmlFor` and the `<select>` no
      // `id`, so the control has no accessible name to query by. (The three
      // inputs this slice adds are properly associated — `getByLabelText(/APR/i)`
      // below works because of it.) Left as-is rather than fixed in passing:
      // relabelling an existing control is its own change with its own blast
      // radius, and it is noted in the checkpoint instead.
      const typeSelect = within(dialog).getByRole('option', { name: /Credit Card/i })
        .closest('select') as HTMLSelectElement;
      await userEvent.selectOptions(typeSelect, 'credit');
      // Do not proceed until the terms have actually rendered: a capture taken a
      // tick early measures the panel WITHOUT them and passes.
      await within(dialog).findByLabelText(/APR/i);
      // *** AND WAIT FOR THE WALLET FETCH, THEN RE-QUERY. *** Choosing `credit`
      // also kicks off `pointspalService.getCards()`; resolving it re-renders the
      // panel and detaches the node captured above, so returning the original
      // `dialog` failed the walk's own "is this element still in the document"
      // check. It failed LOUDLY, which is the only reason this was caught — an
      // earlier run captured 107 elements from a node that was about to be
      // replaced.
      return (await screen.findByRole('dialog')) as HTMLElement;
    },
  },
  {
    /*
      The edit half. `AddAccountForm` and `EditAccountForm` are separate files that
      have drifted apart before (#123 was two copies of one colour list), so the
      shared control is measured in BOTH — a field that overflows in one and not
      the other is exactly what a single capture would miss. This one also proves
      the PREFILL renders: the fixture's 999.99 is the widest APR the column can
      hold.
    */
    name: 'slidepanel-edit-account-credit-terms',
    Page: Accounts as React.FC,
    open: async () => {
      const edit = await screen.findByRole('button', { name: /Edit account/i }, { timeout: 6000 });
      await userEvent.click(edit);
      const dialog = await screen.findByRole('dialog');
      await within(dialog).findByLabelText(/APR/i);
      return dialog as HTMLElement;
    },
  },
  {
    name: 'slidepanel-add-transaction',
    Page: Transactions as React.FC,
    open: async () => {
      await screen.findByRole('button', { name: /Add Transaction/ }, { timeout: 6000 });
      await userEvent.click(screen.getByRole('button', { name: /Add Transaction/ }));
      return (await screen.findByRole('dialog')) as HTMLElement;
    },
  },
  {
    /* `Modal.tsx`, the third shell — portalled like SlidePanel, but with a
       `maxWidth` and a centred card rather than a full-height rail. */
    name: 'modal-add-category',
    Page: CategoryManagement as React.FC,
    open: async () => {
      await screen.findByRole('button', { name: /Add Category/ }, { timeout: 6000 });
      await userEvent.click(screen.getByRole('button', { name: /Add Category/ }));
      return (await screen.findByRole('dialog')) as HTMLElement;
    },
  },
  {
    /* The widest `Modal.tsx` in the app at `maxWidth="700px"`, and the one whose
       form has the most fields to fit. */
    name: 'modal-transaction-rule',
    Page: TransactionRules as React.FC,
    open: async () => {
      await screen.findByRole('button', { name: /Add Rule/ }, { timeout: 6000 });
      await userEvent.click(screen.getByRole('button', { name: /Add Rule/ }));
      return (await screen.findByRole('dialog')) as HTMLElement;
    },
  },
  {
    /**
     * *** DRIVEN TO THE MANUAL-DETAILS STEP, BECAUSE THE STEP IT OPENS ON MEASURES
     * NOTHING. *** As it first paints this modal is a symbol input and two disabled
     * buttons — 19 elements, which clears the stub floor and then reports `ok` at
     * four widths in two themes while containing no form to overflow. That is eight
     * scopes of false assurance, and it is the same shape as the `.animate-spin`
     * readiness check `capture-pages.walk.tsx` records: a check for the absence of
     * something is satisfied by that something never having existed. The fields are
     * behind "Enter Details Manually", which is disabled until a symbol is typed.
     */
    name: 'modal-add-holding',
    Page: Investments as React.FC,
    open: async () => {
      const add = await screen.findAllByRole('button', { name: /Add Holding/ }, { timeout: 6000 });
      await userEvent.click(add[0]);
      await userEvent.type(await screen.findByPlaceholderText(/AAPL, MSFT/), 'AAPL');
      await userEvent.click(screen.getByRole('button', { name: /Enter Details Manually/ }));
      // Waiting on a FIELD, not on the button losing its disabled attribute — the
      // button re-enables whether or not the form rendered. The notes textarea is
      // the last thing in the manual form and its placeholder is unique to it.
      return screen.findByPlaceholderText(/Add any notes about this investment/);
    },
  },
  {
    /**
     * Three `repeat(auto-fit, minmax(...))` grids — 200px, 180px and 150px floors
     * — inside a card that is at most 294px of content at 390px. `auto-fit` cannot
     * go below its own minimum, so a floor wider than the track is the one grid
     * shape that CANNOT reflow its way out. This is the capture most likely to
     * find something, which is why it is here rather than left for later.
     */
    name: 'modal-stock-detail',
    Page: Investments as React.FC,
    open: async () => {
      await screen.findByText('AAPL', undefined, { timeout: 6000 });
      await userEvent.click(screen.getByText('AAPL'));
      // Anchored on a label that exists ONLY in the modal. "Apple Inc." is in the
      // holdings row too, so `findByText` rejected with "found multiple" — which
      // reads as a broken drive rather than an ambiguous selector.
      return screen.findByText('Cost Basis', undefined, { timeout: 6000 });
    },
  },
];

/* `importing` is deliberately NOT captured: it is a spinner and a sentence, it has
   no layout of its own, and the stub guard below would fire on it correctly. */

it.each(cases.map((c) => [c.name, c] as const))('captures %s', async (name, c) => {
  const { container } = render(
    <MemoryRouter><ThemeProvider><ToastProvider><c.Page /></ToastProvider></ThemeProvider></MemoryRouter>
  );

  const anchor = await c.open();
  const root = markModalRoot(anchor, name);

  /* Positive, like contrast-walk's readiness gate: waiting for a spinner to be
     absent is satisfied by a spinner that never existed. */
  await waitFor(() => {
    expect(root.querySelectorAll('*').length).toBeGreaterThanOrEqual(15);
  }, { timeout: 6000 });

  const inContainer = container.contains(root);
  const portals = [...document.body.children]
    .filter((el) => el !== container)
    .map((el) => el.outerHTML)
    .join('');

  if (!inContainer && !portals.includes(`data-fp-modal="${name}"`)) {
    throw new Error(`${name}: the modal is neither in the container nor in the portal markup — it would be captured as nothing`);
  }

  const painted = root.querySelectorAll('*').length;
  if (painted < 15) throw new Error(`${name}: only ${painted} elements in the modal — captured a stub`);

  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `${name}.html`), assemble(container.innerHTML, portals), 'utf8');
  // eslint-disable-next-line no-console
  console.log(`CAPTURED ${name}: ${painted} elements in the modal, ${inContainer ? 'inline' : 'PORTALLED'}`);
});
