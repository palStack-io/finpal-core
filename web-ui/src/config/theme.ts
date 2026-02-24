/**
 * Theme Configuration
 * Ported from the original HTML/CSS design
 */

export const theme = {
  colors: {
    primary: {
      DEFAULT: '#15803d',
      dark: '#166534',
      darker: '#14532d',
    },
    accent: {
      DEFAULT: '#fbbf24',
      light: '#fef3c7',
      gold: '#ffd700',
    },
    background: {
      dark: '#111827',
      darker: '#030712',
    },
    green: {
      money: '#22c55e',
    },
    text: {
      primary: '#ffffff',
      secondary: 'rgba(255, 255, 255, 0.8)',
      muted: 'rgba(255, 255, 255, 0.6)',
    },
  },

  spacing: {
    sidebarWidth: '250px',
    sidebarMiniWidth: '70px',
    headerHeight: '60px',
  },

  transitions: {
    speed: '0.3s',
  },

  shadows: {
    card: '0 4px 6px rgba(0, 0, 0, 0.1)',
    hover: '0 8px 15px rgba(0, 0, 0, 0.15)',
  },

  borderRadius: {
    card: '16px',
    button: '8px',
  },
} as const;

export type Theme = typeof theme;
