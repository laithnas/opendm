import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: {
          light: "#F5F6F8",
          dark: "#0B0E13",
        },
        surface: {
          light: "#FFFFFF",
          dark: "#14181F",
        },
        line: {
          light: "#E5E7EB",
          dark: "#232A35",
        },
        accent: {
          DEFAULT: "#E5322D",
          soft: "#FDEDEC",
          dark: "#C42A26",
        },
        ink: {
          light: "#111827",
          dark: "#EDEFF3",
        },
        muted: {
          light: "#6B7280",
          dark: "#9AA3B2",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(16 24 40 / 0.04), 0 1px 3px 0 rgb(16 24 40 / 0.06)",
        pop: "0 8px 30px rgb(0 0 0 / 0.12)",
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