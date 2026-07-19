import type { Config } from "tailwindcss";

function withOpacity(variable: string) {
  return `rgb(var(${variable}) / <alpha-value>)`;
}

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        canvas: withOpacity("--color-canvas"),
        surface: {
          DEFAULT: withOpacity("--color-surface"),
          muted: withOpacity("--color-surface-muted"),
        },
        border: {
          DEFAULT: withOpacity("--color-border"),
          strong: withOpacity("--color-border-strong"),
        },
        text: {
          primary: withOpacity("--color-text-primary"),
          secondary: withOpacity("--color-text-secondary"),
          muted: withOpacity("--color-text-muted"),
          inverse: withOpacity("--color-text-inverse"),
        },
        accent: {
          DEFAULT: withOpacity("--color-accent"),
          hover: withOpacity("--color-accent-hover"),
          pressed: withOpacity("--color-accent-pressed"),
          subtle: withOpacity("--color-accent-subtle"),
          "subtle-border": withOpacity("--color-accent-subtle-border"),
        },
        success: {
          bg: withOpacity("--color-success-bg"),
          text: withOpacity("--color-success-text"),
        },
        warning: {
          bg: withOpacity("--color-warning-bg"),
          text: withOpacity("--color-warning-text"),
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1rem",
      },
      boxShadow: {
        elevate: "0 4px 16px -4px rgb(var(--shadow-color) / 0.12)",
        "elevate-lg": "0 12px 32px -8px rgb(var(--shadow-color) / 0.18)",
      },
      maxWidth: {
        canvas: "1440px",
      },
    },
  },
  plugins: [],
} satisfies Config;
