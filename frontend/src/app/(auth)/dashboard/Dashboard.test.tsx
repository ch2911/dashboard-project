// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { usePinnedStocks } from "../../../../hooks/usePinnedStocks";
import { fetchPrice } from "../../../../utils/api";
import Dashboard from "./page";

vi.mock("../../../../hooks/usePinnedStocks", () => ({ usePinnedStocks: vi.fn() }));
vi.mock("../../../../utils/api", () => ({
    fetchPrice: vi.fn(),
    fetchPriceHistory: vi.fn(async () => []),
    fetchSentiment: vi.fn(async () => []),
    fetchPrediction: vi.fn(async () => []),
}));
// The chart itself needs a real browser to measure, and isn't what these tests are about
vi.mock("recharts", () => {
    const Stub = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
    return { LineChart: Stub, Line: Stub, XAxis: Stub, YAxis: Stub, Tooltip: Stub, Legend: Stub, ResponsiveContainer: Stub };
});

// The same array every render, like the real hook, so the page doesn't keep reloading
const NONE: string[] = [];
const POPULAR = ["AAPL", "MSFT"];

function pinnedStocks(state: { pinned?: string[]; loading?: boolean; error?: boolean; isGuest?: boolean }) {
    vi.mocked(usePinnedStocks).mockReturnValue({
        pinned: NONE,
        loading: false,
        error: false,
        isGuest: false,
        pinStock: vi.fn(),
        unpinStock: vi.fn(),
        ...state,
    });
}

describe("Dashboard", () => {
    beforeEach(() => {
        vi.mocked(fetchPrice).mockImplementation(async (ticker) => ({ ticker, name: `${ticker} Inc.`, price: 100, change: 1 }) as never);
    });
    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
    });

    it("says when nothing is pinned yet", () => {
        pinnedStocks({});
        render(<Dashboard />);
        expect(screen.getByText(/You haven.t pinned any stocks yet/)).toBeTruthy();
        expect(screen.queryByText(/Couldn.t load your pinned stocks/)).toBeNull();
    });

    it("says the pinned stocks couldn't be loaded, rather than that there are none", () => {
        pinnedStocks({ error: true });
        render(<Dashboard />);
        expect(screen.getByText(/Couldn.t load your pinned stocks/)).toBeTruthy();
        expect(screen.queryByText(/You haven.t pinned any stocks yet/)).toBeNull();
    });

    it("says nothing about pinned stocks while they're loading", () => {
        pinnedStocks({ loading: true });
        render(<Dashboard />);
        expect(screen.queryByText(/You haven.t pinned any stocks yet/)).toBeNull();
        expect(screen.queryByText(/Couldn.t load your pinned stocks/)).toBeNull();
    });

    it("shows visitors without an account some popular stocks and how to sign up", async () => {
        pinnedStocks({ pinned: POPULAR, isGuest: true });
        render(<Dashboard />);

        expect(screen.getByRole("heading", { name: "📊 Popular Stocks" })).toBeTruthy();
        expect(screen.getByText(/trying the dashboard without an account/)).toBeTruthy();
        expect(screen.getByRole("link", { name: "Sign up" }).getAttribute("href")).toBe("/login");
        await waitFor(() => expect(screen.getByText("MSFT Inc.")).toBeTruthy());
        expect(fetchPrice).toHaveBeenCalledWith("AAPL");
        expect(screen.queryByText(/You haven.t pinned/)).toBeNull();
    });

    it("calls them your pinned stocks once signed in", () => {
        pinnedStocks({ pinned: POPULAR });
        render(<Dashboard />);
        expect(screen.getByRole("heading", { name: "📊 My Pinned Stocks" })).toBeTruthy();
        expect(screen.queryByText(/without an account/)).toBeNull();
    });
});
