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
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-md">
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
    success: <CheckCircle className="h-5 w-5 text-green-500" />,
    error: <XCircle className="h-5 w-5 text-red-500" />,
    warning: <AlertCircle className="h-5 w-5 text-yellow-500" />,
    info: <Info className="h-5 w-5 text-blue-500" />,
  };

  const bgColors = {
    success: 'bg-green-500/10 border-green-500/50',
    error: 'bg-red-500/10 border-red-500/50',
    warning: 'bg-yellow-500/10 border-yellow-500/50',
    info: 'bg-blue-500/10 border-blue-500/50',
  };

  return (
    <div
      className={`
        flex items-start gap-3 p-4 rounded-lg border backdrop-blur-sm
        bg-background-dark/95 shadow-xl
        ${bgColors[toast.type]}
        animate-in slide-in-from-right duration-300
      `}
    >
      <div className="flex-shrink-0 mt-0.5">{icons[toast.type]}</div>
      <p className="flex-1 text-sm text-white font-medium">{toast.message}</p>
      <button
        onClick={onClose}
        className="flex-shrink-0 text-gray-400 hover:text-white transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};
