/**
 * A ROLE CLASS THAT NOTHING REFERENCES CANNOT BE WRONG, SO NOTHING KEEPS IT
 * RIGHT — and this repo has now been bitten by that four times.
 *
 * `cssClassesAreDefined.test.ts` guards one direction: a `className` in a
 * component must resolve to a rule (D-60, where Tailwind-shaped classes matched
 * nothing and the button's spinner stopped reading as spinning). **This file
 * guards the other direction**, which turned out to be where the damage was:
 *
 *   `.page-title`   said 28px    where all seven pages rendered 32px
 *   `.fp-input`     said 10px 14px where every input rendered 12px
 *   `.page-footer`  described a DIALOG footer with right-aligned buttons, while
 *                   the three real page footers are centred text
 *   `.btn-brand`    used a three-stop green→green→GOLD gradient with near-black
 *                   text, where the 14 primary buttons that ship use a two-stop
 *                   dark green with white text
 *
 * Every one of those was defined, unreferenced, and **wrong** — and the last is
 * the sharpest: adopting it in good faith would have turned every primary button
 * in the app gold. The rot is caused by the rule having no consumer, so the gate
 * is keyed to exactly that: **a role class must be referenced, or carry a
 * reason.**
 *
 * The escape hatch costs something on purpose, exactly as `tokenContrast`'s
 * `absent:` verdicts do: an unreferenced class must be listed here WITH its
 * reason, so silencing this gate is possible but only as a visible diff.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..', '..');
const THEME = readFileSync(join(SRC, 'styles', 'finpal-theme.css'), 'utf8');

/**
 * Unreferenced ON PURPOSE. Each entry is a claim someone has to defend in review.
 */
const DELIBERATELY_UNREFERENCED: Record<string, string> = {
  'fp-card':
    'The app renders cards at TWO radii — 12px at four sites and 16px at four ' +
    'more — so there is no single card shell to adopt. Picking either would ' +
    'resize half of them. Converging the two is a design decision, not a ' +
    'consolidation, so the class waits rather than guessing.',
  'btn-brand':
    'RECONCILED to what ships (two-stop dark green, white text) but not yet ' +
    'adopted: the 14 primary buttons also carry per-site hover handlers, and ' +
    'moving those is its own slice. It is now SAFE to adopt, which it was not.',
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '__tests__') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const COMPONENTS = walk(SRC).map((f) => readFileSync(f, 'utf8')).join('\n');

/** Class names defined at the start of a selector in the theme. */
function definedClasses(): string[] {
  const found = new Set<string>();
  for (const m of THEME.matchAll(/^\.([a-zA-Z][\w-]*)/gm)) found.add(m[1]);
  return [...found].sort();
}

/** Referenced anywhere a className could name it, static or interpolated. */
function isReferenced(cls: string): boolean {
  const word = new RegExp(`\\b${cls.replace(/-/g, '\\-')}\\b`);
  for (const m of COMPONENTS.matchAll(/className=(?:"([^"]*)"|\{([^}]*)\})/g)) {
    if (word.test(m[1] ?? m[2] ?? '')) return true;
  }
  return false;
}

describe('every role class has a consumer, or a stated reason', () => {
  const classes = definedClasses();

  it('found the theme and its classes — the guard on this guard', () => {
    // A scan that finds nothing would report "all classes referenced" and pass
    // forever, which is the exact failure shape this file exists to prevent.
    expect(classes.length).toBeGreaterThan(20);
    expect(COMPONENTS.length).toBeGreaterThan(10_000);
  });

  it('no class is defined, unreferenced AND unexplained', () => {
    const orphans = classes
      .filter((c) => !isReferenced(c))
      .filter((c) => !(c in DELIBERATELY_UNREFERENCED));

    expect(orphans, `unreferenced role classes with no recorded reason: ${orphans.join(', ')}`)
      .toEqual([]);
  });

  it('every recorded exception is still actually unreferenced', () => {
    // The allowlist must not outlive its reason. Once a class is adopted, its
    // entry here is stale and has to go, or the list becomes a place things are
    // parked rather than decided.
    const stale = Object.keys(DELIBERATELY_UNREFERENCED).filter((c) => isReferenced(c));
    expect(stale, `these are referenced now and should leave the allowlist: ${stale.join(', ')}`)
      .toEqual([]);
  });

  it('every recorded exception gives a real reason', () => {
    for (const [cls, reason] of Object.entries(DELIBERATELY_UNREFERENCED)) {
      expect(reason.length, `${cls} needs a reason worth reading`).toBeGreaterThan(60);
    }
  });
});

describe('the classes reconciled in this slice match what ships', () => {
  it('.btn-brand is the green the app uses, not the gold gradient', () => {
    // The dangerous one. `--brand-gradient` is green -> green -> GOLD, and this
    // rule used it with near-black text while every primary button ships a
    // two-stop dark green with white text.
    const rule = THEME.match(/\.btn-brand \{[^}]*\}/)?.[0] ?? '';
    expect(rule).toMatch(/#15803d/);
    expect(rule).toMatch(/color:\s*white/);
    expect(rule).not.toMatch(/--brand-gradient/);
    expect(rule).not.toMatch(/#0f172a/);
  });

  it('.fp-page-footer is centred text, not a right-aligned dialog footer', () => {
    const rule = THEME.match(/\.fp-page-footer \{[^}]*\}/)?.[0] ?? '';
    expect(rule).toMatch(/text-align:\s*center/);
    expect(rule).not.toMatch(/justify-content:\s*flex-end/);
  });

  it('.fp-error-banner carries no bottom margin of its own', () => {
    // Four of its five inline twins had none; baking 20px in is what made it
    // un-adoptable without moving four layouts.
    const rule = THEME.match(/\.fp-error-banner \{[^}]*\}/)?.[0] ?? '';
    expect(rule).toMatch(/rgba\(239, 68, 68, 0\.1\)/);
    expect(rule).not.toMatch(/margin-bottom/);
  });
});
