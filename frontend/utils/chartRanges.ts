// The time ranges every stock chart can show, shortest first. The values match the API's
// /price_history?range= options.

export type ChartRange = "intraday" | "week" | "month" | "daily";

export const CHART_RANGES: { value: ChartRange; label: string; title: string }[] = [
    { value: "intraday", label: "1D", title: "Today, in 5-minute steps" },
    { value: "week", label: "1W", title: "The last 5 trading days, in 30-minute steps" },
    { value: "month", label: "1M", title: "The last month of daily closing prices" },
    { value: "daily", label: "3M", title: "The last 3 months of daily closing prices" },
];

/** The 7-day forecast is shown on the ranges with one price per day, so it lines up with them. */
export function showsForecast(range: ChartRange): boolean {
    return range === "month" || range === "daily";
}

/** How to label a point on the x-axis, in the viewer's own time zone. */
export function timeLabelFormat(range: ChartRange): Intl.DateTimeFormatOptions {
    switch (range) {
        case "intraday":
            return { hour: "2-digit", minute: "2-digit" };
        case "week":
            return { weekday: "short", hour: "2-digit", minute: "2-digit" };
        default:
            return { day: "2-digit", month: "short" };
    }
}

/** An x-axis label for a price taken at `time`, e.g. "14:30", "Mon 14:30" or "13 Oct". */
export function formatTimeLabel(time: string | Date, range: ChartRange): string {
    return new Intl.DateTimeFormat("en-GB", timeLabelFormat(range)).format(new Date(time));
}
