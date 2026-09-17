import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Backpack,
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
  Flag,
  ListChecks,
  Sun,
  Moon,
  LogOut,
  ChevronRight,
} from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuthStore } from '../../store/authStore';
import { moduleRegistry } from '../../modules';
import { useReviewStore } from '../../store/reviewStore';
import type { ModuleManifest } from '../../modules/registry';
import { useCoinBalance } from '../../contexts/CoinAwardContext';

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
      { name: 'Goals', path: '/goals', icon: Flag },
      { name: 'Recurring', path: '/recurring', icon: Repeat },
      { name: 'Categories', path: '/categories', icon: Tags },
      { name: 'Rules', path: '/rules', icon: Filter },
      // Carries the only badge in the rail — see the render. It sits in Plan
      // rather than in a heading of its own because NAV_GROUP_HEADINGS is
      // mirrored by mobile and compared by a test: a sixth heading here would
      // be a silent parity break, and "keep your setup straight" is what this
      // group already is.
      { name: 'Review', path: '/review', icon: ListChecks },
      // *** ALSO IN `Plan`, AND FOR THE SAME REASON AS Review ABOVE. ***
      // NAV_GROUP_HEADINGS is mirrored by mobile and compared by a test, so a
      // sixth heading here is a silent parity break. Kit belongs beside Review
      // anyway: Review is where coins are earned and Kit is where they go.
      { name: 'Kit', path: '/kit', icon: Backpack },
    ],
  },
  { heading: 'Insight', items: [{ name: 'Analytics', path: '/analytics', icon: TrendingUp }] },
  { heading: 'Shared', items: [{ name: 'Groups', path: '/groups', icon: Users }] },
];

/*
 * *** THE RAIL'S SECTION HEADINGS WERE 1.52:1 IN LIGHT AND 2.61:1 IN DARK —
 * BELOW AA IN BOTH THEMES, WHICH IS WORSE THAN THE MODULE LABELS BELOW. ***
 *
 * `rgba(148,163,184,0.5)` is slate-400 at HALF alpha: #c8d0d9 over the light
 * sidebar and #556469 over the dark one. "INSIGHT", "SHARED" and "MODULES" are
 * 10px uppercase text — too small for the large-text exemption — so 4.5:1 is
 * the floor and neither theme came near it.
 *
 * *** THE HIERARCHY IS CARRIED BY SIZE, WEIGHT, CASE AND TRACKING, NOT BY
 * FADING THE TEXT. *** That is the whole point: a heading reads as a heading
 * here because it is 10px, 700, uppercase and letterspaced beside 14px
 * sentence-case items. Turning the contrast down was doing a job four other
 * properties already do, and it did that job by making the text illegible.
 * `--text-secondary` is 5.77:1 light and 7.22:1 dark and the rail still reads
 * with exactly the same structure.
 */
const navGroupHeadingStyle: React.CSSProperties = {
  padding: '4px 12px 2px',
  fontSize: 10,
  fontWeight: 700,
  color: 'var(--text-secondary)',
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
        /* *** THIS READ AS DISABLED, AND IT WAS 2.13:1. ***
           The colour was `rgba(148,163,184,0.85)` — slate-400 at 85% alpha,
           hardcoded, where every sibling nav item takes `--text-secondary` from
           the `.nav-item` role class. Composited over the light sidebar
           (`--bg-secondary` = #FBFCF9) that is **#a3b0c2 at 2.13:1**, so
           `pointsPal` and `learnPal` were the only two items in the rail a
           reader could not comfortably read, and the owner's report was that
           they "look like its disabled" — which is exactly what a greyed label
           beside sharp ones means to anyone.

           *** IT PASSED IN DARK AND FAILED IN LIGHT, WHICH IS WHY NOBODY SAW
           IT. *** The same value measures 4.94:1 over the dark card. This file
           has a whole comment about that failure mode under `--amount-income`:
           one value used against two very different backgrounds. The token is
           5.77:1 light and 7.22:1 dark.

           *** AND NO GATE COULD SEE IT: THE SIDEBAR IS NOT IN ANY WALK. *** The
           page captures render page components alone, without `AppLayout`, so
           the rail has never been measured by the contrast walk — the same
           class of gap as D-243, one component out. */
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 16px', cursor: 'pointer', borderRadius: 8,
          margin: '1px 8px', color: 'var(--text-secondary)',
          transition: 'background 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        <span style={{ fontSize: 14, lineHeight: 1 }}>{manifest.icon}</span>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, fontFamily: "'Bricolage Grotesque', sans-serif" }}>
          {manifest.label}
        </span>
        {/* `opacity: 0.6` put this at 2.53:1 in light against a 3:1 floor for a
            control's affordance — the chevron is the only thing saying this row
            expands. 0.85 measures 4.14:1 light / 5.61:1 dark and still reads as
            quieter than the label. */}
        <ChevronRight
          size={14}
          style={{ transition: 'transform 0.2s', transform: open ? 'rotate(90deg)' : 'rotate(0deg)', opacity: 0.85 }}
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

/**
 * `isOpen` / `onClose` are back, and this time they are READ.
 *
 * AUDIT D-46 deleted them because #74 passed them to a component that ignored
 * them, leaving a hamburger that swapped its own icon and moved nothing. The
 * lesson recorded there is not "never add these props" — it is that a control
 * whose target does not consume it is worse than no control. Both are consumed
 * below: `isOpen` drives the `is-open` class the phone-width transform reads,
 * and `onClose` fires on navigation so the drawer does not stay open over the
 * page you just moved to.
 *
 * They are optional because above --bp-phone there is no drawer at all — the
 * sidebar is simply a sidebar, and the CSS that translates it away is inside a
 * `max-width: 767px` query.
 */
interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen = false, onClose }) => {
  const { theme, toggleTheme } = useTheme();
  const { user, logout, features } = useAuthStore();
  const navigate = useNavigate();
  // *** THE BADGE IS THE ONLY WAY ANYBODY FINDS THIS PAGE. *** A review list
  // nobody is told about is a page that never gets opened, and the count has to
  // come from the server or it is one more figure two views can disagree about
  // (D-101). Asked once per app load; every confirm hands back a fresh total.
  const reviewTotal = useReviewStore((s) => s.total);
  const refreshReview = useReviewStore((s) => s.refresh);

  // Re-render when a module's nav section is expanded/collapsed elsewhere.
  //
  // `module_hidden_` is NO LONGER LISTENED FOR and that is deliberate: hide/show
  // moved to the server on 2026-09-11, so Settings updates the auth store and
  // zustand re-renders this component without any storage event. Leaving the
  // old key in the predicate would have been harmless and misleading — a reader
  // would conclude localStorage still drove visibility.
  //
  // `module_nav_open_` stays in localStorage on purpose: which sections you have
  // expanded is genuinely per-browser and has no business on the server.
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key?.startsWith('module_nav_open_')) {
        forceUpdate(n => n + 1);
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  useEffect(() => {
    // Only for a signed-in household member. A demo visitor has a review list
    // too (their own sandbox rows), so this is keyed on being logged in rather
    // than on not being a demo.
    if (user) void refreshReview();
  }, [user, refreshReview]);

  const handleLogout = () => {
    // Or the next account signs in to the last one's badge.
    useReviewStore.getState().clear();
    logout();
    navigate('/login');
  };

  type NavItem = { name: string; path: string; icon: React.ComponentType<{ className?: string; size?: number; strokeWidth?: number }> };

  const coinBalance = useCoinBalance();


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
          {/* *** A COUNT, NEVER A FRACTION, AND ABSENT AT ZERO. *** "3" is
              momentum; "3 of 47" is a report card, and a permanent "0" badge
              would nag about a job already done. `null` means "not asked yet"
              and must not render as 0 — claiming an all-clear the app has not
              earned. */}
          {/* *** THE PURSE, AND IT IS TEXT RATHER THAN A PILL ON PURPOSE. ***
              The Review badge beside it is a pill because it is an ALERT —
              something is waiting for you. A balance is ambient information,
              so it takes no background and invents no colour.
              `var(--status-warn)` is the amber ROLE token and is MEASURED in
              both themes: #8A6A2F at 5.02:1 on the light card, #E8B872 at
              8.9:1 on #16241A. (`--kt-seg-4` used raw in LIGHT is the 3.06:1
              trap the kit file warns about; this is not that.)
              Absent when null, and absent at zero — same rule as the badge:
              null is "not asked yet" and a confident 0 is a claim the app has
              not earned. */}
          {item.path === '/kit' && coinBalance !== null && coinBalance > 0 && (
            <span
              aria-label={`${coinBalance} coins to spend`}
              style={{
                marginLeft: 'auto', fontSize: 12, fontWeight: 700,
                color: 'var(--status-warn)', letterSpacing: '0.01em',
              }}
            >
              {coinBalance.toLocaleString()}
            </span>
          )}
          {item.path === '/review' && reviewTotal !== null && reviewTotal > 0 && (
            <span
              aria-label={`${reviewTotal} to review`}
              style={{
                marginLeft: 'auto', minWidth: 20, padding: '1px 7px',
                borderRadius: 999, fontSize: 12, fontWeight: 700,
                textAlign: 'center',
                /* *** WHITE ON BLUE-500 IS 3.68:1 AND THIS IS THE ONLY
                   BADGE IN THE RAIL. *** `#3b82f6` is one of the four
                   semantic accents this project deliberately does not
                   variablize, and that convention is about SURFACES working in
                   both themes — it is not a claim that white text clears AA on
                   them, and here it does not, in either theme. Blue-700 keeps
                   the meaning (attention, not error, not success) and takes
                   white at 6.70:1. */
                background: '#1d4ed8', color: 'white',
              }}
            >
              {reviewTotal}
            </span>
          )}
        </NavLink>
      );
    });

  return (
    <aside
      id="app-sidebar"
      className={isOpen ? 'sidebar is-open' : 'sidebar'}
      /* Closing on any activation inside the rail covers NavLinks, the profile
         header and the module links in one place, rather than threading onClose
         through five call sites and missing one. */
      onClick={onClose ? (e) => {
          if ((e.target as HTMLElement).closest('a,button')) onClose();
        } : undefined}
    >
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
          // Server-side since 2026-09-11. This read `localStorage` — a
          // per-BROWSER hide that did not follow the user to another device and
          // that mobile could not see at all. `?? []` and not `|| []` is not the
          // point here; the point is that a payload from an older server has no
          // `hidden_modules` key, and undefined must mean NOTHING hidden.
          const hidden = new Set(user?.hidden_modules ?? []);
          const visibleModules = activeModules.filter(m => !hidden.has(m.slug));
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
          /* `--accent-red` is #EF4444, which is 3.38:1 on the rail's hover
             surface and 3.65:1 at rest — below AA on the one control that
             signs you out. `--re-ink` is the theme's red for TEXT and exists
             for exactly this asymmetry: #b91c1c light (5.81 / 6.28) and
             #f87171 dark (5.83). The same split as --g-ink vs the brand
             green, and the same reason. */
          style={{ cursor: 'pointer', color: 'var(--re-ink)', marginBottom: '12px' }}
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
