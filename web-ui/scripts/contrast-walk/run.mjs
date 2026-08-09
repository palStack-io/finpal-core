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
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
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

  const dom = execFileSync(chrome(), [
    '--headless=new', '--disable-gpu', '--allow-file-access-from-files',
    '--virtual-time-budget=6000', '--hide-scrollbars',
    '--window-size=1400,3000', '--dump-dom', `file://${file}`,
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });

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
  if (out.total < 20) {
    console.error(`[${theme}] only ${out.total} elements: the walk is inspecting a stub, not the page`);
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

if (baseline) {
  let regressions = 0;
  for (const [scope, pairs] of Object.entries(seenPairs)) {
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
