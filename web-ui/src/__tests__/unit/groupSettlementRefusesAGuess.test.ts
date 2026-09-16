/**
 * Totalling "you owe" across groups, and the three things it refuses to do.
 *
 * *** THE FIXTURE IS THE LIVE DEMO'S SETTLEMENT. *** Read from
 * `GET /groups/<id>/balances` on `findemo.palstack.io`: Alex owes Jordan
 * $178.02 in Apartment Roommates, $228.00 in Trip to Vegas (where Morgan and
 * Taylor each owe Jordan the same), and $31.50 plus $5.20 to two different
 * people in Office Lunch Club. Total **$442.72** across **four payments** to
 * **two people**, which is what the mockup draws.
 *
 * *** AND THE REFUSALS ARE THE POINT OF THE FILE. *** This page used to render
 * "You Owe $0.00" from `const totalOwed = 0`, and the pass that deleted it
 * recorded that aggregating by display NAME was unsafe. It is: the second test
 * builds two members called "Alex Demo" and shows that a name-keyed total
 * cannot tell them apart.
 */
import { describe, expect, it } from 'vitest';
import { settlementFor, peopleYouOwe, type GroupBalances } from '../../utils/groupSettlement';

const ME = 'demo1@finpal.demo';
const JORDAN = 'demo3@finpal.demo';
const TAYLOR = 'demo4@finpal.demo';
const MORGAN = 'demo2@finpal.demo';

/** Exactly what the three demo groups return. */
const DEMO: GroupBalances[] = [
  {
    groupId: 1, groupName: 'Apartment Roommates',
    balances: [{ from: 'Alex Demo', to: 'Jordan Demo', from_id: ME, to_id: JORDAN, amount: 178.02 }],
  },
  {
    groupId: 2, groupName: 'Trip to Vegas',
    balances: [
      { from: 'Alex Demo', to: 'Jordan Demo', from_id: ME, to_id: JORDAN, amount: 228 },
      { from: 'Morgan Demo', to: 'Jordan Demo', from_id: MORGAN, to_id: JORDAN, amount: 228 },
      { from: 'Taylor Demo', to: 'Jordan Demo', from_id: TAYLOR, to_id: JORDAN, amount: 228 },
    ],
  },
  {
    groupId: 3, groupName: 'Office Lunch Club',
    balances: [
      { from: 'Alex Demo', to: 'Jordan Demo', from_id: ME, to_id: JORDAN, amount: 31.5 },
      { from: 'Alex Demo', to: 'Taylor Demo', from_id: ME, to_id: TAYLOR, amount: 5.2 },
    ],
  },
];

describe('the demo settlement', () => {
  it('is $442.72 over four payments to two people', () => {
    const s = settlementFor(ME, DEMO);
    expect(s.youOwe).toBeCloseTo(442.72, 2);
    expect(s.yourDebts).toHaveLength(4);
    expect(peopleYouOwe(s)).toBe(2);
    expect(s.unreadable).toEqual([]);
  });

  it('counts only YOUR lines — other people owing each other is not your debt', () => {
    // Vegas has three identical $228 debts and only one of them is mine.
    const s = settlementFor(ME, DEMO);
    expect(s.youOwe).not.toBeCloseTo(442.72 + 456, 2);
    expect(s.youAreOwed).toBe(0);
  });

  it('is owed the other way round when you are the creditor', () => {
    const s = settlementFor(JORDAN, DEMO);
    expect(s.youAreOwed).toBeCloseTo(178.02 + 228 * 3 + 31.5, 2);
    expect(s.youOwe).toBe(0);
    expect(s.yourDebts).toEqual([]);
  });
});

describe('what it refuses', () => {
  it('*** TWO MEMBERS SHARING A DISPLAY NAME ARE STILL DISTINGUISHED ***', () => {
    // The exact reason the ids were added server-side. A name-keyed total would
    // add both of these to one person.
    const shared: GroupBalances[] = [{
      groupId: 9, groupName: 'Flat',
      balances: [
        { from: 'Alex Demo', to: 'Jordan Demo', from_id: ME, to_id: JORDAN, amount: 40 },
        { from: 'Alex Demo', to: 'Jordan Demo', from_id: 'someone-else@x', to_id: JORDAN, amount: 60 },
      ],
    }];
    const s = settlementFor(ME, shared);
    expect(s.youOwe).toBe(40);
    expect(s.yourDebts).toHaveLength(1);
  });

  it('*** A LINE WITH NO IDS MAKES ITS GROUP UNREADABLE, NOT PARTLY COUNTED ***', () => {
    // An older self-hosted backend sends names only. A half-summed group is a
    // wrong figure with nothing on screen to say it is wrong.
    const old: GroupBalances[] = [{
      groupId: 4, groupName: 'Old server',
      balances: [{ from: 'Alex Demo', to: 'Jordan Demo', amount: 99 }],
    }];
    const s = settlementFor(ME, old);
    expect(s.youOwe).toBe(0);
    expect(s.unreadable).toEqual(['Old server']);
  });

  it('a group whose request FAILED is unreadable, which is not the same as having no debts', () => {
    const s = settlementFor(ME, [{ groupId: 5, groupName: 'Broken', balances: null }]);
    expect(s.unreadable).toEqual(['Broken']);
    expect(s.youOwe).toBe(0);
  });

  it('an empty group is settled, not unreadable', () => {
    const s = settlementFor(ME, [{ groupId: 6, groupName: 'Nothing yet', balances: [] }]);
    expect(s.unreadable).toEqual([]);
    expect(s.youOwe).toBe(0);
  });

  it('not knowing who you are makes everything unreadable rather than zero', () => {
    const s = settlementFor(null, DEMO);
    expect(s.youOwe).toBe(0);
    expect(s.unreadable).toHaveLength(3);
  });
});
