import type { Config } from "tailwindcss";

// Palette + type lifted from the design docs (journey.html / ro-voice.html):
// warm-paper light, warm-charcoal dark, Inter + JetBrains Mono, "RO" info-blue.
// Exposed as CSS variables (see app/globals.css) so light/dark is one source.
const config: Config = {
  darkMode: "media",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surf: "var(--surf)",
        surf2: "var(--surf2)",
        tx: "var(--tx)",
        tx2: "var(--tx2)",
        tx3: "var(--tx3)",
        bd: "var(--bd)",
        info: "var(--info)",
        "info-bg": "var(--info-bg)",
        "info-tx": "var(--info-tx)",
        suc: "var(--suc)",
        "suc-bg": "var(--suc-bg)",
        warn: "var(--warn)",
        "warn-bg": "var(--warn-bg)",
        dng: "var(--dng)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Inter", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
