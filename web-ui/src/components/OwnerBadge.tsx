import React from 'react';
import type { AccountOwner } from '../services/accountService';

/**
 * Whose money this is.
 *
 * Extracted from `Accounts.tsx`, which grew the first copy in #72. The
 * transactions page needs the identical badge on every row, and two hand-rolled
 * copies of "the member's own colour, their emoji, their name" drift — the colour
 * is the whole point, because it is what lets the same person read the same on
 * every screen without reading the text.
 *
 * **Renders nothing when the household has one member.** With one member the badge
 * always says "you", which is noise on every row of a long list. `memberCount`
 * is required rather than optional so a caller has to decide: defaulting it would
 * silently show badges on a solo user's screen the first time someone forgot.
 */
export interface OwnerBadgeProps {
  owner?: AccountOwner | null;
  memberCount: number;
  /** `sm` for a dense transaction row, `md` for the accounts list. */
  size?: 'sm' | 'md';
  /**
   * CO-owners (B3). Optional and defaulted, so the transactions page -- which has
   * no co-owner data on a row -- keeps its exact current behaviour.
   *
   * *** THIS CHANGES THE LABEL, NOT THE MEANING. *** Attribution is still the
   * primary owner: a charge on a joint card is still that person's spending in
   * every figure the app computes. What "Joint" says is who can manage it and who
   * thinks of it as theirs, which is precisely the presentation half of the
   * co-ownership decision.
   */
  coOwners?: AccountOwner[];
}

export const OwnerBadge: React.FC<OwnerBadgeProps> = ({
  owner, memberCount, size = 'md', coOwners = [],
}) => {
  if (!owner) return null;

  const small = size === 'sm';
  const joint = coOwners.length > 0;
  const everyone = [owner, ...coOwners];

  // *** THE MEMBER-COUNT RULE DOES NOT APPLY TO A JOINT ACCOUNT, AND THE E2E RUN
  // IS WHAT FOUND THAT. *** The single-member rule below is right for the plain
  // owner badge: with one member it always says "you", which is noise on every
  // row. But a CO-OWNED account has two people on it by definition — that is
  // what the row is telling you — so suppressing "Joint" because
  // `teamService.getMembers()` returned one name hides the entire presentation
  // half of the co-ownership feature.
  //
  // It bit on the demo, where `/team/members` is caller-scoped for a demo user:
  // the account was genuinely co-owned, the API said so, and the badge rendered
  // nothing. No unit test could see it, because every one of them passes
  // `memberCount` by hand.
  if (!joint && memberCount <= 1) return null;

  if (joint) {
    return (
      <span
        title={`Jointly owned by ${everyone.map((o) => o.name).join(' and ')}. `
          + `Spending on it is still attributed to ${owner.name}.`}
        style={{
          padding: small ? '1px 8px' : '2px 10px',
          borderRadius: '9999px',
          fontSize: small ? '11px' : '12px',
          fontWeight: 600,
          whiteSpace: 'nowrap',
          // The PRIMARY owner's colour, not a new one. The colour is how the same
          // person reads the same on every screen without reading the text, and a
          // joint account still has one attribution.
          color: owner.color || 'var(--text-secondary)',
          background: 'var(--surface-hover)',
          border: '1px solid var(--border-light)',
        }}
      >
        Joint · {everyone.map((o) => o.name).join(' & ')}
      </span>
    );
  }

  return (
    <span
      title={`This is ${owner.name}'s money`}
      style={{
        padding: small ? '1px 8px' : '2px 10px',
        borderRadius: '9999px',
        fontSize: small ? '11px' : '12px',
        fontWeight: 600,
        whiteSpace: 'nowrap',
        color: owner.color || 'var(--text-secondary)',
        background: 'var(--surface-hover)',
        border: '1px solid var(--border-light)',
      }}
    >
      {owner.emoji ? `${owner.emoji} ` : ''}
      {owner.name}
    </span>
  );
};
