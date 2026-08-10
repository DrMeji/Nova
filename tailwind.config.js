/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ark: {
          navy: {
            950: '#0a0e1a',
            900: '#0d1320',
            800: '#131b2e',
            700: '#1a2440',
            600: '#223056',
          },
          blue: {
            50: '#eef4ff',
            100: '#d9e6ff',
            200: '#bcd3ff',
            300: '#8eb5ff',
            400: '#5b8def',
            500: '#3b6fd9',
            600: '#2a56b8',
            700: '#234899',
            800: '#1f3d7a',
            900: '#1b3363',
          },
          accent: {
            blue: '#4a8dfd',
            green: '#3ecf8e',
            amber: '#f5a623',
            red: '#ef4444',
          },
        },
        surface: {
          DEFAULT: '#0d1320',
          hover: '#131b2e',
          active: '#1a2440',
          panel: '#101729',
          border: '#1e2a45',
          'border-light': '#2a3a5e',
        },
        content: {
          primary: '#e8ecf4',
          secondary: '#8b97b0',
          tertiary: '#5a6580',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'Menlo', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-in-right': 'slideInRight 0.25s ease-out',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
        'spin-slow': 'spin 3s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(12px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
};
