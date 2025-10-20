// tailwind.config.js
/** @type {import('tailwindcss').Config} */
module.exports = {
  // In v4 you don't need `content:` — Tailwind's PostCSS plugin handles it.
  // Keep dark mode driven by the user's OS (you already use prefers-color-scheme).
  darkMode: ["media"], // switch to 'class' if you add a manual theme toggle
  theme: {
    extend: {
      // Hook your Next font variables so Tailwind utilities pick them up
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-roboto-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      // Optional: map CSS variable colors to Tailwind color tokens for convenience
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
  plugins: [],
};
