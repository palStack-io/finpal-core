import type { GroupBalance } from '../services/api/groups';

/**
 * What you owe and are owed, totalled across groups.
 *
 * *** THIS WAS A RECORDED BLOCKER AND THE FIX WAS AN ID, NOT A CLEVERER STRING
 * MATCH. *** `Groups.tsx` used to render "You Owe" and "You Are Owed" as
 * `const totalOwed = 0` with a "mock for now" comment — a confident $0.00
 * whatever the real balances were — and a previous pass deleted both cards and
 * wrote down why: `/groups/<id>/balances` returned `from`/`to` as display
 * NAMES, and "aggregating them across groups needs a backend change first".
 *
 * It does, and the change was two lines: `calculate_group_balances` already had
 * `debtor_id` and `creditor_id` in scope and emitted only the names. Matching on
 * the name would have been the defect rather than the shortcut — two members of
 * one instance can share a display name, and the client would silently report
 * one person's debt as another's, inside a figure the user is about to settle
 * money from.
 *
 * *** SO A LINE WITH NO IDS IS REFUSED, NOT GUESSED. *** A self-hoster on an
 * older backend gets no total rather than a wrong one, and the caller can say
 * which groups it could not read.
 */
export interface Settlement {
  /** Total you must pay, across every group that could be read. */
  youOwe: number;
  /** Total owed to you. */
  youAreOwed: number;
  /** One entry per payment you owe, so the page can name the people. */
  yourDebts: Array<{ to: string; toId: string; amount: number; groupId: number; groupName: string }>;
  /** Groups whose balances could not be attributed — an older server, or a failed read. */
  unreadable: string[];
}

export interface GroupBalances {
  groupId: number;
  groupName: string;
  /** `null` when the request failed, which is not the same as "no debts". */
  balances: GroupBalance[] | null;
}

export function settlementFor(userId: string | null | undefined, groups: GroupBalances[]): Settlement {
  const out: Settlement = { youOwe: 0, youAreOwed: 0, yourDebts: [], unreadable: [] };
  // Without knowing who you are, nothing here can be attributed at all.
  if (!userId) {
    return { ...out, unreadable: groups.map((g) => g.groupName) };
  }

  for (const group of groups) {
    if (group.balances === null) {
      out.unreadable.push(group.groupName);
      continue;
    }
    // A line missing ids cannot be attributed. One such line makes the whole
    // group's total unsafe, so the group is named rather than partly counted —
    // a half-summed group is a wrong figure with no way to see it is wrong.
    if (group.balances.some((b) => !b.from_id || !b.to_id)) {
      if (group.balances.length) out.unreadable.push(group.groupName);
      continue;
    }
    for (const line of group.balances) {
      if (line.from_id === userId) {
        out.youOwe += line.amount;
        out.yourDebts.push({
          to: line.to, toId: line.to_id as string, amount: line.amount,
          groupId: group.groupId, groupName: group.groupName,
        });
      } else if (line.to_id === userId) {
        out.youAreOwed += line.amount;
      }
    }
  }
  return out;
}

/** How many distinct people you owe, which is what "to two people" is counted from. */
export function peopleYouOwe(settlement: Settlement): number {
  return new Set(settlement.yourDebts.map((d) => d.toId)).size;
}
