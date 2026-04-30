import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'Plus Jakarta Sans Variable'", "'Plus Jakarta Sans'", "system-ui", "sans-serif"],
        mono: ["'Plus Jakarta Sans Variable'", "'Plus Jakarta Sans'", "system-ui", "sans-serif"],
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // ============ KOAST DESIGN SYSTEM (April 2026) ============
        // Primary — coastal greens
        "deep-sea": "var(--deep-sea)",
        coastal: "var(--coastal)",
        mangrove: "var(--mangrove)",
        tideline: "var(--tideline)",
        // Accent — golden hour
        golden: "var(--golden)",
        driftwood: "var(--driftwood)",
        sandbar: "var(--sandbar)",
        // Neutral — sandy shore
        shore: "var(--shore)",
        "shore-soft": "var(--shore-soft)",
        "dry-sand": "var(--dry-sand)",
        shell: "var(--shell)",
        hairline: "var(--hairline)",
        white: "var(--white)",
        // Lume — cool teal AI accent
        "lume-light": "var(--lume-light)",
        lume: "var(--lume)",
        "lume-deep": "var(--lume-deep)",
        // Untokenized decisions
        positive: "var(--positive)",
        abyss: "var(--abyss)",
        // Semantic
        "coral-reef": "var(--coral-reef)",
        "amber-tide": "var(--amber-tide)",
        lagoon: "var(--lagoon)",
        "deep-water": "var(--deep-water)",
        "bar-dark": "var(--bar-dark)",
        // ============ LEGACY ALIASES (transition) ============
        forest: {
          DEFAULT: "var(--forest)",
          light: "var(--forest-light)",
          muted: "var(--forest-muted)",
        },
        brass: {
          DEFAULT: "var(--brass)",
          light: "var(--brass-light)",
          dark: "var(--brass-dark)",
        },
        linen: {
          DEFAULT: "var(--linen)",
          dark: "var(--linen-dark)",
        },
        ink: {
          DEFAULT: "var(--ink)",
          secondary: "var(--ink-secondary)",
          muted: "var(--ink-muted)",
        },
        neutral: {
          0: "var(--neutral-0)",
          25: "var(--neutral-25)",
          50: "var(--neutral-50)",
          100: "var(--neutral-100)",
          200: "var(--neutral-200)",
          300: "var(--neutral-300)",
          400: "var(--neutral-400)",
          500: "var(--neutral-500)",
          600: "var(--neutral-600)",
          700: "var(--neutral-700)",
          800: "var(--neutral-800)",
          900: "var(--neutral-900)",
        },
        sidebar: {
          bg: "var(--sidebar-bg)",
          text: "var(--sidebar-text)",
          "text-active": "var(--sidebar-text-active)",
          hover: "var(--sidebar-hover)",
          "active-bg": "var(--sidebar-active-bg)",
          "active-text": "var(--sidebar-active-text)",
          border: "var(--sidebar-border)",
        },
        success: { DEFAULT: "var(--success)", light: "var(--success-light)" },
        warning: { DEFAULT: "var(--warning)", light: "var(--warning-light)" },
        danger: { DEFAULT: "var(--danger)", light: "var(--danger-light)" },
        info: { DEFAULT: "var(--info)", light: "var(--info-light)" },
        airbnb: "var(--airbnb)",
        vrbo: "var(--vrbo)",
        "booking-com": "var(--booking-com)",
        direct: "var(--direct)",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        xl: "var(--shadow-xl)",
        card: "var(--shadow-card)",
        "card-hover": "var(--shadow-card-hover)",
        glass: "var(--shadow-glass)",
        "glass-hover": "var(--shadow-glass-hover)",
        sidebar: "var(--shadow-sidebar)",
        "logo-glow": "var(--shadow-logo-glow)",
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        full: "var(--radius-full)",
      },
      fontSize: {
        xs: "var(--text-xs)",
        sm: "var(--text-sm)",
        base: "var(--text-base)",
        md: "var(--text-md)",
        lg: "var(--text-lg)",
        xl: "var(--text-xl)",
        "2xl": "var(--text-2xl)",
        "3xl": "var(--text-3xl)",
        "4xl": "var(--text-4xl)",
      },
      transitionDuration: {
        fast: "120ms",
        base: "200ms",
        slow: "300ms",
      },
    },
  },
  plugins: [],
};
export default config;
