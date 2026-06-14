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
          ink: "#17130f",
          charcoal: "#24211d",
          gold: "#b9904a",
          mist: "#f6f3ee",
          line: "#ded6c8",
          pearl: "#fffaf1",
          forest: "#1f4a3d",
          ruby: "#8d2f2f",
          steel: "#35506b",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
