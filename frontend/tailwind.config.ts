import type { Config } from "tailwindcss";

// The --background/--border/etc CSS variables hold full `oklch(...)` colors
// (not raw channel triples), so Tailwind can't append an alpha channel on
// its own for opacity modifiers like `bg-primary/80`. This builds that value
// using CSS relative-color syntax, which lets Tailwind override just the
// alpha while keeping the variable's l/c/h.
function withOpacity(variableName: string) {
  return ({ opacityValue }: { opacityValue?: string }) => {
    if (opacityValue !== undefined) {
      return `oklch(from var(${variableName}) l c h / ${opacityValue})`;
    }
    return `var(${variableName})`;
  };
}

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        /* Brand palette */
        red: "#B5091D",        /* headings, links, buttons, active states, icons, borders */
        darkergrey: "#333333", /* header/nav background, carousel background, dark section backgrounds */
        darkgrey: "#4D4D4D",   /* body copy, card backgrounds, secondary headings */
        grey: "#666666",       /* borders, footer top border, dividers */
        demigrey: "#808080",   /* secondary/italic text, subtitles, author lines */
        lemigrey: "#D6D6D6",   /* hover states, light borders */
        lightgrey: "#E8E8E8",  /* light section backgrounds, footer text */
        whiteish: "#F0F0F0",   /* filter bars, light content blocks */
        background: withOpacity("--background"),
        foreground: withOpacity("--foreground"),
        border: withOpacity("--border"),
        input: withOpacity("--input"),
        ring: withOpacity("--ring"),
        primary: {
          DEFAULT: withOpacity("--primary"),
          foreground: withOpacity("--primary-foreground"),
        },
        secondary: {
          DEFAULT: withOpacity("--secondary"),
          foreground: withOpacity("--secondary-foreground"),
        },
        muted: {
          DEFAULT: withOpacity("--muted"),
          foreground: withOpacity("--muted-foreground"),
        },
        accent: {
          DEFAULT: withOpacity("--accent"),
          foreground: withOpacity("--accent-foreground"),
        },
        destructive: {
          DEFAULT: withOpacity("--destructive"),
        },
        card: {
          DEFAULT: withOpacity("--card"),
          foreground: withOpacity("--card-foreground"),
        },
        popover: {
          DEFAULT: withOpacity("--popover"),
          foreground: withOpacity("--popover-foreground"),
        },
        sidebar: {
          DEFAULT: withOpacity("--sidebar"),
          foreground: withOpacity("--sidebar-foreground"),
          primary: withOpacity("--sidebar-primary"),
          "primary-foreground": withOpacity("--sidebar-primary-foreground"),
          accent: withOpacity("--sidebar-accent"),
          "accent-foreground": withOpacity("--sidebar-accent-foreground"),
          border: withOpacity("--sidebar-border"),
          ring: withOpacity("--sidebar-ring"),
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [],
};
export default config;
