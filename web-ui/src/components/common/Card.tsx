/**
 * Card Component
 * Container card with rounded corners and optional header
 *
 * Inline styles with CSS variables. It previously used Tailwind, which hardcodes
 * `background.dark: #111827` with no `data-theme` awareness — so a card could not
 * follow the light/dark toggle, and rendered as a dark block on a light page.
 * The prop signature is unchanged: 7 files import this.
 */

import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  header?: React.ReactNode;
  footer?: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  hover = false,
  padding = 'md',
  header,
  footer,
}) => {
  const paddingValues = {
    none: '0',
    sm: '16px',
    md: '24px',
    lg: '32px',
  };

  // hover is handled by onMouseEnter/onMouseLeave rather than a CSS class,
  // which is the idiom the rest of this app already uses (see
  // components/import/SimpleFinSettings.tsx).
  const baseStyle: React.CSSProperties = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-light)',
    borderRadius: '16px',
    boxShadow: 'var(--card-shadow)',
    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
  };

  const edgeStyle: React.CSSProperties = {
    padding: '16px 24px',
  };

  return (
    <div
      className={className}
      style={baseStyle}
      onMouseEnter={hover ? (e) => {
        e.currentTarget.style.transform = 'scale(1.02)';
        e.currentTarget.style.boxShadow = '0 20px 25px -5px rgba(0, 0, 0, 0.15)';
      } : undefined}
      onMouseLeave={hover ? (e) => {
        e.currentTarget.style.transform = 'scale(1)';
        e.currentTarget.style.boxShadow = 'var(--card-shadow)';
      } : undefined}
    >
      {header && (
        <div style={{ ...edgeStyle, borderBottom: '1px solid var(--border-light)' }}>
          {header}
        </div>
      )}
      <div style={{ padding: paddingValues[padding] }}>
        {children}
      </div>
      {footer && (
        <div style={{ ...edgeStyle, borderTop: '1px solid var(--border-light)' }}>
          {footer}
        </div>
      )}
    </div>
  );
};
