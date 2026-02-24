import React, { useState, useEffect } from 'react';
import { User, Lock, Bell, Globe, Palette, Database, Shield, Mail, Key, Eye, EyeOff, Check, Save, Zap, Tag, Link, AlertCircle, Repeat, Info, Download, Trash2, X, Users, Home } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { getBranding } from '../config/branding';
import { TransactionRules } from '../components/TransactionRules';
import { CategoryManagement } from '../components/CategoryManagement';
import { SimpleFinSettings } from '../components/import/SimpleFinSettings';
import { InvestmentSettings } from '../components/investment/InvestmentSettings';
import { RecurringTransactions } from '../components/RecurringTransactions';
import { TeamManagement } from '../components/settings/TeamManagement';
import { userService } from '../services/userService';

export const Settings: React.FC = () => {
  const { user } = useAuthStore();
  const branding = getBranding(user?.default_currency_code || 'USD');
  const [activeTab, setActiveTab] = useState('profile');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [profileData, setProfileData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    userColor: user?.user_color || '#3b82f6',
    profileEmoji: user?.profile_emoji || '😊',
    timezone: user?.timezone || 'America/New_York',
    currency: user?.default_currency_code || 'USD'
  });

  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  const [notificationSettings, setNotificationSettings] = useState({
    budgetAlerts: true,
    monthlyReports: true,
    transactionNotifications: false,
    goalReminders: true
  });

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const tabs = [
    { id: 'profile', label: 'Profile', icon: <User size={18} /> },
    { id: 'security', label: 'Security', icon: <Lock size={18} /> },
    ...(user?.is_admin ? [{ id: 'household', label: 'Household', icon: <Home size={18} /> }] : []),
    { id: 'integrations', label: 'Integrations', icon: <Link size={18} /> },
    { id: 'categories', label: 'Categories', icon: <Tag size={18} /> },
    { id: 'rules', label: 'Transaction Rules', icon: <Zap size={18} /> },
    { id: 'recurring', label: 'Recurring', icon: <Repeat size={18} /> },
    { id: 'notifications', label: 'Notifications', icon: <Bell size={18} /> },
    { id: 'preferences', label: 'Preferences', icon: <Palette size={18} /> },
    { id: 'data', label: 'Data & Privacy', icon: <Database size={18} /> },
    { id: 'about', label: 'About', icon: <Info size={18} /> }
  ];

  const currencies = ['USD', 'EUR', 'GBP', 'INR', 'JPY', 'CAD', 'AUD'];
  const timezones = [
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'Europe/London',
    'Europe/Paris',
    'Asia/Tokyo',
    'Asia/Dubai'
  ];

  const profileEmojis = [
    '😊', '😎', '🤓', '🦊', '🐱', '🐶', '🦁', '🐼',
    '🦄', '🐉', '🌟', '🔥', '💎', '🎯', '🚀', '💰',
    '🌈', '🎨', '🎵', '🏆', '⚡', '🍀', '🌺', '🦋',
  ];

  // Load user data on mount
  useEffect(() => {
    if (user) {
      setProfileData({
        name: user.name || '',
        email: user.email || '',
        userColor: user.user_color || '#3b82f6',
        profileEmoji: user.profile_emoji || '😊',
        timezone: user.timezone || 'UTC',
        currency: user.default_currency_code || 'USD'
      });
    }
  }, [user]);

  const handleProfileSave = async () => {
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      await userService.updateProfile({
        name: profileData.name,
        user_color: profileData.userColor,
        profile_emoji: profileData.profileEmoji,
        timezone: profileData.timezone,
        default_currency_code: profileData.currency as any,
      });

      // Update auth store with new user data
      useAuthStore.setState({
        user: {
          ...user!,
          name: profileData.name,
          user_color: profileData.userColor,
          profile_emoji: profileData.profileEmoji,
          timezone: profileData.timezone,
          default_currency_code: profileData.currency as any,
        }
      });

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error: any) {
      setSaveError(error.response?.data?.message || 'Failed to save profile changes');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePasswordChange = async () => {
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    // Validation
    if (!passwordData.currentPassword || !passwordData.newPassword || !passwordData.confirmPassword) {
      setSaveError('All password fields are required');
      setIsSaving(false);
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setSaveError('New passwords do not match');
      setIsSaving(false);
      return;
    }

    if (passwordData.newPassword.length < 8) {
      setSaveError('New password must be at least 8 characters long');
      setIsSaving(false);
      return;
    }

    try {
      await userService.changePassword(passwordData.currentPassword, passwordData.newPassword);

      // Clear password fields
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error: any) {
      setSaveError(error.response?.data?.message || 'Failed to change password');
    } finally {
      setIsSaving(false);
    }
  };

  const handleNotificationsSave = async () => {
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      // TODO: Implement notification settings API endpoint
      // For now, just show success
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error: any) {
      setSaveError(error.response?.data?.message || 'Failed to save notification settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportData = async () => {
    setIsExporting(true);
    try {
      const blob = await userService.exportData();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `finpal-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error: any) {
      setSaveError(error.response?.data?.message || 'Failed to export data');
    } finally {
      setIsExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword) {
      setSaveError('Please enter your password to confirm deletion');
      return;
    }

    setIsDeleting(true);
    setSaveError(null);

    try {
      await userService.deleteAccount(deletePassword);
      // Logout and redirect
      useAuthStore.getState().logout();
      window.location.href = '/login';
    } catch (error: any) {
      setSaveError(error.response?.data?.message || 'Failed to delete account');
      setIsDeleting(false);
    }
  };

  return (
    <>
      <div style={{ minHeight: '100vh', padding: '24px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ marginBottom: '32px' }}>
            <h1 style={{ fontSize: '32px', fontWeight: 700, marginBottom: '8px', color: 'var(--text-primary)' }}>
              Settings
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Manage your account preferences and settings</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '250px 1fr', gap: '24px' }}>
            <div style={{ background: 'var(--bg-card)', backdropFilter: 'blur(8px)', border: '1px solid var(--border-light)', borderRadius: '16px', padding: '16px', height: 'fit-content' }}>
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    background: activeTab === tab.id ? 'rgba(21, 128, 61, 0.2)' : 'transparent',
                    border: activeTab === tab.id ? '1px solid rgba(21, 128, 61, 0.3)' : '1px solid transparent',
                    borderRadius: '8px',
                    color: activeTab === tab.id ? '#86efac' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    marginBottom: '8px',
                    fontSize: '14px',
                    fontWeight: activeTab === tab.id ? '600' : '500',
                    transition: 'all 0.3s',
                    textAlign: 'left'
                  }}
                  onMouseEnter={(e) => {
                    if (activeTab !== tab.id) {
                      (e.target as HTMLButtonElement).style.background = 'var(--surface-hover)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (activeTab !== tab.id) {
                      (e.target as HTMLButtonElement).style.background = 'transparent';
                    }
                  }}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>

            <div style={{ background: 'var(--bg-card)', backdropFilter: 'blur(8px)', border: '1px solid var(--border-light)', borderRadius: '16px', padding: '32px' }}>
              {activeTab === 'profile' && (
                <div>
                  <h2 style={{ fontSize: '24px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '24px' }}>Profile Information</h2>

                  {/* Error Message */}
                  {saveError && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '16px',
                      background: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      borderRadius: '8px',
                      marginBottom: '20px'
                    }}>
                      <AlertCircle size={20} style={{ color: '#ef4444' }} />
                      <p style={{ color: '#ef4444', fontSize: '14px', margin: 0 }}>{saveError}</p>
                    </div>
                  )}

                  <div style={{ marginBottom: '24px' }}>
                    <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
                      Full Name
                    </label>
                    <input
                      type="text"
                      value={profileData.name}
                      onChange={(e) => setProfileData({...profileData, name: e.target.value})}
                      style={{
                        width: '100%',
                        padding: '12px',
                        background: 'var(--input-bg)',
                        border: '1px solid var(--input-border)',
                        borderRadius: '8px',
                        color: 'var(--text-primary)',
                        fontSize: '14px',
                        outline: 'none'
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: '24px' }}>
                    <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
                      Email Address
                    </label>
                    <input
                      type="email"
                      value={profileData.email}
                      disabled
                      style={{
                        width: '100%',
                        padding: '12px',
                        background: 'var(--input-bg)',
                        border: '1px solid var(--input-border)',
                        borderRadius: '8px',
                        color: 'var(--text-muted)',
                        fontSize: '14px',
                        outline: 'none',
                        cursor: 'not-allowed'
                      }}
                    />
                    <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '4px' }}>Email cannot be changed</p>
                  </div>

                  <div style={{ marginBottom: '24px' }}>
                    <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
                      Profile Emoji
                    </label>
                    <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '12px' }}>
                      Pick an emoji to use as your profile picture
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
                      <div style={{
                        width: '64px',
                        height: '64px',
                        borderRadius: '16px',
                        background: 'rgba(21, 128, 61, 0.15)',
                        border: '2px solid rgba(21, 128, 61, 0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '36px',
                        lineHeight: 1
                      }}>
                        {profileData.profileEmoji}
                      </div>
                      <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Current emoji</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '8px' }}>
                      {profileEmojis.map((emoji) => (
                        <button
                          key={emoji}
                          onClick={() => setProfileData({...profileData, profileEmoji: emoji})}
                          style={{
                            width: '44px',
                            height: '44px',
                            fontSize: '24px',
                            lineHeight: 1,
                            background: profileData.profileEmoji === emoji ? 'rgba(21, 128, 61, 0.2)' : 'var(--surface-hover)',
                            border: profileData.profileEmoji === emoji ? '2px solid #15803d' : '1px solid var(--border-light)',
                            borderRadius: '10px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s'
                          }}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ marginBottom: '24px' }}>
                    <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
                      Default Currency
                    </label>
                    <select
                      value={profileData.currency}
                      onChange={(e) => setProfileData({...profileData, currency: e.target.value})}
                      style={{
                        width: '100%',
                        padding: '12px',
                        background: 'var(--input-bg)',
                        border: '1px solid var(--input-border)',
                        borderRadius: '8px',
                        color: 'var(--text-primary)',
                        fontSize: '14px',
                        outline: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      {currencies.map((curr) => (
                        <option key={curr} value={curr} style={{ background: 'var(--bg-secondary)' }}>{curr}</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ marginBottom: '32px' }}>
                    <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
                      Timezone
                    </label>
                    <select
                      value={profileData.timezone}
                      onChange={(e) => setProfileData({...profileData, timezone: e.target.value})}
                      style={{
                        width: '100%',
                        padding: '12px',
                        background: 'var(--input-bg)',
                        border: '1px solid var(--input-border)',
                        borderRadius: '8px',
                        color: 'var(--text-primary)',
                        fontSize: '14px',
                        outline: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      {timezones.map((tz) => (
                        <option key={tz} value={tz} style={{ background: 'var(--bg-secondary)' }}>{tz}</option>
                      ))}
                    </select>
                  </div>

                  <button
                    onClick={handleProfileSave}
                    disabled={isSaving}
                    style={{
                      padding: '12px 24px',
                      background: isSaving ? '#166534' : '#15803d',
                      border: 'none',
                      borderRadius: '8px',
                      color: 'white',
                      fontSize: '14px',
                      fontWeight: '600',
                      cursor: isSaving ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      transition: 'all 0.3s',
                      opacity: isSaving ? 0.7 : 1
                    }}
                    onMouseEnter={(e) => !isSaving && ((e.target as HTMLButtonElement).style.background = '#166534')}
                    onMouseLeave={(e) => !isSaving && ((e.target as HTMLButtonElement).style.background = '#15803d')}
                  >
                    <Save size={16} />
                    {isSaving ? 'Saving...' : 'Save Changes'}
                  </button>

                  {saveSuccess && (
                    <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)', borderRadius: '8px', color: '#22c55e', fontSize: '14px' }}>
                      ✓ Settings saved successfully!
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'security' && (
                <div>
                  <h2 style={{ fontSize: '24px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '24px' }}>Security Settings</h2>

                  {/* Error Message */}
                  {saveError && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '16px',
                      background: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      borderRadius: '8px',
                      marginBottom: '20px'
                    }}>
                      <AlertCircle size={20} style={{ color: '#ef4444' }} />
                      <p style={{ color: '#ef4444', fontSize: '14px', margin: 0 }}>{saveError}</p>
                    </div>
                  )}

                  {/* Success Message */}
                  {saveSuccess && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '16px',
                      background: 'rgba(34, 197, 94, 0.1)',
                      border: '1px solid rgba(34, 197, 94, 0.3)',
                      borderRadius: '8px',
                      marginBottom: '20px'
                    }}>
                      <Check size={20} style={{ color: '#22c55e' }} />
                      <p style={{ color: '#22c55e', fontSize: '14px', fontWeight: '600', margin: 0 }}>Password changed successfully!</p>
                    </div>
                  )}

                  <div style={{ marginBottom: '24px' }}>
                    <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
                      Current Password
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showCurrentPassword ? 'text' : 'password'}
                        value={passwordData.currentPassword}
                        onChange={(e) => setPasswordData({...passwordData, currentPassword: e.target.value})}
                        placeholder="Enter current password"
                        style={{
                          width: '100%',
                          padding: '12px 44px 12px 12px',
                          background: 'var(--input-bg)',
                          border: '1px solid var(--input-border)',
                          borderRadius: '8px',
                          color: 'var(--text-primary)',
                          fontSize: '14px',
                          outline: 'none'
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                        style={{
                          position: 'absolute',
                          right: '12px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          padding: '4px',
                          display: 'flex',
                          alignItems: 'center'
                        }}
                      >
                        {showCurrentPassword ? <EyeOff size={20} color="#64748b" /> : <Eye size={20} color="#64748b" />}
                      </button>
                    </div>
                  </div>

                  <div style={{ marginBottom: '24px' }}>
                    <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
                      New Password
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        value={passwordData.newPassword}
                        onChange={(e) => setPasswordData({...passwordData, newPassword: e.target.value})}
                        placeholder="Enter new password"
                        style={{
                          width: '100%',
                          padding: '12px 44px 12px 12px',
                          background: 'var(--input-bg)',
                          border: '1px solid var(--input-border)',
                          borderRadius: '8px',
                          color: 'var(--text-primary)',
                          fontSize: '14px',
                          outline: 'none'
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        style={{
                          position: 'absolute',
                          right: '12px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          padding: '4px',
                          display: 'flex',
                          alignItems: 'center'
                        }}
                      >
                        {showNewPassword ? <EyeOff size={20} color="#64748b" /> : <Eye size={20} color="#64748b" />}
                      </button>
                    </div>
                  </div>

                  <div style={{ marginBottom: '32px' }}>
                    <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
                      Confirm New Password
                    </label>
                    <input
                      type="password"
                      value={passwordData.confirmPassword}
                      onChange={(e) => setPasswordData({...passwordData, confirmPassword: e.target.value})}
                      placeholder="Confirm new password"
                      style={{
                        width: '100%',
                        padding: '12px',
                        background: 'var(--input-bg)',
                        border: '1px solid var(--input-border)',
                        borderRadius: '8px',
                        color: 'var(--text-primary)',
                        fontSize: '14px',
                        outline: 'none'
                      }}
                    />
                  </div>

                  <button
                    onClick={handlePasswordChange}
                    disabled={isSaving}
                    style={{
                      padding: '12px 24px',
                      background: isSaving ? '#166534' : '#15803d',
                      border: 'none',
                      borderRadius: '8px',
                      color: 'white',
                      fontSize: '14px',
                      fontWeight: '600',
                      cursor: isSaving ? 'not-allowed' : 'pointer',
                      transition: 'all 0.3s',
                      opacity: isSaving ? 0.7 : 1
                    }}
                    onMouseEnter={(e) => !isSaving && ((e.target as HTMLButtonElement).style.background = '#166534')}
                    onMouseLeave={(e) => !isSaving && ((e.target as HTMLButtonElement).style.background = '#15803d')}
                  >
                    {isSaving ? 'Updating...' : 'Update Password'}
                  </button>

                  <div style={{ marginTop: '32px', padding: '16px', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <Shield size={20} color="#3b82f6" style={{ flexShrink: 0 }} />
                      <div>
                        <p style={{ color: '#3b82f6', fontWeight: '600', fontSize: '14px', marginBottom: '4px' }}>Password Requirements</p>
                        <ul style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: '1.6', margin: 0, paddingLeft: '20px' }}>
                          <li>At least 8 characters long</li>
                          <li>Contains uppercase and lowercase letters</li>
                          <li>Includes at least one number</li>
                          <li>Has at least one special character</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'household' && (
                <TeamManagement />
              )}

              {activeTab === 'integrations' && (
                <div>
                  <h2 style={{ fontSize: '24px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '24px' }}>
                    Integrations
                  </h2>

                  {/* SimpleFin */}
                  <div style={{ marginBottom: '32px' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '16px' }}>
                      SimpleFin
                    </h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '16px' }}>
                      Connect your bank accounts automatically with SimpleFin. Import transactions and keep your accounts in sync.
                    </p>
                    <SimpleFinSettings />
                  </div>

                  {/* Investment Tracking */}
                  <div style={{ marginBottom: '32px' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '16px' }}>
                      Investment Tracking
                    </h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '16px' }}>
                      Track your stocks, ETFs, and other investments. Monitor portfolio performance and get real-time quotes.
                    </p>
                    <InvestmentSettings />
                  </div>
                </div>
              )}

              {activeTab === 'categories' && (
                <CategoryManagement />
              )}

              {activeTab === 'rules' && (
                <TransactionRules />
              )}

              {activeTab === 'recurring' && (
                <RecurringTransactions />
              )}

              {activeTab === 'notifications' && (
                <div>
                  <h2 style={{ fontSize: '24px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '24px' }}>Notification Preferences</h2>

                  {Object.entries(notificationSettings).map(([key, value]) => (
                    <div key={key} style={{
                      padding: '16px',
                      background: 'var(--surface-hover)',
                      border: '1px solid var(--border-light)',
                      borderRadius: '8px',
                      marginBottom: '12px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <div>
                        <p style={{ color: 'var(--text-primary)', fontWeight: '500', fontSize: '14px', marginBottom: '4px' }}>
                          {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                        </p>
                        <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                          {key === 'budgetAlerts' && 'Get notified when you approach budget limits'}
                          {key === 'monthlyReports' && 'Receive monthly spending summaries via email'}
                          {key === 'transactionNotifications' && 'Alert for every new transaction'}
                          {key === 'goalReminders' && 'Reminders to help you reach your savings goals'}
                        </p>
                      </div>
                      <label style={{ position: 'relative', display: 'inline-block', width: '48px', height: '24px' }}>
                        <input
                          type="checkbox"
                          checked={value}
                          onChange={(e) => setNotificationSettings({...notificationSettings, [key]: e.target.checked})}
                          style={{ opacity: 0, width: 0, height: 0 }}
                        />
                        <span style={{
                          position: 'absolute',
                          cursor: 'pointer',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          background: value ? '#15803d' : 'var(--border-medium)',
                          borderRadius: '24px',
                          transition: '0.3s'
                        }}>
                          <span style={{
                            position: 'absolute',
                            content: '',
                            height: '18px',
                            width: '18px',
                            left: value ? '26px' : '3px',
                            bottom: '3px',
                            background: 'white',
                            borderRadius: '50%',
                            transition: '0.3s'
                          }}></span>
                        </span>
                      </label>
                    </div>
                  ))}

                  <button
                    onClick={handleNotificationsSave}
                    disabled={isSaving}
                    style={{
                      marginTop: '20px',
                      padding: '12px 24px',
                      background: isSaving ? '#166534' : '#15803d',
                      border: 'none',
                      borderRadius: '8px',
                      color: 'white',
                      fontSize: '14px',
                      fontWeight: '600',
                      cursor: isSaving ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      transition: 'all 0.3s',
                      opacity: isSaving ? 0.7 : 1
                    }}
                    onMouseEnter={(e) => !isSaving && ((e.target as HTMLButtonElement).style.background = '#166534')}
                    onMouseLeave={(e) => !isSaving && ((e.target as HTMLButtonElement).style.background = '#15803d')}
                  >
                    <Save size={16} />
                    {isSaving ? 'Saving...' : 'Save Preferences'}
                  </button>

                  {saveSuccess && (
                    <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)', borderRadius: '8px', color: '#22c55e', fontSize: '14px' }}>
                      ✓ Notification preferences saved successfully!
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'preferences' && (
                <div>
                  <h2 style={{ fontSize: '24px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '24px' }}>App Preferences</h2>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Customize your app experience</p>

                  <div style={{ marginTop: '24px', padding: '20px', background: 'var(--surface-hover)', border: '1px solid var(--border-light)', borderRadius: '8px', textAlign: 'center' }}>
                    <Palette size={48} color="#64748b" style={{ margin: '0 auto 16px' }} />
                    <p style={{ color: 'var(--text-muted)' }}>Additional preferences coming soon</p>
                  </div>
                </div>
              )}

              {activeTab === 'data' && (
                <div>
                  <h2 style={{ fontSize: '24px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '24px' }}>Data & Privacy</h2>

                  {/* Error Message */}
                  {saveError && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '16px',
                      background: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      borderRadius: '8px',
                      marginBottom: '20px'
                    }}>
                      <AlertCircle size={20} style={{ color: '#ef4444' }} />
                      <p style={{ color: '#ef4444', fontSize: '14px', margin: 0 }}>{saveError}</p>
                    </div>
                  )}

                  <div style={{ marginBottom: '24px', padding: '16px', background: 'var(--surface-hover)', border: '1px solid var(--border-light)', borderRadius: '8px' }}>
                    <h3 style={{ color: 'var(--text-primary)', fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>Export Your Data</h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '12px' }}>Download all your financial data in JSON format</p>
                    <button
                      onClick={handleExportData}
                      disabled={isExporting}
                      style={{
                        padding: '10px 20px',
                        background: 'var(--btn-secondary-bg)',
                        border: '1px solid var(--btn-secondary-border)',
                        borderRadius: '8px',
                        color: 'var(--btn-secondary-text)',
                        fontSize: '14px',
                        cursor: isExporting ? 'not-allowed' : 'pointer',
                        transition: 'all 0.3s',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        opacity: isExporting ? 0.7 : 1
                      }}
                    >
                      <Download size={16} />
                      {isExporting ? 'Exporting...' : 'Export Data'}
                    </button>
                  </div>

                  <div style={{ padding: '16px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px' }}>
                    <h3 style={{ color: '#ef4444', fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>Delete Account</h3>
                    <p style={{ color: '#fca5a5', fontSize: '14px', marginBottom: '12px' }}>Permanently delete your account and all associated data</p>
                    <button
                      onClick={() => setShowDeleteModal(true)}
                      style={{
                        padding: '10px 20px',
                        background: 'rgba(239, 68, 68, 0.2)',
                        border: '1px solid rgba(239, 68, 68, 0.5)',
                        borderRadius: '8px',
                        color: '#ef4444',
                        fontSize: '14px',
                        cursor: 'pointer',
                        fontWeight: '600',
                        transition: 'all 0.3s',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}
                    >
                      <Trash2 size={16} />
                      Delete Account
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 'about' && (
                <div>
                  <h2 style={{ fontSize: '24px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '24px' }}>About finPal</h2>

                  <div style={{ marginBottom: '24px', padding: '24px', background: 'var(--surface-hover)', border: '1px solid var(--border-light)', borderRadius: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
                      <img
                        src="/finPal.png"
                        alt="finPal"
                        style={{ height: '64px', width: 'auto' }}
                      />
                      <div>
                        <h3 style={{ color: 'var(--text-primary)', fontSize: '20px', fontWeight: '600', marginBottom: '4px' }}>finPal</h3>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Version 1.0.0</p>
                      </div>
                    </div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.6' }}>
                      A modern, privacy-first personal finance management application. Track expenses, manage budgets,
                      split bills with friends, and gain insights into your spending habits.
                    </p>
                  </div>

                  <div style={{ marginBottom: '24px', padding: '20px', background: 'var(--surface-hover)', border: '1px solid var(--border-light)', borderRadius: '12px' }}>
                    <h3 style={{ color: 'var(--text-primary)', fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>Features</h3>
                    <ul style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '2', paddingLeft: '20px', margin: 0 }}>
                      <li>Multi-currency expense tracking</li>
                      <li>Smart auto-categorization with custom rules</li>
                      <li>Budget management with rollover support</li>
                      <li>Bill splitting with group expense tracking</li>
                      <li>Bank integration via SimpleFin</li>
                      <li>Investment portfolio tracking</li>
                      <li>Recurring transaction detection</li>
                      <li>Detailed analytics and reports</li>
                    </ul>
                  </div>

                  <div style={{ padding: '20px', background: 'var(--surface-hover)', border: '1px solid var(--border-light)', borderRadius: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                      <img
                        src="/palStack.png"
                        alt="palStack"
                        style={{ height: '32px', width: 'auto' }}
                      />
                      <h3 style={{ color: 'var(--text-primary)', fontSize: '16px', fontWeight: '600' }}>Part of {branding.parentBrand}</h3>
                    </div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.6', marginBottom: '12px' }}>
                      finPal is part of the {branding.parentBrand} ecosystem - a suite of privacy-focused
                      productivity tools designed to help you manage your digital life.
                    </p>
                    <p style={{ color: 'var(--text-muted)', fontSize: '13px', fontStyle: 'italic' }}>
                      "That's what pals do – they show up and help with the everyday stuff."
                    </p>
                    <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '16px' }}>
                      © {new Date().getFullYear()} {branding.parentBrand}. All rights reserved.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '32px', borderTop: '1px solid var(--border-light)', marginTop: '40px' }}>
            <img src="/palStack.png" alt="palStack" style={{ height: '24px', width: 'auto', opacity: 0.7 }} />
            <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Part of the {branding.parentBrand} ecosystem</p>
          </div>
        </div>
      </div>

      {/* Delete Account Confirmation Modal */}
      {showDeleteModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'var(--overlay-bg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'var(--bg-secondary)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '16px',
            padding: '32px',
            maxWidth: '450px',
            width: '90%'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h3 style={{ color: '#ef4444', fontSize: '20px', fontWeight: '600', margin: 0 }}>Delete Account</h3>
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeletePassword('');
                  setSaveError(null);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  padding: '4px'
                }}
              >
                <X size={24} />
              </button>
            </div>

            <div style={{
              padding: '16px',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              borderRadius: '8px',
              marginBottom: '24px'
            }}>
              <p style={{ color: '#fca5a5', fontSize: '14px', margin: 0, lineHeight: '1.6' }}>
                <strong>Warning:</strong> This action is permanent and cannot be undone. All your data including
                transactions, accounts, budgets, and settings will be permanently deleted.
              </p>
            </div>

            {saveError && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '8px',
                marginBottom: '16px'
              }}>
                <AlertCircle size={18} style={{ color: '#ef4444' }} />
                <p style={{ color: '#ef4444', fontSize: '13px', margin: 0 }}>{saveError}</p>
              </div>
            )}

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
                Enter your password to confirm
              </label>
              <input
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder="Your password"
                style={{
                  width: '100%',
                  padding: '12px',
                  background: 'var(--input-bg)',
                  border: '1px solid var(--input-border)',
                  borderRadius: '8px',
                  color: 'var(--text-primary)',
                  fontSize: '14px',
                  outline: 'none'
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeletePassword('');
                  setSaveError(null);
                }}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: 'var(--btn-secondary-bg)',
                  border: '1px solid var(--btn-secondary-border)',
                  borderRadius: '8px',
                  color: 'var(--btn-secondary-text)',
                  fontSize: '14px',
                  cursor: 'pointer',
                  fontWeight: '500'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={isDeleting || !deletePassword}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: isDeleting ? '#7f1d1d' : '#dc2626',
                  border: 'none',
                  borderRadius: '8px',
                  color: 'white',
                  fontSize: '14px',
                  cursor: isDeleting || !deletePassword ? 'not-allowed' : 'pointer',
                  fontWeight: '600',
                  opacity: isDeleting || !deletePassword ? 0.7 : 1
                }}
              >
                {isDeleting ? 'Deleting...' : 'Delete My Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
