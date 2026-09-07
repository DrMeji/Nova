/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        NOVA: {
          // Theme-aware neutrals (were navy/blue). Values flip via :root / .light CSS vars.
          navy: {
            950: 'rgb(var(--ark-navy-950) / <alpha-value>)',
            900: 'rgb(var(--ark-navy-900) / <alpha-value>)',
            800: 'rgb(var(--ark-navy-800) / <alpha-value>)',
            700: 'rgb(var(--ark-navy-700) / <alpha-value>)',
            600: 'rgb(var(--ark-navy-600) / <alpha-value>)',
          },
          blue: {
            50: 'rgb(var(--ark-accent-50) / <alpha-value>)',
            100: 'rgb(var(--ark-accent-100) / <alpha-value>)',
            200: 'rgb(var(--ark-accent-200) / <alpha-value>)',
            300: 'rgb(var(--ark-accent-300) / <alpha-value>)',
            400: 'rgb(var(--ark-accent-400) / <alpha-value>)',
            500: 'rgb(var(--ark-accent-500) / <alpha-value>)',
            600: 'rgb(var(--ark-accent-600) / <alpha-value>)',
            700: 'rgb(var(--ark-accent-700) / <alpha-value>)',
            800: 'rgb(var(--ark-accent-800) / <alpha-value>)',
            900: 'rgb(var(--ark-accent-900) / <alpha-value>)',
          },
          accent: {
            blue: 'rgb(var(--ark-accent-400) / <alpha-value>)',
            green: '#3ecf8e',
            amber: '#f5a623',
            red: '#ef4444',
          },
        },
        surface: {
          DEFAULT: 'rgb(var(--color-surface) / <alpha-value>)',
          hover: 'rgb(var(--color-surface-hover) / <alpha-value>)',
          active: 'rgb(var(--color-surface-active) / <alpha-value>)',
          panel: 'rgb(var(--color-surface-panel) / <alpha-value>)',
          border: 'rgb(var(--color-surface-border) / <alpha-value>)',
          'border-light': 'rgb(var(--color-surface-border-light) / <alpha-value>)',
        },
        content: {
          primary: 'rgb(var(--color-content-primary) / <alpha-value>)',
          secondary: 'rgb(var(--color-content-secondary) / <alpha-value>)',
          tertiary: 'rgb(var(--color-content-tertiary) / <alpha-value>)',
        },
      },
    },
  },
  plugins: [],
};
