/**
 * A catch block must prefer the server's named reason over axios's generic one.
 *
 * axios ALWAYS populates `err.message` — with "Request failed with status code
 * 400" — so `err.message || err.response?.data?.error` short-circuits on every
 * HTTP error and the branch reading the server's `error` is dead. The user is
 * shown a status code instead of "amount_min must not be greater than
 * amount_max". Nothing fails, nothing logs, and the handler looks correct.
 *
 * This surfaced in `TransactionRules.tsx`, where it had been latent: the save
 * endpoint had no 400 a user could trigger until D-38 (#59) started refusing an
 * inverted amount range — two perfectly valid numbers anyone can type into the
 * two number inputs. Five other catches in that same file already had the right
 * order, so this was a single-site slip, which is exactly the kind a list-keyed
 * check never catches.
 *
 * Keyed to the mechanism rather than to that file: any `.tsx`/`.ts` under `src/`
 * that reads both `err.message` and `err.response...error` in one expression
 * must put the server's value first.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const SRC = join(__dirname, '..', '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      return entry === '__tests__' || entry === 'node_modules'
        ? []
        : sourceFiles(full);
    }
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

/** `x.message || y.response?.data?.error` — the generic one winning. */
const MESSAGE_BEFORE_RESPONSE =
  /\b[A-Za-z_$][\w$]*\s*\.\s*message\s*\|\|[^;]{0,200}?\.\s*response\s*\??\.\s*data/;

describe('API error precedence', () => {
  const files = sourceFiles(SRC);

  it('scans a non-trivial number of source files', () => {
    // A detector that silently inspects nothing looks exactly like one that
    // passes. This is the guard against that.
    expect(files.length).toBeGreaterThan(50);
  });

  it('finds the catches it is meant to be checking', () => {
    const withBoth = files.filter((f) => {
      const src = readFileSync(f, 'utf8');
      return /\.response\s*\??\.\s*data/.test(src) && /\.message\b/.test(src);
    });
    expect(withBoth.length).toBeGreaterThan(0);
  });

  it('never prefers axios\'s generic message over the server\'s reason', () => {
    const offenders = files
      .filter((f) => MESSAGE_BEFORE_RESPONSE.test(readFileSync(f, 'utf8')))
      .map((f) => relative(SRC, f));

    expect(offenders, offenders.length
      ? `these read err.message before the server's error, so a 4xx shows the `
        + `status code instead of its reason: ${offenders.join(', ')}`
      : '').toEqual([]);
  });

  /**
   * The shape the check above is blind to, found while adding a reachable 400 to
   * account creation (item A of the D-18 build).
   *
   * `AddAccountForm.tsx` read `(err as {message?: string}).message || 'Failed to
   * create account'` and `EditAccountForm.tsx` read `err.message || 'Failed to
   * update account'`. Neither reads `response.data.error` **anywhere**, so the
   * precedence check above — which needs both reads present in one expression to
   * fire — could never see them. The server's reason is not merely deprioritised
   * here, it is never consulted, which is strictly worse: there is no branch to
   * reorder.
   *
   * Keyed to the catch binding rather than to a file or a fallback string: find
   * `catch (x)`, take the block, and require that a block reading `x.message` also
   * reads `.response`. That distinguishes it from the three sites that read a
   * *result* object's `.message` (`ResetPassword`, `ForgotPassword`, `Accounts`),
   * which are successful responses carrying a server-authored message and are not
   * errors at all.
   */
  it('never reads only axios\'s message, ignoring the server\'s reason', () => {
    const offenders: string[] = [];

    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      const pattern = /\bcatch\s*\(\s*([A-Za-z_$][\w$]*)[^)]*\)\s*\{/g;
      let match: RegExpExecArray | null;

      while ((match = pattern.exec(src)) !== null) {
        const binding = match[1];
        const body = blockAfter(src, pattern.lastIndex - 1);
        // Does this catch read the error's own `.message`, directly or through a cast?
        const readsMessage = new RegExp(
          `(?:\\b${binding}\\s*\\.\\s*message\\b)|(?:\\(\\s*${binding}\\s+as\\b[^)]*\\)\\s*\\.\\s*message\\b)`,
        ).test(body);
        if (readsMessage && !/\.\s*response\b/.test(body)) {
          const line = src.slice(0, match.index).split('\n').length;
          offenders.push(`${relative(SRC, file)}:${line}`);
        }
      }
    }

    expect(offenders, offenders.length
      ? `these catches show axios's "Request failed with status code N" and never `
        + `read the server's error, so a 4xx reason never reaches the user: `
        + `${offenders.join(', ')}`
      : '').toEqual([]);
  });

  it('the catch-block scanner actually finds catch blocks', () => {
    // Same guard as above, one level down: if the block extractor silently
    // returned nothing, the check would pass while inspecting nothing.
    const found = files.reduce((n, f) => {
      const src = readFileSync(f, 'utf8');
      return n + (src.match(/\bcatch\s*\(/g) || []).length;
    }, 0);
    expect(found).toBeGreaterThan(20);
  });
});

/** The `{...}` block starting at `open`, brace-matched. */
function blockAfter(src: string, open: number): string {
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  return src.slice(open);
}
