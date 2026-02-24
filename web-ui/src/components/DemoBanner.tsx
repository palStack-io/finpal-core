/**
 * Demo Banner Component
 * Displays a sticky banner for demo users showing countdown and restrictions
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { Clock, AlertCircle, X } from 'lucide-react';
import { useDemoTimer } from '../hooks/useDemoTimer';

interface DemoBannerProps {
  onDismiss?: () => void;
}

export const DemoBanner: React.FC<DemoBannerProps> = ({ onDismiss }) => {
  const { isDemo, formattedTime, remainingSeconds } = useDemoTimer();

  if (!isDemo) {
    return null;
  }

  // Determine urgency level based on remaining time
  const isUrgent = remainingSeconds < 60; // Less than 1 minute
  const isWarning = remainingSeconds < 180 && !isUrgent; // Less than 3 minutes

  const getBannerStyle = () => {
    if (isUrgent) {
      return {
        background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
        borderColor: '#ef4444',
      };
    }
    if (isWarning) {
      return {
        background: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
        borderColor: '#f59e0b',
      };
    }
    return {
      background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
      borderColor: '#3b82f6',
    };
  };

  const style = getBannerStyle();

  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        ...style,
        borderBottom: `1px solid ${style.borderColor}`,
        padding: '0.75rem 1rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        {/* Demo Mode Badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            background: 'rgba(255, 255, 255, 0.15)',
            padding: '0.375rem 0.75rem',
            borderRadius: '9999px',
            fontSize: '0.875rem',
            fontWeight: 600,
            color: '#ffffff',
          }}
        >
          <AlertCircle size={16} />
          Demo Mode
        </div>

        {/* Timer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.375rem',
            color: '#ffffff',
            fontSize: '0.875rem',
          }}
        >
          <Clock size={16} />
          <span>
            Time remaining: <strong>{formattedTime}</strong>
          </span>
        </div>

        {/* Restrictions Note */}
        <div
          style={{
            color: 'rgba(255, 255, 255, 0.9)',
            fontSize: '0.8125rem',
          }}
        >
          CSV import and API settings are disabled
        </div>
      </div>

      {/* Sign Up CTA */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <Link
          to="/register"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '0.5rem 1rem',
            background: 'rgba(255, 255, 255, 0.95)',
            color: '#1e40af',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
            fontWeight: 600,
            textDecoration: 'none',
            transition: 'all 0.2s',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#ffffff';
            e.currentTarget.style.transform = 'translateY(-1px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.95)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          Sign up for free
        </Link>

        {onDismiss && (
          <button
            onClick={onDismiss}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(255, 255, 255, 0.8)',
              cursor: 'pointer',
              padding: '0.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '0.25rem',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#ffffff';
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'rgba(255, 255, 255, 0.8)';
              e.currentTarget.style.background = 'transparent';
            }}
            aria-label="Dismiss banner"
          >
            <X size={18} />
          </button>
        )}
      </div>
    </div>
  );
};

export default DemoBanner;
