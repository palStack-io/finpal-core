/**
 * *** THE SAME CASE TABLE EXISTS IN mobile/src/__tests__/spendingGroups.test.ts. ***
 * Only the runner import and the module path differ. Do not change an expected
 * value here without changing it there in the same turn -- the point of the
 * duplication is that a divergence shows up as a diff rather than as a user
 * noticing the phone and the web app sort one category two different ways.
 */
import { describe, it, expect } from 'vitest';
import {
  effectiveSpendingType, GROUP_ORDER, GROUP_LABELS, UNSORTED_LABEL,
  type GroupableCategory,
} from '../../utils/spendingGroups';

const cat = (id: number, name: string, spending_type: any, parent_id: number | null = null):
  GroupableCategory => ({ id, name, spending_type, parent_id });

const index = (rows: GroupableCategory[]) => new Map(rows.map((r) => [r.id, r]));

describe('spending groups', () => {
  it('orders fixed, then flexible, then non-monthly', () => {
    expect([...GROUP_ORDER]).toEqual(['fixed', 'flexible', 'non_monthly']);
  });

  it('labels non_monthly for humans, not for the database', () => {
    expect(GROUP_LABELS.non_monthly).toBe('Non-Monthly');
    expect(GROUP_LABELS.fixed).toBe('Fixed');
    expect(GROUP_LABELS.flexible).toBe('Flexible');
  });

  it('calls the unclassified section Unsorted', () => {
    expect(UNSORTED_LABEL).toBe('Unsorted');
  });

  it('uses a category own value when it has one', () => {
    const rows = [cat(1, 'Rent/Mortgage', 'fixed')];
    expect(effectiveSpendingType(rows[0], index(rows))).toBe('fixed');
  });

  it('inherits the parent when the child has none', () => {
    const parent = cat(1, 'Food', 'flexible');
    const child = cat(2, 'Groceries', null, 1);
    expect(effectiveSpendingType(child, index([parent, child]))).toBe('flexible');
  });

  it('lets an explicit child value override its parent', () => {
    const parent = cat(1, 'Food', 'flexible');
    const child = cat(2, 'Groceries', 'fixed', 1);
    expect(effectiveSpendingType(child, index([parent, child]))).toBe('fixed');
  });

  it('is null when neither the child nor the parent has one', () => {
    const parent = cat(1, 'Health', null);
    const child = cat(2, 'Fitness', null, 1);
    expect(effectiveSpendingType(child, index([parent, child]))).toBeNull();
  });

  it('is null for an orphan whose parent is missing from the payload', () => {
    // Pagination, a permission filter, or a stale client can produce this.
    const child = cat(2, 'Groceries', null, 99);
    expect(effectiveSpendingType(child, index([child]))).toBeNull();
  });

  it('does not loop forever if a category is its own parent', () => {
    const self = cat(1, 'Broken', null, 1);
    expect(effectiveSpendingType(self, index([self]))).toBeNull();
  });

  it('treats an unknown value from an older client as unsorted, not as a crash', () => {
    const rows = [cat(1, 'Legacy', 'needs' as any)];
    expect(effectiveSpendingType(rows[0], index(rows))).toBeNull();
  });

  it('treats an absent spending_type the same as null', () => {
    // A backend that predates this feature omits the key entirely.
    const row = { id: 1, name: 'Old', parent_id: null } as any;
    expect(effectiveSpendingType(row, index([row]))).toBeNull();
  });

  it('does NOT walk past one level, matching the server rollup', () => {
    // budget.py:72 rolls up exactly one level, so a grandchild inheriting from a
    // grandparent here would disagree with the totals the server computes.
    const grandparent = cat(1, 'Housing', 'fixed');
    const parent = cat(2, 'Utilities', null, 1);
    const child = cat(3, 'Electricity', null, 2);
    const byId = index([grandparent, parent, child]);
    expect(effectiveSpendingType(parent, byId)).toBe('fixed');
    expect(effectiveSpendingType(child, byId)).toBeNull();
  });
});
