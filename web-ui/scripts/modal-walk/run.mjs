/**
 * Drives headless Chrome over every captured MODAL at 1440 / 1024 / 768 / 390 and
 * reports what overflows, what is clipped, and — the part a page walk cannot do —
 * WHICH element is doing the scrolling.
 *
 *   node scripts/modal-walk/run.mjs
 *   node scripts/modal-walk/run.mjs --width 390 --theme light
 *
 * Run the capture first:
 *   WALK_CAPTURE=scripts/modal-walk/capture-modals.walk.tsx \
 *     npx vitest run --config scripts/contrast-walk/vitest.walk.config.ts
 *
 * ── WHY A THIRD WALK AND NOT A LINE IN THE SECOND ────────────────────────────
 *
 * `contrast-walk/captured/` is swept by BOTH existing walks, so dropping modal
 * markup in there would have been free coverage — and it would have been wrong
 * twice. The contrast walk gates on `baseline.json = {}`, a deliberate zero bar;
 * modals have never been contrast-audited, so every pair they carry would land as
 * a REGRESSION on a gate that has nothing to do with overflow, and the only ways
 * out are an unplanned palette pass or adopting failures into a file the repo
 * explicitly says must not absorb them (`run.mjs`'s PENDING_AUDIT comment). And
 * the responsive walk measures against `.main-content`, which is the wrong frame
 * of reference for a `position: fixed` overlay — see `measure.js` here.
 *
 * The traps from responsive-walk apply unchanged and are not re-derived:
 *   - `--window-size` clamps to 500px, so a phone cannot be rendered that way;
 *     this drives CDP `Emulation.setDeviceMetricsOverride`.
 *   - that needs a global `WebSocket`, so Node >= 22. Checked, not assumed.
 */
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_UI = join(HERE, '..', '..');
const CAPTURED = join(HERE, 'captured');

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : null;
};
const WIDTHS = arg('width') ? [Number(arg('width'))] : [1440, 1024, 768, 390];
const THEMES = arg('theme') ? [arg('theme')] : ['light', 'dark'];
const VERBOSE = process.argv.includes('--verbose');

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
    // LOUD, never a skip: a gate that quietly does nothing is indistinguishable
    // from one that passes, and this repo has shipped that shape more than once.
    console.error('No Chrome found. Tried:\n  ' + CHROME_CANDIDATES.join('\n  '));
    process.exit(2);
  }
  return found;
}

if (!existsSync(CAPTURED)) {
  console.error(`No captured modals at ${CAPTURED}. Run the capture — see the header.`);
  process.exit(2);
}
// A sweep of the directory, not a hand-kept list — contrast-walk's D-59 lesson.
// Adding a modal to the capture is the whole job.
const MODALS = readdirSync(CAPTURED).filter((f) => f.endsWith('.html')).sort();
if (!MODALS.length) {
  console.error('The capture directory is empty. Run the capture — see the header.');
  process.exit(2);
}

const MEASURE = readFileSync(join(HERE, 'measure.js'), 'utf8');

/**
 * *** ANIMATIONS ARE TURNED OFF BELOW, AND THAT IS A CORRECTNESS FIX RATHER THAN
 * A TIDY-UP. ***
 *
 * SlidePanel enters with "slideIn 0.3s ease-out" from translateX(100%), and this
 * walk measures 250ms after navigation. The first run reported the panel
 * overhanging the viewport by exactly 38px at 1440, 1024 and 768 and 29px at 390 —
 * four widths, one number each, which is the signature of a constant rather than a
 * layout. It was not a defect: it was 500px of easing not yet finished. Waiting
 * longer would be a race written as a sleep, so the settled layout is asserted
 * instead of waited for.
 */
/* The capture already assembled the real shell around the page and put portalled
   markup back as a body sibling, so the harness only has to supply the app's real
   stylesheets and the theme. Copied values are this project's named failure mode. */
const harness = (markup, theme) => `<!doctype html>
<html${theme === 'dark' ? ' data-theme="dark"' : ''}>
<meta charset="utf-8">
<link rel="stylesheet" href="${join(WEB_UI, 'src', 'index.css')}">
<link rel="stylesheet" href="${join(WEB_UI, 'src', 'styles', 'finpal-theme.css')}">
<style>html,body{margin:0}body{background:var(--bg-primary)}.sidebar{}
*,*::before,*::after{animation:none !important;transition:none !important}</style>
<body>${markup}</body>`;

if (typeof WebSocket === 'undefined') {
  console.error(`This gate drives CDP over a global WebSocket, which requires Node >= 22.
You are on ${process.version}. Upgrade the runtime — do not skip the gate.`);
  process.exit(2);
}

const PORT = 9611 + (process.pid % 100);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn(chromePath(), [
  '--headless=new', '--disable-gpu', '--hide-scrollbars',
  '--allow-file-access-from-files', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${join(HERE, `.chrome-profile-${process.pid}`)}`,
  'about:blank',
], { stdio: 'ignore' });
const die = (code, msg) => { if (msg) console.error(msg); try { chrome.kill(); } catch { /* gone */ } process.exit(code); };

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

const findings = [];     // everything the gate fails on
let hardErrors = 0;

for (const file0 of MODALS) {
  const name = file0.replace('.html', '');
  const markup = readFileSync(join(CAPTURED, file0), 'utf8');

  for (const theme of THEMES) {
    const file = join(TMP, `${name}.${theme}.html`);
    writeFileSync(file, harness(markup, theme), 'utf8');

    for (const width of WIDTHS) {
      await send('Emulation.setDeviceMetricsOverride',
        { width, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
      await send('Page.navigate', { url: `file://${file}` }, sessionId);
      await sleep(250);

      const res = await send('Runtime.evaluate', {
        expression: `${MEASURE}; JSON.stringify(window.__MODAL)`, returnByValue: true,
      }, sessionId);
      const raw = res.result?.result?.value;
      if (!raw) die(2, `[${name}/${theme}/${width}] the measure script produced nothing — it did not run`);
      const out = JSON.parse(raw);
      if (out.error) die(2, `[${name}/${theme}/${width}] ${out.error}`);

      /**
       * The stub guard. A modal captured before it opened, or captured as its
       * backdrop alone, serializes perfectly and overflows nowhere.
       *
       * *** 25, AND THE NUMBER IS MEASURED RATHER THAN ROUND. *** The floor was 15,
       * and at 15 the Add-Holding modal passed at 20 elements while containing a
       * symbol input and two DISABLED buttons — its whole form sits behind "Enter
       * Details Manually" — so it reported `ok` at four widths in two themes having
       * measured nothing. Eight scopes of false assurance, and the same shape as the
       * readiness bug `contrast-walk/capture-pages.walk.tsx` records: a check for the
       * absence of something is satisfied by that something never having existed.
       * The capture now drives that modal to its form (36 elements), and the smallest
       * HONEST state in the set is `csvimport-complete` at 29 — a tick and two lines,
       * fully rendered. 25 sits below that and above the stub.
       */
      if (out.total < 25) {
        console.error(`[${name}/${theme}/${width}] only ${out.total} laid-out elements in the modal — walking a stub, not a dialog`);
        hardErrors += 1;
        continue;
      }
      // The emulation not taking would make every number below a lie.
      if (out.vw !== width) {
        die(2, `[${name}/${theme}/${width}] viewport is ${out.vw}px, not ${width}px — device-metrics emulation did not apply`);
      }

      const scope = `${name}:${theme}:${width}`;

      /**
       * One finding per CAUSE, not once per descendant. Nothing clips inside a
       * modal that has no wrapper, so a 378px table overhanging the viewport
       * reported itself, its thead, its tbody, every row and every cell — 20 lines
       * for one defect. `responsive-walk` can group by path because `.main-content`
       * bounds the sweep; here the suppression has to be explicit.
       */
      const ranked = out.offenders.sort((a, b) => b.over - a.over);
      const roots = [];
      for (const o of ranked.slice().sort((a, b) => a.path.length - b.path.length)) {
        if (!roots.some((r) => o.path.startsWith(`${r.path}>`))) roots.push(o);
      }
      for (const o of roots.sort((a, b) => b.over - a.over)) {
        const buried = ranked.filter((x) => x.path.startsWith(`${o.path}>`)).length;
        findings.push({ scope, kind: o.kinds.join('+'), detail:
          `+${o.over}px  ${o.content}/${o.box}  ${o.grid ? `grid ${o.grid}` : o.tag}  ${JSON.stringify(o.text)}  @${o.path}` +
          `${buried ? ` (and ${buried} descendant(s))` : ''}` });
      }

      /**
       * *** THE RULE THAT MAKES THIS A MODAL WALK AND NOT A SECOND PAGE WALK. ***
       *
       * A horizontal scroller inside a dialog is legitimate only when the things
       * overhanging it are TABLES — Tier 3's "a data table scrolls, it does not
       * reflow". Anything else that scrolls sideways is scrolling BY ACCIDENT:
       * `overflow-y: auto` on a modal body computes `overflow-x: auto` too, because
       * a box cannot be `visible` on one axis and clipped on the other. The user is
       * then dragging the whole dialog sideways to read a form field, and every
       * absence-based check calls that a pass — which is precisely how MyCards'
       * 438px earn-rate grid survived a full responsive pass inside a 318px box.
       *
       * The first version of this rule asked whether the scroller was the nearest
       * scrollable ancestor of a wide table, and the sabotage that deletes the
       * preview table's wrapper PASSED it: with the wrapper gone the modal's own
       * card becomes that ancestor and inherits the excuse. Written this way the
       * same sabotage fails, because the card holds a header, a stepper and three
       * form sections rather than one table.
       */
      for (const s of out.scrollers) {
        // The app's Tier 3 idiom, and nothing looser: `.fp-table-scroll > table`.
        const legit = s.kids.length === 1 && s.kids[0] === 'table';
        if (legit) continue;
        findings.push({ scope, kind: 'accidental-scroll', detail:
          `${s.content}/${s.box} scrolls sideways and it is not a table wrapper — it holds ` +
          `${s.kids.length ? `<${s.kids.join('>, <')}>` : 'no in-flow children'}` +
          ` (overflow-y: ${s.overflowY})  ${JSON.stringify(s.text)}  @${s.path}` });
      }

      /**
       * *** AND THE INVERSE, WHICH SILENCE CANNOT PROVE. ***
       *
       * `tableStyle` is `width: 100%` with no floor, so a table inside a scroll
       * wrapper does not overflow it — it SQUEEZES, one character per column, and
       * the wrapper never engages. The theme file says so in as many words beside
       * `.fp-table-scroll > table { min-width: 420px }`. A table that squeezed is
       * unreadable, and it is invisible to every check that waits to be told
       * something overflowed.
       */
      /**
       * *** CURRENTLY UNREACHABLE IN THIS APP, AND KEPT ANYWAY — SAYING SO RATHER
       * THAN LETTING IT ROT SILENTLY. *** Every dialog shell here gives its body
       * `overflow-y: auto`, which drags `overflow-x: auto` along with it, so a table
       * inside one almost always HAS some scrollable ancestor and this branch is
       * skipped. It fires for the two shapes that would matter: a modal whose body
       * does not scroll at all, and a table sealed behind an `overflow-x: hidden`
       * parent — the reachability walk in `measure.js` stops at a clipper rather
       * than stepping over it, which is the second of the two holes the sabotages
       * exposed. Verified by sabotage, not by the app.
       */
      for (const t of out.tables) {
        if (t.hostPath) continue;
        // Named separately from `clipped`, which reports the BOX that cut the
        // table off. This says which table the user cannot read, and it is the
        // only finding here that survives a clipping ancestor: a table inside an
        // `overflow-x: hidden` parent is bounded, so the overhang check skips it
        // by design and the parent's `clipped` line does not say what was lost.
        findings.push({ scope, kind: 'unreachable-table', detail:
          `${t.cols} columns, ${t.width}px wide, and NO scrollable ancestor inside the modal  @${t.path}` });
      }

      const head = `${scope.padEnd(42)} modal ${String(out.root.width).padStart(4)}px @${String(out.root.left).padStart(4)}  ${out.total} el`;
      const n = findings.filter((f) => f.scope === scope).length;
      if (!n) console.log(`  ok   ${head}`);
      else console.log(`  FAIL ${head}`);
      if (VERBOSE) {
        for (const s of out.scrollers) console.log(`         scroller ${s.content}/${s.box} ${JSON.stringify(s.text)} @${s.path}`);
        for (const t of out.tables) console.log(`         table ${t.cols}col ${t.intrinsic}/${t.width} narrowest ${t.narrowestCell} host ${t.hostPath}`);
      }
    }
  }
}

ws.close();
chrome.kill();

if (hardErrors) {
  console.error(`\n${hardErrors} modal(s) walked as a stub. Re-run the capture.`);
  process.exit(2);
}

if (!findings.length) {
  console.log(`\nno modal overflow at any width, in either theme (${MODALS.length} modal states walked).`);
  process.exit(0);
}

/**
 * *** ZERO IS THE BAR, AND THERE IS DELIBERATELY NO baseline.json. ***
 *
 * responsive-walk seeded a ratchet against 1238 offenders because it was auditing
 * a shipped desktop-only app mid-pass; it reached zero and DELETED the file, and
 * its comment says why — "leaving a green gate sitting on a baseline of 1238
 * accepted offenders is how a gate becomes decoration, and this repo has shipped
 * that four times". This walk starts from whatever it starts from, so it gets the
 * same bar rather than inheriting an excuse file on day one.
 */
console.error('');
const byKind = new Map();
for (const f of findings) byKind.set(f.kind, (byKind.get(f.kind) ?? 0) + 1);
for (const f of findings) console.error(`  ${f.kind.padEnd(18)} [${f.scope}] ${f.detail}`);
console.error(`\n${findings.length} modal finding(s): ${[...byKind].map(([k, n]) => `${n} ${k}`).join(', ')}.`);
console.error('Fix them. There is no baseline file here on purpose — see the comment above.');
process.exit(1);
