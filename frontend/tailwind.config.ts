// In frontend/tailwind.config.ts
import type { Config } from "tailwindcss";

const config: Config = {
    content: [
        "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
        "./components/**/*.{js,ts,jsx,tsx,mdx}", // Also check root components folder
        "./hooks/**/*.{js,ts,jsx,tsx,mdx}",     // And hooks folder
    ],
    theme: {
        extend: {},
    },
    plugins: [],
};
export default config;