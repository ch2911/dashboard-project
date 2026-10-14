import { describe, expect, it } from "vitest";
import { sortTooltipRows } from "./PortfolioTooltip";

const row = (dataKey: string, value: unknown) => ({ dataKey, name: dataKey, value, color: "#fff" });

describe("sortTooltipRows", () => {
    it("lists stocks from the highest price to the lowest", () => {
        const rows = [row("AAPL", 316.22), row("AMZN", 256.97), row("BBW", 28.88), row("BP", 44.88), row("NVDA", 225.48)];
        expect(sortTooltipRows(rows).map((r) => r.dataKey)).toEqual(["AAPL", "AMZN", "NVDA", "BP", "BBW"]);
    });

    it("leaves out stocks with no price on that date", () => {
        const rows = [row("AAPL", 316.22), row("AMZN", undefined), row("BP", null), row("NVDA", Number.NaN)];
        expect(sortTooltipRows(rows).map((r) => r.dataKey)).toEqual(["AAPL"]);
    });

    it("sorts forecasts by price alongside the stocks", () => {
        const rows = [row("BP-pred", 45.1), row("AAPL-pred", 352.4), row("NVDA-pred", 230.0)];
        expect(sortTooltipRows(rows).map((r) => r.dataKey)).toEqual(["AAPL-pred", "NVDA-pred", "BP-pred"]);
    });

    it("shows only the real price where a forecast starts", () => {
        // On the last real date the forecast line starts from the same price
        const rows = [row("AAPL", 351.36), row("AAPL-pred", 351.36), row("BP-pred", 45.1)];
        expect(sortTooltipRows(rows).map((r) => r.dataKey)).toEqual(["AAPL", "BP-pred"]);
    });

    it("doesn't change the list it was given", () => {
        const rows = [row("BP", 44.88), row("AAPL", 316.22)];
        sortTooltipRows(rows);
        expect(rows.map((r) => r.dataKey)).toEqual(["BP", "AAPL"]);
    });
});
