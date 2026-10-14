// Stand-ins for the browser and Supabase, shared by the React tests.
import { vi } from "vitest";

type Result = { data?: unknown; error?: unknown };

/**
 * A Supabase query that records how it was built (`.select(...)`, `.eq(...)`, ...) and resolves
 * to `result` when awaited, like the real query builder.
 */
export class FakeQuery implements PromiseLike<Result> {
    select = vi.fn(() => this);
    eq = vi.fn(() => this);
    insert = vi.fn(() => this);
    delete = vi.fn(() => this);
    upsert = vi.fn(() => this);
    maybeSingle = vi.fn(() => this);

    constructor(private result: Result = { data: null, error: null }) {}

    then<A = Result, B = never>(
        onFulfilled?: ((value: Result) => A | PromiseLike<A>) | null,
        onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
    ): PromiseLike<A | B> {
        return Promise.resolve(this.result).then(onFulfilled, onRejected);
    }
}

/** Makes `from` hand out these queries in order, one per `supabase.from(...)` call. */
export function queueQueries(from: { mockImplementation: (fn: () => never) => unknown }, ...results: Result[]) {
    const queries = results.map((result) => new FakeQuery(result));
    const pending = [...queries];
    from.mockImplementation(() => {
        const next = pending.shift();
        if (!next) throw new Error("More Supabase queries than the test expected");
        return next as never;
    });
    return queries;
}

/**
 * jsdom has no matchMedia. This one reports whether the device prefers dark mode and lets a test
 * flip that preference, telling any "change" listeners like a real device would.
 */
export function fakeDeviceTheme(dark = false) {
    const listeners = new Set<() => void>();
    const query = {
        get matches() {
            return dark;
        },
        addEventListener: vi.fn((_type: string, listener: () => void) => listeners.add(listener)),
        removeEventListener: vi.fn((_type: string, listener: () => void) => listeners.delete(listener)),
    };
    vi.stubGlobal("matchMedia", vi.fn(() => query));
    return {
        query,
        listeners,
        setDark(value: boolean) {
            dark = value;
            listeners.forEach((listener) => listener());
        },
    };
}
