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
}

export const OwnerBadge: React.FC<OwnerBadgeProps> = ({ owner, memberCount, size = 'md' }) => {
  if (memberCount <= 1 || !owner) return null;

  const small = size === 'sm';

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
