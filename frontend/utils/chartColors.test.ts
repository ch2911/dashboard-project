import { describe, expect, it } from "vitest";
import { SERIES_COLORS, seriesColor } from "./chartColors";

describe("seriesColor", () => {
    it("gives each of the first eight stocks its own colour", () => {
        const colours = Array.from({ length: 8 }, (_, i) => seriesColor(i));
        expect(new Set(colours).size).toBe(8);
        expect(colours).toEqual(SERIES_COLORS);
    });

    it("keeps the same colour for a stock's position", () => {
        expect(seriesColor(2)).toBe(seriesColor(2));
        expect(seriesColor(0)).toBe("#6ee7b7");
    });

    it("only repeats colours after eight stocks", () => {
        expect(seriesColor(8)).toBe(seriesColor(0));
    });
});
