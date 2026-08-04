/**
 * Loading Component
 * Loading spinner with optional text
 *
 * Inline styles with CSS variables. It previously used Tailwind, so the spinner
 * track was a fixed dark grey and the caption was white — invisible on a light
 * background. 8 files import this; the prop signature is unchanged.
 */

import React from 'react';

interface LoadingProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  text?: string;
  fullScreen?: boolean;
}

const SIZES = {
  sm: 24,
  md: 40,
  lg: 64,
  xl: 96,
};

const wrapperStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '16px',
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'var(--overlay-bg)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 50,
};

export const Loading: React.FC<LoadingProps> = ({
  size = 'md',
  text,
  fullScreen = false,
}) => {
  const px = SIZES[size];

  // Two counter-rotating rings. `.animate-spin` is hand-defined in index.css,
  // not a Tailwind utility.
  const ringBase: React.CSSProperties = {
    width: px,
    height: px,
    borderWidth: '4px',
    borderStyle: 'solid',
    borderRadius: '50%',
  };

  const spinner = (
    <div style={wrapperStyle}>
      <div style={{ position: 'relative', width: px, height: px }}>
        <div
          className="animate-spin"
          style={{
            ...ringBase,
            borderColor: 'var(--progress-track)',
            borderTopColor: 'var(--brand-main-green)',
          }}
        />
        <div
          className="animate-spin"
          style={{
            ...ringBase,
            position: 'absolute',
            top: 0,
            left: 0,
            borderColor: 'transparent',
            borderTopColor: 'var(--brand-accent-gold)',
            animationDirection: 'reverse',
            animationDuration: '1.5s',
          }}
        />
      </div>
      {text && (
        <p style={{
          color: 'var(--text-secondary)',
          fontSize: '14px',
          fontWeight: 500,
          margin: 0,
        }}>
          {text}
        </p>
      )}
    </div>
  );

  if (fullScreen) {
    return <div style={overlayStyle}>{spinner}</div>;
  }

  return spinner;
};
