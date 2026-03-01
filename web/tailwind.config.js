/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        accent: "var(--color-accent)",
        "accent-muted": "var(--color-accent-muted)",
        panel: "var(--color-panel)",
        "panel-border": "var(--color-panel-border)",
        bg: "var(--color-bg)",
        "bg-overlay": "var(--color-bg-overlay)",
      },
      fontFamily: {
        sans: "var(--font-sans), ui-sans-serif, system-ui, sans-serif",
        mono: "var(--font-mono), ui-monospace, monospace",
      },
    },
  },
  plugins: [],
};
