// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { usePinnedStocks } from "../../../../hooks/usePinnedStocks";
import StockPageClient from "./StockPageClient";

vi.mock("../../../../hooks/usePinnedStocks", () => ({ usePinnedStocks: vi.fn() }));
vi.mock("../../../../utils/api", () => ({
    fetchPrice: vi.fn(async () => null),
    fetchPriceHistory: vi.fn(async () => []),
    fetchSentiment: vi.fn(async () => []),
    fetchPrediction: vi.fn(async () => []),
}));
vi.mock("recharts", () => {
    const Stub = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
    return { Area: Stub, ComposedChart: Stub, Line: Stub, XAxis: Stub, YAxis: Stub, Tooltip: Stub, Legend: Stub, ResponsiveContainer: Stub };
});

const pinStock = vi.fn();
const unpinStock = vi.fn();
const PINNED = ["AAPL"];

function pinnedStocks(isGuest: boolean) {
    vi.mocked(usePinnedStocks).mockReturnValue({ pinned: PINNED, loading: false, error: false, isGuest, pinStock, unpinStock });
}

describe("Stock page Pin button", () => {
    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
    });

    it("pins the stock for a signed-in user", () => {
        pinnedStocks(false);
        render(<StockPageClient ticker="NVDA" />);
        fireEvent.click(screen.getByRole("button", { name: "Pin" }));
        expect(pinStock).toHaveBeenCalledWith("NVDA");
        expect(screen.queryByText(/need an account/)).toBeNull();
    });

    it("unpins a stock the user has pinned", () => {
        pinnedStocks(false);
        render(<StockPageClient ticker="AAPL" />);
        fireEvent.click(screen.getByRole("button", { name: "Unpin" }));
        expect(unpinStock).toHaveBeenCalledWith("AAPL");
    });

    it("asks a visitor without an account to sign up instead of pinning", () => {
        pinnedStocks(true);
        // AAPL is one of the stocks guests are shown, but they haven't pinned it themselves
        render(<StockPageClient ticker="AAPL" />);
        expect(screen.queryByRole("button", { name: "Unpin" })).toBeNull();

        fireEvent.click(screen.getByRole("button", { name: "Pin" }));

        expect(pinStock).not.toHaveBeenCalled();
        expect(screen.getByText(/You need an account to pin stocks/)).toBeTruthy();
        expect(screen.getByRole("link", { name: "Sign up for free" }).getAttribute("href")).toBe("/login");
    });
});
