import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Deep charcoal base
        charcoal: {
          950: '#0d0e10',
          900: '#12141a',
          800: '#1a1d24',
          700: '#22262f',
          600: '#2c3140',
        },
        // Amber/gold for alerts
        amber: {
          400: '#fbbf24',
          500: '#f59e0b',
        },
        // Plate status colors
        valid: '#22c55e',      // green-500
        flagged: '#ef4444',    // red-500
        unknown: '#94a3b8',    // slate-400
        expired: '#f97316',    // orange-500
        stolen: '#dc2626',     // red-600
      },
      fontFamily: {
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui'],
      },
    },
  },
  plugins: [],
} satisfies Config
