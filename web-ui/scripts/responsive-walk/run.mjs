/**
 * Drives headless Chrome over every captured page at 1440 / 1024 / 768 / 390 and
 * reports every element that overflows or is clipped by the shell.
 *
 *   node scripts/responsive-walk/run.mjs               # light and dark, all widths
 *   node scripts/responsive-walk/run.mjs --theme dark
 *   node scripts/responsive-walk/run.mjs --width 390
 *   node scripts/responsive-walk/run.mjs --write-baseline
 *
 * Run the captures first — this walks the SAME `contrast-walk/captured/` directory:
 *   npx vitest run --config scripts/contrast-walk/vitest.walk.config.ts
 *   WALK_CAPTURE=scripts/contrast-walk/capture-pages.walk.tsx \
 *     npx vitest run --config scripts/contrast-walk/vitest.walk.config.ts
 *
 * ── TWO MEASUREMENT TRAPS, BOTH FOUND BY MAKING THIS FAIL ON PURPOSE ─────────
 *
 * 1. *** `--window-size` CANNOT RENDER A PHONE. *** Chrome clamps its window to a
 *    500px minimum, silently. Asking for 390 and asking for 320 both produce a
 *    500px viewport, so a width sweep built the way `contrast-walk/run.mjs` builds
 *    it reports "390: pass" having never rendered anything narrower than 500 —
 *    D-45's shape with a different subject. Measured:
 *
 *        asked 1440 -> 1440    asked 390 -> 500
 *        asked 1024 -> 1024    asked 320 -> 500
 *        asked  768 ->  768
 *
 *    So this drives CDP `Emulation.setDeviceMetricsOverride` instead, which gives a
 *    true CSS viewport at any width AND evaluates media queries against it. Zero
 *    new dependencies: Node 22 has a global `WebSocket`.
 *
 * 2. The document-level check is not sufficient — see the header of `measure.js`.
 *
 * ── WHAT THIS DOES NOT MEASURE ──────────────────────────────────────────────
 *
 * The captures are page markup, so the shell here is REBUILT from `App.tsx`'s real
 * `AppLayout` and the app's real stylesheets rather than copied values. Webfonts do
 * not load, so text metrics come from fallback faces; that shifts intrinsic widths a
 * little and is why the tolerance is not zero. It cannot manufacture a 200px
 * overflow, which is the size of the findings this exists to catch.
 */
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_UI = join(HERE, '..', '..');
const CAPTURED = join(WEB_UI, 'scripts', 'contrast-walk', 'captured');

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : null;
};

const WIDTHS = arg('width') ? [Number(arg('width'))] : [1440, 1024, 768, 390];
const THEMES = arg('theme') ? [arg('theme')] : ['light', 'dark'];
const WRITE_BASELINE = process.argv.includes('--write-baseline');

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

function chromePath() {
  const found = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!found) {
    // LOUD, never a skip. Copied deliberately from contrast-walk/run.mjs: a gate
    // that quietly does nothing is indistinguishable from one that passes, and
    // this repo has shipped that shape more than once.
    console.error('No Chrome found. Tried:\n  ' + CHROME_CANDIDATES.join('\n  '));
    process.exit(2);
  }
  return found;
}

if (!existsSync(CAPTURED)) {
  console.error(`No captured markup at ${CAPTURED}. Run BOTH captures — see the header.`);
  process.exit(2);
}
const PAGES = readdirSync(CAPTURED).filter((f) => f.endsWith('.html')).sort();
if (!PAGES.length) {
  console.error('The capture directory is empty. Run BOTH captures — see the header.');
  process.exit(2);
}
// A sweep of the directory, not a hand-kept list: adding a page to the capture is
// enough, nobody has to remember to add it here too. That is contrast-walk's D-59
// lesson, and this gate exists partly BECAUSE the capture list had no pointsPal page
// in it — the whole of Tier 2 and Tier 3 would have been walked by nothing.

const MEASURE = readFileSync(join(HERE, 'measure.js'), 'utf8');

/**
 * The real shell, reproduced from `src/App.tsx`'s `AppLayout`:
 *
 *     <div style={{ display: 'flex', minHeight: '100vh' }}>
 *       <Sidebar />                      // .sidebar, position: fixed, 240px
 *       <main className="main-content">  // margin-left: 240px, overflow-x: hidden
 *
 * NOTE it is `App.tsx` and NOT `components/layout/Layout.tsx`. That file describes
 * itself as the shell, is where D-46's decision is recorded, and is what the design
 * doc measured — but nothing imports it. It is dead code, so its `maxWidth: 1280px`
 * container and its `<Header />` do not exist in the rendered app. Building the
 * harness from it would have measured a layout no user has ever seen.
 */
const harness = (markup, theme) => `<!doctype html>
<html${theme === 'dark' ? ' data-theme="dark"' : ''}>
<meta charset="utf-8">
<link rel="stylesheet" href="${join(WEB_UI, 'src', 'index.css')}">
<link rel="stylesheet" href="${join(WEB_UI, 'src', 'styles', 'finpal-theme.css')}">
<style>html,body{margin:0}body{background:var(--bg-primary)}
  /* Stands in for <Sidebar/>, which is position:fixed and out of flow — its width
     is reserved by .main-content's margin, so an empty box of the right class
     reproduces the arithmetic exactly. */
  .sidebar{}</style>
<body><div style="display:flex;min-height:100vh"><aside class="sidebar"></aside><main class="main-content">${markup}</main></div></body>`;

// ── CDP, over Node 22's global WebSocket. No puppeteer, no ws. ────────────────
const PORT = 9411 + (process.pid % 100);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(chromePath(), [
  '--headless=new', '--disable-gpu', '--hide-scrollbars',
  '--allow-file-access-from-files', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`,
  // Per-pid, because a profile directory is LOCKED by a live Chrome. Sharing one
  // meant a second run silently failed to open its debugging port while the first
  // instance was still exiting, which reads as "Chrome is broken" rather than
  // "that directory is in use".
  `--user-data-dir=${join(HERE, `.chrome-profile-${process.pid}`)}`,
  'about:blank',
], { stdio: 'ignore' });

const die = (code, msg) => { if (msg) console.error(msg); try { chrome.kill(); } catch { /* already gone */ } process.exit(code); };

let version = null;
for (let i = 0; i < 60; i += 1) {
  try { version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; }
  catch { await sleep(200); }
}
if (!version) die(2, `Chrome never opened a debugging port on ${PORT}.`);

const ws = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.addEventListener('open', res);
  ws.addEventListener('error', () => rej(new Error('CDP socket failed')));
});

let nextId = 0;
const pending = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
const send = (method, params = {}, sessionId) => new Promise((res) => {
  const id = (nextId += 1);
  pending.set(id, res);
  ws.send(JSON.stringify({ id, method, params, sessionId }));
});

const { result: { targetId } } = await send('Target.createTarget', { url: 'about:blank' });
const { result: { sessionId } } = await send('Target.attachToTarget', { targetId, flatten: true });
await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);

const TMP = join(HERE, '.pages');
mkdirSync(TMP, { recursive: true });

// ── The walk ─────────────────────────────────────────────────────────────────
const seen = {};      // scope -> Set of offender keys
let hardErrors = 0;

/**
 * *** TIER 3'S SUCCESS CONDITION IS THE INVERSE OF TIER 1'S, SO SILENCE CANNOT
 * PROVE IT. ***
 *
 * A data table is not made responsive by reflowing it — stacking its columns
 * destroys the column-to-header relationship that makes it a table. It is made
 * responsive by scrolling horizontally with its columns intact. So for these pages
 * the gate asserts a container that DOES overflow and IS reachable, at the width
 * where it matters. Checking only for the absence of a complaint would pass a
 * wrapper that never applied, and it nearly did: MyCards' 438px earn-rate grid sat
 * silently inside a 318px box for the whole of this pass, reachable only because
 * the modal above it computes `overflow-x: auto` as a side effect of its own
 * `overflow-y` — by accident, at the wrong scroll container.
 */
const MUST_SCROLL_AT_390 = {
  'pointspal-mycards': 'the manual earn-rates table (130px 52px 90px 90px 52px)',
  investments: 'the holdings <table>',
  'pointspal-bestcard': 'RecommendTable',
  'pointspal-redeem': 'the redemption options <table>',
};
const scrollProof = {};

for (const page of PAGES) {
  const name = page.replace('.html', '');
  const markup = readFileSync(join(CAPTURED, page), 'utf8');

  for (const theme of THEMES) {
    const file = join(TMP, `${name}.${theme}.html`);
    writeFileSync(file, harness(markup, theme), 'utf8');

    for (const width of WIDTHS) {
      await send('Emulation.setDeviceMetricsOverride',
        { width, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
      await send('Page.navigate', { url: `file://${file}` }, sessionId);
      await sleep(250);

      const res = await send('Runtime.evaluate', {
        expression: `${MEASURE}; JSON.stringify(window.__RESP)`,
        returnByValue: true,
      }, sessionId);

      const raw = res.result?.result?.value;
      if (!raw) die(2, `[${name}/${theme}/${width}] the measure script produced nothing — it did not run`);
      const out = JSON.parse(raw);
      if (out.error) die(2, `[${name}/${theme}/${width}] ${out.error}`);

      // The stub guard, same purpose as contrast-walk's: a page captured before its
      // data arrived serializes perfectly and overflows nowhere, and a measurement
      // that undercounts looks exactly like a measurement that passes.
      if (out.total < 20) {
        console.error(`[${name}/${theme}/${width}] only ${out.total} laid-out elements — walking a stub, not a page`);
        hardErrors += 1;
        continue;
      }
      // The emulation not taking is the single failure that would make every number
      // below a lie, so it is checked rather than assumed.
      if (out.doc.box !== width) {
        die(2, `[${name}/${theme}/${width}] viewport is ${out.doc.box}px, not ${width}px — device-metrics emulation did not apply`);
      }

      const scope = `${name}:${theme}:${width}`;
      seen[scope] = new Set();
      if (width === 390 && MUST_SCROLL_AT_390[name]) {
        scrollProof[`${name}:${theme}`] = out.scrollers;
      }

      const head = `${scope.padEnd(38)} main ${String(out.main.content).padStart(5)}/${String(out.main.box).padStart(4)}  doc ${out.doc.content}/${out.doc.box}`;
      if (!out.offenders.length && !out.docOverflows) {
        console.log(`  ok   ${head}`);
      } else {
        console.log(`  FAIL ${head}`);
        if (out.docOverflows) {
          seen[scope].add('DOCUMENT');
          console.log(`         DOCUMENT overflows: ${out.doc.content} > ${out.doc.box}`);
        }
        // Grouped by path, widest first — 12 rows of one grid is one finding, and a
        // wall of duplicates hides how many DISTINCT things are wrong.
        const worst = out.offenders.sort((a, b) => b.over - a.over);
        for (const o of worst) {
          seen[scope].add(o.path);
        }
        for (const o of worst.slice(0, 6)) {
          const what = o.grid ? `grid ${o.grid}` : (o.cls || o.tag);
          console.log(`         ${o.kinds.join('+').padEnd(16)} +${String(o.over).padStart(4)}px  ${String(o.content).padStart(5)}/${String(o.box).padStart(4)}  ${what}  ${JSON.stringify(o.text)}`);
        }
        if (worst.length > 6) console.log(`         … and ${worst.length - 6} more`);
      }
    }
  }
}

ws.close();
chrome.kill();

if (hardErrors) {
  console.error(`\n${hardErrors} page(s) walked as a stub. Re-run the captures.`);
  process.exit(2);
}

// ── Tier 3, asserted positively ──────────────────────────────────────────────
if (WIDTHS.includes(390)) {
  let missing = 0;
  console.log('\nTier 3 — containers that must scroll horizontally at 390px:');
  for (const [page, what] of Object.entries(MUST_SCROLL_AT_390)) {
    for (const theme of THEMES) {
      const found = scrollProof[`${page}:${theme}`];
      if (found === undefined) continue; // page not in the capture set for this run
      if (!found.length) {
        console.error(`  MISSING [${page}/${theme}] nothing scrolls horizontally — ${what} is not reachable`);
        missing += 1;
      } else {
        const w = found.sort((a, b) => (b.content - b.box) - (a.content - a.box))[0];
        console.log(`  ok      [${page}/${theme}] ${w.content}/${w.box} reachable  ${JSON.stringify(w.text)}`);
      }
    }
  }
  if (missing) {
    console.error(`\n${missing} table(s) with no horizontal scroll at 390px — the data is unreachable, not merely ugly.`);
    process.exit(1);
  }
}

// ── THE GATE: a ratchet, exactly like the contrast walk's ─────────────────────
//
// Not "zero offenders". The app is desktop-only today (D-46) and the seed run
// records what that costs at each width; demanding zero on day one produces a gate
// that fails immediately and gets switched off, which is how a gate becomes
// decoration. Recording a COUNT would let a new offender replace a fixed one
// silently. So the baseline records the offender PATHS per scope, and any path not
// in it fails. It can only ratchet tighter.
const baselinePath = join(HERE, 'baseline.json');
const serialised = Object.fromEntries(
  Object.entries(seen).map(([k, v]) => [k, [...v].sort()])
);

if (WRITE_BASELINE) {
  writeFileSync(baselinePath, `${JSON.stringify(serialised, null, 2)}\n`, 'utf8');
  const n = Object.values(serialised).reduce((a, b) => a + b.length, 0);
  console.log(`\nbaseline written: ${n} offender(s) across ${Object.keys(serialised).length} scope(s).`);
  process.exit(0);
}

/**
 * *** NO baseline.json MEANS ZERO IS THE BAR, NOT THAT THE GATE IS OFF. ***
 *
 * It was a ratchet against a seeded 1238 while the pass was in flight, which was
 * the right shape then: demanding zero on day one produces a gate that fails
 * immediately and gets switched off. The pass reached zero, so the file was
 * deleted and the bar is now zero — leaving a green gate sitting on a baseline of
 * 1238 accepted offenders is how a gate becomes decoration, and this repo has
 * shipped that four times.
 *
 * `--write-baseline` still exists, for recording an offender DELIBERATELY. If you
 * use it, the reason belongs in the commit, not in the file.
 */
if (!existsSync(baselinePath)) {
  const n = Object.values(serialised).reduce((a, b) => a + b.length, 0);
  if (n) {
    console.error(`\n${n} overflowing element(s) across ${Object.keys(serialised).length} scope(s), and no baseline.json to excuse them.`);
    console.error('Fix them, or record them deliberately with --write-baseline and say why in the commit.');
    process.exit(1);
  }
  console.log('\nno horizontal overflow at any width, in either theme.');
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
let regressions = 0;
let improvements = 0;
for (const [scope, paths] of Object.entries(seen)) {
  const known = new Set(baseline[scope] ?? []);
  for (const p of paths) {
    if (!known.has(p)) { console.error(`  REGRESSION [${scope}] new overflow: ${p}`); regressions += 1; }
  }
  for (const p of known) {
    if (!paths.has(p)) { console.log(`  improved [${scope}] no longer overflowing: ${p}`); improvements += 1; }
  }
}
if (regressions) {
  console.error(`\n${regressions} NEW overflowing element(s). The baseline is a ratchet: fix it, or record it deliberately with --write-baseline.`);
  process.exit(1);
}
console.log(`\nno new overflow against the baseline${improvements ? ` (${improvements} fixed — re-run with --write-baseline to tighten)` : ''}.`);
