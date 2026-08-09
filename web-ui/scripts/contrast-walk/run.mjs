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
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_UI = join(HERE, '..', '..');
const capArg = process.argv.indexOf('--capture');
const CAPTURED = capArg > -1
  ? process.argv[capArg + 1]
  : join(HERE, 'captured', 'transactions.html');

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

if (!existsSync(CAPTURED)) {
  console.error(
    'No captured markup. Run:\n' +
    '  npx vitest run --config scripts/contrast-walk/vitest.walk.config.ts');
  process.exit(2);
}

const themes = process.argv.includes('--theme')
  ? [process.argv[process.argv.indexOf('--theme') + 1]]
  : ['light', 'dark'];

const markup = readFileSync(CAPTURED, 'utf8');

let failed = 0;

for (const theme of themes) {
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

  const file = join(HERE, `page.${theme}.html`);
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

  console.log(`\n=== ${theme.toUpperCase()} — ${out.total} elements resolved against their actual background ===`);
  if (out.total < 100) {
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
      const key = `${f.fg}|${f.bg}|${f.floor}|${f.kind}`;
      const seen = byPair.get(key);
      if (seen) { seen.n += 1; continue; }
      byPair.set(key, { ...f, n: 1 });
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

console.log(`\n${failed} AA failure(s) across ${themes.length} theme(s).`);
