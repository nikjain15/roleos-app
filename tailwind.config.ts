import type { Config } from "tailwindcss";

// RoleOS design system — Tailwind mapping. All values are CSS variables defined
// in app/globals.css (light = default, dark = `.theme-dark`), so light/dark and
// any future re-theme is one source. Direction: OpenRouter-structured — cool
// neutrals, grape lead accent, tidy type + radius scale. See docs/specs/design-system.md.
const config: Config = {
  darkMode: ["class", ".theme-dark"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // brand
        ink: "var(--ink)",
        cloud: "var(--cloud)",
        grape: "var(--grape)",
        volt: "var(--volt)",
        coral: "var(--coral)",
        royal: "var(--royal)",
        // surfaces
        bg: "var(--bg)",
        surf: "var(--surf)",
        surf2: "var(--surf2)",
        surf3: "var(--surf3)",
        // text
        tx: "var(--tx)",
        tx2: "var(--tx2)",
        tx3: "var(--tx3)",
        // borders
        bd: "var(--bd)",
        bd2: "var(--bd2)",
        // primary (grape)
        primary: {
          DEFAULT: "var(--primary)",
          tx: "var(--primary-tx)",
          hover: "var(--primary-hover)",
          active: "var(--primary-active)",
          bg: "var(--primary-bg)",
          bd: "var(--primary-bd)",
        },
        link: "var(--link)",
        spark: "var(--spark)",
        "spark-ink": "var(--spark-ink)",
        // semantic states
        info: "var(--info)", "info-tx": "var(--info-tx)", "info-bg": "var(--info-bg)", "info-bd": "var(--info-bd)",
        suc: "var(--suc)", "suc-tx": "var(--suc-tx)", "suc-bg": "var(--suc-bg)", "suc-bd": "var(--suc-bd)",
        warn: "var(--warn)", "warn-tx": "var(--warn-tx)", "warn-bg": "var(--warn-bg)", "warn-bd": "var(--warn-bd)",
        dng: "var(--dng)", "dng-tx": "var(--dng-tx)", "dng-bg": "var(--dng-bg)", "dng-bd": "var(--dng-bd)",
      },
      fontFamily: {
        display: ["var(--font-display)"],
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
      },
      fontSize: {
        display: ["var(--t-display)", { lineHeight: "var(--lh-tight)", letterSpacing: "var(--tr-display)" }],
        h1: ["var(--t-h1)", { lineHeight: "var(--lh-tight)", letterSpacing: "var(--tr-display)" }],
        h2: ["var(--t-h2)", { lineHeight: "var(--lh-snug)", letterSpacing: "var(--tr-tight)" }],
        h3: ["var(--t-h3)", { lineHeight: "var(--lh-snug)" }],
        section: ["var(--t-section)", { lineHeight: "var(--lh-snug)" }],
        body: ["var(--t-body)", { lineHeight: "var(--lh-body)" }],
        small: ["var(--t-small)", { lineHeight: "var(--lh-snug)" }],
        overline: ["var(--t-overline)", { lineHeight: "var(--lh-snug)", letterSpacing: "var(--tr-overline)" }],
      },
      fontWeight: {
        body: "450",
        medium: "500",
        semibold: "600",
        bold: "700",
      },
      borderRadius: {
        sm: "var(--r-sm)",
        md: "var(--r-md)",
        lg: "var(--r-lg)",
        xl: "var(--r-xl)",
        "2xl": "var(--r-2xl)",
        full: "var(--r-full)",
      },
      boxShadow: {
        sm: "var(--sh-sm)",
        md: "var(--sh-md)",
        lg: "var(--sh-lg)",
        ring: "0 0 0 3px var(--primary-ring)",
      },
      transitionTimingFunction: {
        ro: "var(--ease)",
      },
    },
  },
  plugins: [],
};

export default config;
