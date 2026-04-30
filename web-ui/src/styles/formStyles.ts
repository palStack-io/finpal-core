import React from 'react';

/** Standard text input / select / textarea. */
export const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 16px',
  background: 'var(--input-bg)',
  border: '1px solid var(--input-border)',
  borderRadius: '8px',
  color: 'var(--text-primary)',
  fontSize: '14px',
  outline: 'none',
  transition: 'all 0.3s',
};

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
