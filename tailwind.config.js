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
          50:  '#EEF5FB',   // lightest tint
          100: '#D1E7F5',
          200: '#A3CFEB',
          300: '#75B7E1',
          400: '#479FD7',
          500: '#1A6FA8',   // sea blue — primary brand colour
          600: '#155A8A',
          700: '#10456B',
          800: '#0B304D',
          900: '#061B2E',   // darkest shade
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
        sans: ['Poppins', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}
