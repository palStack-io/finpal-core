/**
 * *** A `useQuery` WITH NO PROVIDER IS A BLANK PAGE, NOT AN ERROR MESSAGE. ***
 *
 * `src/hooks/useCurrencies.ts` calls `useQuery`, `src/pages/Onboarding.tsx`
 * calls `useCurrencies()`, and `main.tsx` had no `QueryClientProvider`. React
 * Query throws during render, React unmounts the tree, and `#root` ends up
 * with zero bytes of HTML: the page paints its background and nothing else.
 *
 * `ProtectedRoute` redirects every user whose `hasCompletedOnboarding` is
 * false to that page, so this was **the first screen after every new signup**
 * and it was blank.
 *
 * Nothing caught it. The route resolves, the server is healthy, and the whole
 * backend suite passes; the component tests that render Onboarding mount it
 * inside their own wrapper, so they supply what production did not. Only a
 * real browser found it.
 *
 * This test is deliberately a SOURCE SWEEP rather than a render test, for
 * exactly that reason: a render test would pass by providing the thing whose
 * absence is the bug. What has to be asserted is that the **application
 * entry point** mounts a provider, because that is the file production uses.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '..', '..');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '__tests__') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

describe('react-query needs a provider at the entry point', () => {
  const files = walk(SRC);

  it('finds the source tree it is meant to be checking', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('mounts a QueryClientProvider in main.tsx whenever any hook uses react-query', () => {
    const consumers = files.filter((file) => {
      const source = readFileSync(file, 'utf8');
      return /from ['"]@tanstack\/react-query['"]/.test(source)
        && /\buse(Query|Mutation|InfiniteQuery|Queries)\b/.test(source);
    });

    if (consumers.length === 0) {
      // Nothing uses it, so nothing needs a provider. Still a pass, but say
      // so rather than asserting vacuously.
      expect(consumers).toEqual([]);
      return;
    }

    const entry = readFileSync(join(SRC, 'main.tsx'), 'utf8');

    // *** `<QueryClientProvider`, NOT `QueryClientProvider`. ***
    // The first version of this test matched the bare name and so matched
    // the IMPORT line. Sabotage-checked by replacing the JSX element with a
    // fragment and leaving the import in place: the test passed. An import
    // is not a mount, and a guard that cannot tell them apart is decoration.
    const isMounted = /<\s*QueryClientProvider[\s>]/.test(entry);

    expect(
      isMounted
        ? ''
        : `${consumers.length} file(s) use react-query hooks `
          + `(${consumers.map((f) => f.replace(SRC + '/', '')).join(', ')}) `
          + 'but src/main.tsx mounts no QueryClientProvider. React Query '
          + 'throws during render, React unmounts the tree, and the page is '
          + 'BLANK with no message — which is what the Onboarding page did '
          + 'for every new signup.'
    ).toBe('');

    // And an actual client is constructed and handed to it.
    expect(/new QueryClient\(/.test(entry)).toBe(true);
    expect(/<\s*QueryClientProvider[^>]*client=\{/.test(entry)).toBe(true);
  });
});
