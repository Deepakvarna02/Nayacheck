import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#12233d',
        ember: '#f06b2b',
        sand: '#f7f1e6',
        sage: '#93b18a'
      },
      fontFamily: {
        display: ['"Sora"', 'sans-serif'],
        body: ['"Manrope"', 'sans-serif']
      },
      boxShadow: {
        panel: '0 18px 40px rgba(18, 35, 61, 0.12)'
      }
    }
  },
  plugins: []
};

export default config;
