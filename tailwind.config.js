/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50:  '#eef2ff',
          500: '#6366f1',
          600: '#4f46e5',
        },
        easy:     { DEFAULT: '#10b981', light: '#d1fae5' },
        moderate: { DEFAULT: '#f59e0b', light: '#fef3c7' },
        hard:     { DEFAULT: '#ef4444', light: '#fee2e2' },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
};
