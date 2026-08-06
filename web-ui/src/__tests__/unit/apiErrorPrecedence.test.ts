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
});
