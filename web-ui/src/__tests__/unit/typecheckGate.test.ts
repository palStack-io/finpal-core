/**
 * The typecheck command must be one that can fail.
 *
 * AUDIT D-45. `tsconfig.json` here is **solution-style**: `{"files": [], "references":
 * [...]}`. `tsc --noEmit` does not follow project references, so against this config it
 * compiles **zero files and always exits 0**. The command recorded as a gate in
 * ROADMAP.md three times and in RESUME_PROMPT.txt was `npx tsc --noEmit -> 0 errors` —
 * a true statement about a command that inspects nothing, and the fifth time this
 * project has been caught by "a check that inspects nothing looks exactly like a check
 * that passes". Eleven real type errors had accumulated behind it.
 *
 * `tsc -b` (build mode) is the one that follows references. This file pins the
 * relationship rather than the string: **if `tsconfig.json` names no files of its own,
 * then the typecheck script must use build mode.** So it keeps holding if the script is
 * renamed, and it correctly stops applying if someone later gives the root config a
 * real `include`/`files` — at which point `--noEmit` would genuinely check something.
 *
 * What it cannot check is whether anyone runs it: CI (`tests.yml`) runs pytest only,
 * and the image build runs `vite build`, which strips types without checking them. That
 * remains true and is recorded in D-45.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..', '..');

const tsconfig = JSON.parse(
  // Strip line comments; tsconfig allows them, JSON.parse does not.
  readFileSync(join(ROOT, 'tsconfig.json'), 'utf8').replace(/^\s*\/\/.*$/gm, ''),
);
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

/** Scripts whose job is to type-check, by what they run rather than by name. */
function typecheckingScripts(): [string, string][] {
  return Object.entries(pkg.scripts as Record<string, string>).filter(
    ([name, cmd]) => /\btsc\b/.test(cmd) && !name.startsWith('_'),
  );
}

describe('the typecheck gate can actually fail', () => {
  it('is inspecting a real solution-style config, or this whole file is moot', () => {
    // Guard against the guard becoming vacuous: if the root config gains its own
    // files/include, `--noEmit` starts working and the assertions below stop being
    // the point. Fail loudly so someone re-reads D-45 rather than silently passing.
    const namesNoFiles =
      (!tsconfig.files || tsconfig.files.length === 0) && !tsconfig.include;
    const hasReferences = Array.isArray(tsconfig.references)
      && tsconfig.references.length > 0;

    expect(
      namesNoFiles && hasReferences,
      'tsconfig.json is no longer solution-style. Re-read AUDIT D-45 and decide '
        + 'whether this guard still describes reality before changing it.',
    ).toBe(true);
  });

  it('has a script that type-checks', () => {
    expect(
      typecheckingScripts().length,
      'no npm script runs tsc, so there is no gate at all — which is the state '
        + 'D-45 was opened for',
    ).toBeGreaterThan(0);
  });

  it('never type-checks with --noEmit, which compiles nothing against this config', () => {
    const offenders = typecheckingScripts()
      .filter(([, cmd]) => /--noEmit/.test(cmd) && !/\btsc\s+-b\b/.test(cmd))
      .map(([name, cmd]) => `${name}: ${cmd}`);

    expect(offenders, offenders.length
      ? 'these type-check with --noEmit against a solution-style config, so they '
        + `compile zero files and can never fail: ${offenders.join(', ')}`
      : '').toEqual([]);
  });

  it('uses build mode, which is the only form that follows references', () => {
    const buildMode = typecheckingScripts()
      .filter(([, cmd]) => /\btsc\s+(-b\b|--build\b)/.test(cmd));

    expect(
      buildMode.length,
      'no script runs `tsc -b`; every other form ignores the project references '
        + 'and therefore checks nothing here',
    ).toBeGreaterThan(0);
  });
});
