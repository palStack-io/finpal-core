import React, { useState } from 'react';
import { UserPlus, X } from 'lucide-react';
import { accountService, type AccountOwner } from '../../services/accountService';
import type { TeamMember } from '../../types/team';
import { apiErrorMessage } from '../../utils/apiError';

/**
 * Add and remove co-owners on one account (B3).
 *
 * *** THIS GRANTS PERMISSION AND CHANGES A LABEL. IT DOES NOT MOVE MONEY. ***
 * Attribution stays with the primary owner: a charge on a joint card is still
 * that person's spending in every figure the app computes, historically and from
 * now on. The copy says so, because "co-owner" would otherwise read as "we split
 * this", and a user who believed that would be looking at dashboard figures that
 * disagree with what they think they set up.
 *
 * Rendered only when the household has more than one member -- the caller checks
 * that. With one member the picker has no valid option, and an affordance that
 * cannot do anything is the shape D-18 exists to remove.
 */

interface AccountRow {
  id: number;
  ownerId: string;
  owners: AccountOwner[];
}

export interface CoOwnerControlProps {
  account: AccountRow;
  members: TeamMember[];
  /** Refetch, rather than patch local state: the server owns this list. */
  onChanged: () => void | Promise<void>;
  onError: (message: string) => void;
}

const chipStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '2px 6px 2px 10px', borderRadius: 9999, fontSize: 12,
  background: 'var(--surface-hover)', border: '1px solid var(--border-light)',
  color: 'var(--text-secondary)',
};

export const CoOwnerControl: React.FC<CoOwnerControlProps> = ({
  account, members, onChanged, onError,
}) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const coOwnerIds = new Set(account.owners.map((o) => o.id));
  // The primary owner is excluded: the server refuses them as their own co-owner,
  // and offering the option would be an affordance that answers 400.
  const addable = members.filter(
    (m) => m.id !== account.ownerId && !coOwnerIds.has(m.id),
  );

  const run = async (action: () => Promise<unknown>, fallback: string) => {
    setBusy(true);
    try {
      await action();
      await onChanged();
    } catch (err) {
      onError(apiErrorMessage(err, fallback));
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8,
          padding: 0, background: 'none', border: 'none', cursor: 'pointer',
          // `--g-ink` themes (#166534 / #5fce8b); `--brand-main-green` does not and
          // measures 3.22:1 on the dark surface. Measure a colour, never match it.
          color: 'var(--g-ink)', fontSize: 12,
        }}
      >
        <UserPlus size={13} />
        {account.owners.length > 0 ? 'Manage co-owners' : 'Share this account'}
      </button>
    );
  }

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        marginTop: 10, padding: 12, borderRadius: 10,
        background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
      }}
    >
      <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--text-muted)' }}>
        Co-owners can rename, edit and close this account, and it will read as
        joint. Spending on it is still counted as the primary owner’s.
      </p>

      {account.owners.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {account.owners.map((owner) => (
            <span key={owner.id} style={chipStyle}>
              {owner.name}
              <button
                type="button"
                disabled={busy}
                aria-label={`Remove ${owner.name} as a co-owner`}
                onClick={() => run(
                  () => accountService.removeCoOwner(account.id, owner.id),
                  'Could not remove that co-owner.',
                )}
                style={{
                  display: 'flex', padding: 2, background: 'none', border: 'none',
                  cursor: 'pointer', color: 'var(--text-muted)',
                }}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      {addable.length > 0 ? (
        <select
          className="fp-input"
          value=""
          disabled={busy}
          aria-label="Add a co-owner"
          onChange={(e) => {
            const userId = e.target.value;
            if (!userId) return;
            void run(
              () => accountService.addCoOwner(account.id, userId),
              'Could not add that co-owner.',
            );
          }}
        >
          <option value="">Add someone…</option>
          {addable.map((member) => (
            <option key={member.id} value={member.id}>{member.name}</option>
          ))}
        </select>
      ) : (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
          Everyone in your household already owns this account.
        </p>
      )}

      <button
        type="button"
        onClick={() => setOpen(false)}
        style={{
          marginTop: 8, padding: 0, background: 'none', border: 'none',
          cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12,
        }}
      >
        Done
      </button>
    </div>
  );
};

export default CoOwnerControl;
