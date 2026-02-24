/**
 * SimpleFin Connect Modal
 * Modal for connecting SimpleFin integration
 */

import React, { useState } from 'react';
import { Button } from '../common/Button';
import { X, Link2, CheckCircle, AlertCircle } from 'lucide-react';
import { accountService } from '../../services/accountService';

interface SimpleFinConnectProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const SimpleFinConnect: React.FC<SimpleFinConnectProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [accessUrl, setAccessUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');

  if (!isOpen) return null;

  const handleConnect = async () => {
    if (!accessUrl.trim()) {
      setError('Please enter your SimpleFin access URL');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await accountService.connectSimpleFin(accessUrl);
      setTestStatus('success');

      // Wait a moment to show success state
      setTimeout(() => {
        onSuccess();
        handleClose();
      }, 1000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to connect SimpleFin');
      setTestStatus('error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setAccessUrl('');
    setError(null);
    setTestStatus('idle');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-background-dark border border-gray-800 rounded-2xl p-8 max-w-2xl w-full mx-4 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Link2 className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">Connect SimpleFin</h2>
              <p className="text-gray-400 text-sm">Link your bank accounts automatically</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-lg hover:bg-background-darker transition-colors text-gray-400 hover:text-white"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Instructions */}
        <div className="bg-background-darker/50 border border-gray-800 rounded-xl p-6 mb-6">
          <h3 className="text-white font-semibold mb-3">How to get your SimpleFin Access URL:</h3>
          <ol className="space-y-2 text-gray-400 text-sm list-decimal list-inside">
            <li>Visit SimpleFin's setup token page</li>
            <li>Create a new setup token for finPal</li>
            <li>Copy the access URL provided</li>
            <li>Paste it below to connect your accounts</li>
          </ol>
          <div className="mt-4">
            <a
              href="https://beta-bridge.simplefin.org/simplefin/claim"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:text-primary-light transition-colors text-sm inline-flex items-center gap-2"
            >
              Get SimpleFin Access URL
              <span className="text-xs">↗</span>
            </a>
          </div>
        </div>

        {/* Input */}
        <div className="mb-6">
          <label className="block text-white font-medium mb-2">
            SimpleFin Access URL
          </label>
          <input
            type="text"
            value={accessUrl}
            onChange={(e) => {
              setAccessUrl(e.target.value);
              setError(null);
              setTestStatus('idle');
            }}
            placeholder="https://..."
            className="w-full px-4 py-3 bg-background-darker border border-gray-800 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-primary transition-colors"
            disabled={isLoading}
          />
          {error && (
            <div className="mt-2 flex items-center gap-2 text-red-500 text-sm">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}
          {testStatus === 'success' && (
            <div className="mt-2 flex items-center gap-2 text-green-500 text-sm">
              <CheckCircle className="h-4 w-4" />
              Connection successful!
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={handleClose}
            className="flex-1"
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleConnect}
            className="flex-1"
            disabled={isLoading || !accessUrl.trim()}
          >
            {isLoading ? 'Connecting...' : 'Connect SimpleFin'}
          </Button>
        </div>

        {/* Security Note */}
        <div className="mt-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl">
          <p className="text-blue-400 text-xs">
            <strong>Secure:</strong> Your SimpleFin access URL is encrypted and stored securely.
            We never see your banking credentials.
          </p>
        </div>
      </div>
    </div>
  );
};
