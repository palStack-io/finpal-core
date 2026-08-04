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

  // Inline styles with CSS variables. Previously Tailwind, so the whole header
  // was a fixed dark bar with white text regardless of theme.
  const iconButtonStyle: React.CSSProperties = {
    padding: '8px',
    borderRadius: '8px',
    background: 'transparent',
    border: 'none',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    transition: 'background 0.2s ease, color 0.2s ease',
  };

  const hoverIn = (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.background = 'var(--surface-hover)';
    e.currentTarget.style.color = 'var(--text-primary)';
  };
  const hoverOut = (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.background = 'transparent';
    e.currentTarget.style.color = 'var(--text-secondary)';
  };

  const menuItemStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    width: '100%',
    padding: '8px 16px',
    background: 'transparent',
    border: 'none',
    color: 'var(--text-secondary)',
    fontSize: '14px',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'background 0.2s ease, color 0.2s ease',
  };

  return (
    <header style={{
      position: 'sticky',
      top: 0,
      zIndex: 40,
      background: 'var(--bg-card)',
      backdropFilter: 'blur(12px)',
      borderBottom: '1px solid var(--border-light)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        height: '64px', padding: '0 16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={onMenuToggle}
            aria-label={isSidebarOpen ? 'Close menu' : 'Open menu'}
            style={iconButtonStyle}
            onMouseEnter={hoverIn}
            onMouseLeave={hoverOut}
          >
            {isSidebarOpen ? <X size={24} /> : <Menu size={24} />}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '30px' }}>{user?.profile_emoji || '\u{1F60A}'}</span>
            <div>
              <h1 style={{
                fontSize: '18px', fontWeight: 700, margin: 0,
                color: 'var(--text-primary)',
              }}>
                {user?.name || 'User'}
              </h1>
              <p style={{
                fontSize: '12px', margin: 0, color: 'var(--text-muted)',
              }}>
                {branding.appName}
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            aria-label="Notifications"
            style={{ ...iconButtonStyle, position: 'relative' }}
            onMouseEnter={hoverIn}
            onMouseLeave={hoverOut}
          >
            <Bell size={20} />
            <span style={{
              position: 'absolute', top: '4px', right: '4px',
              height: '8px', width: '8px', borderRadius: '50%',
              background: 'var(--brand-accent-gold)',
            }} />
          </button>

          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              style={{ ...iconButtonStyle, gap: '8px' }}
              onMouseEnter={hoverIn}
              onMouseLeave={hoverOut}
            >
              <div style={{
                height: '32px', width: '32px', borderRadius: '50%',
                background: 'linear-gradient(to bottom right, var(--brand-main-green), var(--brand-accent-gold))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ fontSize: '18px', lineHeight: 1 }}>
                  {user?.profile_emoji || user?.name?.[0]?.toUpperCase() || 'U'}
                </span>
              </div>
              <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                {user?.name || 'User'}
              </span>
            </button>

            {showUserMenu && (
              <>
                <div
                  style={{ position: 'fixed', inset: 0, zIndex: 10 }}
                  onClick={() => setShowUserMenu(false)}
                />
                <div style={{
                  position: 'absolute', right: 0, marginTop: '8px', width: '224px',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-light)',
                  borderRadius: '8px',
                  boxShadow: 'var(--card-shadow)',
                  zIndex: 20, overflow: 'hidden',
                }}>
                  <div style={{ padding: '16px', borderBottom: '1px solid var(--border-light)' }}>
                    <p style={{ fontWeight: 500, margin: 0, color: 'var(--text-primary)' }}>
                      {user?.name}
                    </p>
                    <p style={{ fontSize: '14px', margin: 0, color: 'var(--text-muted)' }}>
                      {user?.email}
                    </p>
                  </div>
                  <div style={{ padding: '8px 0' }}>
                    <button
                      onClick={() => { setShowUserMenu(false); navigate('/profile'); }}
                      style={menuItemStyle}
                      onMouseEnter={hoverIn}
                      onMouseLeave={hoverOut}
                    >
                      <User size={16} />
                      <span>Profile</span>
                    </button>
                    <button
                      onClick={() => { setShowUserMenu(false); handleLogout(); }}
                      style={menuItemStyle}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'var(--surface-hover)';
                        e.currentTarget.style.color = 'var(--accent-red)';
                      }}
                      onMouseLeave={hoverOut}
                    >
                      <LogOut size={16} />
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
