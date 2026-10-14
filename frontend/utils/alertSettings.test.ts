import { describe, expect, it } from "vitest";
import { DEFAULT_ALERT_SETTINGS, alertsAvailableTo, parseThreshold, settingsFromRow } from "./alertSettings";

describe("parseThreshold", () => {
    it("accepts a percentage in range, rounded to two decimals", () => {
        expect(parseThreshold("5")).toEqual({ value: 5 });
        expect(parseThreshold(" 2.345 ")).toEqual({ value: 2.35 });
    });

    it("rejects blanks and non-numbers", () => {
        expect(parseThreshold("")).toHaveProperty("error");
        expect(parseThreshold("abc")).toHaveProperty("error");
    });

    it("rejects thresholds that are too small or too large", () => {
        expect(parseThreshold("0")).toHaveProperty("error");
        expect(parseThreshold("-3")).toHaveProperty("error");
        expect(parseThreshold("75")).toHaveProperty("error");
    });
});

describe("settingsFromRow", () => {
    it("uses the defaults when nothing is saved", () => {
        expect(settingsFromRow(null)).toEqual(DEFAULT_ALERT_SETTINGS);
    });

    it("reads Postgres numerics, which arrive as strings", () => {
        expect(settingsFromRow({ enabled: false, threshold_percent: "7.50" })).toEqual({ enabled: false, thresholdPercent: 7.5 });
    });
});

describe("alertsAvailableTo", () => {
    it("lets everyone use alerts when no owner is set", () => {
        expect(alertsAvailableTo("user-1", undefined)).toBe(true);
        expect(alertsAvailableTo("user-1", "")).toBe(true);
    });

    it("limits alerts to the owner in demo mode", () => {
        expect(alertsAvailableTo("owner", "owner")).toBe(true);
        expect(alertsAvailableTo("someone", "owner")).toBe(false);
        expect(alertsAvailableTo(undefined, "owner")).toBe(false);
    });
});
