/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
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
      },
      backgroundImage: {
        'gradient-main': 'linear-gradient(to bottom right, var(--tw-gradient-stops))',
      },
      backdropBlur: {
        'xs': '2px',
      },
    },
  },
  plugins: [],
}
