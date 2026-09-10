import { describe, expect, it } from 'vitest';
import {
  canUnlinkAccounts, goalTrackingLabel, TRACKED_BY_HAND,
  type TrackedGoal,
} from '../../utils/goalTracking';

/**
 * B12 — the line under a goal's name that says which balances it reads.
 *
 * *** THE CASE TABLE BELOW IS DUPLICATED, VERBATIM, IN THE OTHER CLIENT. THAT IS
 * THE POINT OF IT. *** web-ui and mobile are separate git repos with no shared
 * module, so the only thing that can stop them describing one goal two different
 * ways is one table of inputs and expected strings that a human can diff. If you
 * change a string here, change it there in the same turn — a copy fix on one
 * client is not a copy fix (D-99). `goalFigures.test.ts` established this
 * convention for D-179; this is its second use.
 *
 * The first three rows are the ones that matter most and the least obvious: a
 * payload with NO `accounts` key at all. A new bundle reaches an older backend
 * routinely here — nginx serves the new assets before the backend restarts, and a
 * self-hoster can update `web-ui` alone — and `goal.accounts.map(...)` would throw
 * on a page that worked a minute earlier. That is the trap D-176 is the row for.
 */

const CASES: ReadonlyArray<{
  name: string;
  goal: Partial<TrackedGoal>;
  expected: string;
}> = [
  {
    name: '*** NO `accounts` KEY AT ALL (older backend) falls back to `account_name` ***',
    goal: { accounts: undefined, account_id: 1, account_name: 'Chase Amazon' },
    expected: 'Tracking Chase Amazon',
  },
  {
    name: 'no `accounts` key and no account is still tracked by hand',
    goal: { accounts: undefined, account_id: null, account_name: null },
    expected: 'Tracked by hand',
  },
  {
    name: "*** AN EMPTY `accounts` WITH AN account_id IS NOT 'Tracked by hand' *** — that is the window between the table being created at boot and the backfill filling it",
    goal: { accounts: [], account_id: 1, account_name: 'Chase Amazon' },
    expected: 'Tracking Chase Amazon',
  },
  {
    name: "an older backend's own set description is passed through rather than second-guessed",
    goal: { accounts: undefined, account_id: 1, account_name: '3 accounts' },
    expected: 'Tracking 3 accounts',
  },
  {
    name: 'a manual goal',
    goal: { accounts: [], account_id: null, account_name: null },
    expected: 'Tracked by hand',
  },
  {
    name: 'one account reads exactly as it did before B12',
    goal: {
      accounts: [{ id: 1, name: 'Chase Amazon', start_amount: -1650 }],
      account_id: 1, account_name: 'Chase Amazon',
    },
    expected: 'Tracking Chase Amazon',
  },
  {
    name: '*** TWO ACCOUNTS ARE NAMED, WHERE THE SERVER COULD ONLY SAY "2 accounts" ***',
    goal: {
      accounts: [
        { id: 1, name: 'Visa', start_amount: -1000 },
        { id: 2, name: 'Amex', start_amount: -500 },
      ],
      account_id: 1, account_name: '2 accounts',
    },
    expected: 'Tracking Visa & Amex',
  },
  {
    name: 'three are a comma list with the ampersand on the last pair only',
    goal: {
      accounts: [
        { id: 1, name: 'Visa', start_amount: -1000 },
        { id: 2, name: 'Amex', start_amount: -500 },
        { id: 3, name: 'Store card', start_amount: -200 },
      ],
      account_id: 1, account_name: '3 accounts',
    },
    expected: 'Tracking Visa, Amex & Store card',
  },
  {
    name: 'four stop being readable on a phone row, so they become a count',
    goal: {
      accounts: [
        { id: 1, name: 'Visa', start_amount: -1000 },
        { id: 2, name: 'Amex', start_amount: -500 },
        { id: 3, name: 'Store card', start_amount: -200 },
        { id: 4, name: 'Overdraft', start_amount: -75 },
      ],
      account_id: 1, account_name: '4 accounts',
    },
    expected: 'Tracking 4 accounts',
  },
  {
    name: "the server's order is kept, not re-sorted into one this client invented",
    goal: {
      accounts: [
        { id: 9, name: 'Zurich savings', start_amount: 100 },
        { id: 2, name: 'Alpha savings', start_amount: 200 },
      ],
      account_id: 9, account_name: '2 accounts',
    },
    expected: 'Tracking Zurich savings & Alpha savings',
  },
];

const goal = (over: Partial<TrackedGoal>): TrackedGoal => ({
  account_id: null,
  account_name: null,
  ...over,
});

describe('the line that says which balances a goal reads', () => {
  it.each(CASES.map((c) => [c.name, c.goal, c.expected] as const))(
    '%s',
    (_name, over, expected) => {
      expect(goalTrackingLabel(goal(over))).toBe(expected);
    },
  );

  it('never throws on a payload with no `accounts` key', () => {
    // Stated as behaviour and not as a type: `accounts?:` makes TypeScript happy
    // and proves nothing about a JSON body that arrived over the wire from a
    // backend that predates B12. Analytics interfaces in this project have lied
    // about the server five times, and a green typecheck was reassuring
    // throughout.
    const fromAnOlderServer = JSON.parse(
      '{"account_id":1,"account_name":"Chase Amazon"}',
    ) as TrackedGoal;
    expect(() => goalTrackingLabel(fromAnOlderServer)).not.toThrow();
    expect(goalTrackingLabel(fromAnOlderServer)).toBe('Tracking Chase Amazon');
  });

  it('covers both the migrated and the unmigrated payload, or the table has lost a half', () => {
    // A table that drifted to one shape would pass every row above while testing
    // nothing about the case that actually breaks. This project has shipped two
    // gates that inspected nothing (D-45, and a CI guard whose condition could
    // never be true).
    expect(CASES.some((c) => c.goal.accounts === undefined)).toBe(true);
    expect(CASES.some((c) => (c.goal.accounts?.length ?? 0) > 1)).toBe(true);
    expect(CASES.length).toBeGreaterThanOrEqual(10);
  });

  it('says "Tracked by hand" with the exact words the copy elsewhere uses', () => {
    expect(TRACKED_BY_HAND).toBe('Tracked by hand');
  });
});

describe('whether the unlink control should exist', () => {
  it('*** IS FALSE FOR A SINGLE-ACCOUNT GOAL, BECAUSE THE SERVER ALWAYS REFUSES ***', () => {
    // `DELETE /goals/<id>/accounts/<account_id>` answers 400 on the last link:
    // removing it is a conversion to a manual goal, not an unlink. A button that
    // can only ever fail is D-172's shape.
    expect(canUnlinkAccounts(goal({
      accounts: [{ id: 1, name: 'Visa', start_amount: -1000 }],
      account_id: 1, account_name: 'Visa',
    }))).toBe(false);
  });

  it('is true once a second account has joined', () => {
    expect(canUnlinkAccounts(goal({
      accounts: [
        { id: 1, name: 'Visa', start_amount: -1000 },
        { id: 2, name: 'Amex', start_amount: -500 },
      ],
      account_id: 1, account_name: '2 accounts',
    }))).toBe(true);
  });

  it('is false on an older payload, where this client cannot know', () => {
    // Not "assume one": assume NOT SHOWN. Offering a control on a payload that
    // cannot say how many accounts there are risks a button that only fails,
    // and the cost of hiding it is that the user opens the goal to manage it.
    expect(canUnlinkAccounts(goal({
      accounts: undefined, account_id: 1, account_name: 'Chase Amazon',
    }))).toBe(false);
  });
});
