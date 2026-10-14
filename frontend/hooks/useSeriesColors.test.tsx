// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import { useSeriesColors } from "./useSeriesColors";

const render = (pinned: string[]) =>
    renderHook(({ pinned }) => useSeriesColors(pinned), { initialProps: { pinned } });

const saved = () => JSON.parse(localStorage.getItem("seriesColors") ?? "null");

describe("useSeriesColors", () => {
    beforeEach(() => localStorage.clear());
    afterEach(cleanup);

    it("keeps the other stocks' colours when one is unpinned", () => {
        const { result, rerender } = render(["AAPL", "MSFT", "NVDA"]);
        expect(result.current).toEqual({ AAPL: 0, MSFT: 1, NVDA: 2 });

        rerender({ pinned: ["AAPL", "NVDA"] });
        expect(result.current).toEqual({ AAPL: 0, NVDA: 2 });

        // The freed colour goes to the next stock pinned
        rerender({ pinned: ["AAPL", "NVDA", "TSLA"] });
        expect(result.current).toEqual({ AAPL: 0, NVDA: 2, TSLA: 1 });
    });

    it("remembers each stock's colour after a reload", () => {
        const first = render(["AAPL", "MSFT", "NVDA"]);
        first.rerender({ pinned: ["AAPL", "NVDA"] });
        first.unmount();
        expect(saved()).toEqual({ AAPL: 0, NVDA: 2 });

        const { result } = render(["AAPL", "NVDA"]);
        expect(result.current).toEqual({ AAPL: 0, NVDA: 2 });
    });

    it("doesn't forget the saved colours while the pinned stocks are still loading", () => {
        localStorage.setItem("seriesColors", JSON.stringify({ NVDA: 3 }));
        const { rerender, result } = render([]);
        expect(saved()).toEqual({ NVDA: 3 });

        rerender({ pinned: ["NVDA"] });
        expect(result.current).toEqual({ NVDA: 3 });
    });

    it("starts afresh when the saved colours are unreadable", () => {
        localStorage.setItem("seriesColors", "not json");
        expect(render(["AAPL"]).result.current).toEqual({ AAPL: 0 });
        cleanup();

        localStorage.setItem("seriesColors", "[1, 2]");
        expect(render(["AAPL"]).result.current).toEqual({ AAPL: 0 });
    });
});
