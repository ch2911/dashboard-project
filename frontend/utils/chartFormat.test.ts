import { describe, expect, it } from "vitest";
import { formatPriceTick, formatTooltipPrice } from "./chartFormat";

describe("formatPriceTick", () => {
    it("rounds prices from 100 up to whole numbers", () => {
        expect(formatPriceTick(196.4510350000001)).toBe("196");
        expect(formatPriceTick(100)).toBe("100");
    });

    it("keeps two decimals for cheaper stocks", () => {
        expect(formatPriceTick(1.23456)).toBe("1.23");
    });
});

describe("formatTooltipPrice", () => {
    it("shows a range as low to high", () => {
        expect(formatTooltipPrice([182.1, 197.456])).toBe("182.10 to 197.46");
    });

    it("shows a single price with two decimals", () => {
        expect(formatTooltipPrice(190)).toBe("190.00");
    });

    it("passes anything else through as text", () => {
        expect(formatTooltipPrice("n/a")).toBe("n/a");
    });
});
