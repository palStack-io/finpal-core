/**
 * NO REMOTE FONT ORIGIN IN THE SHIPPED ARTIFACT.
 *
 * finPal Core is deployed by people who run it themselves, often specifically to
 * keep their finances off third-party infrastructure, and some of those installs
 * are air-gapped. A `fonts.gstatic.com` reference in the built CSS is therefore a
 * defect and not a convenience: on an air-gapped box the text silently renders in
 * the fallback face, and on a connected one every visitor's browser announces the
 * install to Google. Bundling Outfit is the whole point of the slice this gate
 * ships with, and a gate is the only thing that keeps it bundled.
 *
 * ── Why this scans the BUILD and not the source ──────────────────────────────
 *
 * Source is the wrong surface. A remote font can arrive through a `@font-face` in
 * a `.css` file, an `@import` at the top of one, a `<link>` in `index.html`, a
 * styled component, or a dependency that ships its own stylesheet — and only the
 * last of those is invisible to a source grep, which is exactly the one nobody
 * would think to look for. The build is where every route converges, so that is
 * where the question gets asked.
 *
 * IT BUILDS ITS OWN OUTPUT, into a scratch directory, every run. Reading an
 * existing `dist/` would make this the project's named failure twice over: absent,
 * the gate would skip and read as passing ("a check that inspects nothing looks
 * exactly like a check that passes" — hit four times here); stale, it would
 * certify the previous commit's bundle, which is the "still the old bundle"
 * ambiguity the deploy verification exists to avoid. The build takes ~2s.
 *
 * ── Keyed to the mechanism, not to a filename ────────────────────────────────
 *
 * Three independent detectors, so that no single spelling is load-bearing:
 *
 *   1. any absolute http(s) URL ending in a font extension, ANYWHERE in the built
 *      CSS or JS. This is the primary key — it does not care which file, which
 *      host, or which syntax pulled it in;
 *   2. any absolute URL inside an `@font-face` block or an `@import` in the built
 *      CSS — catches a Google Fonts stylesheet URL, which has no font extension
 *      on it and detector 1 would miss;
 *   3. a list of known webfont hosts. This one IS a list, and lists are what D-59
 *      says fail, so it is deliberately the LAST net and not the first.
 *
 * The companion assertions are the other half: the four woff2 must actually be
 * emitted, and `--font-sans` must still name a fallback after Outfit. "No remote
 * origin" is trivially satisfiable by shipping no font at all, and a bare
 * `--font-sans: 'Outfit'` with nothing behind it turns a missing file into an
 * unreadable app.
 */
import { execFileSync } from 'child_process';
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'fs';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const WEB_UI = join(__dirname, '..', '..', '..');
const THEME = join(WEB_UI, 'src', 'styles', 'finpal-theme.css');
const FONT_DIR = join(WEB_UI, 'src', 'assets', 'fonts');

/** The weights the direction actually uses. 700 is deliberately not bundled. */
const BUNDLED_WEIGHTS = ['300', 'regular', '500', '600'];

const FONT_EXT = /\.(woff2?|ttf|otf|eot)/i;

/** Detector 3, and only detector 3. See the header on why it is last. */
const KNOWN_FONT_HOSTS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'use.typekit.net',
  'p.typekit.net',
  'fonts.bunny.net',
  'use.fontawesome.com',
  'cdn.fonts.net',
  'fast.fonts.net',
];

let outDir: string;
let builtFiles: string[] = [];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

beforeAll(() => {
  outDir = mkdtempSync(join(tmpdir(), 'finpal-fontgate-'));
  execFileSync(
    'npx',
    ['vite', 'build', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'error'],
    { cwd: WEB_UI, stdio: 'pipe' }
  );
  builtFiles = walk(outDir);
}, 180_000);

afterAll(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true });
});

describe('the built artifact loads its fonts from this origin only', () => {
  it('produced a build to inspect', () => {
    // Guard the guard. If the build silently emitted nothing, every assertion
    // below would pass over an empty list and this file would certify a bundle
    // that does not exist.
    expect(builtFiles.length).toBeGreaterThan(3);
    expect(builtFiles.some((f) => f.endsWith('index.html'))).toBe(true);
    expect(builtFiles.some((f) => f.endsWith('.css'))).toBe(true);
    expect(builtFiles.some((f) => f.endsWith('.js'))).toBe(true);
  });

  it('detector 1 — no absolute URL anywhere in the build points at a font file', () => {
    const offenders: string[] = [];
    for (const file of builtFiles) {
      if (!/\.(css|js|html)$/.test(file)) continue;
      const text = readFileSync(file, 'utf8');
      for (const url of text.match(/https?:\/\/[^"'()\s\\]+/g) ?? []) {
        if (FONT_EXT.test(url)) offenders.push(`${file.slice(outDir.length + 1)}: ${url}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('detector 2 — no @font-face or @import in the built CSS reaches off-origin', () => {
    const offenders: string[] = [];
    for (const file of builtFiles.filter((f) => f.endsWith('.css'))) {
      const css = readFileSync(file, 'utf8');
      const name = file.slice(outDir.length + 1);

      for (const block of css.match(/@font-face\s*\{[^}]*\}/g) ?? []) {
        for (const url of block.match(/https?:\/\/[^"'()\s\\]+/g) ?? []) {
          offenders.push(`${name}: @font-face -> ${url}`);
        }
      }
      // `@import url(https://fonts.googleapis.com/css2?...)` carries no font
      // extension and sits outside any @font-face block, so neither detector 1
      // nor the block scan above can see it. It is also the single most common
      // way a webfont gets reintroduced by a copy-paste.
      for (const imp of css.match(/@import[^;]+;/g) ?? []) {
        for (const url of imp.match(/https?:\/\/[^"'()\s\\]+/g) ?? []) {
          offenders.push(`${name}: @import -> ${url}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('detector 3 — no known webfont host appears in the build', () => {
    const offenders: string[] = [];
    for (const file of builtFiles) {
      if (!/\.(css|js|html)$/.test(file)) continue;
      const text = readFileSync(file, 'utf8');
      for (const host of KNOWN_FONT_HOSTS) {
        if (text.includes(host)) offenders.push(`${file.slice(outDir.length + 1)}: ${host}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('emits all four Outfit woff2 into the build, and no other font format', () => {
    // The other half of the claim: "no remote origin" is satisfied perfectly by
    // shipping no font at all.
    const fonts = builtFiles
      .filter((f) => FONT_EXT.test(f))
      .map((f) => f.slice(outDir.length + 1));

    expect(fonts).toHaveLength(4);
    for (const weight of BUNDLED_WEIGHTS) {
      expect(fonts.some((f) => f.includes(`outfit-v15-latin-${weight}`))).toBe(true);
    }
    // Vite fingerprints anything it pipelines. If these ever land unhashed at the
    // build root it means they were moved to `public/`, which also moves them out
    // of `/usr/share/nginx/html/assets/` — the path the deploy verification
    // greps. A correct build reading as a missing font is the exact ambiguity
    // that verification is supposed to remove.
    for (const font of fonts) {
      expect(font.startsWith('assets/')).toBe(true);
    }
    expect(fonts.every((f) => f.endsWith('.woff2'))).toBe(true);
  });

  it('the built CSS references every bundled woff2 by a same-origin path', () => {
    const css = builtFiles
      .filter((f) => f.endsWith('.css'))
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n');

    const faces = css.match(/@font-face\s*\{[^}]*\}/g) ?? [];
    expect(faces).toHaveLength(4);
    for (const face of faces) {
      expect(face).toMatch(/font-display:\s*swap/);
      expect(face).toMatch(/url\(\s*["']?\/assets\/outfit-v15-latin-/);
    }
    // Every weight declared is a weight shipped, and vice versa.
    const declared = faces
      .map((f) => f.match(/font-weight:\s*(\d+)/)?.[1])
      .filter(Boolean)
      .sort();
    expect(declared).toEqual(['300', '400', '500', '600']);
  });
});

describe('the source states the obligations this gate protects', () => {
  it('--font-sans names Outfit first and keeps a real fallback behind it', () => {
    const theme = readFileSync(THEME, 'utf8');
    const decl = theme.match(/--font-sans:\s*([^;]+);/)?.[1] ?? '';
    const stack = decl
      .split(',')
      .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);

    expect(stack[0]).toBe('Outfit');
    // A bare `--font-sans: 'Outfit'` turns a missing file into an unreadable app
    // rather than an ugly one. system-ui specifically, because it resolves to the
    // right native face on every platform — and because Outfit has no ₹ glyph, so
    // the fallback carries that symbol for every INR user on every page.
    expect(stack).toContain('system-ui');
    expect(stack).toContain('sans-serif');
    expect(stack.length).toBeGreaterThan(3);
  });

  it('the OFL-1.1 licence is vendored beside the binaries', () => {
    // OFL 1.1 permits redistribution, and requires the licence to travel with the
    // font. The subsetted woff2 carry name ID 14 (the licence URL) but their name
    // ID 13 (the full licence description) is EMPTY — the subsetter dropped it —
    // so the text is not recoverable from the binaries and has to be vendored.
    const ofl = join(FONT_DIR, 'OFL.txt');
    expect(existsSync(ofl)).toBe(true);
    const text = readFileSync(ofl, 'utf8');
    expect(text).toMatch(/SIL OPEN FONT LICENSE Version 1\.1/i);
    expect(text).toMatch(/Copyright 2021 The Outfit Project Authors/);
    expect(existsSync(join(FONT_DIR, 'PROVENANCE.md'))).toBe(true);
  });

  it('bundles exactly the four weights the direction uses', () => {
    const files = readdirSync(FONT_DIR).filter((f) => f.endsWith('.woff2'));
    expect(files).toHaveLength(4);
    // 700 is not an oversight. Bundling a weight no page renders is dead payload
    // on an app people install on their own hardware.
    expect(files.some((f) => f.includes('-700'))).toBe(false);
  });
});
