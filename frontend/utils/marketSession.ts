import type { PricePoint } from "./api";

// Exchanges by Yahoo ticker suffix. A ticker without a suffix (AAPL, BP) trades in the US.
const MARKETS_BY_SUFFIX: Record<string, string> = {
    L: "London",
    TO: "Toronto",
    V: "Toronto",
    PA: "Paris",
    AS: "Amsterdam",
    DE: "Frankfurt",
    F: "Frankfurt",
    MI: "Milan",
    MC: "Madrid",
    SW: "Swiss",
    HK: "Hong Kong",
    T: "Tokyo",
    AX: "Australian",
    NS: "India",
    BO: "India",
};

/** The market a ticker trades on, as shown on the intraday chart, e.g. "US market". */
export function marketName(ticker: string): string {
    const dot = ticker.lastIndexOf(".");
    if (dot === -1) return "US market";
    const market = MARKETS_BY_SUFFIX[ticker.slice(dot + 1).toUpperCase()];
    return market ? `${market} market` : "Market";
}

/**
 * A trading day of intraday prices. The API sends times in the exchange's own time zone with
 * its UTC offset (e.g. "2026-10-14T09:30:00-04:00"), so the session date is the exchange's date.
 */
export type MarketSession = {
    market: string;
    /** The exchange's date for this session, as YYYY-MM-DD */
    date: string;
    /** Prices are still coming in for this session */
    live: boolean;
    /** When the next session should start, skipping weekends (not holidays). Null while live. */
    nextOpen: Date | null;
};

// Prices arrive every 5 minutes, so a gap longer than this means trading has stopped
const LIVE_WINDOW_MS = 20 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

function offsetMinutes(isoTime: string): number {
    const match = /([+-])(\d\d):?(\d\d)$/.exec(isoTime);
    if (!match) return 0; // "Z" or no offset: UTC
    const minutes = Number(match[2]) * 60 + Number(match[3]);
    return match[1] === "-" ? -minutes : minutes;
}

/** The trading session a stock's intraday prices come from, or null without prices. */
export function describeSession(ticker: string, history: PricePoint[], now: Date = new Date()): MarketSession | null {
    if (!history.length) return null;

    const first = history[0].time;
    const last = history[history.length - 1].time;
    const offset = offsetMinutes(last) * MINUTE_MS;
    const date = last.slice(0, 10);

    // "Exchange clock" times: UTC fields of these read as the exchange's local date and time
    const exchangeNow = new Date(now.getTime() + offset);
    const exchangeToday = exchangeNow.toISOString().slice(0, 10);
    const live = date === exchangeToday && now.getTime() - new Date(last).getTime() < LIVE_WINDOW_MS;

    let nextOpen: Date | null = null;
    if (!live) {
        // Assume the next session opens at the same time of day as this one did
        const openMinutes = Number(first.slice(11, 13)) * 60 + Number(first.slice(14, 16));
        const nowMinutes = exchangeNow.getUTCHours() * 60 + exchangeNow.getUTCMinutes();
        let day = Date.UTC(exchangeNow.getUTCFullYear(), exchangeNow.getUTCMonth(), exchangeNow.getUTCDate());
        if (date === exchangeToday || nowMinutes >= openMinutes) day += DAY_MS;
        while ([0, 6].includes(new Date(day).getUTCDay())) day += DAY_MS;
        nextOpen = new Date(day + openMinutes * MINUTE_MS - offset);
    }

    return { market: marketName(ticker), date, live, nextOpen };
}

/** "Tue 14 Oct" for a YYYY-MM-DD date */
export function formatSessionDate(date: string): string {
    return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
        .format(new Date(`${date}T00:00:00Z`));
}

/** Clock time in the viewer's time zone (or `timeZone`), e.g. "14:30" */
export function formatLocalTime(time: Date | string, timeZone?: string): string {
    return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone }).format(new Date(time));
}

/** Short name of the viewer's time zone (or `timeZone`) at a moment, e.g. "BST" */
export function timeZoneLabel(at: Date = new Date(), timeZone?: string): string {
    const part = new Intl.DateTimeFormat("en-GB", { timeZoneName: "short", timeZone })
        .formatToParts(at)
        .find((p) => p.type === "timeZoneName");
    return part?.value ?? "your time";
}

/** "Wed 15 Oct, 14:30" in the viewer's time zone (or `timeZone`) */
export function formatNextOpen(at: Date, timeZone?: string): string {
    const day = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone }).format(at);
    return `${day}, ${formatLocalTime(at, timeZone)}`;
}

/** One line per market and session, e.g. "US market · Tue 14 Oct · Closed, next open Wed 15 Oct, 14:30" */
export function sessionSummaries(sessions: MarketSession[], timeZone?: string): { text: string; live: boolean }[] {
    const seen = new Map<string, MarketSession>();
    for (const s of sessions) {
        const key = `${s.market}|${s.date}`;
        if (!seen.has(key)) seen.set(key, s);
    }
    return Array.from(seen.values()).map((s) => {
        const status = s.live
            ? "Live"
            : s.nextOpen
                ? `Closed, showing the last session. Next open ${formatNextOpen(s.nextOpen, timeZone)}`
                : "Closed";
        return { text: `${s.market} · ${formatSessionDate(s.date)} · ${status}`, live: s.live };
    });
}
