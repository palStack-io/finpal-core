import React, { useState } from 'react';
import { categoriesApi } from '../../services/api/categories';
import {
  GROUP_ORDER, GROUP_LABELS, UNSORTED_LABEL, type SpendingType,
} from '../../utils/spendingGroups';

/**
 * The in-place control that moves a category between Fixed, Flexible and
 * Non-Monthly.
 *
 * *** IT WRITES THROUGH TO `Category.spending_type` AND THEN REFETCHES. *** The
 * server owns the group subtotals and the totals (D-101), so patching local
 * state after a write would create a second place those figures are computed
 * and a second chance for them to disagree with the database. Slower by one
 * round trip, and correct.
 *
 * *** "UNSORTED" IS AN OPTION, NOT AN ABSENCE. *** `null` is a real state, so
 * the user can put a category back into Unsorted deliberately. The boot
 * backfill is guarded against re-defaulting that choice on the next restart.
 *
 * *** A SYSTEM CATEGORY IS CLASSIFIABLE. *** All 147 demo categories carry
 * `is_system=True`, and the API used to refuse every edit to one -- so without
 * the server-side exemption this control would fail on every row of the only
 * instance anyone browses. See AUDIT D-182.
 */

interface Props {
  categoryId: number;
  value: SpendingType | null;
  /** Where the value came from, so an inherited one can say so. */
  inherited?: boolean;
  onChanged: () => void | Promise<void>;
}

const OPTIONS: Array<{ value: SpendingType | null; label: string }> = [
  ...GROUP_ORDER.map((value) => ({ value, label: GROUP_LABELS[value] })),
  { value: null, label: UNSORTED_LABEL },
];

export const SpendingTypeControl: React.FC<Props> = ({
  categoryId, value, inherited = false, onChanged,
}) => {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    // '' is the wire form of null here, because a <select> cannot carry one.
    const next = event.target.value === '' ? null : (event.target.value as SpendingType);
    setSaving(true);
    setError(null);
    try {
      await categoriesApi.update(categoryId, { spending_type: next });
      await onChanged();
    } catch {
      // Named, not swallowed. A control that silently fails to save a
      // classification is worse than one that refuses to offer it.
      setError('Could not save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
      <select
        aria-label="Spending group"
        value={value ?? ''}
        disabled={saving}
        onChange={handleChange}
        onClick={(e) => e.stopPropagation()}
        className="fp-input"
        style={{ padding: '4px 8px', fontSize: '12px', width: 'auto' }}
      >
        {OPTIONS.map((option) => (
          <option key={option.label} value={option.value ?? ''}>
            {option.label}
          </option>
        ))}
      </select>
      {inherited && !error && (
        // *** A DEFAULT IS NEVER PRESENTED AS THE USER'S DECISION (spec §4). ***
        // An inherited value is the parent's, and saying so is the difference
        // between a starting position and a claim about someone's life.
        <span className="fp-hint" style={{ fontSize: '11px' }}>from parent</span>
      )}
      {error && (
        <span style={{ fontSize: '11px', color: 'var(--status-over)' }}>{error}</span>
      )}
    </span>
  );
};

export default SpendingTypeControl;
