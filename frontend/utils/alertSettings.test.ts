import { describe, expect, it } from "vitest";
import { DEFAULT_ALERT_SETTINGS, parseThreshold, settingsFromRow } from "./alertSettings";

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
