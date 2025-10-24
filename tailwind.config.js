// tailwind.config.js
const { fontFamily } = require('tailwindcss/defaultTheme');

/** Helper: allow `hsl(var(--token) / <alpha-value>)` */
const hslVar = (name) => ({ opacityValue }) =>
  opacityValue === undefined
    ? `hsl(var(${name}))`
    : `hsl(var(${name}) / ${opacityValue})`;

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',

  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],

  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', ...fontFamily.sans],
        serif: ['var(--font-noto-serif)', ...fontFamily.serif],
        mono: ['var(--font-roboto-mono)', ...fontFamily.mono],
      },

      // Map Tailwind color keys to your CSS variables (alpha-aware)
      colors: {
        background: hslVar('--background'),
        foreground: hslVar('--foreground'),
        primary: hslVar('--primary'),
        'primary-foreground': hslVar('--primary-fg'),
        muted: hslVar('--muted'),
        'muted-foreground': hslVar('--muted-fg'),
        success: hslVar('--success'),
        warning: hslVar('--warning'),
        danger: hslVar('--danger'),
      },

      boxShadow: {
        elev1: 'var(--elev-1)',
        elev2: 'var(--elev-2)',
      },
      borderRadius: {
        xl: '16px',
        '2xl': '20px',
      },
      // optional: smoother prose defaults that follow your tokens
      typography: (theme) => ({
        DEFAULT: {
          css: {
            '--tw-prose-body': theme('colors.foreground'),
            '--tw-prose-headings': theme('colors.foreground'),
            '--tw-prose-links': theme('colors.primary'),
            '--tw-prose-bold': theme('colors.foreground'),
            '--tw-prose-quotes': theme('colors.muted-foreground'),
            '--tw-prose-code': theme('colors.foreground'),
          },
        },
        invert: {
          css: {
            '--tw-prose-body': theme('colors.foreground'),
            '--tw-prose-headings': theme('colors.foreground'),
            '--tw-prose-links': theme('colors.primary'),
            '--tw-prose-bold': theme('colors.foreground'),
            '--tw-prose-quotes': theme('colors.muted-foreground'),
            '--tw-prose-code': theme('colors.foreground'),
          },
        },
      }),
    },
  },

  plugins: [require('@tailwindcss/typography')],
};
