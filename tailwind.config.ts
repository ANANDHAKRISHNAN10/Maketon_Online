import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#080b11",
        surface: "#0f1623",
        "surface-card": "#141c2e",
        "surface-hover": "#1c273e",
        border: "#202c45",
        "border-glow": "#38bdf8",
        brand: {
          50: "#eef2ff",
          100: "#e0e7ff",
          200: "#c7d2fe",
          300: "#a5b4fc",
          400: "#818cf8",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
          800: "#3730a3",
          900: "#312e81",
          neon: "#00f0ff",
          glow: "#6366f1",
        },
        cyber: {
          cyan: "#00f0ff",
          emerald: "#10b981",
          amber: "#f59e0b",
          rose: "#f43f5e",
          purple: "#a855f7",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
        gaming: ["Rajdhani", "ui-sans-serif", "sans-serif"],
      },
      boxShadow: {
        "neon-cyan": "0 0 15px -3px rgba(0, 240, 255, 0.3)",
        "neon-purple": "0 0 20px -3px rgba(168, 85, 247, 0.35)",
        "neon-emerald": "0 0 15px -3px rgba(16, 185, 129, 0.3)",
        "card-glow": "0 4px 20px -2px rgba(0, 0, 0, 0.5), 0 0 1px 1px rgba(255, 255, 255, 0.05)",
      },
    },
  },
  plugins: [],
};

export default config;
