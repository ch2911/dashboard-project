import { describe, expect, it } from "vitest";
import { SERIES_COLORS, assignSeriesColors, seriesColor } from "./chartColors";

const colorsOf = (pinned: string[], previous = {}) => {
    const assignments = assignSeriesColors(pinned, previous);
    return pinned.map((ticker) => seriesColor(assignments, ticker));
};

describe("assignSeriesColors", () => {
    it("gives the first eight stocks the colours in order, each its own", () => {
        const pinned = ["A", "B", "C", "D", "E", "F", "G", "H"];
        const colours = colorsOf(pinned);
        expect(new Set(colours).size).toBe(8);
        expect(colours).toEqual(SERIES_COLORS);
    });

    it("leaves the other stocks' colours alone when one is unpinned", () => {
        const before = assignSeriesColors(["AAPL", "MSFT", "TSLA", "NVDA"]);
        const after = assignSeriesColors(["AAPL", "TSLA", "NVDA"], before);
        expect(seriesColor(after, "AAPL")).toBe(seriesColor(before, "AAPL"));
        expect(seriesColor(after, "TSLA")).toBe(seriesColor(before, "TSLA"));
        expect(seriesColor(after, "NVDA")).toBe(seriesColor(before, "NVDA"));
        expect(after).not.toHaveProperty("MSFT");
    });

    it("gives a newly pinned stock the first free colour", () => {
        const before = assignSeriesColors(["AAPL", "MSFT", "TSLA"]);
        const afterUnpin = assignSeriesColors(["AAPL", "TSLA"], before);
        const afterPin = assignSeriesColors(["AAPL", "TSLA", "AMZN"], afterUnpin);
        expect(seriesColor(afterPin, "AMZN")).toBe(seriesColor(before, "MSFT"));
        expect(new Set(Object.values(afterPin)).size).toBe(3);
    });

    it("doesn't depend on the order the pinned list comes back in", () => {
        const before = assignSeriesColors(["AAPL", "MSFT", "TSLA"]);
        const after = assignSeriesColors(["TSLA", "AAPL", "MSFT"], before);
        expect(after).toEqual(before);
    });

    it("ignores saved colours that are invalid or already taken", () => {
        const assignments = assignSeriesColors(["AAPL", "MSFT", "TSLA"], { AAPL: 1, MSFT: 1, TSLA: 99 });
        expect(assignments.AAPL).toBe(1);
        expect(new Set(Object.values(assignments)).size).toBe(3);
        expect(Object.values(assignments).every((i) => i >= 0 && i < SERIES_COLORS.length)).toBe(true);
    });

    it("only repeats colours past eight stocks, using the least-used one", () => {
        const pinned = Array.from({ length: 10 }, (_, i) => `T${i}`);
        const assignments = assignSeriesColors(pinned);
        expect(new Set(pinned.slice(0, 8).map((t) => assignments[t])).size).toBe(8);
        expect(assignments.T8).toBe(0);
        expect(assignments.T9).toBe(1);
    });
});
