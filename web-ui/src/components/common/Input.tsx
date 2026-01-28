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
  const widthClass = fullWidth ? 'w-full' : '';

  return (
    <div className={`${widthClass} ${className}`}>
      {label && (
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-white mb-1.5"
        >
          {label}
        </label>
      )}
      <div className="relative">
        {leftIcon && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
            {leftIcon}
          </div>
        )}
        <input
          id={inputId}
          className={`
            block w-full px-4 py-2.5
            bg-background-dark border rounded-lg
            text-white placeholder-gray-400
            transition-all duration-200
            focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent
            disabled:bg-gray-800 disabled:cursor-not-allowed
            ${error ? 'border-red-500' : 'border-gray-700 hover:border-gray-600'}
            ${leftIcon ? 'pl-10' : ''}
            ${rightIcon ? 'pr-10' : ''}
          `}
          {...props}
        />
        {rightIcon && (
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-gray-400">
            {rightIcon}
          </div>
        )}
      </div>
      {error && (
        <p className="mt-1.5 text-sm text-red-500">{error}</p>
      )}
      {helperText && !error && (
        <p className="mt-1.5 text-sm text-gray-400">{helperText}</p>
      )}
    </div>
  );
};
