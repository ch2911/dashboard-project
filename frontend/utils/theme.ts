// Light/dark mode and accent colour, saved per browser in localStorage.
//
// The accent recolours every `sky-*` class in the app (tailwind.config.ts points them at CSS
// variables that globals.css sets per accent). The accents are all cool, dark-enough hues, so the
// light per-stock chart lines in chartColors.ts and the green/red price changes stay readable on
// every one of them.

export type Mode = "light" | "dark" | "system";
export type Accent = "ocean" | "indigo" | "violet" | "graphite";

export const MODES: { value: Mode; label: string }[] = [
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
    { value: "system", label: "Match my device" },
];

// `swatch` is the accent's 500 shade, for the colour picker on the settings page
export const ACCENTS: { value: Accent; label: string; swatch: string }[] = [
    { value: "ocean", label: "Ocean", swatch: "#0ea5e9" },
    { value: "indigo", label: "Indigo", swatch: "#6366f1" },
    { value: "violet", label: "Violet", swatch: "#8b5cf6" },
    { value: "graphite", label: "Graphite", swatch: "#64748b" },
];

export const MODE_KEY = "theme-mode";
export const ACCENT_KEY = "theme-accent";

export type ThemeSettings = { mode: Mode; accent: Accent };

export const DEFAULT_THEME: ThemeSettings = { mode: "light", accent: "ocean" };

/** Saved settings, falling back to the defaults for anything missing or unrecognised. */
export function parseTheme(mode: string | null, accent: string | null): ThemeSettings {
    return {
        mode: MODES.some((m) => m.value === mode) ? (mode as Mode) : DEFAULT_THEME.mode,
        accent: ACCENTS.some((a) => a.value === accent) ? (accent as Accent) : DEFAULT_THEME.accent,
    };
}

/** Whether to show the dark theme, given the chosen mode and the device's preference. */
export function resolveDark(mode: Mode, deviceIsDark: boolean): boolean {
    return mode === "dark" || (mode === "system" && deviceIsDark);
}

function deviceIsDark(): boolean {
    return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Put the theme on the <html> element, where globals.css picks it up. */
export function applyTheme({ mode, accent }: ThemeSettings, root: HTMLElement = document.documentElement) {
    const dark = resolveDark(mode, deviceIsDark());
    root.dataset.theme = dark ? "dark" : "light";
    root.dataset.accent = accent;
    root.style.colorScheme = dark ? "dark" : "light";
}

export function loadTheme(): ThemeSettings {
    try {
        return parseTheme(localStorage.getItem(MODE_KEY), localStorage.getItem(ACCENT_KEY));
    } catch {
        // Storage can be blocked (e.g. some private windows); use the defaults
        return DEFAULT_THEME;
    }
}

export function saveTheme(settings: ThemeSettings) {
    try {
        localStorage.setItem(MODE_KEY, settings.mode);
        localStorage.setItem(ACCENT_KEY, settings.accent);
    } catch {
        // Not saved, but still applied for this visit
    }
    applyTheme(settings);
}

/** Keep "Match my device" in step when the device switches between light and dark. */
export function followDeviceTheme(): () => void {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => {
        const settings = loadTheme();
        if (settings.mode === "system") applyTheme(settings);
    };
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
}

// Runs in <head> before the page is drawn, so a saved dark theme doesn't flash light first.
// It repeats the logic above in plain JS because it can't import modules.
export const THEME_INIT_SCRIPT = `(function(){try{
var m=localStorage.getItem(${JSON.stringify(MODE_KEY)}),a=localStorage.getItem(${JSON.stringify(ACCENT_KEY)});
var modes=${JSON.stringify(MODES.map((m) => m.value))},accents=${JSON.stringify(ACCENTS.map((a) => a.value))};
if(modes.indexOf(m)<0)m=${JSON.stringify(DEFAULT_THEME.mode)};if(accents.indexOf(a)<0)a=${JSON.stringify(DEFAULT_THEME.accent)};
var d=m==="dark"||(m==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);
var r=document.documentElement;r.dataset.theme=d?"dark":"light";r.dataset.accent=a;r.style.colorScheme=d?"dark":"light";
}catch(e){}})();`;
