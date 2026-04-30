import React from 'react';

/** Flex row, items centered, gap 8px. */
export const flexRowGap8: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
};

/** Flex row, items centered, gap 12px. */
export const flexRowGap12: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
};

/** Flex row, items centered, space-between. */
export const flexRowBetween: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

/** Flex column, gap 12px. */
export const flexColGap12: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
};

/** Flex column, gap 16px. */
export const flexColGap16: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
};

/** Flex column, gap 20px. */
export const flexColGap20: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '20px',
};

/** Section header row: flex, center, space-between, bottom margin 24px. */
export const sectionHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: '24px',
};

/** Page container: full viewport height, 24px padding. */
export const pageContainerStyle: React.CSSProperties = {
  minHeight: '100vh',
  padding: '24px',
};

/** Page content max-width wrapper. */
export const pageMaxWidthStyle: React.CSSProperties = {
  margin: '0 auto',
  maxWidth: '1400px',
};

/** Standard card container (matches .fp-card CSS class). */
export const cardStyle: React.CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border-light)',
  borderRadius: '12px',
  boxShadow: 'var(--card-shadow)',
};

/** Table with full width and collapsed borders. */
export const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
};
