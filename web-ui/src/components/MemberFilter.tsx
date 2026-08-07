import React from 'react';
import { Users } from 'lucide-react';
import type { TeamMember } from '../types/team';

/**
 * Whose transactions to show — the household, or one member.
 *
 * This is what retires D-01's per-figure scope tags on the transactions page. The
 * tags existed because the same screen mixed household-scoped and caller-scoped
 * figures and nothing said which was which; a filter answers the question once,
 * for every figure on the page, so the figures agree by construction instead of
 * being labelled individually.
 *
 * **Renders nothing when the household has one member**, matching the owner badge
 * on the accounts list. A solo user must not be handed a control that filters
 * nothing — it implies other people's money exists somewhere on the screen.
 *
 * The selected value is sent to the server as `member_id`, not applied here. The
 * transactions page loads one page at a time and its three summary cards come from
 * the server's `summary` over the whole filtered set; filtering in the browser
 * would make those cards describe a different set of rows than the list does,
 * which is the exact bug that page was fixed for once already.
 */
export interface MemberFilterProps {
  members: TeamMember[];
  /** `null` means the whole household. */
  value: string | null;
  onChange: (memberId: string | null) => void;
}

const HOUSEHOLD = '__household__';

export const MemberFilter: React.FC<MemberFilterProps> = ({ members, value, onChange }) => {
  if (members.length <= 1) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '200px' }}>
      <Users size={18} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
      <label htmlFor="member-filter" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        Show transactions for
      </label>
      <select
        id="member-filter"
        aria-label="Show transactions for"
        value={value ?? HOUSEHOLD}
        onChange={(e) => onChange(e.target.value === HOUSEHOLD ? null : e.target.value)}
        style={{
          flex: 1,
          padding: '12px 16px',
          background: 'var(--input-bg)',
          border: '1px solid var(--input-border)',
          borderRadius: '8px',
          color: 'var(--text-primary)',
          fontSize: '14px',
          cursor: 'pointer',
        }}
      >
        <option value={HOUSEHOLD}>Everyone in the household</option>
        {members.map((member) => (
          <option key={member.id} value={member.id}>
            {member.name || member.email}
          </option>
        ))}
      </select>
    </div>
  );
};
