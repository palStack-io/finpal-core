/**
 * Prints the COMPUTED style of a chosen element on a captured page, at a chosen
 * width. Exists for one job: diffing a named role class against the inline style it
 * replaces, BEFORE adopting it.
 *
 * `finpal_core/CLAUDE.md` requires this, and the reason is measured: two of the two
 * role classes anyone has checked were already drifted from what the app renders
 * (`.page-title` said 28px where pages render 32px; `.fp-input` said `10px 14px`
 * where inputs render `12px`). A rule nothing references cannot be wrong, so nothing
 * keeps it right — and an overflow gate cannot catch this, because a two-pane class
 * with the wrong gap or the wrong align-items passes it perfectly.
 *
 *   node scripts/responsive-walk/probe.mjs <page> <width> "<css selector>"
 */
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_UI = join(HERE, '..', '..');
const [page, widthArg, selector] = process.argv.slice(2);
if (!page || !widthArg || !selector) {
  console.error('usage: probe.mjs <page> <width> "<selector>"');
  process.exit(2);
}
const width = Number(widthArg);

const CHROME = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
].find((p) => existsSync(p));
if (!CHROME) { console.error('No Chrome found.'); process.exit(2); }

const markup = readFileSync(join(WEB_UI, 'scripts', 'contrast-walk', 'captured', `${page}.html`), 'utf8');
const html = `<!doctype html><html><meta charset="utf-8">
<link rel="stylesheet" href="${join(WEB_UI, 'src', 'index.css')}">
<link rel="stylesheet" href="${join(WEB_UI, 'src', 'styles', 'finpal-theme.css')}">
<style>html,body{margin:0}</style>
<body><div style="display:flex;min-height:100vh"><aside class="sidebar"></aside><main class="main-content">${markup}</main></div></body>`;

const TMP = join(HERE, '.pages');
mkdirSync(TMP, { recursive: true });
const file = join(TMP, `probe.${page}.html`);
writeFileSync(file, html, 'utf8');

const PORT = 9600 + (process.pid % 100);
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(HERE, `.chrome-profile-p${process.pid}`)}`,
  'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let v = null;
for (let i = 0; i < 60; i += 1) {
  try { v = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; } catch { await sleep(200); }
}
if (!v) { chrome.kill(); console.error('Chrome never opened a debugging port.'); process.exit(2); }

const ws = new WebSocket(v.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pend = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const send = (method, params = {}, sessionId) => new Promise((r) => { const i = (id += 1); pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });

const { result: { targetId } } = await send('Target.createTarget', { url: 'about:blank' });
const { result: { sessionId } } = await send('Target.attachToTarget', { targetId, flatten: true });
await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
await send('Page.navigate', { url: `file://${file}` }, sessionId);
await sleep(400);

const PROPS = ['display', 'grid-template-columns', 'gap', 'row-gap', 'column-gap',
  'align-items', 'justify-items', 'margin-bottom', 'padding'];
const res = await send('Runtime.evaluate', {
  expression: `(() => {
    const els = [...document.querySelectorAll(${JSON.stringify(selector)})];
    if (!els.length) return JSON.stringify({ error: 'selector matched nothing' });
    return JSON.stringify(els.map((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const o = { width: Math.round(r.width), x: Math.round(r.left), y: Math.round(r.top) };
      for (const p of ${JSON.stringify(PROPS)}) o[p] = cs.getPropertyValue(p);
      o.text = (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 40);
      return o;
    }), null, 2);
  })()`,
  returnByValue: true,
}, sessionId);

console.log(`${page} @ ${width}px  ${selector}`);
console.log(res.result?.result?.value ?? '(no result)');
ws.close(); chrome.kill();
