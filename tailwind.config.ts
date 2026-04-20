import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef7f4',
          100: '#d5ebe3',
          500: '#2f8f6f',
          600: '#24755a',
          700: '#1b5a46',
          900: '#0e2e24',
        },
        severity: {
          mild: '#f5c518',
          moderate: '#f28b30',
          severe: '#d93025',
        },
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
