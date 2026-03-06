/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./index.html', './js/**/*.js'],
  theme: {
    extend: {
      colors: {
        primary: '#3b82f6',
        surface: '#1e293b',
        'surface-light': '#334155',
      },
    },
  },
  plugins: [],
};
