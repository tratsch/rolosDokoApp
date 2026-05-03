/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        card: {
          red: '#dc2626',
          black: '#1a1a1a',
          gold: '#f59e0b',
          bg: '#f8f4e8',
          border: '#d4af37',
        },
        table: {
          green: '#2d6a4f',
          darkGreen: '#1b4332',
          felt: '#40916c',
        },
      },
      fontFamily: {
        card: ['Georgia', 'serif'],
      },
      boxShadow: {
        card: '2px 4px 8px rgba(0,0,0,0.3)',
        'card-hover': '4px 8px 16px rgba(0,0,0,0.4)',
      },
    },
  },
  plugins: [],
};
