import animate from 'tailwindcss-animate'

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'], // solo light en uso, pero dejamos el selector preparado
  content: [
    './index.html',
    './renderer/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '1rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        /**
         * Tokens semánticos -> CSS variables en renderer/index.css.
         * Regla: NUNCA usar colores crudos (bg-blue-600) en componentes.
         * Siempre tokens semánticos (bg-primary, text-foreground, ...).
         */
        border:      'hsl(var(--tw-border) / <alpha-value>)',
        input:       'hsl(var(--tw-input) / <alpha-value>)',
        ring:        'hsl(var(--tw-ring) / <alpha-value>)',
        background:  'hsl(var(--tw-background) / <alpha-value>)',
        foreground:  'hsl(var(--tw-foreground) / <alpha-value>)',
        primary: {
          DEFAULT:    'hsl(var(--tw-primary) / <alpha-value>)',
          foreground: 'hsl(var(--tw-primary-foreground) / <alpha-value>)',
          50:  'hsl(var(--tw-primary-50) / <alpha-value>)',
          100: 'hsl(var(--tw-primary-100) / <alpha-value>)',
          200: 'hsl(var(--tw-primary-200) / <alpha-value>)',
          300: 'hsl(var(--tw-primary-300) / <alpha-value>)',
          400: 'hsl(var(--tw-primary-400) / <alpha-value>)',
          500: 'hsl(var(--tw-primary-500) / <alpha-value>)',
          600: 'hsl(var(--tw-primary-600) / <alpha-value>)',
          700: 'hsl(var(--tw-primary-700) / <alpha-value>)',
          800: 'hsl(var(--tw-primary-800) / <alpha-value>)',
          900: 'hsl(var(--tw-primary-900) / <alpha-value>)',
          950: 'hsl(var(--tw-primary-950) / <alpha-value>)',
        },
        secondary: {
          DEFAULT:    'hsl(var(--tw-secondary) / <alpha-value>)',
          foreground: 'hsl(var(--tw-secondary-foreground) / <alpha-value>)',
        },
        destructive: {
          DEFAULT:    'hsl(var(--tw-destructive) / <alpha-value>)',
          foreground: 'hsl(var(--tw-destructive-foreground) / <alpha-value>)',
          50:  'hsl(var(--tw-destructive-50) / <alpha-value>)',
          100: 'hsl(var(--tw-destructive-100) / <alpha-value>)',
          200: 'hsl(var(--tw-destructive-200) / <alpha-value>)',
          300: 'hsl(var(--tw-destructive-300) / <alpha-value>)',
          400: 'hsl(var(--tw-destructive-400) / <alpha-value>)',
          500: 'hsl(var(--tw-destructive-500) / <alpha-value>)',
          600: 'hsl(var(--tw-destructive-600) / <alpha-value>)',
          700: 'hsl(var(--tw-destructive-700) / <alpha-value>)',
          800: 'hsl(var(--tw-destructive-800) / <alpha-value>)',
          900: 'hsl(var(--tw-destructive-900) / <alpha-value>)',
          950: 'hsl(var(--tw-destructive-950) / <alpha-value>)',
        },
        muted: {
          DEFAULT:    'hsl(var(--tw-muted) / <alpha-value>)',
          foreground: 'hsl(var(--tw-muted-foreground) / <alpha-value>)',
        },
        accent: {
          DEFAULT:    'hsl(var(--tw-accent) / <alpha-value>)',
          foreground: 'hsl(var(--tw-accent-foreground) / <alpha-value>)',
        },
        popover: {
          DEFAULT:    'hsl(var(--tw-popover) / <alpha-value>)',
          foreground: 'hsl(var(--tw-popover-foreground) / <alpha-value>)',
        },
        card: {
          DEFAULT:    'hsl(var(--tw-card) / <alpha-value>)',
          foreground: 'hsl(var(--tw-card-foreground) / <alpha-value>)',
        },
        success: {
          DEFAULT:    'hsl(var(--tw-success) / <alpha-value>)',
          foreground: 'hsl(var(--tw-success-foreground) / <alpha-value>)',
        },
        warning: {
          DEFAULT:    'hsl(var(--tw-warning) / <alpha-value>)',
          foreground: 'hsl(var(--tw-warning-foreground) / <alpha-value>)',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': { from: { height: 0 }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up':   { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: 0 } },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up':   'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [animate],
}
