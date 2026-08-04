/**
 * Input Component
 * Form input with label and error states
 */

import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  fullWidth?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  helperText,
  fullWidth = false,
  leftIcon,
  rightIcon,
  className = '',
  id,
  ...props
}) => {
  const inputId = id || `input-${Math.random().toString(36).substring(2, 11)}`;

  // Inline styles with CSS variables. Previously Tailwind, so the field had a
  // fixed dark background and white text — unreadable on a light theme. Error
  // red stays literal per CLAUDE.md.
  const iconStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    bottom: 0,
    display: 'flex',
    alignItems: 'center',
    pointerEvents: 'none',
    color: 'var(--text-muted)',
  };

  const inputStyle: React.CSSProperties = {
    display: 'block',
    width: '100%',
    padding: '10px 16px',
    paddingLeft: leftIcon ? '40px' : '16px',
    paddingRight: rightIcon ? '40px' : '16px',
    background: 'var(--input-bg)',
    border: `1px solid ${error ? '#ef4444' : 'var(--input-border)'}`,
    borderRadius: '8px',
    color: 'var(--text-primary)',
    fontSize: '14px',
    transition: 'border-color 0.2s ease',
    boxSizing: 'border-box',
  };

  const messageStyle: React.CSSProperties = {
    marginTop: '6px',
    fontSize: '14px',
  };

  return (
    <div className={className} style={{ width: fullWidth ? '100%' : undefined }}>
      {label && (
        <label
          htmlFor={inputId}
          style={{
            display: 'block',
            fontSize: '14px',
            fontWeight: 500,
            color: 'var(--text-secondary)',
            marginBottom: '6px',
          }}
        >
          {label}
        </label>
      )}
      <div style={{ position: 'relative' }}>
        {leftIcon && <div style={{ ...iconStyle, left: 0, paddingLeft: '12px' }}>{leftIcon}</div>}
        <input
          id={inputId}
          style={inputStyle}
          {...props}
        />
        {rightIcon && <div style={{ ...iconStyle, right: 0, paddingRight: '12px' }}>{rightIcon}</div>}
      </div>
      {error && (
        <p style={{ ...messageStyle, color: '#ef4444' }}>{error}</p>
      )}
      {helperText && !error && (
        <p style={{ ...messageStyle, color: 'var(--text-muted)' }}>{helperText}</p>
      )}
    </div>
  );
};
