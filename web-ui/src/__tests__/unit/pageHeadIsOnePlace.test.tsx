/**
 * The page head is ONE component, and the pages that have adopted it render a
 * title, a sentence, an action slot and a band — not four pages' worth of
 * slightly different flex rows.
 *
 * *** THE POINT OF THE ADOPTION ASSERTION (D-106). *** A helper's own test is
 * not proof of its adoption: `login.tsx` bypassed a helper that had 494 green
 * tests behind it and told an offline user their correct password was wrong. So
 * this file checks the component AND counts the call sites, because a
 * `PageHead` nothing renders is a component, not a redesign.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { PageHead } from '../../components/PageHead';
import { HEAD_BANDS } from '../../utils/headBands';

const SRC = join(__dirname, '..', '..');

describe('PageHead', () => {
  it('gives the page exactly one h1, and keeps the role class on it', () => {
    render(<PageHead band="accounts" title="Accounts" subtitle="What you have." />);
    const h1 = screen.getByRole('heading', { level: 1, name: 'Accounts' });
    // *** `page-title` IS LOAD-BEARING HERE. *** The role class carries this
    // project's title-sizing history and `roleClassesAreReferenced.test.ts`
    // fails a rule nothing references. One component referencing it beats
    // eleven pages doing so — but only while this stays true.
    expect(h1.className).toContain('page-title');
  });

  it('renders the sentence and the action slot', () => {
    render(
      <PageHead band="goals" title="Goals" subtitle="Link a goal to an account."
        right={<button type="button">New goal</button>} />,
    );
    expect(screen.getByText('Link a goal to an account.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'New goal' })).toBeTruthy();
  });

  it('hides the band from assistive technology, because it states nothing', () => {
    const { container } = render(<PageHead band="transactions" title="Transactions" />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('aria-hidden')).toBe('true');
    // `none` fills the box at every width. `meet` plus a fixed height is what
    // shrank GoalRange to 340x77 on a phone under 170px of dead space.
    expect(svg!.getAttribute('preserveAspectRatio')).toBe('none');
  });

  it('draws the band the page asked for, not a shared one', () => {
    const drawn = (band: 'accounts' | 'goals') => {
      const { container } = render(<PageHead band={band} title="x" />);
      return container.querySelector('path')!.getAttribute('d');
    };
    expect(drawn('accounts')).toBe(HEAD_BANDS.accounts.d);
    expect(drawn('accounts')).not.toBe(drawn('goals'));
  });

  it('every band in the set is claimed by a page, and every adopter names a real band', () => {
    /**
     * *** THE SWEEP COVERS `components/` TOO, AND THE FIRST VERSION DID NOT. ***
     * It read `pages/` only, which is a fair guess and wrong about this app:
     * Recurring and Rules have no page file at all — the component IS the
     * route, `App.tsx` renders `RecurringTransactions` and `TransactionRules`
     * directly. So adopting the head on those two turned this assertion red
     * while the adoption was real, which is a gate keyed to a layout
     * convention rather than to the thing it means to check.
     */
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === '__tests__') continue;
          walk(full);
        } else if (entry.name.endsWith('.tsx')) {
          files.push(full);
        }
      }
    };
    walk(join(SRC, 'pages'));
    walk(join(SRC, 'components'));
    walk(join(SRC, 'modules'));

    const named = new Set<string>();
    let adopters = 0;
    for (const full of files) {
      const src = readFileSync(full, 'utf8');
      // The component's own definition is not an adoption of it.
      if (full.endsWith('PageHead.tsx')) continue;
      if (!src.includes('<PageHead')) continue;
      adopters += 1;
      for (const m of src.matchAll(/band="([a-z-]+)"/g)) named.add(m[1]);
    }
    // A band nobody asks for is `rangeSilhouettes`' problem in miniature: dead
    // geometry that cannot be wrong, so nothing keeps it right.
    expect([...Object.keys(HEAD_BANDS)].sort()).toEqual([...named].sort());
    for (const band of named) expect(HEAD_BANDS[band], `band="${band}"`).toBeTruthy();
    expect(adopters, 'surfaces rendering PageHead').toBeGreaterThanOrEqual(5);
  });
});
