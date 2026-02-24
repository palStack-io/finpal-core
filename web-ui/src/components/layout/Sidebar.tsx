import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  ArrowLeftRight,
  Wallet,
  Target,
  TrendingUp,
  Users,
  LineChart,
  Settings,
  Sun,
  Moon,
  LogOut,
} from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuthStore } from '../../store/authStore';

const navItems = [
  { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { name: 'Transactions', path: '/transactions', icon: ArrowLeftRight },
  { name: 'Accounts', path: '/accounts', icon: Wallet },
  { name: 'Budgets', path: '/budgets', icon: Target },
];

const navItems2 = [
  { name: 'Investments', path: '/investments', icon: LineChart },
  { name: 'Analytics', path: '/analytics', icon: TrendingUp },
  { name: 'Groups', path: '/groups', icon: Users },
];

const navItems3 = [
  { name: 'Settings', path: '/settings', icon: Settings },
];

export const Sidebar: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const renderNavItems = (items: typeof navItems) =>
    items.map((item) => {
      const Icon = item.icon;
      return (
        <NavLink
          key={item.path}
          to={item.path}
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
        >
          <Icon className="nav-icon" size={20} strokeWidth={2} />
          <span>{item.name}</span>
        </NavLink>
      );
    });

  return (
    <aside className="sidebar">
      {/* User Profile Header */}
      <div className="sidebar-header">
        <div className="user-profile-header" onClick={() => navigate('/settings')}>
          <div className="user-avatar">{user?.profile_emoji || '👤'}</div>
          <div className="user-info">
            <div className="user-name">{user?.name || 'User'}</div>
            <div className="user-email">View profile</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        {renderNavItems(navItems)}
        <div className="nav-divider" />
        {renderNavItems(navItems2)}
        <div className="nav-divider" />
        {renderNavItems(navItems3)}
      </nav>

      {/* Footer */}
      <div className="sidebar-footer">
        {/* Theme Toggle */}
        <div className="theme-toggle" onClick={toggleTheme}>
          {theme === 'dark' ? (
            <>
              <Sun className="theme-icon" size={18} />
              <span className="theme-text">Light Mode</span>
            </>
          ) : (
            <>
              <Moon className="theme-icon" size={18} />
              <span className="theme-text">Dark Mode</span>
            </>
          )}
        </div>

        {/* Logout */}
        <div
          className="nav-item"
          onClick={handleLogout}
          style={{ cursor: 'pointer', color: 'var(--accent-red)', marginBottom: '12px' }}
        >
          <LogOut size={18} />
          <span style={{ fontSize: '13px', fontWeight: 600 }}>Logout</span>
        </div>

        {/* finPal Branding */}
        <div className="logo-footer">
          <img src="/finPal.png" alt="finPal" style={{ height: '28px', width: 'auto' }} />
          <div className="logo-text">finPal</div>
        </div>
      </div>
    </aside>
  );
};
