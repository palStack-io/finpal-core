import React, { useState } from 'react';

/**
 * Two windows to compare, picked by hand.
 *
 * *** THE PRESETS ARE ROLLING AND THESE ARE NOT — THAT IS THE WHOLE REASON
 * IT EXISTS. *** `windowsFor` answers "the last 30 days against the 30
 * before", which cannot express "March against September". Owner, 2026-09-19:
 * *"we dont have manual data pickers for comparition on the analysis"*.
 *
 * *** IT APPLIES ON SUBMIT, NOT ON EVERY KEYSTROKE. *** A date input emits a
 * value on the way to being typed — `2026-0` is a valid change event — so
 * fetching per keystroke fires a request per digit AND briefly asks the server
 * about the year 2026-01-01 when the user meant September. A form with an
 * explicit Compare also gives the keyboard a natural submit.
 */
export const ComparePicker: React.FC<{
  busy: boolean;
  active: boolean;
  onApply: (a: { start: string; end: string }, b: { start: string; end: string }) => void;
  onReset: () => void;
}> = ({ busy, active, onApply, onReset }) => {
  const [aStart, setAStart] = useState('');
  const [aEnd, setAEnd] = useState('');
  const [bStart, setBStart] = useState('');
  const [bEnd, setBEnd] = useState('');

  const complete = aStart && aEnd && bStart && bEnd;
  /* Refused rather than silently swapped: a reversed range is as likely to be
     the wrong date typed as the right dates in the wrong order, and the server
     refuses it too (`end_date must not precede start_date`). */
  const reversed = (aStart && aEnd && aEnd < aStart) || (bStart && bEnd && bEnd < bStart);

  const field = (label: string, value: string, set: (v: string) => void) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span className="fp-hint" style={{ fontSize: 11.5 }}>{label}</span>
      <input
        type="date" className="fp-input" value={value}
        onChange={(e) => set(e.target.value)}
        style={{ padding: '6px 9px', fontSize: 13 }}
      />
    </label>
  );

  return (
    <form
      data-testid="compare-picker"
      onSubmit={(e) => {
        e.preventDefault();
        if (!complete || reversed) return;
        onApply({ start: aStart, end: aEnd }, { start: bStart, end: bEnd });
      }}
      style={{
        display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end',
        padding: '12px 0 14px', borderBottom: '1px solid var(--border-light)',
        marginBottom: 14,
      }}
    >
      {/* *** EACH LABEL IS UNIQUE, INCLUDING THE TWO "to"s. *** Two fields
          both called "to" are announced identically, so a screen-reader user
          tabbing through has four date inputs and two of them are the same
          word. Found by a test that could not tell them apart either. */}
      {field('Period A from', aStart, setAStart)}
      {field('Period A to', aEnd, setAEnd)}
      {field('Period B from', bStart, setBStart)}
      {field('Period B to', bEnd, setBEnd)}

      <button
        type="submit"
        disabled={!complete || !!reversed || busy}
        style={{
          padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
          border: '1px solid var(--border-medium)',
          background: 'transparent',
          color: complete && !reversed ? 'var(--g-ink)' : 'var(--text-secondary)',
          cursor: complete && !reversed && !busy ? 'pointer' : 'not-allowed',
        }}
      >
        {busy ? 'Comparing…' : 'Compare'}
      </button>

      {active && (
        <button
          type="button" onClick={onReset}
          style={{
            padding: '7px 10px', border: 0, background: 'none', fontSize: 13,
            color: 'var(--text-secondary)', cursor: 'pointer',
          }}
        >
          Back to presets
        </button>
      )}

      {reversed && (
        <p role="alert" className="fp-hint" style={{ margin: 0, flexBasis: '100%' }}>
          A period cannot end before it starts.
        </p>
      )}
    </form>
  );
};
