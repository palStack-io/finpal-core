/**
 * A filled coloured button's label is white, and this is the gate.
 *
 * *** THE CONVENTION WAS WRITTEN DOWN AND VIOLATED IN FIVE PLACES. *** `CLAUDE.md`
 * says plainly: *"Do not use `color: 'var(--text-primary)'` on colored
 * (green/red/blue) buttons — use `'white'`."* `Investments.tsx` even carried a
 * comment spelling out the measured ratios. Five other buttons did it anyway.
 * A convention recorded in one file is not adoption — D-106's shape, one layer
 * over — and only a gate closes that.
 *
 * *** WHY IT IS WRONG, MEASURED: *** `--text-primary` flips with the theme while
 * the button's green does not, so one theme always loses. On the
 * `#15803d → #166534` gradient the label measured **2.83:1 in light**
 * (`#17301f`) and **4.32:1 in dark** (`#e9f0e6`), against a 4.5 requirement.
 * White is **5.02:1** on the gradient's first stop and does not flip.
 *
 * *** THE WINDOW IS THE STYLE OBJECT, NOT A LINE COUNT. *** A first version
 * looked back a fixed fourteen lines and produced THREE false positives — a
 * `<p>` and an `<h3>` that merely sat near a coloured element. A guard that
 * cries wolf gets weakened, so this one brackets the enclosing `{ ... }` and
 * only fires when the colour and the background are in the SAME object.
 *
 * The contrast walk catches this too, but only on pages it renders — which is
 * exactly why four of the five went unseen. A static check sees every page.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const SRC = join(__dirname, '..', '..');

/** Solid brand colours a filled control uses. Tints are not in this list. */
const FILLED = ['#15803d', '#166534', '#22c55e', '#3b82f6', '#ef4444', '#f59e0b'];

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((e) => {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) {
      return e === '__tests__' || e === 'node_modules' ? [] : walk(full);
    }
    return full.endsWith('.tsx') ? [full] : [];
  });

/**
 * Every `{ ... }` style object in the file, with the line its `color:` sits on.
 * Brace-matched rather than line-windowed, so a neighbouring element cannot be
 * mistaken for the coloured one.
 */
const styleObjects = (src: string): Array<{ body: string; line: number }> => {
  const out: Array<{ body: string; line: number }> = [];
  const re = /style=\{\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    let i = m.index + m[0].length;
    let depth = 2; // the two braces just consumed
    while (i < src.length && depth > 0) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') depth--;
      i++;
    }
    const body = src.slice(m.index, i);
    out.push({ body, line: src.slice(0, m.index).split('\n').length });
  }
  return out;
};

describe('a filled coloured button uses white, never --text-primary', () => {
  it('finds no theme-flipping label on a solid brand background', () => {
    const found: string[] = [];
    for (const file of walk(SRC)) {
      const src = readFileSync(file, 'utf8');
      for (const { body, line } of styleObjects(src)) {
        const flips = /color: *['"]var\(--text-primary\)['"]/.test(body);
        if (!flips) continue;
        // *** THE BACKGROUND MAY BE A TERNARY, AND THE FIRST VERSION OF THIS
        //     REGEX REQUIRED A QUOTE IMMEDIATELY AFTER THE COLON. ***
        //     `background: applyingRules ? 'rgba(...)' : 'linear-gradient(...)'`
        //     matched nothing, so the Apply-to-All button — `--text-primary` on
        //     an amber gradient, 1.44:1 in dark — walked straight past this
        //     guard. Take everything up to the end of the line instead and look
        //     for a brand colour anywhere in it. Guards keyed to a spelling go
        //     blind, and this one was.
        const bgLine = body.match(/background(?:Color)?: *([^\n]+)/);
        if (!bgLine || !FILLED.some((c) => bgLine[1].includes(c))) continue;
        const bg = [bgLine[0], bgLine[1]];
        found.push(`${relative(SRC, file).split('\\').join('/')}:${line}  ${bg[1].slice(0, 48)}`);
      }
    }
    expect(found, `--text-primary on a filled brand background:\n${found.join('\n')}`)
      .toEqual([]);
  });

  it('still sees a violation when one is introduced', () => {
    // A gate nobody has watched fail is not a gate. This proves the brace
    // matching and the colour list both work, without touching a real file.
    const sample = `<button style={{
      background: 'linear-gradient(135deg, #15803d 0%, #166534 100%)',
      color: 'var(--text-primary)',
    }}>Add</button>`;
    const [obj] = styleObjects(sample);
    expect(obj).toBeDefined();
    expect(/color: *['"]var\(--text-primary\)['"]/.test(obj.body)).toBe(true);
    expect(FILLED.some((c) => obj.body.includes(c))).toBe(true);
  });

  it('does NOT fire on a label that merely sits near a coloured element', () => {
    // The three false positives the line-windowed version produced.
    const sample = `<div style={{ background: '#15803d' }}>
      <h3 style={{ color: 'var(--text-primary)' }}>Heading outside the button</h3>
    </div>`;
    const offenders = styleObjects(sample).filter(({ body }) => {
      const flips = /color: *['"]var\(--text-primary\)['"]/.test(body);
      const bg = body.match(/background(?:Color)?: *['"]([^'"]+)['"]/);
      return flips && bg && FILLED.some((c) => bg[1].includes(c));
    });
    expect(offenders).toEqual([]);
  });
});
