import { describe, expect, it } from "vitest";
import { newAddressForOldStockLink, parseTicker, stockPageHref } from "./stockLinks";

describe("stockPageHref", () => {
    it("links to the single stock page with the ticker in the address", () => {
        expect(stockPageHref("AAPL")).toBe("/stocks/?ticker=AAPL");
    });

    it("encodes characters that have a meaning in addresses", () => {
        expect(stockPageHref("GBPUSD=X")).toBe("/stocks/?ticker=GBPUSD%3DX");
    });
});

describe("parseTicker", () => {
    it.each([
        ["AAPL", "AAPL"],
        ["asml", "ASML"],
        ["  msft ", "MSFT"],
        ["RR.L", "RR.L"],
        ["BRK-B", "BRK-B"],
        ["^GSPC", "^GSPC"],
        ["GBPUSD=X", "GBPUSD=X"],
    ])("accepts %s as %s", (raw, ticker) => {
        expect(parseTicker(raw)).toBe(ticker);
    });

    it.each([null, undefined, "", "   ", "not a ticker", "<script>", "A".repeat(20)])("rejects %j", (raw) => {
        expect(parseTicker(raw)).toBeNull();
    });
});

describe("newAddressForOldStockLink", () => {
    it("sends an old stock link to the new page, keeping the GitHub Pages base path", () => {
        expect(newAddressForOldStockLink("/dashboard-project/stocks/AAPL/")).toBe("/dashboard-project/stocks/?ticker=AAPL");
    });

    it("works without a trailing slash or base path", () => {
        expect(newAddressForOldStockLink("/stocks/asml")).toBe("/stocks/?ticker=ASML");
    });

    it("decodes encoded tickers", () => {
        expect(newAddressForOldStockLink("/stocks/GBPUSD%3DX/")).toBe("/stocks/?ticker=GBPUSD%3DX");
    });

    it.each(["/dashboard-project/nothing-here/", "/stocks/", "/stocks/AAPL/extra/", "/stocks/%E0%A4%A/", "/stocks/<script>/"])(
        "ignores %s",
        (pathname) => {
            expect(newAddressForOldStockLink(pathname)).toBeNull();
        },
    );
});
