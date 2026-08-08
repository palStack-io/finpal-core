/**
 * One module per resource — the structural half of what the two Categories
 * implementations taught.
 *
 * **The defect this exists for.** `src/services/` and `src/services/api/` were two
 * parallel service layers describing the same endpoints. That is not tidiness: the
 * duplicates *drifted*, repeatedly, and each drift was invisible because both files
 * compiled and both had tests.
 *
 *   * **D-57** — both declared their own filter type and assembled their own
 *     `URLSearchParams`. #76 taught one of them `member_id` and not the other, so
 *     `Dashboard.tsx` could not filter its recent strip at all.
 *   * **`groupsApi.create` had the NARROWER type.** It took
 *     `Partial<Group> & { member_ids?: string[] }`, which omitted
 *     `default_split_values` and typed `member_ids` as strings where callers send
 *     numbers. The *older* module was the one that had it right — so converging
 *     naively would have silently narrowed a working contract.
 *   * **`transactionsApi.get` and `.update` declared the wrong return shape.**
 *     `get` said `Promise<Transaction>` while the deployed server answers
 *     `{success, transaction}`; `update` said `{message}` while the server also
 *     returns the updated row. `create` had already been corrected and the other
 *     two were left behind. A caller trusting those types would read fields off an
 *     envelope and get `undefined`, with TypeScript agreeing it was fine.
 *
 * So this is keyed to the **structure**, not to the four names that happened to be
 * duplicated: any future resource with a module in both layers fails here.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const SERVICES = resolve(process.cwd(), 'src/services');
const API = resolve(SERVICES, 'api');

/**
 * Both sides normalised to a canonical SINGULAR, so `categoryService.ts` and
 * `api/categories.ts` collide.
 *
 * The first version of this stripped a trailing `s`, which turned `categories`
 * into `categorie` and `category` into `category` — they never matched, so the
 * structural check PASSED while a real duplicate sat in the tree, and only the
 * hardcoded name list below caught it. That is "a list of the ones somebody
 * remembered", the exact failure this file is supposed to replace. Found by
 * sabotaging it; it would otherwise have shipped as decoration.
 */
const singular = (s: string) =>
  s.replace(/\.ts$/, '')
    .replace(/Service$/, '')
    .toLowerCase()
    .replace(/ies$/, 'y')
    .replace(/(?<!s)s$/, '');

const legacy = readdirSync(SERVICES)
  .filter((f) => f.endsWith('Service.ts'));
const modern = readdirSync(API).filter((f) => f.endsWith('.ts'));

describe('no resource has two service modules', () => {
  it('reads both directories, or every assertion below is vacuous', () => {
    expect(legacy.length, 'no *Service.ts files found — the scan is broken').toBeGreaterThan(3);
    expect(modern.length, 'no services/api/*.ts files found — the scan is broken').toBeGreaterThan(3);
  });

  it('no *Service.ts shadows a services/api module', () => {
    const modernStems = new Set(modern.map(singular));
    const shadowed = legacy.filter((f) => modernStems.has(singular(f)));

    expect(shadowed, `these resources have TWO service modules, which is how D-57 and the groupsApi type narrowing happened. Converge on services/api/* and delete the other: ${shadowed.join(', ')}`).toEqual([]);
  });
});

describe('the retired modules stay retired', () => {
  // Named explicitly BECAUSE they are gone. The structural check above cannot see
  // a file that does not exist, so without this a reintroduced `categoryService.ts`
  // would only fail once someone also added `services/api/categories.ts` — which
  // already exists, so in fact it would fail immediately. Kept anyway as the
  // readable statement of what was deleted and why.
  it.each(['categoryService.ts', 'groupService.ts', 'transactionService.ts'])(
    '%s is not back', (name) => {
      expect(legacy).not.toContain(name);
    });
});
