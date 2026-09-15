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
    const pages = readdirSync(join(SRC, 'pages')).filter((f) => f.endsWith('.tsx'));
    const named = new Set<string>();
    let adopters = 0;
    for (const file of pages) {
      const src = readFileSync(join(SRC, 'pages', file), 'utf8');
      if (!src.includes('<PageHead')) continue;
      adopters += 1;
      for (const m of src.matchAll(/band="([a-z-]+)"/g)) named.add(m[1]);
    }
    // A band nobody asks for is `rangeSilhouettes`' problem in miniature: dead
    // geometry that cannot be wrong, so nothing keeps it right.
    expect([...Object.keys(HEAD_BANDS)].sort()).toEqual([...named].sort());
    for (const band of named) expect(HEAD_BANDS[band], `band="${band}"`).toBeTruthy();
    expect(adopters, 'pages rendering PageHead').toBeGreaterThanOrEqual(3);
  });
});
