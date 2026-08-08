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
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

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


/**
 * One input definition — U-03 slice 4, and the same lesson one layer over.
 *
 * There were TWO: the `.fp-input` CSS class and an `inputStyle` object in
 * `src/styles/formStyles.ts`. They had drifted on padding (`12px` vs `12px 16px`),
 * exactly as the two service layers above drifted on types and envelopes.
 *
 * **Why a class won, and why this cannot be "just use a shared style object".** An
 * inline style beats a class rule at any specificity, INCLUDING `:focus`. So an
 * element styled from a JS object cannot take its focus styling from CSS — which
 * is why ten files had hand-rolled `onFocus`/`onBlur` handlers imperatively setting
 * `borderColor` and `background` on every field. A class can express `:focus`; a
 * style object structurally cannot. Reintroducing the object brings the handlers
 * back with it.
 */
describe('inputs have one definition, and it is the class', () => {
  const formStyles = readFileSync(resolve(process.cwd(), 'src/styles/formStyles.ts'), 'utf8');

  it('no shared inputStyle object comes back', () => {
    expect(/export const inputStyle/.test(formStyles)).toBe(false);
  });

  /** Every .tsx under src, excluding tests. */
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (entry.endsWith('.tsx') && !full.includes('__tests__')) out.push(full);
    }
    return out;
  };
  const FILES = walk(resolve(process.cwd(), 'src'));

  /**
   * Files that still style focus by hand, each with a reason.
   *
   * Four are AUTH PAGES, which keep their own visual scheme by owner decision and
   * are explicitly out of scope for the theme work. The other two use a genuinely
   * DIFFERENT focus treatment (a ring, or a translucent border) rather than the
   * `.fp-input` pair — converging those is a design change, not a refactor.
   */
  const HAND_ROLLED_BY_DESIGN: Record<string, string> = {
    'pages/Login.tsx': 'auth pages keep their own scheme — owner decision',
    'pages/Register.tsx': 'auth pages keep their own scheme — owner decision',
    'pages/ResetPassword.tsx': 'auth pages keep their own scheme — owner decision',
    'pages/ForgotPassword.tsx': 'auth pages keep their own scheme — owner decision',
    'pages/Transactions.tsx': 'different treatment (translucent green border), not the .fp-input pair',
    'components/import/CSVImportModal.tsx': 'different treatment, not the .fp-input pair',
  };

  it('reads a non-trivial number of components, or the sweep is vacuous', () => {
    expect(FILES.length).toBeGreaterThan(30);
  });

  it('the by-design list is not stale', () => {
    // The other half. Without it an exemption for a file that no longer hand-rolls
    // anything becomes a permanent hole to hide a real one in.
    const stale = Object.keys(HAND_ROLLED_BY_DESIGN).filter(
      (k) => !FILES.some((f) => f.endsWith(k)));
    expect(stale).toEqual([]);
  });

  it('no component hand-rolls focus styling again', () => {
    // *** KEYED TO THE MECHANISM: an assignment INSIDE an onFocus/onBlur handler.
    //
    // The first version matched `style.background = 'var(--brand-main-green)'`
    // anywhere, and flagged five files whose only match was a BUTTON HOVER
    // (`onMouseLeave` restoring a button's green). Legitimate code, wrong guard —
    // the same false positive as the D-64 mechanism check and as
    // apiErrorPrecedence before it. Matching a value is not matching a behaviour.
    const offenders: string[] = [];
    for (const f of FILES) {
      if (Object.keys(HAND_ROLLED_BY_DESIGN).some((k) => f.endsWith(k))) continue;
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/on(?:Focus|Blur)=\{/g)) {
        let i = m.index! + m[0].length;
        let depth = 1;
        while (i < src.length && depth > 0) {
          if (src[i] === '{') depth++;
          else if (src[i] === '}') depth--;
          i++;
        }
        const body = src.slice(m.index! + m[0].length, i - 1);
        if (/style\.(borderColor|background)\s*=/.test(body)) {
          offenders.push(f.replace(process.cwd(), ''));
          break;
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
