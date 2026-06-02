import type { Config } from 'tailwindcss';

export default {
  content: ['./popup.html', './options.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#111827',
        panel: '#f8fafc',
        accent: '#0f766e',
      },
    },
  },
  plugins: [],
} satisfies Config;
