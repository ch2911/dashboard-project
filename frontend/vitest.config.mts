import { defineConfig } from "vitest/config";

export default defineConfig({
    // tsconfig keeps JSX as-is for Next.js, so the tests compile it themselves
    esbuild: { jsx: "automatic" },
    test: {
        // Plain logic runs in Node; React tests opt into a browser-like DOM with `// @vitest-environment jsdom`
        environment: "node",
        coverage: {
            provider: "v8",
            include: ["components/**", "hooks/**", "lib/**", "utils/**", "src/**"],
            exclude: ["**/*.test.*"],
            reporter: ["text", "text-summary"],
        },
    },
});
