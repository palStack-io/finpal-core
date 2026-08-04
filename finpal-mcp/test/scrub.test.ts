import { beforeEach, describe, expect, it } from 'vitest';
import { isTemporal, pseudonym, scrub, scrubDigits, type ScrubContext } from '../src/scrub.js';
import accountsFixture from './fixtures/accounts.json';
import transactionsFixture from './fixtures/transactions.json';

let ctx: ScrubContext;
beforeEach(() => { ctx = { ownerId: 'owner@example.com' }; });

describe('scrubDigits', () => {
  it('masks a run of four or more digits', () => {
    expect(scrubDigits('Chase Checking ...4242')).toBe('Chase Checking ...••••');
  });

  it('keeps the label, which is the point', () => {
    // Stripping the field entirely would make every answer unreadable.
    expect(scrubDigits('Chase Checking ...4242')).toContain('Chase Checking');
  });

  it('masks longer runs too', () => {
    expect(scrubDigits('acct 5555666677778888')).toBe('acct ••••');
  });

  it('leaves short numbers alone so amounts and years survive', () => {
    expect(scrubDigits('Table for 2')).toBe('Table for 2');
    expect(scrubDigits('Flight 747')).toBe('Flight 747');
  });

  it('masks a year-like run, accepting the false positive', () => {
    // 2026 is indistinguishable from a card fragment. Masking it costs a little
    // readability; not masking it leaks four digits of an account number.
    expect(scrubDigits('Renewal 2026')).toBe('Renewal ••••');
  });
});

describe('pseudonym', () => {
  it('renders the caller as "you"', () => {
    expect(pseudonym('owner@example.com', ctx)).toBe('you');
  });

  it('is stable for the same person across calls', () => {
    const first = pseudonym('flat@example.com', ctx);
    expect(pseudonym('flat@example.com', ctx)).toBe(first);
  });

  it('distinguishes different people', () => {
    expect(pseudonym('a@example.com', ctx))
      .not.toBe(pseudonym('b@example.com', ctx));
  });

  it('never returns the address itself', () => {
    expect(pseudonym('flat@example.com', ctx)).not.toContain('@');
  });
});

describe('scrub', () => {
  it('masks digits in name and card_used', () => {
    const out = scrub({
      name: 'Chase Checking ...4242', card_used: 'Amex ...9876',
    }, ctx) as Record<string, string>;
    expect(out.name).toBe('Chase Checking ...••••');
    expect(out.card_used).toBe('Amex ...••••');
  });

  it('drops notes entirely', () => {
    // Free text: users put routing and account numbers in it, and it is rarely
    // what the question is about.
    const out = scrub({ description: 'Tesco', notes: 'acct 5555666677778888' }, ctx);
    expect(out).not.toHaveProperty('notes');
    expect(out).toHaveProperty('description', 'Tesco');
  });

  it('pseudonymises user ids, which are email addresses', () => {
    const out = scrub({
      user_id: 'owner@example.com', paid_by: 'flat@example.com',
    }, ctx) as Record<string, string>;
    expect(out.user_id).toBe('you');
    expect(out.paid_by).not.toContain('@');
  });

  it('recurses into arrays and nested objects', () => {
    const out = scrub({
      transactions: [
        { card_used: 'Visa ...1111', splits: [{ email: 'flat@example.com' }] },
      ],
    }, ctx) as { transactions: Array<{ card_used: string; splits: Array<{ email: string }> }> };
    expect(out.transactions[0].card_used).toBe('Visa ...••••');
    expect(out.transactions[0].splits[0].email).not.toContain('@');
  });

  it('leaves amounts and dates untouched', () => {
    const out = scrub({ amount: 4242.42, date: '2026-03-01' }, ctx) as Record<string, unknown>;
    expect(out.amount).toBe(4242.42);
    expect(out.date).toBe('2026-03-01');
  });

  it('leaves timestamps and month buckets untouched but not prose containing a year', () => {
    // The exemption is on the value's shape, not the key's name, so a key
    // carrying something card-shaped is still masked.
    const out = scrub({
      created_at: '2026-03-01T09:15:00',
      period: '2026-03',
      date: 'Renewal 2026',
      updated_at: '2026-03-01T09:15:00.123456+00:00',
      card_used: '4242-42',
    }, ctx) as Record<string, string>;
    expect(out.created_at).toBe('2026-03-01T09:15:00');
    expect(out.period).toBe('2026-03');
    expect(out.updated_at).toBe('2026-03-01T09:15:00.123456+00:00');
    expect(out.date).toBe('Renewal ••••');
    // Month is range-checked, so a card fragment is not mistaken for a month.
    expect(out.card_used).toBe('••••-42');
  });

  it('masks an email appearing anywhere in a string value', () => {
    const out = scrub({ description: 'Split with flat@example.com' }, ctx) as Record<string, string>;
    expect(out.description).not.toContain('flat@example.com');
  });

  it('fails closed on an unrecognised field carrying a credential shape', () => {
    // A future API change must not silently pass a secret through. Anything
    // whose key looks like a credential is dropped whatever its name.
    const out = scrub({ access_url: 'https://bridge/x', some_token: 'abc' }, ctx);
    expect(out).not.toHaveProperty('access_url');
    expect(out).not.toHaveProperty('some_token');
  });

  it('handles null and primitives without throwing', () => {
    expect(scrub(null, ctx)).toBeNull();
    expect(scrub(42, ctx)).toBe(42);
    expect(scrub('plain', ctx)).toBe('plain');
  });
});

const DIGIT_RUN = /\d{4,}/;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;

/**
 * Every key and every string value in a tree.
 *
 * Assertions are on string leaves, not on `JSON.stringify(...)`: numbers are
 * deliberately left alone, so a balance of 1284.55 puts a four-digit run in the
 * serialised text of any realistic response. Keys are included because `scrub`
 * rewrites values only — an address used as an object key would survive.
 */
function stringLeaves(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(stringLeaves);
  if (value !== null && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .flatMap(([key, nested]) => [key, ...stringLeaves(nested)]);
  }
  return [];
}

describe('scrub against real API responses', () => {
  it('leaves no digit run in any string of a real accounts or transactions response', () => {
    for (const fixture of [accountsFixture, transactionsFixture]) {
      // Teeth first: a fixture with nothing to remove would prove nothing.
      expect(stringLeaves(fixture).filter((s) => DIGIT_RUN.test(s)).length)
        .toBeGreaterThan(0);
      expect(stringLeaves(scrub(fixture, ctx))
        .filter((s) => DIGIT_RUN.test(s) && !isTemporal(s))).toEqual([]);
    }
  });

  it('leaves no email address anywhere in a real transactions response', () => {
    expect(stringLeaves(transactionsFixture).filter((s) => EMAIL.test(s)).length)
      .toBeGreaterThan(0);
    expect(stringLeaves(scrub(transactionsFixture, ctx)).filter((s) => EMAIL.test(s)))
      .toEqual([]);
  });

  it('still contains readable labels, renders the owner as "you", and has dropped notes', () => {
    const before = stringLeaves(transactionsFixture);
    const after = stringLeaves(scrub(transactionsFixture, ctx));
    expect(after).toContain('Chase Checking ...••••');
    expect(after).toContain('you');
    expect(after).toContain('2026-03-01T00:00:00');
    expect(before).toContain('notes');
    expect(after).not.toContain('notes');
  });
});
