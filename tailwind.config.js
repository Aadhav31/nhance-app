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
          50:  '#FDF2F5',   // blush tint
          100: '#FCE7ED',
          200: '#F9CAD7',
          300: '#F3A2B8',
          400: '#E57191',
          500: '#C9426A',
          600: '#A72D50',   // burgundy — primary brand colour
          700: '#84213F',
          800: '#651A33',
          900: '#3A0E1D',   // deepest wine
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
