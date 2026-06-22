/** @type {import('tailwindcss').Config} */

// Helper: generates a color that works with Tailwind's bg-opacity / bg-*/opacity modifiers
function v(varName) {
  return ({ opacityValue }) =>
    opacityValue !== undefined
      ? `rgb(var(${varName}) / ${opacityValue})`
      : `rgb(var(${varName}))`
}

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50:  '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        // Surface palette — driven by CSS variables so theme switch is instant
        dark: {
          900: v('--s0'),   // page background
          800: v('--s1'),   // cards / panels
          750: v('--s2'),   // slightly elevated cards
          700: v('--s2'),   // inputs / elevated surfaces
          600: v('--s3'),   // borders
          500: v('--s4'),   // strong borders / dividers
          400: v('--s4'),   // strong borders (alias)
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}
