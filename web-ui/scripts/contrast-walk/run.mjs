/**
 * Drives headless Chrome over the captured Transactions markup and reports every
 * (foreground, actual computed background) pair that misses WCAG AA.
 *
 *   node scripts/contrast-walk/run.mjs            # light and dark
 *   node scripts/contrast-walk/run.mjs --theme dark
 *
 * Run the capture first:
 *   npx vitest run --config scripts/contrast-walk/vitest.walk.config.ts
 */
import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdtempSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));

/* One throwaway Chrome profile for the whole run — see the long note at the
   launch below. Removed on the way out so a hung run cannot leave a lock for
   the next one to inherit, which is the failure this replaces. */
const CHROME_PROFILE = mkdtempSync(join(tmpdir(), 'finpal-contrast-walk-'));
const cleanUpProfile = () => { try { rmSync(CHROME_PROFILE, { recursive: true, force: true }); } catch { /* best effort */ } };
process.on('exit', cleanUpProfile);
const WEB_UI = join(HERE, '..', '..');
const capArg = process.argv.indexOf('--capture');
/**
 * *** EVERY CAPTURED PAGE, NOT JUST THE ONE SOMEBODY REMEMBERED. ***
 *
 * This walked `transactions.html` alone for its first day, which is how the
 * Dashboard and Budgets pages reached production carrying five AA failures each
 * while the gate reported green — "unmeasured" reading as "clean". Iterating the
 * directory means adding a page to the capture is enough; nobody has to remember
 * to add it here too. That is D-59's lesson: prefer a sweep to a list.
 */
const CAPTURES = capArg > -1
  ? [process.argv[capArg + 1]]
  : readdirSync(join(HERE, 'captured'))
      .filter((f) => f.endsWith('.html'))
      .sort()
      .map((f) => join(HERE, 'captured', f));

/**
 * The text-bearing element floor per page, where 20 is the wrong number.
 *
 * *** THIS IS THE SAME OVER-TUNING THE COMMENT AT THE GUARD DESCRIBES, ONE
 * NOTCH DOWN. *** That floor was 100, calibrated on Transactions' fifty rows,
 * and it called every smaller page a stub; it was lowered to 20, which is right
 * for a page of cards. It is still wrong for a screen that IS a form. Measured
 * 2026-09-16: `forgot-password` resolves NINE text-bearing elements when it is
 * complete — a kicker, a headline, a sentence, an h1, a subtitle, a field
 * label, a button and a link — and the walk exited 2 calling that a stub.
 *
 * So the floors are per page with a reason, not one number for a directory
 * holding both a 50-row ledger and a single-field form. A page absent from this
 * map keeps the shared floor, which is what should happen: this is an exemption
 * list, and an empty one is the goal.
 */
const TEXT_FLOORS = {
  /* *** THE FIVE PRE-AUTH SCREENS ARE A FAMILY OF SMALL PAGES, AND THE SHARED
     FLOOR OF 20 WAS NEVER RIGHT FOR ANY OF THEM. *** Named as a group rather
     than added one at a time as each wobbles, because that is the actual fact:
     these pages are a sentence, a few fields and a button. Measured complete —
     login 19 (four personas and a disclosure on a demo instance, where most of
     its text USED to be the form), register 19, reset-password 14,
     forgot-password 9. Each floor below sits a few under its measured value so
     a copy edit does not redden the walk, and every one of them still catches a
     spinner, which resolves fewer than ten.

     This is the third place the same over-tuned floor has had to be fixed
     (D-244 covers the other two). The lesson is that a shared floor encodes an
     assumption about how big a page is, and it was written when every scope was
     a data-dense app page. */
  login: 15,
  register: 15,
  /* A 404 at its most complete, MEASURED RATHER THAN COUNTED FROM THE SOURCE:
     the figure, a heading, a sentence and ONE destination = 4. It looks like it
     should be five, because the page also renders a Back button -- but that
     button is conditional on window.history.length > 1, and the walk loads each
     capture into a fresh tab where there is no history to go back to. So 4 is
     this page COMPLETE, and a floor of 5 failed a correct render. */
  notfound: 4,
  // One field, one button, one way back.
  'forgot-password': 7,
  // Two fields, a rule line and a button.
  'reset-password': 11,
};

const DEFAULT_TEXT_FLOOR = 20;

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

function chrome() {
  const found = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!found) {
    // LOUD, never a skip. A contrast check that quietly does nothing looks
    // exactly like a contrast check that passes.
    console.error('No Chrome found. Tried:\n  ' + CHROME_CANDIDATES.join('\n  '));
    process.exit(2);
  }
  return found;
}

if (!CAPTURES.length || CAPTURES.some((f) => !existsSync(f))) {
  console.error(
    'No captured markup. Run BOTH captures:\n' +
    '  npx vitest run --config scripts/contrast-walk/vitest.walk.config.ts\n' +
    '  WALK_CAPTURE=scripts/contrast-walk/capture-pages.walk.tsx \\\n' +
    '    npx vitest run --config scripts/contrast-walk/vitest.walk.config.ts');
  process.exit(2);
}

const themes = process.argv.includes('--theme')
  ? [process.argv[process.argv.indexOf('--theme') + 1]]
  : ['light', 'dark'];



let failed = 0;
const seenPairs = {};

for (const CAPTURED of CAPTURES) {
  const pageName = CAPTURED.split('/').pop().replace('.html', '');
  const markup = readFileSync(CAPTURED, 'utf8');
  for (const theme of themes) {
  const key = `${pageName}:${theme}`;
  // The page is assembled with the app's REAL stylesheets rather than a copy of
  // the values. A copied palette is this project's named failure mode, and a
  // contrast check reading a stale copy would certify the wrong colours while
  // looking perfectly rigorous.
  const page = `<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="${join(WEB_UI, 'src', 'index.css')}">
<link rel="stylesheet" href="${join(WEB_UI, 'src', 'styles', 'finpal-theme.css')}">
<style>body{background:var(--bg-primary);margin:0}</style>
<body>${markup}</body>
<script src="${join(HERE, 'walk.js')}"></script>`;
  // Referenced, NOT inlined. --dump-dom returns the script's own source too, so
  // an inlined walk puts its output marker in the DOM twice — once as the string
  // literal that builds it — and the parse reads the wrong one.

  const file = join(HERE, `page.${pageName}.${theme}.html`);
  writeFileSync(file, theme === 'dark'
    ? page.replace('<!doctype html>', '<!doctype html><html data-theme="dark">')
    : page);

  /*
   * *** THIS WALK USED TO HANG, NOT FAIL, AND BOTH CAUSES WERE IN THIS CALL. ***
   * Measured 2026-09-15: it stalled mid-run four times, at four DIFFERENT
   * scopes (4 of 36, then 19, then 12), with headless Chrome sitting at 0.7%
   * CPU and the process never returning. Once it was killed by hand the step
   * reported `✗`, which read as a contrast failure and was not one.
   *
   * **1. `--user-data-dir`.** Without it every one of these 36 launches uses
   * Chrome's DEFAULT profile and serialises on its lock. That directory really
   * does hold a `SingletonLock` on this machine, left behind whether or not a
   * browser is running, so a launch can block on a lock nothing will release.
   * It also means the walk was reading the owner's real profile — extensions
   * and all — when the whole point is a clean, reproducible render. A fresh
   * temp profile per run removes the contention AND the shared state. This is
   * also why "kill every Chrome and re-run" appeared to be the cure and then
   * was not: killing a browser clears the live lock, not the stale file.
   *
   * **2. `timeout`.** `execFileSync` with no timeout waits forever, so the only
   * thing that ever ended a stall was `preflight.sh`'s own 900s step limit —
   * fifteen minutes to learn nothing. 60s is many times the ~1.5s a scope
   * actually takes, so it cannot fire on a slow machine, and a hung scope now
   * THROWS with a name attached instead of silently costing the whole run.
   */
  let dom;
  try {
    dom = execFileSync(chrome(), [
      '--headless=new', '--disable-gpu', '--allow-file-access-from-files',
      '--virtual-time-budget=6000', '--hide-scrollbars',
      `--user-data-dir=${CHROME_PROFILE}`, '--no-first-run', '--no-default-browser-check',
      '--window-size=1400,3000', '--dump-dom', `file://${file}`,
    ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'], timeout: 60_000 });
  } catch (err) {
    // ETIMEDOUT is the hang; anything else is Chrome refusing to start. Both
    // are reported against the scope that caused them, which is the thing the
    // silent version never told anybody.
    console.error(`[${key}] chrome did not return: ${err.code ?? err.message}`);
    process.exit(2);
  }

  const m = dom.match(/WALK::([\s\S]*?)::END/);
  if (!m) {
    console.error(`[${theme}] the walk produced no output — it did not run`);
    process.exit(2);
  }
  const out = JSON.parse(m[1]);

  seenPairs[key] = new Set();
  console.log(`\n=== ${pageName} / ${theme.toUpperCase()} — ${out.total} elements resolved against their actual background ===`);
  // The guard exists to catch a SPINNER — a page captured before its data
  // arrived serializes perfectly and walks to zero failures, which is a
  // measurement that undercounts looking exactly like a measurement.
  //
  // *** THE FLOOR WAS 100 AND THAT WAS OVER-TUNED TO ONE PAGE. *** Transactions
  // yields ~440 text-bearing elements because it has 50 rows; Dashboard yields
  // ~46 because it is cards and a chart. A page-count floor calibrated on the
  // biggest page reports every smaller page as a stub. 20 still catches a
  // spinner, which has fewer than ten.
  const floor = TEXT_FLOORS[pageName] ?? DEFAULT_TEXT_FLOOR;
  if (out.total < floor) {
    console.error(`[${theme}] only ${out.total} text-bearing elements against a `
      + `floor of ${floor}: the walk is inspecting a stub, not the page`);
    process.exit(2);
  }
  if (!out.failures.length) {
    console.log('  no AA failures');
  } else {
    // Grouped by the PAIR, not listed per element. 50 rows produce 50 copies of
    // the same finding, and a wall of duplicates hides how many DISTINCT things
    // are actually wrong — which is the number that matters when comparing two
    // captures.
    const byPair = new Map();
    for (const f of out.failures) {
      const pairKey = `${f.fg}|${f.bg}|${f.floor}|${f.kind}`;
      const seen = byPair.get(pairKey);
      if (seen) { seen.n += 1; continue; }
      byPair.set(pairKey, { ...f, n: 1 });
      seenPairs[key].add(pairKey);
    }
    failed += byPair.size;
    const sorted = [...byPair.values()].sort((a, b) => a.ratio - b.ratio);
    for (const f of sorted) {
      console.log(`  FAIL ${String(f.ratio).padStart(5)}:1 (needs ${f.floor})  ${f.fg} on ${f.bg}  ${String(f.size).padStart(4)}px/${f.weight}  x${String(f.n).padStart(3)}  ${JSON.stringify((f.text || f.kind).slice(0, 30))}`);
    }
    console.log(`  ${byPair.size} distinct failing pair(s), ${out.failures.length} element(s)`);
  }
  console.log('  worst passing text:');
  for (const f of out.worstText.slice(0, 3)) {
    console.log(`    ${String(f.ratio).padStart(5)}:1  ${f.fg} on ${f.bg}  ${JSON.stringify(f.text)}`);
  }
  }
}

// ── THE GATE: A RATCHET, NOT "ZERO FAILURES" ─────────────────────────────────
//
// This page still carries failures from the app's EXISTING palette
// (`--text-muted` at 2.53:1, the blue household badge at 3.20:1), and the
// implementation plan puts a live-app contrast sweep explicitly out of scope:
// "Do not audit the shipped app's existing contrast pairs as part of this."
//
// Demanding zero would therefore fail on day one and be switched off, which is
// how a gate becomes decoration. Demanding "no more than N" would pass a NEW
// failure that replaced an old one. So the baseline records the PAIRS, and any
// pair not in it fails. It can only ratchet tighter.
const baselinePath = join(HERE, 'baseline.json');
const baseline = existsSync(baselinePath)
  ? JSON.parse(readFileSync(baselinePath, 'utf8'))
  : null;

/**
 * *** PAGES MEASURED AND REPORTED, BUT NOT YET GATED — AUDIT D-103. ***
 *
 * The 2026-08-11 responsive pass added investments and the five pointsPal pages to
 * `captured/`, because the overflow gate's Tier 2 and Tier 3 subjects live there and
 * it would otherwise have swept four pages containing none of them. This walk sweeps
 * the same directory by design — that is D-59's lesson and it stays — so those six
 * pages arrived here too, carrying **72 pre-existing failing pairs** between them.
 * Zero new pairs appeared on the four pages already covered, so nothing regressed;
 * these are shipped palette failures on pages nobody had ever rendered.
 *
 * Three ways to handle that, and only one of them is honest:
 *   - adopt the 72 into baseline.json. NO. It is `{}` — a deliberate ZERO bar since
 *     #114 took Dashboard, Budgets and Accounts to zero — and adopting would convert
 *     "zero failures" into "72 accepted failures" in a file nobody reads.
 *   - stop sweeping the directory. NO. That is D-59 in reverse, and re-creates the
 *     "unmeasured reads as clean" hole these pages were sitting in.
 *   - measure them, PRINT them every single run, and gate them separately until the
 *     palette pass that owns them happens. That is this.
 *
 * Fixing them is a palette pass, not a layout one. Delete a page from this list when
 * its pairs are fixed — the staleness check below fails if a listed page has none,
 * so the list cannot quietly outlive the problem.
 *
 * *** `pointspal-caps` AND `pointspal-overview` WERE REMOVED 2026-09-08 BECAUSE THE
 * STALENESS CHECK DEMANDED IT, TWICE. *** The D-103 pass took it to zero, the next run exited 1 saying so, and the
 * pages now sit behind the real gate at a zero bar rather than behind this list.
 * That is the mechanism working: a page cannot be quietly left "pending" once it
 * is clean. The other four are still above zero and stay.
 */
/**
 * *** EMPTY, AND THAT IS THE POINT: D-103 IS CLOSED. ***
 *
 * This map held pages that had entered `captured/` without ever having been
 * contrast-audited -- the "unmeasured is not clean" hole. A page listed here was
 * REPORTED and not GATED, and the staleness check below exits 1 the moment a
 * listed page reaches zero failing pairs, so nothing can sit here after it is
 * fixed. All of them have now graduated:
 *
 *   pointspal-bestcard, pointspal-mycards, pointspal-redeem   2026-09-12
 *   categories, investments, recurring, rules                 2026-09-13
 *
 * *** THE LAST SIX PAIRS CAME OUT AS TWO ROOT CAUSES, NOT SIX COLOURS. ***
 *
 *   1. **An accent used as INK.** `#22c55e`, `#3b82f6` and `#15803d` are SURFACE
 *      values -- they paint buttons -- and as a mark on a near-white card or on
 *      a 20% wash of themselves they measured 2.21, 2.84 and 2.63 against a 3:1
 *      non-text floor. `--g-ink` / `--bl-ink` are the tokens that exist for
 *      exactly this and they THEME, which a brand hex cannot: a token cannot be
 *      both the ink and the surface and change for only one of them.
 *
 *   2. **A wash one step too thick.** `INACTIVE` (3.77), `Pause` (4.41) and the
 *      rule chip (4.41) all had the right ink on too much tint. Thinning the
 *      wash moves it toward the CARD, which is lighter on light and darker on
 *      dark -- so one edit raises contrast in BOTH themes, where darkening the
 *      ink would have had to be done twice, in opposite directions.
 *
 * Adding a page back here is a deliberate act and needs a reason beside it. The
 * default for a new page is the real gate.
 */
const PENDING_AUDIT = {
};

{
  let pending = 0;
  const clean = [];
  for (const [page, why] of Object.entries(PENDING_AUDIT)) {
    const n = themes.reduce((sum, t) => sum + (seenPairs[`${page}:${t}`]?.size ?? 0), 0);
    if (!Object.keys(seenPairs).some((k) => k.startsWith(`${page}:`))) continue;
    if (n === 0) clean.push(page);
    else { pending += n; console.log(`  PENDING [${page}] ${n} failing pair(s) — ${why}`); }
  }
  if (pending) {
    console.log(`\n${pending} failing pair(s) on pages awaiting their first contrast audit (AUDIT D-103).`);
    console.log('Reported, not gated. They are NOT in baseline.json and must not be put there.');
  }
  if (clean.length) {
    console.error(`\nPENDING_AUDIT is stale: ${clean.join(', ')} now has zero failing pairs.`);
    console.error('Remove it from PENDING_AUDIT so the page joins the real gate.');
    process.exit(1);
  }
}

if (baseline) {
  let regressions = 0;
  for (const [scope, pairs] of Object.entries(seenPairs)) {
    // Pending pages are reported above and gated by D-103, not by the ratchet.
    if (PENDING_AUDIT[scope.split(':')[0]]) continue;
    const known = new Set(baseline[scope] ?? []);
    const fresh = [...pairs].filter((p) => !known.has(p));
    const gone = [...known].filter((p) => !pairs.has(p));

    for (const p of fresh) {
      console.error(`  REGRESSION [${scope}] new failing pair: ${p}`);
      regressions += 1;
    }
    for (const p of gone) {
      // Not a failure — an invitation to tighten the baseline.
      console.log(`  improved [${scope}] no longer failing: ${p} — remove it from baseline.json`);
    }
  }
  if (regressions) {
    console.error(`\n${regressions} NEW failing contrast pair(s). The baseline is a ratchet: fix it, or record it deliberately.`);
    process.exit(1);
  }
  console.log('\nno new failing pairs against the baseline.');
} else {
  console.log(`\n${failed} AA failure(s) across ${themes.length} theme(s). (no baseline.json — not gating)`);
}
