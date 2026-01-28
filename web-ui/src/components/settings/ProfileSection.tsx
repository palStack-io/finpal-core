/**
 * Profile Section Component
 * User profile management with avatar upload and password change
 */

import React, { useState, useRef } from 'react';
import { Button } from '../common/Button';
import { useAuthStore } from '../../store/authStore';
import { userService } from '../../services/userService';
import { useToast } from '../../contexts/ToastContext';
import {
  User,
  Camera,
  Lock,
  Trash2,
  Eye,
  EyeOff,
  CheckCircle,
  XCircle,
  AlertCircle,
} from 'lucide-react';
import type { PasswordStrength } from '../../types/user';

export const ProfileSection: React.FC = () => {
  const { user, updateUser } = useAuthStore();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Profile form state
  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [isProfileLoading, setIsProfileLoading] = useState(false);

  // Avatar state
  const [avatarPreview, setAvatarPreview] = useState(user?.avatar || '');
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  // Password change state
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState<PasswordStrength>('weak');
  const [isPasswordLoading, setIsPasswordLoading] = useState(false);

  // Delete account state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // Handle profile update
  const handleUpdateProfile = async () => {
    setIsProfileLoading(true);
    try {
      const updatedUser = await userService.updateProfile({
        name,
        phone: phone || undefined,
        bio: bio || undefined,
      });

      updateUser(updatedUser);
      showToast('Profile updated successfully', 'success');
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to update profile', 'error');
    } finally {
      setIsProfileLoading(false);
    }
  };

  // Handle avatar upload
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      showToast('Please select an image file', 'error');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      showToast('Image must be less than 5MB', 'error');
      return;
    }

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setAvatarPreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);

    // Upload
    setIsUploadingAvatar(true);
    try {
      const avatarUrl = await userService.uploadAvatar(file);
      updateUser({ ...user!, avatar: avatarUrl });
      showToast('Avatar updated successfully', 'success');
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to upload avatar', 'error');
      setAvatarPreview(user?.avatar || '');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  // Handle password change
  const handleChangePassword = async () => {
    // Validate
    if (!currentPassword || !newPassword || !confirmPassword) {
      showToast('Please fill in all password fields', 'error');
      return;
    }

    if (newPassword !== confirmPassword) {
      showToast('New passwords do not match', 'error');
      return;
    }

    if (newPassword.length < 8) {
      showToast('Password must be at least 8 characters', 'error');
      return;
    }

    setIsPasswordLoading(true);
    try {
      await userService.changePassword(currentPassword, newPassword);
      showToast('Password changed successfully', 'success');
      setShowPasswordForm(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to change password', 'error');
    } finally {
      setIsPasswordLoading(false);
    }
  };

  // Handle password strength check
  const handleNewPasswordChange = (value: string) => {
    setNewPassword(value);
    const result = userService.checkPasswordStrength(value);
    setPasswordStrength(result.strength);
  };

  // Get password strength color
  const getStrengthColor = () => {
    switch (passwordStrength) {
      case 'strong':
        return 'bg-green-500';
      case 'medium':
        return 'bg-yellow-500';
      default:
        return 'bg-red-500';
    }
  };

  // Handle account deletion
  const handleDeleteAccount = async () => {
    if (!deletePassword) {
      showToast('Please enter your password to confirm', 'error');
      return;
    }

    setIsDeleting(true);
    try {
      await userService.deleteAccount(deletePassword);
      showToast('Account deleted successfully', 'success');
      // Logout user
      window.location.href = '/login';
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to delete account', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Avatar Section */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-4">Profile Picture</h3>
        <div className="flex items-center gap-6">
          <div className="relative">
            <div className="w-24 h-24 rounded-full bg-background-darker border-2 border-gray-800 overflow-hidden flex items-center justify-center">
              {avatarPreview ? (
                <img
                  src={avatarPreview}
                  alt="Avatar"
                  className="w-full h-full object-cover"
                />
              ) : (
                <User className="w-12 h-12 text-gray-600" />
              )}
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingAvatar}
              className="absolute bottom-0 right-0 p-2 bg-primary rounded-full hover:bg-primary-dark transition-colors disabled:opacity-50"
            >
              <Camera className="w-4 h-4 text-white" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              className="hidden"
            />
          </div>
          <div>
            <p className="text-white font-medium">Upload a new avatar</p>
            <p className="text-gray-400 text-sm">JPG, PNG or GIF. Max size 5MB</p>
          </div>
        </div>
      </div>

      {/* Profile Information */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-4">Personal Information</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-white font-medium mb-2">Display Name</label>
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
            <label className="block text-white font-medium mb-2">Phone Number (Optional)</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-4 py-3 bg-background-darker border border-gray-800 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-primary transition-colors"
              placeholder="+1 (555) 123-4567"
            />
          </div>

          <div>
            <label className="block text-white font-medium mb-2">Bio / Notes (Optional)</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              className="w-full px-4 py-3 bg-background-darker border border-gray-800 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-primary transition-colors resize-none"
              placeholder="Tell us about yourself..."
            />
          </div>

          <div>
            <label className="block text-white font-medium mb-2">Account Created</label>
            <input
              type="text"
              value={user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}
              disabled
              className="w-full px-4 py-3 bg-background-darker border border-gray-800 rounded-xl text-gray-500 cursor-not-allowed"
            />
          </div>

          <Button
            variant="primary"
            onClick={handleUpdateProfile}
            isLoading={isProfileLoading}
          >
            Save Profile
          </Button>
        </div>
      </div>

      {/* Password Change Section */}
      <div className="pt-6 border-t border-gray-800">
        <h3 className="text-lg font-semibold text-white mb-4">Password</h3>
        {!showPasswordForm ? (
          <Button
            variant="outline"
            onClick={() => setShowPasswordForm(true)}
          >
            <Lock className="h-4 w-4 mr-2" />
            Change Password
          </Button>
        ) : (
          <div className="space-y-4 max-w-md">
            <div>
              <label className="block text-white font-medium mb-2">Current Password</label>
              <div className="relative">
                <input
                  type={showCurrentPassword ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-4 py-3 pr-12 bg-background-darker border border-gray-800 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-primary transition-colors"
                  placeholder="Enter current password"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                >
                  {showCurrentPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-white font-medium mb-2">New Password</label>
              <div className="relative">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => handleNewPasswordChange(e.target.value)}
                  className="w-full px-4 py-3 pr-12 bg-background-darker border border-gray-800 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-primary transition-colors"
                  placeholder="Enter new password"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                >
                  {showNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {newPassword && (
                <div className="mt-2">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all ${getStrengthColor()}`}
                        style={{
                          width:
                            passwordStrength === 'strong'
                              ? '100%'
                              : passwordStrength === 'medium'
                              ? '66%'
                              : '33%',
                        }}
                      />
                    </div>
                    <span className="text-sm text-gray-400 capitalize">{passwordStrength}</span>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-white font-medium mb-2">Confirm New Password</label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-3 pr-12 bg-background-darker border border-gray-800 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-primary transition-colors"
                  placeholder="Confirm new password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                >
                  {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {confirmPassword && (
                <div className="flex items-center gap-2 mt-2 text-sm">
                  {newPassword === confirmPassword ? (
                    <>
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      <span className="text-green-500">Passwords match</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4 text-red-500" />
                      <span className="text-red-500">Passwords do not match</span>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <Button
                variant="primary"
                onClick={handleChangePassword}
                isLoading={isPasswordLoading}
              >
                Update Password
              </Button>
              <Button variant="outline" onClick={() => setShowPasswordForm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Delete Account Section */}
      <div className="pt-6 border-t border-gray-800">
        <h3 className="text-lg font-semibold text-white mb-2">Danger Zone</h3>
        <p className="text-gray-400 mb-4">
          Once you delete your account, there is no going back. Please be certain.
        </p>
        {!showDeleteConfirm ? (
          <Button variant="danger" onClick={() => setShowDeleteConfirm(true)}>
            <Trash2 className="h-4 w-4 mr-2" />
            Delete Account
          </Button>
        ) : (
          <div className="p-6 bg-red-500/10 border border-red-500/30 rounded-xl max-w-md">
            <div className="flex items-start gap-3 mb-4">
              <AlertCircle className="w-6 h-6 text-red-500 mt-1" />
              <div>
                <h4 className="text-white font-semibold mb-1">Are you absolutely sure?</h4>
                <p className="text-gray-400 text-sm">
                  This will permanently delete your account and all associated data. This action
                  cannot be undone.
                </p>
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-white font-medium mb-2">
                Enter your password to confirm
              </label>
              <input
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                className="w-full px-4 py-3 bg-background-darker border border-gray-800 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-red-500 transition-colors"
                placeholder="Enter password"
              />
            </div>
            <div className="flex gap-3">
              <Button variant="danger" onClick={handleDeleteAccount} isLoading={isDeleting}>
                Yes, Delete My Account
              </Button>
              <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
