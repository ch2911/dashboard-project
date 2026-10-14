// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDeviceTheme } from "../test/fakes";
import {
    ACCENT_KEY,
    DEFAULT_THEME,
    MODE_KEY,
    THEME_INIT_SCRIPT,
    applyTheme,
    followDeviceTheme,
    loadTheme,
    parseTheme,
    resolveDark,
    saveTheme,
} from "./theme";

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

describe("applying and saving the theme", () => {
    const root = document.documentElement;

    beforeEach(() => {
        localStorage.clear();
        delete root.dataset.theme;
        delete root.dataset.accent;
        root.style.colorScheme = "";
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it("puts the theme on the page", () => {
        fakeDeviceTheme(false);
        applyTheme({ mode: "dark", accent: "graphite" });
        expect(root.dataset).toMatchObject({ theme: "dark", accent: "graphite" });
        expect(root.style.colorScheme).toBe("dark");
    });

    it("follows the device in 'Match my device' mode", () => {
        fakeDeviceTheme(true);
        applyTheme({ mode: "system", accent: "ocean" });
        expect(root.dataset.theme).toBe("dark");
    });

    it("saves the choice so it's still there after a reload", () => {
        fakeDeviceTheme(false);
        saveTheme({ mode: "dark", accent: "violet" });
        expect(localStorage.getItem(MODE_KEY)).toBe("dark");
        expect(localStorage.getItem(ACCENT_KEY)).toBe("violet");
        expect(loadTheme()).toEqual({ mode: "dark", accent: "violet" });
        expect(root.dataset.theme).toBe("dark");
    });

    it("still applies the theme when the browser blocks storage", () => {
        fakeDeviceTheme(false);
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new Error("blocked");
        });
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
            throw new Error("blocked");
        });
        saveTheme({ mode: "dark", accent: "indigo" });
        expect(root.dataset).toMatchObject({ theme: "dark", accent: "indigo" });
        expect(loadTheme()).toEqual(DEFAULT_THEME);
    });

    it("switches with the device in 'Match my device' mode, and stops when cleaned up", () => {
        const device = fakeDeviceTheme(false);
        saveTheme({ mode: "system", accent: "ocean" });
        const stop = followDeviceTheme();

        device.setDark(true);
        expect(root.dataset.theme).toBe("dark");
        device.setDark(false);
        expect(root.dataset.theme).toBe("light");

        stop();
        expect(device.listeners.size).toBe(0);
    });

    it("ignores the device when light or dark was chosen", () => {
        const device = fakeDeviceTheme(false);
        saveTheme({ mode: "light", accent: "ocean" });
        const stop = followDeviceTheme();
        device.setDark(true);
        expect(root.dataset.theme).toBe("light");
        stop();
    });
});
