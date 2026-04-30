/**
 * Theme Configuration
 * Ported from the original HTML/CSS design
 */

export const theme = {
  colors: {
    primary: {
      DEFAULT: 'var(--brand-main-green)',
      dark: 'var(--brand-dark-green)',
      darker: '#14532d',
    },
    accent: {
      DEFAULT: 'var(--brand-accent-gold)',
      light: '#fef3c7',
      gold: '#ffd700',
    },
    background: {
      dark: '#111827',
      darker: '#030712',
    },
    green: {
      money: 'var(--brand-green-glow)',
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

/** Ordered palette for chart series / category rotation (8 distinct colors). */
export const CHART_COLORS = [
  'var(--accent-blue)', // blue
  'var(--accent-green)', // emerald
  'var(--accent-yellow)', // amber
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f43f5e', // rose
  '#06b6d4', // cyan
] as const;

export type Theme = typeof theme;
