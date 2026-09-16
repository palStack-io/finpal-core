import { describe, it, expect } from 'vitest';
import { railTag, modulesOn, type RailFacts } from '../../utils/settingsRailTags';

/**
 * demo1@finpal.demo as the live payload describes them, read 2026-09-15:
 * `modules: ['pointspal', 'learnpal']`, no `hidden_modules` key at all,
 * `default_currency_code: 'USD'`, and `is_admin` ABSENT — so this user has no
 * Household section in the rail and no member count to show.
 */
const DEMO1: RailFacts = {
  memberCount: null,
  modules: ['pointspal', 'learnpal'],
  currency: 'USD',
};

describe('the tags the rail can actually show', () => {
  it('counts two modules on for the demo user', () => {
    expect(railTag('modules', DEMO1)).toBe('2 on');
  });

  it('names the currency every figure in the app is rendered in', () => {
    expect(railTag('preferences', DEMO1)).toBe('USD');
  });

  it('states the one-channel truth for notifications', () => {
    expect(railTag('notifications', DEMO1)).toBe('email only');
  });

  it('pluralises the household count, and says "1 person" for one', () => {
    expect(railTag('household', { ...DEMO1, memberCount: 2 })).toBe('2 people');
    expect(railTag('household', { ...DEMO1, memberCount: 1 })).toBe('1 person');
  });
});

describe('an absent fact renders as NOTHING, not as a zero', () => {
  it('gives no household tag while the member list is unknown', () => {
    // This is the load-bearing case. "0 people" is a false statement about an
    // instance whose members simply have not arrived, and on screen it is
    // indistinguishable from a true one.
    expect(railTag('household', { ...DEMO1, memberCount: null })).toBeNull();
    expect(railTag('household', { ...DEMO1, memberCount: 0 })).toBeNull();
  });

  it('gives no modules tag when the user is entitled to none', () => {
    expect(railTag('modules', { ...DEMO1, modules: undefined })).toBeNull();
    expect(railTag('modules', { ...DEMO1, modules: [] })).toBeNull();
  });

  it('gives no currency tag rather than inventing a default', () => {
    // A page that guessed USD would be wrong for every non-US self-hoster, and
    // `money()` renders in the READER's currency without converting.
    expect(railTag('preferences', { ...DEMO1, currency: undefined })).toBeNull();
  });

  it('returns null for a section it has nothing to say about', () => {
    expect(railTag('profile', DEMO1)).toBeNull();
    expect(railTag('security', DEMO1)).toBeNull();
    expect(railTag('data', DEMO1)).toBeNull();
    expect(railTag('about', DEMO1)).toBeNull();
    expect(railTag('integrations', DEMO1)).toBeNull();
  });

  it('does not throw on an id it has never heard of', () => {
    expect(railTag('not-a-section', DEMO1)).toBeNull();
  });
});

describe('"on" means showing, which is entitlement MINUS preference', () => {
  it('subtracts a hidden module from the count', () => {
    expect(modulesOn({ ...DEMO1, hiddenModules: ['learnpal'] })).toBe(1);
    expect(railTag('modules', { ...DEMO1, hiddenModules: ['learnpal'] })).toBe('1 on');
  });

  it('treats an absent hidden_modules as nothing hidden, not everything', () => {
    // `undefined` must mean "has never hidden one" — there is no such key for
    // that user. Reading it as "all hidden" would report 0 on for every user who
    // has never opened the Modules tab.
    expect(modulesOn({ ...DEMO1, hiddenModules: undefined })).toBe(2);
  });

  it('can reach zero on, which is a real state and still gets a tag', () => {
    // Entitled to two and hiding both is a true "0 on" — distinct from the
    // no-entitlement case above, which has no section at all.
    expect(railTag('modules', {
      ...DEMO1, hiddenModules: ['pointspal', 'learnpal'],
    })).toBe('0 on');
  });

  it('ignores a hidden slug the user is no longer entitled to', () => {
    // Counted by membership, not by subtracting lengths: a stale slug would
    // otherwise subtract from a total it was never part of and under-report.
    expect(modulesOn({
      ...DEMO1, hiddenModules: ['a-module-that-was-revoked'],
    })).toBe(2);
  });

  it('does not let a duplicated hidden slug subtract twice', () => {
    expect(modulesOn({
      ...DEMO1, hiddenModules: ['learnpal', 'learnpal'],
    })).toBe(1);
  });
});
