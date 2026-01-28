/**
 * Card Component
 * Container card with rounded corners and optional header
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
  const paddingClasses = {
    none: '',
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
  };

  const hoverClass = hover ? 'hover:shadow-xl hover:scale-[1.02] transition-all duration-200' : '';

  return (
    <div
      className={`
        bg-background-dark/80 backdrop-blur-sm
        border border-gray-800
        rounded-2xl shadow-lg
        ${hoverClass}
        ${className}
      `}
    >
      {header && (
        <div className="px-6 py-4 border-b border-gray-800">
          {header}
        </div>
      )}
      <div className={paddingClasses[padding]}>
        {children}
      </div>
      {footer && (
        <div className="px-6 py-4 border-t border-gray-800">
          {footer}
        </div>
      )}
    </div>
  );
};
