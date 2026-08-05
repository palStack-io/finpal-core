/**
 * The AGPL obligations the UI itself has to carry.
 *
 * AGPL-3.0 section 13: a program users interact with over a network must offer
 * them its source. finPal Core is served over HTTP, so the source link in
 * Settings > About is a licence obligation rather than a courtesy — and before
 * 2026-08-05 there was no such link anywhere in the UI.
 *
 * Written as a source scan rather than a render, deliberately. `Settings.tsx`
 * pulls in twelve components, two stores, a service, a context and the module
 * registry, so rendering it to read one paragraph would be mostly mocking; and
 * the property worth protecting is "this text and these links exist", which the
 * source states directly. Same shape as mobile's
 * `src/__tests__/components.themeProps.test.ts`.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..', '..');
const SETTINGS = join(SRC, 'pages', 'Settings.tsx');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '__tests__') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

describe('AGPL obligations in the UI', () => {
  it('Settings links to the licence text', () => {
    const source = readFileSync(SETTINGS, 'utf8');
    expect(source).toMatch(/gnu\.org\/licenses\/agpl-3\.0/);
  });

  it('Settings offers the source code, which AGPL section 13 requires', () => {
    const source = readFileSync(SETTINGS, 'utf8');
    expect(source).toMatch(/github\.com\/palStack-io\/finpal-core/);
    // The link has to be findable by a user, not just present in the markup.
    expect(source).toMatch(/Get the source code/);
  });

  it('says finPal Core, not finPal, is the free software', () => {
    // The project is dual licensed: this repository is the AGPL Core and Premium
    // is proprietary. "finPal is free software" overclaims in the other
    // direction, which is its own kind of licence inaccuracy.
    const source = readFileSync(SETTINGS, 'utf8');
    expect(source).toMatch(/finPal Core is\s+free software/);
  });

  it('nothing in the UI claims "All rights reserved"', () => {
    // It contradicts the AGPL grant. Scanned across the whole tree rather than
    // pinned to the one file that used to say it, so it cannot reappear
    // somewhere else.
    const offenders = walk(SRC).filter((file) =>
      /All rights reserved/i.test(readFileSync(file, 'utf8'))
    );
    expect(offenders).toEqual([]);
  });
});
