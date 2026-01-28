/**
 * Security Tab Component
 * Security settings including sessions, login history, and 2FA
 */

import React, { useState, useEffect } from 'react';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { userService } from '../../services/userService';
import { useToast } from '../../contexts/ToastContext';
import {
  Shield,
  Smartphone,
  Monitor,
  LogOut,
  Clock,
  MapPin,
  Mail,
  Key,
  CheckCircle,
  XCircle,
  AlertTriangle,
} from 'lucide-react';
import type { Session } from '../../types/user';

export const SecurityTab: React.FC = () => {
  const { showToast } = useToast();

  // Sessions state
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);

  // Login history state
  const [loginHistory, setLoginHistory] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // 2FA state
  const [is2FAEnabled, setIs2FAEnabled] = useState(false);

  // Password reset state
  const [resetEmail, setResetEmail] = useState('');
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  useEffect(() => {
    loadSessions();
    loadLoginHistory();
  }, []);

  const loadSessions = async () => {
    setIsLoadingSessions(true);
    try {
      const data = await userService.getSessions();
      setSessions(data);
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to load sessions', 'error');
    } finally {
      setIsLoadingSessions(false);
    }
  };

  const loadLoginHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const data = await userService.getLoginHistory(10);
      setLoginHistory(data);
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to load login history', 'error');
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleTerminateSession = async (sessionId: string) => {
    if (!confirm('Are you sure you want to terminate this session?')) return;

    try {
      await userService.terminateSession(sessionId);
      showToast('Session terminated successfully', 'success');
      loadSessions();
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to terminate session', 'error');
    }
  };

  const handlePasswordReset = async () => {
    if (!resetEmail) {
      showToast('Please enter your email', 'error');
      return;
    }

    setIsResettingPassword(true);
    try {
      await userService.requestPasswordReset(resetEmail);
      showToast('Password reset email sent', 'success');
      setResetEmail('');
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to send reset email', 'error');
    } finally {
      setIsResettingPassword(false);
    }
  };

  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));

    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes} minutes ago`;

    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours} hours ago`;

    const diffInDays = Math.floor(diffInHours / 24);
    return `${diffInDays} days ago`;
  };

  return (
    <div className="space-y-6">
      {/* Password Reset Section */}
      <Card>
        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
          <Key className="h-5 w-5" />
          Password Reset
        </h2>
        <p className="text-gray-400 mb-4">
          Request a password reset link to be sent to your email address
        </p>
        <div className="flex gap-3 max-w-md">
          <input
            type="email"
            value={resetEmail}
            onChange={(e) => setResetEmail(e.target.value)}
            className="flex-1 px-4 py-3 bg-background-darker border border-gray-800 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-primary transition-colors"
            placeholder="Enter your email"
          />
          <Button
            variant="primary"
            onClick={handlePasswordReset}
            isLoading={isResettingPassword}
          >
            <Mail className="h-4 w-4 mr-2" />
            Send Reset Email
          </Button>
        </div>
      </Card>

      {/* Active Sessions */}
      <Card>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Monitor className="h-5 w-5" />
            Active Sessions
          </h2>
          <Button variant="outline" size="sm" onClick={loadSessions} disabled={isLoadingSessions}>
            Refresh
          </Button>
        </div>
        <p className="text-gray-400 mb-4">
          Manage devices and browsers where you're currently logged in
        </p>

        {isLoadingSessions ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          </div>
        ) : sessions.length > 0 ? (
          <div className="space-y-3">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="p-4 bg-background-darker border border-gray-800 rounded-xl"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      {session.current ? (
                        <Monitor className="h-5 w-5 text-primary" />
                      ) : (
                        <Smartphone className="h-5 w-5 text-gray-400" />
                      )}
                      <h3 className="text-white font-semibold">
                        {session.device}
                        {session.current && (
                          <span className="ml-2 px-2 py-0.5 text-xs bg-primary/20 text-primary rounded">
                            Current
                          </span>
                        )}
                      </h3>
                    </div>
                    <div className="space-y-1 text-sm text-gray-400">
                      <p className="flex items-center gap-2">
                        <span className="font-medium">Browser:</span> {session.browser}
                      </p>
                      <p className="flex items-center gap-2">
                        <MapPin className="w-4 h-4" />
                        {session.location}
                        {session.ipAddress && ` (${session.ipAddress})`}
                      </p>
                      <p className="flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        Last active: {formatRelativeTime(session.lastActive)}
                      </p>
                    </div>
                  </div>
                  {!session.current && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleTerminateSession(session.id)}
                      className="text-red-500 border-red-500/30 hover:bg-red-500/10"
                    >
                      <LogOut className="h-4 w-4 mr-1" />
                      Sign Out
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">No active sessions</div>
        )}
      </Card>

      {/* Login History */}
      <Card>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Login History
          </h2>
          <Button variant="outline" size="sm" onClick={loadLoginHistory} disabled={isLoadingHistory}>
            Refresh
          </Button>
        </div>
        <p className="text-gray-400 mb-4">Your recent login activity (last 10 logins)</p>

        {isLoadingHistory ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          </div>
        ) : loginHistory.length > 0 ? (
          <div className="space-y-2">
            {loginHistory.map((login, index) => (
              <div
                key={index}
                className="p-4 bg-background-darker border border-gray-800 rounded-xl flex items-center justify-between"
              >
                <div className="flex items-start gap-3">
                  {login.success ? (
                    <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-500 mt-0.5" />
                  )}
                  <div>
                    <p className="text-white font-medium">
                      {login.success ? 'Successful login' : 'Failed login attempt'}
                    </p>
                    <div className="space-y-1 text-sm text-gray-400 mt-1">
                      <p>
                        {login.device} - {login.browser}
                      </p>
                      <p className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {login.location} ({login.ipAddress})
                      </p>
                    </div>
                  </div>
                </div>
                <div className="text-sm text-gray-400">
                  {new Date(login.timestamp).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">No login history available</div>
        )}
      </Card>

      {/* Two-Factor Authentication */}
      <Card>
        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Two-Factor Authentication
        </h2>
        <p className="text-gray-400 mb-4">
          Add an extra layer of security to your account by requiring a verification code in
          addition to your password
        </p>

        <div className="p-6 bg-background-darker border border-gray-800 rounded-xl">
          <div className="flex items-start gap-4">
            <div
              className={`p-3 rounded-xl ${
                is2FAEnabled ? 'bg-green-500/10' : 'bg-gray-800'
              }`}
            >
              <Shield
                className={`w-6 h-6 ${is2FAEnabled ? 'text-green-500' : 'text-gray-400'}`}
              />
            </div>
            <div className="flex-1">
              <h3 className="text-white font-semibold mb-1">
                {is2FAEnabled ? 'Two-Factor Authentication Enabled' : 'Enable Two-Factor Authentication'}
              </h3>
              <p className="text-gray-400 text-sm mb-4">
                {is2FAEnabled
                  ? 'Your account is protected with two-factor authentication'
                  : 'Protect your account with an authenticator app'}
              </p>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={is2FAEnabled}
                    onChange={(e) => setIs2FAEnabled(e.target.checked)}
                    className="h-5 w-5 rounded border-gray-800 text-primary focus:ring-primary"
                  />
                  <span className="text-white">
                    {is2FAEnabled ? 'Enabled' : 'Disabled'}
                  </span>
                </label>
                <span className="px-2 py-1 bg-yellow-500/10 text-yellow-500 text-xs rounded">
                  Coming Soon
                </span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Security Questions (Future) */}
      <Card>
        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" />
          Security Questions
        </h2>
        <p className="text-gray-400 mb-4">
          Set up security questions to help recover your account if you forget your password
        </p>
        <div className="p-6 bg-background-darker border border-gray-800 rounded-xl text-center">
          <p className="text-gray-500">This feature is coming soon</p>
          <span className="inline-block mt-2 px-3 py-1 bg-yellow-500/10 text-yellow-500 text-sm rounded">
            Future Release
          </span>
        </div>
      </Card>
    </div>
  );
};
