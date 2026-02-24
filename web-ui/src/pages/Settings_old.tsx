/**
 * Settings Page
 * User preferences, integrations, and data management
 */

import React, { useState, useEffect } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { useAuthStore } from '../store/authStore';
import { accountService } from '../services/accountService';
import { SimpleFinConnect } from '../components/import/SimpleFinConnect';
import { CSVImportModal } from '../components/import/CSVImportModal';
import {
  User,
  Bell,
  Link2,
  Upload,
  Download,
  Globe,
  Clock,
  Lock,
  Trash2,
  CheckCircle,
  XCircle,
  RefreshCw,
} from 'lucide-react';
import type { SimpleFinStatus } from '../types/simplefin';
import type { Account } from '../services/accountService';

type TabType = 'profile' | 'preferences' | 'integrations' | 'import-export';

export const Settings: React.FC = () => {
  const { user, updateUser } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TabType>('profile');
  const [simpleFinStatus, setSimpleFinStatus] = useState<SimpleFinStatus | null>(null);
  const [isSimpleFinConnectOpen, setIsSimpleFinConnectOpen] = useState(false);
  const [isCSVImportOpen, setIsCSVImportOpen] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Form states
  const [name, setName] = useState(user?.name || '');
  const [currency, setCurrency] = useState(user?.default_currency_code || 'USD');
  const [timezone, setTimezone] = useState(user?.timezone || 'UTC');
  const [notifications, setNotifications] = useState(user?.notifications || {
    email: true,
    push: false,
    budgetAlerts: true,
    transactionAlerts: false,
  });

  useEffect(() => {
    loadSimpleFinStatus();
    loadAccounts();
  }, []);

  const loadSimpleFinStatus = async () => {
    try {
      const status = await accountService.getSimpleFinStatus();
      setSimpleFinStatus(status);
    } catch (error) {
      console.error('Failed to load SimpleFin status:', error);
    }
  };

  const loadAccounts = async () => {
    try {
      const accountsList = await accountService.getAccounts();
      setAccounts(accountsList);
    } catch (error) {
      console.error('Failed to load accounts:', error);
    }
  };

  const handleDisconnectSimpleFin = async () => {
    if (!confirm('Are you sure you want to disconnect SimpleFin?')) return;

    setIsLoading(true);
    try {
      await accountService.disconnectSimpleFin();
      setSimpleFinStatus({ connected: false });
    } catch (error) {
      console.error('Failed to disconnect SimpleFin:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportCSV = async () => {
    try {
      const blob = await accountService.exportTransactionsCSV();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `transactions_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Failed to export CSV:', error);
    }
  };

  const handleSaveProfile = async () => {
    setIsLoading(true);
    try {
      // Update user profile
      // This would call an auth service method to update user
      console.log('Saving profile:', { name });
      // await authService.updateProfile({ name });
      // updateUser({ name });
    } catch (error) {
      console.error('Failed to save profile:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSavePreferences = async () => {
    setIsLoading(true);
    try {
      // Update preferences
      console.log('Saving preferences:', { currency, timezone, notifications });
      // await authService.updatePreferences({ currency, timezone, notifications });
      // updateUser({ default_currency_code: currency, timezone, notifications });
    } catch (error) {
      console.error('Failed to save preferences:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const tabs = [
    { id: 'profile' as TabType, label: 'Profile', icon: <User className="h-5 w-5" /> },
    { id: 'preferences' as TabType, label: 'Preferences', icon: <Globe className="h-5 w-5" /> },
    { id: 'integrations' as TabType, label: 'Integrations', icon: <Link2 className="h-5 w-5" /> },
    { id: 'import-export' as TabType, label: 'Import/Export', icon: <Upload className="h-5 w-5" /> },
  ];

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Settings</h1>
          <p className="text-gray-400">Manage your account and preferences</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-gray-800 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex items-center gap-2 px-6 py-3 font-medium transition-all whitespace-nowrap
                ${activeTab === tab.id
                  ? 'text-white border-b-2 border-primary'
                  : 'text-gray-400 hover:text-white'
                }
              `}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="pb-8">
          {/* Profile Tab */}
          {activeTab === 'profile' && (
            <Card>
              <h2 className="text-xl font-bold text-white mb-6">Profile Information</h2>

              <div className="space-y-6 max-w-2xl">
                <div>
                  <label className="block text-white font-medium mb-2">Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-4 py-3 bg-background-darker border border-gray-800 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-primary transition-colors"
                    placeholder="Your name"
                  />
                </div>

                <div>
                  <label className="block text-white font-medium mb-2">Email</label>
                  <input
                    type="email"
                    value={user?.email || ''}
                    disabled
                    className="w-full px-4 py-3 bg-background-darker border border-gray-800 rounded-xl text-gray-500 cursor-not-allowed"
                  />
                  <p className="text-gray-500 text-sm mt-1">Email cannot be changed</p>
                </div>

                <div>
                  <label className="block text-white font-medium mb-2">Password</label>
                  <Button variant="outline" size="sm">
                    <Lock className="h-4 w-4 mr-2" />
                    Change Password
                  </Button>
                </div>

                <div className="pt-4">
                  <Button
                    variant="primary"
                    onClick={handleSaveProfile}
                    disabled={isLoading}
                  >
                    Save Profile
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* Preferences Tab */}
          {activeTab === 'preferences' && (
            <div className="space-y-6">
              <Card>
                <h2 className="text-xl font-bold text-white mb-6">General Preferences</h2>

                <div className="space-y-6 max-w-2xl">
                  <div>
                    <label className="block text-white font-medium mb-2">
                      <Globe className="h-4 w-4 inline mr-2" />
                      Default Currency
                    </label>
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value as any)}
                      className="w-full px-4 py-3 bg-background-darker border border-gray-800 rounded-xl text-white focus:outline-none focus:border-primary transition-colors"
                    >
                      <option value="USD">USD - US Dollar</option>
                      <option value="EUR">EUR - Euro</option>
                      <option value="GBP">GBP - British Pound</option>
                      <option value="INR">INR - Indian Rupee</option>
                      <option value="CAD">CAD - Canadian Dollar</option>
                      <option value="AUD">AUD - Australian Dollar</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-white font-medium mb-2">
                      <Clock className="h-4 w-4 inline mr-2" />
                      Timezone
                    </label>
                    <select
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className="w-full px-4 py-3 bg-background-darker border border-gray-800 rounded-xl text-white focus:outline-none focus:border-primary transition-colors"
                    >
                      <option value="UTC">UTC</option>
                      <option value="America/New_York">Eastern Time (US)</option>
                      <option value="America/Chicago">Central Time (US)</option>
                      <option value="America/Denver">Mountain Time (US)</option>
                      <option value="America/Los_Angeles">Pacific Time (US)</option>
                      <option value="Europe/London">London</option>
                      <option value="Europe/Paris">Paris</option>
                      <option value="Asia/Kolkata">India</option>
                      <option value="Asia/Tokyo">Tokyo</option>
                    </select>
                  </div>
                </div>
              </Card>

              <Card>
                <h2 className="text-xl font-bold text-white mb-6">
                  <Bell className="h-5 w-5 inline mr-2" />
                  Notifications
                </h2>

                <div className="space-y-4 max-w-2xl">
                  <label className="flex items-center justify-between p-4 bg-background-darker rounded-xl cursor-pointer hover:bg-background-darker/70 transition-colors">
                    <div>
                      <p className="text-white font-medium">Email Notifications</p>
                      <p className="text-gray-400 text-sm">Receive updates via email</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={notifications.email}
                      onChange={(e) => setNotifications({ ...notifications, email: e.target.checked })}
                      className="h-5 w-5 rounded border-gray-800 text-primary focus:ring-primary"
                    />
                  </label>

                  <label className="flex items-center justify-between p-4 bg-background-darker rounded-xl cursor-pointer hover:bg-background-darker/70 transition-colors">
                    <div>
                      <p className="text-white font-medium">Budget Alerts</p>
                      <p className="text-gray-400 text-sm">Get notified when approaching budget limits</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={notifications.budgetAlerts}
                      onChange={(e) => setNotifications({ ...notifications, budgetAlerts: e.target.checked })}
                      className="h-5 w-5 rounded border-gray-800 text-primary focus:ring-primary"
                    />
                  </label>

                  <label className="flex items-center justify-between p-4 bg-background-darker rounded-xl cursor-pointer hover:bg-background-darker/70 transition-colors">
                    <div>
                      <p className="text-white font-medium">Transaction Alerts</p>
                      <p className="text-gray-400 text-sm">Notifications for new transactions</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={notifications.transactionAlerts}
                      onChange={(e) => setNotifications({ ...notifications, transactionAlerts: e.target.checked })}
                      className="h-5 w-5 rounded border-gray-800 text-primary focus:ring-primary"
                    />
                  </label>
                </div>

                <div className="mt-6">
                  <Button
                    variant="primary"
                    onClick={handleSavePreferences}
                    disabled={isLoading}
                  >
                    Save Preferences
                  </Button>
                </div>
              </Card>
            </div>
          )}

          {/* Integrations Tab */}
          {activeTab === 'integrations' && (
            <Card>
              <h2 className="text-xl font-bold text-white mb-6">SimpleFin Integration</h2>

              {simpleFinStatus?.connected ? (
                <div className="space-y-6">
                  <div className="flex items-start gap-4 p-6 bg-green-500/10 border border-green-500/30 rounded-xl">
                    <CheckCircle className="h-6 w-6 text-green-500 mt-1" />
                    <div className="flex-1">
                      <h3 className="text-white font-semibold mb-1">Connected</h3>
                      <p className="text-gray-400 text-sm mb-3">
                        Your SimpleFin account is successfully connected
                      </p>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-gray-500">Last Sync</p>
                          <p className="text-white">
                            {simpleFinStatus.lastSync
                              ? new Date(simpleFinStatus.lastSync).toLocaleString()
                              : 'Never'}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-500">Connected Accounts</p>
                          <p className="text-white">{simpleFinStatus.accountCount || 0}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Sync Frequency</p>
                          <p className="text-white capitalize">
                            {simpleFinStatus.syncFrequency || 'Daily'}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-500">Status</p>
                          <p className="text-white">
                            {simpleFinStatus.enabled ? 'Enabled' : 'Disabled'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <Button variant="outline" onClick={loadSimpleFinStatus}>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Refresh Status
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleDisconnectSimpleFin}
                      disabled={isLoading}
                      className="text-red-500 border-red-500/30 hover:bg-red-500/10"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Disconnect
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex items-start gap-4 p-6 bg-background-darker border border-gray-800 rounded-xl">
                    <XCircle className="h-6 w-6 text-gray-500 mt-1" />
                    <div className="flex-1">
                      <h3 className="text-white font-semibold mb-1">Not Connected</h3>
                      <p className="text-gray-400 text-sm mb-4">
                        Connect SimpleFin to automatically sync your bank transactions
                      </p>
                      <ul className="space-y-2 text-sm text-gray-400 mb-4">
                        <li className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-green-500" />
                          Automatic transaction imports
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-green-500" />
                          Secure bank-level encryption
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-green-500" />
                          Support for 1000+ financial institutions
                        </li>
                      </ul>
                    </div>
                  </div>

                  <Button
                    variant="primary"
                    onClick={() => setIsSimpleFinConnectOpen(true)}
                  >
                    <Link2 className="h-4 w-4 mr-2" />
                    Connect SimpleFin
                  </Button>
                </div>
              )}
            </Card>
          )}

          {/* Import/Export Tab */}
          {activeTab === 'import-export' && (
            <div className="space-y-6">
              <Card>
                <h2 className="text-xl font-bold text-white mb-6">
                  <Upload className="h-5 w-5 inline mr-2" />
                  Import Transactions
                </h2>

                <p className="text-gray-400 mb-6">
                  Import your transaction history from a CSV file
                </p>

                <Button
                  variant="primary"
                  onClick={() => setIsCSVImportOpen(true)}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Import from CSV
                </Button>
              </Card>

              <Card>
                <h2 className="text-xl font-bold text-white mb-6">
                  <Download className="h-5 w-5 inline mr-2" />
                  Export Transactions
                </h2>

                <p className="text-gray-400 mb-6">
                  Download your transaction history as a CSV file
                </p>

                <Button variant="outline" onClick={handleExportCSV}>
                  <Download className="h-4 w-4 mr-2" />
                  Export to CSV
                </Button>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <SimpleFinConnect
        isOpen={isSimpleFinConnectOpen}
        onClose={() => setIsSimpleFinConnectOpen(false)}
        onSuccess={() => {
          loadSimpleFinStatus();
          setIsSimpleFinConnectOpen(false);
        }}
      />

      <CSVImportModal
        isOpen={isCSVImportOpen}
        onClose={() => setIsCSVImportOpen(false)}
        onSuccess={() => {
          setIsCSVImportOpen(false);
          // Reload accounts or transactions if needed
        }}
        accounts={accounts}
      />
    </Layout>
  );
};
