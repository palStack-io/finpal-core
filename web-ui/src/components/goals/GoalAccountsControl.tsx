import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { goalService } from '../../services/goalService';
import { formatMoney } from '../../styles/money';
import { apiErrorMessage } from '../../utils/apiError';
import { canUnlinkAccounts } from '../../utils/goalTracking';
import type { Account } from '../../services/accountService';
import type { Goal } from '../../types/goal';

/**
 * Add and remove the accounts one goal reads (B12).
 *
 * The same interaction, and deliberately the same copy, as mobile's
 * `GoalAccountsControl` — a household should not have to learn two.
 *
 * *** ADDING AN ACCOUNT MOVES THE PERCENTAGE, AND THE COPY HAS TO SAY SO. ***
 * This is the one operation the single-account model flatly refused. It is safe
 * now only because the server snapshots the new account's balance AT THE MOMENT
 * IT JOINS and stores it per link: the goal visibly gets bigger, and the bar
 * moves for a reason that can be named, instead of a percentage being silently
 * restated. A user who is not told that reads the jump as a bug.
 *
 * *** THE REMOVE CONTROL IS HIDDEN ON A SINGLE-ACCOUNT GOAL RATHER THAN SHOWN
 * AND REFUSED. *** The server always answers 400 for the last link — removing it
 * is a conversion to a manual goal, not an unlink — so the button could only
 * ever fail, which is D-172's shape. `canUnlinkAccounts` is the shared rule and
 * both clients test it against the same case table.
 *
 * *** IT DOES NOT PRE-FILTER THE ADDABLE LIST BY DIRECTION. *** A goal may not
 * mix accounts being paid down with accounts being built up, and the temptation
 * is to hide the ones that would be refused. That would be this client deciding
 * a rule the server owns, from `balance` — today's number — while the server
 * compares SNAPSHOTS. The two disagree the moment a card is paid off, and a
 * client that guesses wrong hides an account the user is allowed to add. The
 * server's refusal names both sides and is rendered verbatim.
 */

export interface GoalAccountsControlProps {
  goal: Goal;
  /** Every account the caller can see. The server re-checks visibility. */
  accounts: Account[];
  /** Refetch, rather than patching local state: the server owns these figures. */
  onChanged: () => void | Promise<void>;
}

const linkButtonStyle: React.CSSProperties = {
  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
  color: 'var(--accent-primary)', fontSize: '13px', fontWeight: 600,
};

const hintStyle: React.CSSProperties = {
  color: 'var(--text-muted)', fontSize: '13px', margin: '8px 0 0',
};

const chipStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 8,
  padding: '4px 10px', borderRadius: 999,
  border: '1px solid var(--border-color)', background: 'var(--bg-primary)',
  color: 'var(--text-primary)', fontSize: '13px',
};

const addButtonStyle: React.CSSProperties = {
  padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
  border: '1px solid var(--border-color)', background: 'var(--bg-primary)',
  color: 'var(--text-primary)', fontSize: '13px', textAlign: 'left',
};

export const GoalAccountsControl: React.FC<GoalAccountsControlProps> = ({
  goal, accounts, onChanged,
}) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const linked = goal.accounts ?? [];
  const linkedIds = new Set(linked.map((link) => link.id));
  const addable = accounts.filter((account) => !linkedIds.has(account.id));
  const removable = canUnlinkAccounts(goal);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await onChanged();
    } catch (err) {
      // *** `apiErrorMessage` READS THE SERVER'S `error` KEY, AND THAT IS THE
      // WHOLE POINT HERE. *** The server names the accounts that disagree in
      // direction, or the goal already holding the card. An Axios rejection's
      // own `message` is "Request failed with status code 400", so reaching for
      // it would discard the one sentence a user can act on.
      setError(apiErrorMessage(err, 'Could not change the accounts on this goal.'));
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <div style={{ marginBottom: 8 }}>
        <button type="button" style={linkButtonStyle} onClick={() => setOpen(true)}>
          {linked.length > 1 ? 'Manage accounts' : 'Add another account'}
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        marginBottom: 12, paddingBottom: 12,
        borderBottom: '1px solid var(--border-color)',
      }}
    >
      <p style={{ ...hintStyle, marginTop: 0 }}>
        {/* The sentence that makes the moving bar legible. Same wording on mobile. */}
        Adding an account counts its balance from today, so this goal gets bigger
        and the percentage moves. Everything already saved still counts.
      </p>

      {linked.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          {linked.map((link) => (
            <span key={link.id} style={chipStyle}>
              {link.name}
              {/* What THIS account brought to the denominator. Shown, never used
                  to derive anything: the percentage is the server's (D-101). */}
              <span style={{ color: 'var(--text-muted)' }}>
                {` from ${formatMoney(link.start_amount, { currency: goal.currency_code })}`}
              </span>
              {removable && (
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`Remove ${link.name} from ${goal.name}`}
                  onClick={() => run(() => goalService.removeGoalAccount(goal.id, link.id))}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                    color: 'var(--text-muted)', fontSize: '13px', fontWeight: 700,
                  }}
                >
                  ✕
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {!removable && linked.length === 1 && (
        <p style={hintStyle}>
          {/* Says why there is no ✕, rather than leaving a control missing with
              no explanation. Archiving is the real answer, and it is a route. */}
          {`A goal keeps at least one account. To stop tracking ${linked[0].name}, archive this goal instead.`}
        </p>
      )}

      {addable.length > 0 ? (
        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          {addable.map((account) => (
            <button
              key={account.id}
              type="button"
              disabled={busy}
              aria-label={`Add ${account.name} to ${goal.name}`}
              onClick={() => run(() => goalService.addGoalAccount(goal.id, account.id))}
              style={addButtonStyle}
            >
              {`+ ${account.name}`}
            </button>
          ))}
        </div>
      ) : (
        <p style={hintStyle}>This goal already reads every account you have.</p>
      )}

      {error !== null && (
        <p style={{ ...hintStyle, color: 'var(--error-color, #ef4444)' }} role="alert">
          {error}
        </p>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
        {busy && <Loader2 size={14} className="animate-spin" />}
        <button type="button" style={linkButtonStyle} onClick={() => setOpen(false)}>
          Done
        </button>
      </div>
    </div>
  );
};

export default GoalAccountsControl;
