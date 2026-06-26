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
          ink: "#101916",
          onyx: "#0b1310",
          charcoal: "#303832",
          gold: "#a98245",
          goldlight: "#c9a86a",
          mist: "#f4f2ed",
          line: "#d6cec1",
          pearl: "#fbfaf6",
          cream: "#faf8f2",
          forest: "#173b33",
          ruby: "#7f2d35",
          steel: "#33485a",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Arial", "sans-serif"],
      },
      backgroundImage: {
        "gold-sheen": "linear-gradient(180deg, #c19a55 0%, #a98245 55%, #8f6c39 100%)",
        "sidebar-onyx": "linear-gradient(180deg, #14201b 0%, #0d1611 60%, #0b1310 100%)",
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
