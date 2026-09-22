import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: {
          light: "#F6F5F3",
          dark: "#0C0A0F",
        },
        surface: {
          light: "#FFFFFF",
          dark: "#17151C",
        },
        line: {
          light: "#E7E4DF",
          dark: "#2A2632",
        },
        accent: {
          DEFAULT: "#E08A3C",
          soft: "#FCEEDD",
          dark: "#B86A28",
        },
        success: {
          DEFAULT: "#34C77B",
          soft: "#E6F9EF",
          dark: "#1F9D5D",
        },
        warning: {
          DEFAULT: "#F0B429",
          soft: "#FEF6DD",
          dark: "#C68F12",
        },
        danger: {
          DEFAULT: "#F0475A",
          soft: "#FDE8EA",
          dark: "#C43349",
        },
        info: {
          DEFAULT: "#4C9FE8",
          soft: "#E8F3FD",
          dark: "#2E7AC4",
        },
        ink: {
          light: "#171316",
          dark: "#F1EEEA",
        },
        muted: {
          light: "#6E6A72",
          dark: "#9A94A3",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(16 12 20 / 0.05), 0 1px 3px 0 rgb(16 12 20 / 0.07)",
        pop: "0 8px 30px rgb(0 0 0 / 0.14)",
        glow: "0 0 0 1px rgb(224 138 60 / 0.16), 0 8px 24px -8px rgb(224 138 60 / 0.35)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.18s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;