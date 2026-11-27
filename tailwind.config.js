/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        retac: {
          navy: '#101C32',
          navySecondary: '#0B132B',
          gold: '#C5A46D',
          goldSecondary: '#D9C39A',
          bg: '#F7F5F0',
          ivory: '#F7F5F0',
          text: '#263247',
          line: '#E8E4DA',
        },
      },
      fontFamily: {
        sans: ['IBM Plex Sans Arabic', 'Cairo', 'Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
