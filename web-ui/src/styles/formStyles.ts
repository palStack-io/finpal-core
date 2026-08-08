import React from 'react';

/*
 * `inputStyle` WAS HERE AND IS DELETED — U-03 slice 4.
 *
 * It was a second definition of the same thing as the `.fp-input` CSS class, and
 * the two had drifted on padding: this said `12px 16px`, the class said `12px`.
 * Ten form files used this one and ten other sites used the class, so neither was
 * "the" definition and unifying them was a visual change either way — an owner
 * decision (2026-08-07: `12px 16px`), not something a refactor gets to pick.
 *
 * *** WHY A CLASS AND NOT A SHARED STYLE OBJECT. *** An inline style beats a class
 * rule at ANY specificity, including `:focus`. So an element carrying this object
 * could not take its focus styling from CSS — which is exactly why ten files had
 * hand-rolled `onFocus`/`onBlur` handlers imperatively setting `borderColor` and
 * `background`. The class can express `:focus`; a style object structurally
 * cannot. Nineteen handler spreads and twenty-four inline handlers went with it.
 *
 * Use `className="fp-input"`. Per-element extras still go in `style`.
 */

/** Form field label above an input. */
export const labelStyle: React.CSSProperties = {
  display: 'block',
  color: 'var(--text-primary)',
  fontSize: '14px',
  fontWeight: '600',
  marginBottom: '8px',
};

/** Validation error message below a field. */
export const errorTextStyle: React.CSSProperties = {
  color: 'var(--accent-red)',
  fontSize: '12px',
  marginTop: '4px',
};

/** Section / card used inside modals and slide panels. */
export const formSectionStyle: React.CSSProperties = {
  marginBottom: '20px',
};

/** Select / dropdown — same as inputStyle with pointer cursor. */
export const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 16px',
  background: 'var(--input-bg)',
  border: '1px solid var(--input-border)',
  borderRadius: '8px',
  color: 'var(--text-primary)',
  fontSize: '14px',
  outline: 'none',
  transition: 'all 0.3s',
  cursor: 'pointer',
};

/** Inline icon before a label (display: inline, vertical-align middle). */
export const iconInlineStyle: React.CSSProperties = {
  display: 'inline',
  marginRight: '8px',
  verticalAlign: 'middle',
};

/** Two-column form row with a gap. */
export const formRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '12px',
};

/** Action button row at the bottom of a form (gap + top margin). */
export const formActionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: '12px',
  marginTop: '24px',
};
