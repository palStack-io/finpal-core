import React, { useState, useEffect } from 'react';
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
  Repeat,
  Tags,
  Filter,
  Sun,
  Moon,
  LogOut,
  ChevronRight,
} from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuthStore } from '../../store/authStore';
import { moduleRegistry } from '../../modules';
import type { ModuleManifest } from '../../modules/registry';

/**
 * The nav is grouped by WHAT YOU ARE DOING, and the headings are shared with
 * mobile's `more.tsx` so the two clients answer "where do I find X?" the same way.
 * `iaParity.test.ts` fails if these five headings and the mobile ones diverge.
 *
 * Categories, Recurring and Rules live here rather than inside Settings: they are
 * features, not preferences, and Settings had grown to twelve tabs in a
 * ~1,250-line file. See docs/superpowers/specs/2026-08-07-finpal-ia-and-mobile-parity-design.md.
 */
export const NAV_GROUP_HEADINGS = ['Money', 'Plan', 'Insight', 'Shared', 'Modules'] as const;

const navGroups = [
  {
    heading: 'Money',
    items: [
      { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
      { name: 'Transactions', path: '/transactions', icon: ArrowLeftRight },
      { name: 'Accounts', path: '/accounts', icon: Wallet },
      // Investments is spliced in here when the feature is on — see the render.
    ],
  },
  {
    heading: 'Plan',
    items: [
      { name: 'Budgets', path: '/budgets', icon: Target },
      { name: 'Recurring', path: '/recurring', icon: Repeat },
      { name: 'Categories', path: '/categories', icon: Tags },
      { name: 'Rules', path: '/rules', icon: Filter },
    ],
  },
  { heading: 'Insight', items: [{ name: 'Analytics', path: '/analytics', icon: TrendingUp }] },
  { heading: 'Shared', items: [{ name: 'Groups', path: '/groups', icon: Users }] },
];

const navGroupHeadingStyle: React.CSSProperties = {
  padding: '4px 12px 2px',
  fontSize: 10,
  fontWeight: 700,
  color: 'rgba(148,163,184,0.5)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  fontFamily: "'Bricolage Grotesque', sans-serif",
};

const NavGroupHeading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={navGroupHeadingStyle}>{children}</div>
);


// ---------------------------------------------------------------------------
// ModuleNavSection — renders one module's sidebar nav section
// ---------------------------------------------------------------------------

const ModuleNavSection: React.FC<{ manifest: ModuleManifest }> = ({ manifest }) => {
  const { user } = useAuthStore();
  const openKey = `module_nav_open_${manifest.slug}`;

  const [open, setOpen] = useState<boolean>(() => {
    try { return localStorage.getItem(openKey) === 'true'; } catch { return false; }
  });
  const [alertCount, setAlertCount] = useState(0);

  useEffect(() => {
    const hasAlertLinks = manifest.navLinks.some(l => l.hasAlert);
    if (!hasAlertLinks) return;
    if (manifest.slug === 'pointspal') {
      import('../../modules/pointspal/service').then(({ pointspalService }) => {
        pointspalService.getAlerts().then((alerts: any[]) => {
          setAlertCount(alerts.filter((a: any) => !a.dismissed).length);
        }).catch(() => {});
      });
    }
  }, [manifest.slug, manifest.navLinks]);

  const toggle = () => {
    setOpen(prev => {
      const next = !prev;
      try { localStorage.setItem(openKey, String(next)); } catch {}
      return next;
    });
  };

  return (
    <>
      <div
        onClick={toggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 16px', cursor: 'pointer', borderRadius: 8,
          margin: '1px 8px', color: 'rgba(148,163,184,0.85)',
          transition: 'background 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        <span style={{ fontSize: 14, lineHeight: 1 }}>{manifest.icon}</span>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, fontFamily: "'Bricolage Grotesque', sans-serif" }}>
          {manifest.label}
        </span>
        <ChevronRight
          size={14}
          style={{ transition: 'transform 0.2s', transform: open ? 'rotate(90deg)' : 'rotate(0deg)', opacity: 0.6 }}
        />
      </div>

      {open && (
        <div style={{ paddingLeft: 8 }}>
          {manifest.navLinks.map(link => {
            const showAlert = link.hasAlert?.(user ?? null) && alertCount > 0;
            return (
              <NavLink
                key={link.path}
                to={link.path}
                end={link.path === `/${manifest.slug}`}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                style={({ isActive }) => ({
                  paddingLeft: 28, fontSize: 12, position: 'relative',
                  ...(isActive ? { color: 'var(--g400)' } : {}),
                })}
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span style={{
                        position: 'absolute', left: 14, top: '50%',
                        transform: 'translateY(-50%)', width: 6, height: 6,
                        borderRadius: '50%', background: 'var(--g500)',
                      }} />
                    )}
                    <span>{link.label}</span>
                    {showAlert && (
                      <span style={{
                        marginLeft: 'auto', background: 'var(--re600)', color: '#fff',
                        borderRadius: 20, fontSize: 10, fontWeight: 700,
                        padding: '1px 6px', fontFamily: "'Bricolage Grotesque', sans-serif",
                      }}>
                        {alertCount}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            );
          })}
        </div>
      )}
    </>
  );
};

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

export const Sidebar: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const { user, logout, features } = useAuthStore();
  const navigate = useNavigate();

  // Re-render when module hide/show preferences change from Settings
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key?.startsWith('module_hidden_') || e.key?.startsWith('module_nav_open_')) {
        forceUpdate(n => n + 1);
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  type NavItem = { name: string; path: string; icon: React.ComponentType<{ className?: string; size?: number; strokeWidth?: number }> };

  const renderNavItems = (items: readonly NavItem[]) =>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="user-profile-header" onClick={() => navigate('/settings')} style={{ flex: 1 }}>
            <div className="user-avatar">{user?.profile_emoji || '👤'}</div>
            <div className="user-info">
              <div className="user-name">{user?.name || 'User'}</div>
              <div className="user-email">View profile</div>
            </div>
          </div>
          <button
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            style={{
              flexShrink: 0, width: 32, height: 32, borderRadius: '50%',
              border: '1px solid var(--border-medium)',
              background: 'var(--nav-hover)',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-secondary)',
              transition: 'background 0.2s, color 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--border-light)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--nav-hover)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        {navGroups.map(group => {
          // Investments is feature-gated and belongs with Accounts — both are
          // "what you hold". Spliced at render rather than declared, so the
          // group data stays a plain constant the parity test can read.
          const items = group.heading === 'Money' && features?.investments !== false
            ? [...group.items, { name: 'Investments', path: '/investments', icon: LineChart }]
            : group.items;
          return (
            <React.Fragment key={group.heading}>
              <NavGroupHeading>{group.heading}</NavGroupHeading>
              {renderNavItems(items)}
            </React.Fragment>
          );
        })}

        {/* ── Modules section — driven by moduleRegistry + user.modules ── */}
        {(() => {
          const activeModules = moduleRegistry.filter(m => user?.modules?.includes(m.slug));
          const visibleModules = activeModules.filter(m => {
            try { return localStorage.getItem(`module_hidden_${m.slug}`) !== 'true'; } catch { return true; }
          });
          if (visibleModules.length === 0) return null;
          return (
            <>
              <NavGroupHeading>Modules</NavGroupHeading>
              {visibleModules.map(m => <ModuleNavSection key={m.slug} manifest={m} />)}
            </>
          );
        })()}

        <div className="nav-divider" />
        {renderNavItems([{ name: 'Settings', path: '/settings', icon: Settings }])}
      </nav>

      {/* Footer */}
      <div className="sidebar-footer">
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
