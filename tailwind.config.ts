import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        salon: {
          ink: "#15111f",
          onyx: "#09070f",
          charcoal: "#4b4655",
          gold: "#7c3aed",
          goldlight: "#c4b5fd",
          mist: "#f4f1f9",
          line: "#ddd6ee",
          pearl: "#fcfbff",
          cream: "#f9f7fc",
          forest: "#4c1d95",
          ruby: "#7f2d35",
          steel: "#33485a",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Arial", "sans-serif"],
      },
      backgroundImage: {
        "gold-sheen": "linear-gradient(180deg, #9f7aea 0%, #7c3aed 55%, #5b21b6 100%)",
        "sidebar-onyx": "linear-gradient(180deg, #171020 0%, #0d0914 60%, #09070f 100%)",
      },
      boxShadow: {
        lux: "0 10px 24px -12px rgba(16,25,22,0.18), 0 4px 10px -6px rgba(16,25,22,0.10)",
        "lux-lg": "0 28px 60px -28px rgba(16,25,22,0.32), 0 12px 28px -18px rgba(16,25,22,0.16)",
      },
      letterSpacing: {
        eyebrow: "0.18em",
      },
    },
  },
  plugins: [],
};

export default config;
