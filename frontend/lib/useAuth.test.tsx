// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { supabase } from "./supabaseClient";
import { useAuth } from "./useAuth";
import { useAuthRedirect } from "./useAuthRedirect";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("./supabaseClient", () => ({
    supabase: { auth: { getSession: vi.fn(), onAuthStateChange: vi.fn() } },
}));

const auth = vi.mocked(supabase.auth);
const USER = { id: "user-1" };

/** Starts with `user` signed in (or nobody). Returns a way to change who is signed in later. */
function session(user: { id: string } | null) {
    auth.getSession.mockResolvedValue({ data: { session: user ? { user } : null } } as never);
    const unsubscribe = vi.fn();
    let listener: (event: string, session: unknown) => void = () => {};
    auth.onAuthStateChange.mockImplementation(((callback: typeof listener) => {
        listener = callback;
        return { data: { subscription: { unsubscribe } } };
    }) as never);
    return { unsubscribe, change: (next: { id: string } | null) => listener("CHANGED", next ? { user: next } : null) };
}

describe("useAuth", () => {
    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
    });

    it("reports the signed-in user once the session has loaded", async () => {
        session(USER);
        const { result } = renderHook(() => useAuth());
        expect(result.current.loading).toBe(true);
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.user).toEqual(USER);
    });

    it("follows signing in and out, and stops listening when unmounted", async () => {
        const auth = session(null);
        const { result, unmount } = renderHook(() => useAuth());
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.user).toBeNull();

        act(() => auth.change(USER));
        expect(result.current.user).toEqual(USER);
        act(() => auth.change(null));
        expect(result.current.user).toBeNull();

        unmount();
        expect(auth.unsubscribe).toHaveBeenCalled();
    });
});

describe("useAuthRedirect", () => {
    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
    });

    it("sends signed-out visitors to the login page", async () => {
        session(null);
        renderHook(() => useAuthRedirect());
        await waitFor(() => expect(push).toHaveBeenCalledWith("/login"));
    });

    it("lets signed-in users stay", async () => {
        session(USER);
        const { result } = renderHook(() => useAuthRedirect());
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(push).not.toHaveBeenCalled();
    });

    it("waits for the session before deciding", () => {
        auth.getSession.mockReturnValue(new Promise(() => {}) as never);
        auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } } as never);
        renderHook(() => useAuthRedirect());
        expect(push).not.toHaveBeenCalled();
    });
});
