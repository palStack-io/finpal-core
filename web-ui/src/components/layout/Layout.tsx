/**
 * Layout Component
 * Main layout wrapper with header, sidebar, and content
 *
 * Inline styles with CSS variables, matching the other 49 files in this app.
 * It previously used Tailwind, whose config hardcodes `background.dark: #111827`
 * with no `data-theme` awareness — so the app shell could not follow the
 * light/dark toggle at all.
 */

import React, { useState } from 'react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';

interface LayoutProps {
  children: React.ReactNode;
}

const shellStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: 'var(--bg-primary)',
};

/**
 * Faint dollar-sign wallpaper: 144 pulsing glyphs at 5% opacity.
 *
 * Preserved as-is rather than dropped. It is a deliberate design choice, and
 * removing it belongs to D3 (visual refresh), not to a styling convergence that
 * should not change how anything looks. Worth revisiting there though — 144
 * animated nodes render behind every page, and at 5% opacity on the new light
 * background it is close to invisible anyway.
 */
const wallpaperStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  overflow: 'hidden',
  pointerEvents: 'none',
  opacity: 0.05,
};

const wallpaperGridStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'grid',
  gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
  gap: '32px',
  padding: '32px',
  fontSize: '60px',
  color: '#22c55e',
};

const wallpaperCellStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const contentRowStyle: React.CSSProperties = {
  position: 'relative',
  display: 'flex',
  height: '100vh',
  overflow: 'hidden',
};

const columnStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const mainStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
};

const containerStyle: React.CSSProperties = {
  margin: '0 auto',
  padding: '32px 16px',
  maxWidth: '1280px',
  width: '100%',
  boxSizing: 'border-box',
};

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const closeSidebar = () => {
    setIsSidebarOpen(false);
  };

  return (
    <div style={shellStyle}>
      <div style={wallpaperStyle} aria-hidden="true">
        <div style={wallpaperGridStyle}>
          {Array.from({ length: 144 }).map((_, i) => (
            <div
              key={i}
              style={{ ...wallpaperCellStyle, animationDelay: `${i * 0.1}s` }}
              className="animate-pulse"
            >
              $
            </div>
          ))}
        </div>
      </div>

      <div style={contentRowStyle}>
        <Sidebar isOpen={isSidebarOpen} onClose={closeSidebar} />

        <div style={columnStyle}>
          <Header onMenuToggle={toggleSidebar} isSidebarOpen={isSidebarOpen} />

          <main style={mainStyle}>
            <div style={containerStyle}>
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};
