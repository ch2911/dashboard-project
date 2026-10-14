// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { supabase } from "../../../lib/supabaseClient";
import { searchStocks } from "../../../utils/api";
import { stockPageHref } from "../../../utils/stockLinks";
import AuthLayout from "./layout";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("../../../lib/supabaseClient", () => ({ supabase: { auth: { signOut: vi.fn() } } }));
vi.mock("../../../utils/api", () => ({ searchStocks: vi.fn() }));

const search = vi.mocked(searchStocks);
const box = () => screen.getByPlaceholderText("Search stocks...");
const type = (text: string) => fireEvent.change(box(), { target: { value: text } });

describe("Signed-in layout", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        render(<AuthLayout><p>Page content</p></AuthLayout>);
    });
    afterEach(() => {
        cleanup();
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    it("shows the page inside the layout", () => {
        expect(screen.getByText("Page content")).toBeTruthy();
    });

    it("searches once typing pauses, not on every keystroke", async () => {
        search.mockResolvedValue([{ symbol: "AAPL", name: "Apple Inc." }]);
        type("ap");
        type("app");
        type("appl");
        await act(() => vi.advanceTimersByTimeAsync(299));
        expect(search).not.toHaveBeenCalled();

        await act(() => vi.advanceTimersByTimeAsync(1));
        expect(search).toHaveBeenCalledTimes(1);
        expect(search).toHaveBeenCalledWith("appl");
        expect(screen.getByText("AAPL — Apple Inc.")).toBeTruthy();
    });

    it("doesn't search for a single letter", async () => {
        type(" a ");
        await act(() => vi.advanceTimersByTimeAsync(1000));
        expect(search).not.toHaveBeenCalled();
    });

    it("ignores results for a search that has since changed", async () => {
        let answerOld: (value: { symbol: string; name: string }[]) => void = () => {};
        search.mockReturnValueOnce(new Promise((resolve) => (answerOld = resolve)));
        search.mockResolvedValueOnce([{ symbol: "MSFT", name: "Microsoft" }]);

        type("ap");
        await act(() => vi.advanceTimersByTimeAsync(300));
        type("micro");
        await act(() => vi.advanceTimersByTimeAsync(300));
        await act(async () => answerOld([{ symbol: "AAPL", name: "Apple Inc." }]));

        expect(screen.getByText("MSFT — Microsoft")).toBeTruthy();
        expect(screen.queryByText("AAPL — Apple Inc.")).toBeNull();
    });

    it("opens the stock page for a picked suggestion and clears the search", async () => {
        search.mockResolvedValue([{ symbol: "AAPL", name: "Apple Inc." }]);
        type("apple");
        await act(() => vi.advanceTimersByTimeAsync(300));

        fireEvent.click(screen.getByText("AAPL — Apple Inc."));

        expect(push).toHaveBeenCalledWith(stockPageHref("AAPL"));
        expect((box() as HTMLInputElement).value).toBe("");
        expect(screen.queryByText("AAPL — Apple Inc.")).toBeNull();
    });

    it("logs out and goes to the login page", async () => {
        vi.mocked(supabase.auth.signOut).mockResolvedValue({ error: null });
        await act(async () => fireEvent.click(screen.getByRole("button", { name: "Logout" })));
        expect(supabase.auth.signOut).toHaveBeenCalled();
        expect(push).toHaveBeenCalledWith("/login");
    });
});
