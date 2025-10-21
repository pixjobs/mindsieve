// tailwind.config.js

const { fontFamily } = require('tailwindcss/defaultTheme');

/** @type {import('tailwindcss').Config} */
module.exports = {
  // Switched to 'class' to enable manual or default dark mode via a class on the <html> tag.
  // This aligns with the `className="dark"` set in your optimized layout.tsx.
  darkMode: 'class',

  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],

  theme: {
    extend: {
      // Integrated the --font-noto-serif variable for use with the `font-serif` utility class.
      fontFamily: {
        sans: ["var(--font-inter)", ...fontFamily.sans],
        serif: ["var(--font-noto-serif)", ...fontFamily.serif], // Added serif font
        mono: ["var(--font-roboto-mono)", ...fontFamily.mono],
      },
      // Your existing color and style extensions are preserved.
      colors: {
        background: "var(--color-background)",
        foreground: "var(--color-foreground)",
        primary: "var(--color-primary)",
        "primary-foreground": "var(--color-primary-foreground)",
        muted: "var(--color-muted)",
        "muted-foreground": "var(--color-muted-foreground)",
        success: "var(--color-success)",
        warning: "var(--color-warning)",
        danger: "var(--color-danger)",
      },
      boxShadow: {
        elev1: "var(--elev-1)",
        elev2: "var(--elev-2)",
      },
      borderRadius: {
        xl: "16px",
        "2xl": "20px",
      },
    },
  },

  // Added the @tailwindcss/typography plugin to style the markdown output from react-markdown.
  plugins: [
    require('@tailwindcss/typography'),
  ],
};