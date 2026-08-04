/**
 * Button Component
 * Modern button with multiple variants
 */

import React from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  fullWidth?: boolean;
  as?: 'button' | 'span';
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  fullWidth = false,
  as: Component = 'button',
  className = '',
  disabled,
  children,
  ...props
}) => {
  // Inline styles with CSS variables. Tailwind could not follow the theme
  // toggle — its config hardcodes background.dark, so a "secondary" button had a
  // fixed dark foreground regardless of theme.
  const SIZES = {
    sm: { padding: '6px 12px', fontSize: '14px' },
    md: { padding: '8px 16px', fontSize: '16px' },
    lg: { padding: '12px 24px', fontSize: '18px' },
  };

  // Semantic accents stay literal per CLAUDE.md, as does `color: 'white'` on a
  // coloured button — both are correct on either theme.
  const VARIANTS: Record<ButtonVariant, React.CSSProperties> = {
    primary: {
      background: 'var(--brand-main-green)',
      color: 'white',
      border: '1px solid transparent',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    },
    secondary: {
      background: 'var(--btn-secondary-bg)',
      color: 'var(--text-primary)',
      border: '1px solid var(--btn-secondary-border)',
    },
    outline: {
      background: 'transparent',
      color: 'var(--brand-main-green)',
      border: '2px solid var(--brand-main-green)',
    },
    danger: {
      background: '#ef4444',
      color: 'white',
      border: '1px solid transparent',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    },
  };

  const isDisabled = disabled || isLoading;

  const style: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    fontWeight: 500,
    borderRadius: '8px',
    cursor: isDisabled ? 'not-allowed' : 'pointer',
    opacity: isDisabled ? 0.5 : 1,
    transition: 'all 0.2s ease',
    width: fullWidth ? '100%' : undefined,
    ...SIZES[size],
    ...VARIANTS[variant],
  };

  return (
    <Component
      className={className}
      style={style}
      {...(Component === 'button' ? { disabled: disabled || isLoading } : {})}
      {...props}
    >
      {isLoading ? (
        <>
          <svg
            className="animate-spin"
            style={{ width: 16, height: 16 }}
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
          Loading...
        </>
      ) : (
        children
      )}
    </Component>
  );
};
