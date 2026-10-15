import { describe, expect, it } from "vitest";
import {
    describeSession,
    formatLocalTime,
    formatNextOpen,
    formatSessionDate,
    marketName,
    sessionSummaries,
    timeZoneLabel,
} from "./marketSession";

// A US session as the API sends it: New York times with their offset (EDT, UTC-4)
const tuesdayUS = [
    { time: "2026-10-13T09:30:00-04:00", price: 250 },
    { time: "2026-10-13T15:55:00-04:00", price: 252 },
];
const fridayUS = [
    { time: "2026-10-16T09:30:00-04:00", price: 250 },
    { time: "2026-10-16T15:55:00-04:00", price: 252 },
];

describe("marketName", () => {
    it.each([
        ["AAPL", "US market"],
        ["BRK-B", "US market"],
        ["RR.L", "London market"],
        ["shop.to", "Toronto market"],
        ["XYZ.ZZ", "Market"],
    ])("%s trades on the %s", (ticker, market) => {
        expect(marketName(ticker)).toBe(market);
    });
});

describe("describeSession", () => {
    it("is null without prices", () => {
        expect(describeSession("AAPL", [])).toBeNull();
    });

    it("shows yesterday's session before the market opens, opening later today", () => {
        // 10:00 in London on Wed 14 Oct is 05:00 in New York
        const session = describeSession("AAPL", tuesdayUS, new Date("2026-10-14T09:00:00Z"));
        expect(session).toMatchObject({ market: "US market", date: "2026-10-13", live: false });
        expect(session?.nextOpen?.toISOString()).toBe("2026-10-14T13:30:00.000Z");
    });

    it("is live while today's prices are still coming in", () => {
        const today = [{ time: "2026-10-14T09:30:00-04:00", price: 1 }, { time: "2026-10-14T11:00:00-04:00", price: 2 }];
        const session = describeSession("AAPL", today, new Date("2026-10-14T15:05:00Z"));
        expect(session).toMatchObject({ date: "2026-10-14", live: true, nextOpen: null });
    });

    it("after the close, the next open is the following day", () => {
        const session = describeSession("AAPL", tuesdayUS, new Date("2026-10-13T21:00:00Z"));
        expect(session).toMatchObject({ date: "2026-10-13", live: false });
        expect(session?.nextOpen?.toISOString()).toBe("2026-10-14T13:30:00.000Z");
    });

    it("skips the weekend", () => {
        const session = describeSession("AAPL", fridayUS, new Date("2026-10-17T12:00:00Z"));
        expect(session?.nextOpen?.toISOString()).toBe("2026-10-19T13:30:00.000Z");
    });

    it("uses the exchange's date, not the viewer's", () => {
        // 23:30 UTC on Tuesday is still Tuesday in New York, and the session ended hours ago
        const session = describeSession("AAPL", tuesdayUS, new Date("2026-10-13T23:30:00Z"));
        expect(session?.date).toBe("2026-10-13");
        expect(session?.nextOpen?.toISOString()).toBe("2026-10-14T13:30:00.000Z");
    });
});

describe("formatting", () => {
    it("writes the session date as a short day", () => {
        expect(formatSessionDate("2026-10-13")).toBe("Tue 13 Oct");
    });

    it("shows New York's open in UK time", () => {
        expect(formatLocalTime("2026-10-13T09:30:00-04:00", "Europe/London")).toBe("14:30");
        expect(timeZoneLabel(new Date("2026-10-13T12:00:00Z"), "Europe/London")).toBe("BST");
        expect(formatNextOpen(new Date("2026-10-14T13:30:00Z"), "Europe/London")).toBe("Wed 14 Oct, 14:30");
    });

    it("summarises each market and day once", () => {
        const session = describeSession("AAPL", tuesdayUS, new Date("2026-10-14T09:00:00Z"))!;
        const other = describeSession("NVDA", tuesdayUS, new Date("2026-10-14T09:00:00Z"))!;
        expect(sessionSummaries([session, other], "Europe/London")).toEqual([
            { text: "US market · Tue 13 Oct · Closed, showing the last session. Next open Wed 14 Oct, 14:30", live: false },
        ]);
    });
});
