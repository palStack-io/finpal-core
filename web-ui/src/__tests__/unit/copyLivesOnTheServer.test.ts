/**
 * *** THE DATA STATEMENT'S WORDS COME FROM THE SERVER, AND THIS CLIENT HOLDS
 * NONE OF THEM. ***
 *
 * The decision was taken for MOBILE's sake (copy inside an app needs a store
 * build to reword, and iOS EAS is withheld), and it binds this client too for a
 * different reason: two clients each holding their own copy of a promise about a
 * user's money is two promises, and nobody can say which one a given user read.
 * The endpoint is the single place a sentence can be corrected.
 *
 * The failure this guards against is the reasonable-looking one: `DataStatement`
 * renders `null` when the fetch fails, and the obvious "improvement" is a
 * default sentence.
 *
 * *** SCOPED OUT: `__tests__` AND `scripts/`. *** The walk fixtures and msw
 * handlers quote the copy on purpose — a fixture that does not contain the real
 * strings measures nothing. A guard that cannot tell a fixture from a shipped
 * string forbids testing the thing it protects.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '..', '..');

/*
 * *** FRAGMENTS UNIQUE TO THE SERVER STATEMENT, NOT MERELY ON ITS SUBJECT. ***
 * The first draft banned 'stays on your server' and 'no analytics, no tracking'
 * and failed `pages/Landing.tsx` — the signed-out marketing page, which is
 * ENTITLED to make the same point in its own words; that copy has no server to
 * come from, because a visitor with no instance cannot fetch it. What must not
 * be duplicated is the statement's own prose, so the fragments below are its
 * distinctive clauses.
 *
 * Checking Landing did find a real defect, recorded there: it claimed "No
 * third-party access, ever", which six opt-in outbound paths contradict.
 */
const SERVER_OWNED = [
  'never used to train anything',
  'switch on yourself',
  'holds the database, the backups',
  'no "us" in the path',
];

function sources(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === '__tests__' || entry === 'node_modules' || entry.startsWith('.')) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) sources(path, acc);
    else if (/\.(ts|tsx)$/.test(entry)) acc.push(path);
  }
  return acc;
}

describe('the data statement is the server\'s copy', () => {
  const files = sources(SRC);

  it('reads the client at all', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it.each(SERVER_OWNED)('no shipped file spells out %s', (fragment) => {
    const offenders = files
      .filter((f) => readFileSync(f, 'utf8').includes(fragment))
      .map((f) => f.replace(`${SRC}/`, ''));
    expect(offenders, `${fragment} belongs only to `
      + 'finpal_core/src/services/onboarding/copy.py — DataStatement renders '
      + 'nothing on failure on purpose').toEqual([]);
  });
});
