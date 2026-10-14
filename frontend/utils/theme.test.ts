import { describe, expect, it } from "vitest";
import { parseTheme, resolveDark, THEME_INIT_SCRIPT, DEFAULT_THEME } from "./theme";

describe("parseTheme", () => {
    it("keeps valid saved settings", () => {
        expect(parseTheme("dark", "violet")).toEqual({ mode: "dark", accent: "violet" });
    });

    it("falls back to the defaults for missing or unknown values", () => {
        expect(parseTheme(null, null)).toEqual(DEFAULT_THEME);
        expect(parseTheme("purple", "neon")).toEqual(DEFAULT_THEME);
    });
});

describe("resolveDark", () => {
    it("follows the chosen mode, or the device for 'system'", () => {
        expect(resolveDark("light", true)).toBe(false);
        expect(resolveDark("dark", false)).toBe(true);
        expect(resolveDark("system", true)).toBe(true);
        expect(resolveDark("system", false)).toBe(false);
    });
});

describe("THEME_INIT_SCRIPT", () => {
    function run(saved: Record<string, string>, deviceDark = false) {
        const root = { dataset: {} as Record<string, string>, style: {} as Record<string, string> };
        const fakeWindow = { matchMedia: () => ({ matches: deviceDark }) };
        const fakeStorage = { getItem: (key: string) => saved[key] ?? null };
        new Function("document", "window", "localStorage", THEME_INIT_SCRIPT)(
            { documentElement: root },
            fakeWindow,
            fakeStorage,
        );
        return root;
    }

    it("applies the saved theme before the page draws", () => {
        const root = run({ "theme-mode": "dark", "theme-accent": "indigo" });
        expect(root.dataset).toEqual({ theme: "dark", accent: "indigo" });
        expect(root.style.colorScheme).toBe("dark");
    });

    it("matches the device in 'system' mode", () => {
        expect(run({ "theme-mode": "system" }, true).dataset.theme).toBe("dark");
    });

    it("uses the defaults when nothing valid is saved", () => {
        expect(run({ "theme-mode": "nope" }).dataset).toEqual({ theme: "light", accent: "ocean" });
    });
});
