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
    keyframes: {
      'save-flash': {
        '0%': { backgroundColor: 'rgb(220 252 231)', borderRadius: '4px', padding: '0 4px' },
        '100%': { backgroundColor: 'transparent', borderRadius: '4px', padding: '0 4px' },
      },
    },
    animation: {
      'save-flash': 'save-flash 1.5s ease-out',
    },
  } },
  plugins: [],
};
export default config;
