/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        retac: {
          navy: '#0B132B',
          navySecondary: '#0E1A33',
          gold: '#D4AF37',
          goldSecondary: '#B8952E',
          bg: '#F4F6F9',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Cairo', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
