import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Cores da marca SodCapital
        primary: {
          DEFAULT: '#1555D6',
          900: '#0B2A6B',
          foreground: '#ffffff'
        },
        gray: {
          DEFAULT: '#6E7485',
          100: '#F5F5F7',
          200: '#E5E7EB',
          300: '#D1D5DB',
          400: '#9CA3AF',
          500: '#6E7485',
          600: '#4B5563',
          700: '#374151',
          800: '#1F2937',
          900: '#111827'
        },
        background: '#FFFFFF',
        foreground: '#111827',
        card: {
          DEFAULT: '#FFFFFF',
          foreground: '#111827'
        },
        muted: {
          DEFAULT: '#F5F5F7',
          foreground: '#6E7485'
        },
        border: '#E5E7EB',
        input: '#E5E7EB',
        ring: '#1555D6',
        // Status colors
        success: '#10B981',
        warning: '#F59E0B',
        danger: '#EF4444',
        info: '#3B82F6'
      },
      borderRadius: {
        lg: '0.75rem',
        md: '0.5rem',
        sm: '0.25rem',
        '2xl': '1rem'
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: [require('tailwindcss-animate')],
}

export default config
