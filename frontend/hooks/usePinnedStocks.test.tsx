// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/useAuth";
import { queueQueries } from "../test/fakes";
import { usePinnedStocks } from "./usePinnedStocks";

vi.mock("../lib/supabaseClient", () => ({ supabase: { from: vi.fn() } }));
vi.mock("../lib/useAuth", () => ({ useAuth: vi.fn() }));

const from = vi.mocked(supabase.from);
const USER = { id: "user-1" };

function signedIn(user: { id: string } | null) {
    vi.mocked(useAuth).mockReturnValue({ user, loading: false } as never);
}

async function loaded() {
    const hook = renderHook(() => usePinnedStocks());
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    return hook.result;
}

describe("usePinnedStocks", () => {
    beforeEach(() => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        signedIn(USER);
    });
    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
        from.mockReset();
    });

    it("loads only the signed-in user's pinned stocks", async () => {
        const [query] = queueQueries(from, { data: [{ symbol: "AAPL" }, { symbol: "NVDA" }], error: null });
        const result = await loaded();

        expect(result.current.pinned).toEqual(["AAPL", "NVDA"]);
        expect(from).toHaveBeenCalledWith("favorites");
        expect(query.eq).toHaveBeenCalledWith("user_id", "user-1");
    });

    it("has nothing pinned when nobody is signed in", async () => {
        signedIn(null);
        const result = await loaded();
        expect(result.current.pinned).toEqual([]);
        expect(from).not.toHaveBeenCalled();
    });

    it("shows nothing pinned if loading fails", async () => {
        queueQueries(from, { data: null, error: { message: "down" } });
        const result = await loaded();
        expect(result.current.pinned).toEqual([]);
    });

    it("pins a stock for the user, without listing it twice", async () => {
        const [, insert, again] = queueQueries(
            from,
            { data: [{ symbol: "AAPL" }], error: null },
            { error: null },
            { error: null },
        );
        const result = await loaded();

        await act(() => result.current.pinStock("NVDA"));
        await act(() => result.current.pinStock("NVDA"));

        expect(insert.insert).toHaveBeenCalledWith([{ user_id: "user-1", symbol: "NVDA" }]);
        expect(again.insert).toHaveBeenCalled();
        expect(result.current.pinned).toEqual(["AAPL", "NVDA"]);
    });

    it("leaves the list alone if pinning fails", async () => {
        queueQueries(from, { data: [{ symbol: "AAPL" }], error: null }, { error: { message: "nope" } });
        const result = await loaded();
        await act(() => result.current.pinStock("NVDA"));
        expect(result.current.pinned).toEqual(["AAPL"]);
    });

    it("unpins only that user's copy of the stock", async () => {
        const [, remove] = queueQueries(
            from,
            { data: [{ symbol: "AAPL" }, { symbol: "NVDA" }], error: null },
            { error: null },
        );
        const result = await loaded();

        await act(() => result.current.unpinStock("AAPL"));

        expect(remove.delete).toHaveBeenCalled();
        expect(remove.eq).toHaveBeenCalledWith("user_id", "user-1");
        expect(remove.eq).toHaveBeenCalledWith("symbol", "AAPL");
        expect(result.current.pinned).toEqual(["NVDA"]);
    });

    it("keeps the stock pinned if unpinning fails", async () => {
        queueQueries(from, { data: [{ symbol: "AAPL" }], error: null }, { error: { message: "nope" } });
        const result = await loaded();
        await act(() => result.current.unpinStock("AAPL"));
        expect(result.current.pinned).toEqual(["AAPL"]);
    });
});
