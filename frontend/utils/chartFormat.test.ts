import { describe, expect, it } from "vitest";
import { formatPriceTick } from "./chartFormat";

describe("formatPriceTick", () => {
    it("rounds prices from 100 up to whole numbers", () => {
        expect(formatPriceTick(196.4510350000001)).toBe("196");
        expect(formatPriceTick(100)).toBe("100");
    });

    it("keeps two decimals for cheaper stocks", () => {
        expect(formatPriceTick(1.23456)).toBe("1.23");
    });
});
