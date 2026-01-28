/**
 * Header Component
 * Top header with logo and user menu
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { getBranding } from '../../config/branding';
import { Menu, X, User, LogOut, Bell } from 'lucide-react';

interface HeaderProps {
  onMenuToggle?: () => void;
  isSidebarOpen?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ onMenuToggle, isSidebarOpen }) => {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [showUserMenu, setShowUserMenu] = useState(false);

  const branding = getBranding(user?.default_currency_code);

  const handleLogout = async () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-40 bg-background-dark/80 backdrop-blur-lg border-b border-gray-800">
      <div className="flex items-center justify-between h-16 px-4 sm:px-6">
        {/* Left side - Menu toggle and Logo */}
        <div className="flex items-center gap-4">
          <button
            onClick={onMenuToggle}
            className="lg:hidden p-2 rounded-lg hover:bg-gray-800 transition-colors text-white"
          >
            {isSidebarOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>

          <div className="flex items-center gap-2">
            <div className="text-3xl">{branding.currencySymbol}</div>
            <div>
              <h1 className="text-xl font-bold text-white">{branding.appName}</h1>
              <p className="text-xs text-gray-400 hidden sm:block">{branding.parentBrand}</p>
            </div>
          </div>
        </div>

        {/* Right side - User menu */}
        <div className="flex items-center gap-4">
          {/* Notifications */}
          <button className="p-2 rounded-lg hover:bg-gray-800 transition-colors text-gray-400 hover:text-white relative">
            <Bell className="h-5 w-5" />
            <span className="absolute top-1 right-1 h-2 w-2 bg-accent rounded-full"></span>
          </button>

          {/* User menu */}
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-800 transition-colors"
            >
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                <span className="text-white font-semibold text-sm">
                  {user?.name?.[0]?.toUpperCase() || 'U'}
                </span>
              </div>
              <span className="hidden sm:block text-white font-medium">{user?.name || 'User'}</span>
            </button>

            {/* Dropdown menu */}
            {showUserMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowUserMenu(false)}
                ></div>
                <div className="absolute right-0 mt-2 w-56 bg-background-dark border border-gray-800 rounded-lg shadow-xl z-20 overflow-hidden">
                  <div className="p-4 border-b border-gray-800">
                    <p className="text-white font-medium">{user?.name}</p>
                    <p className="text-gray-400 text-sm">{user?.email}</p>
                  </div>
                  <div className="py-2">
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        navigate('/profile');
                      }}
                      className="flex items-center gap-3 w-full px-4 py-2 text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
                    >
                      <User className="h-4 w-4" />
                      <span>Profile</span>
                    </button>
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        handleLogout();
                      }}
                      className="flex items-center gap-3 w-full px-4 py-2 text-gray-300 hover:bg-gray-800 hover:text-red-400 transition-colors"
                    >
                      <LogOut className="h-4 w-4" />
                      <span>Logout</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
