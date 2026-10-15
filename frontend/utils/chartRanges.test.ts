import { describe, expect, it } from "vitest";
import { CHART_RANGES, formatTimeLabel, showsForecast } from "./chartRanges";

// Built from local parts so the labels don't depend on the machine's time zone
const tuesdayAfternoon = new Date(2026, 9, 13, 14, 30);

describe("chart ranges", () => {
    it("lists every range from shortest to longest", () => {
        expect(CHART_RANGES.map((r) => r.label)).toEqual(["1D", "1W", "1M", "3M"]);
        expect(CHART_RANGES.map((r) => r.value)).toEqual(["intraday", "week", "month", "daily"]);
    });

    it("shows the forecast only on the ranges with one price per day", () => {
        expect(showsForecast("intraday")).toBe(false);
        expect(showsForecast("week")).toBe(false);
        expect(showsForecast("month")).toBe(true);
        expect(showsForecast("daily")).toBe(true);
    });

    it.each([
        ["intraday", "14:30"],
        ["week", "Tue 14:30"],
        ["month", "13 Oct"],
        ["daily", "13 Oct"],
    ] as const)("labels a %s point as %s", (range, label) => {
        expect(formatTimeLabel(tuesdayAfternoon, range)).toBe(label);
    });

    it("accepts the API's ISO time strings", () => {
        expect(formatTimeLabel(tuesdayAfternoon.toISOString(), "month")).toBe("13 Oct");
    });
});
