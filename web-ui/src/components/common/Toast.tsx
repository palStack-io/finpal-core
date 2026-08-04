/**
 * Toast Component
 * Toast notification display
 */

import React, { useEffect } from 'react';
import { useToast, Toast as ToastType } from '../../contexts/ToastContext';
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useToast();

  return (
    <div style={{
      position: 'fixed', top: '16px', right: '16px', zIndex: 50,
      display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '448px',
    }}>
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
      ))}
    </div>
  );
};

interface ToastProps {
  toast: ToastType;
  onClose: () => void;
}

const Toast: React.FC<ToastProps> = ({ toast, onClose }) => {
  useEffect(() => {
    if (toast.duration && toast.duration > 0) {
      const timer = setTimeout(() => {
        onClose();
      }, toast.duration);
      return () => clearTimeout(timer);
    }
  }, [toast.duration, onClose]);

  const icons = {
    // Semantic accents stay literal per CLAUDE.md — they read on both themes.
    success: <CheckCircle size={20} style={{ color: '#22c55e' }} />,
    error: <XCircle size={20} style={{ color: '#ef4444' }} />,
    warning: <AlertCircle size={20} style={{ color: '#f59e0b' }} />,
    info: <Info size={20} style={{ color: '#3b82f6' }} />,
  };

  // Tinted background per type, in the tint/border pairing the rest of the app
  // uses (see components/import/SimpleFinSettings.tsx).
  const TINTS = {
    success: '34, 197, 94',
    error: '239, 68, 68',
    warning: '245, 158, 11',
    info: '59, 130, 246',
  };
  const rgb = TINTS[toast.type];

  return (
    <div
      className="animate-in slide-in-from-right"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        padding: '16px',
        borderRadius: '8px',
        background: `rgba(${rgb}, 0.1)`,
        border: `1px solid rgba(${rgb}, 0.3)`,
        backdropFilter: 'blur(4px)',
        boxShadow: 'var(--card-shadow)',
      }}
    >
      <div style={{ flexShrink: 0, marginTop: '2px' }}>{icons[toast.type]}</div>
      <p style={{
        flex: 1, fontSize: '14px', fontWeight: 500,
        color: 'var(--text-primary)', margin: 0,
      }}>
        {toast.message}
      </p>
      <button
        onClick={onClose}
        aria-label="Dismiss notification"
        style={{
          flexShrink: 0, background: 'transparent', border: 'none',
          color: 'var(--text-muted)', cursor: 'pointer', padding: 0,
          display: 'flex', alignItems: 'center',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
      >
        <X size={16} />
      </button>
    </div>
  );
};
