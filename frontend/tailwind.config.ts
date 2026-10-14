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
        extend: {
            // sky-* follows the accent chosen on the settings page (see globals.css)
            colors: {
                sky: Object.fromEntries(
                    ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"].map((shade) => [
                        shade,
                        `rgb(var(--accent-${shade}) / <alpha-value>)`,
                    ]),
                ),
            },
        },
    },
    plugins: [],
};
export default config;