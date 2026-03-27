import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: { extend: {
    colors: {
      reebok: {
        red: '#CC0000',
        dark: '#1a1a1a',
        grey: '#f5f5f5',
      },
    },
  } },
  plugins: [],
};
export default config;
