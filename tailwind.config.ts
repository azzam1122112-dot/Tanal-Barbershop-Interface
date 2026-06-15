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
          charcoal: "#303832",
          gold: "#a98245",
          mist: "#f4f2ed",
          line: "#d6cec1",
          pearl: "#fbfaf6",
          forest: "#173b33",
          ruby: "#7f2d35",
          steel: "#33485a",
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
