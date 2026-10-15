import { sessionSummaries, timeZoneLabel, type MarketSession } from "../utils/marketSession";

// Under an intraday chart: which market and trading day the prices are from, whether it's still
// trading, and the time zone the axis is in. Before the market opens the chart shows the previous
// session, which otherwise looks like the wrong day.
export default function MarketSessionNote({ sessions }: { sessions: MarketSession[] }) {
    if (!sessions.length) return null;
    return (
        <div className="text-sm text-sky-200 mt-2 space-y-1">
            {sessionSummaries(sessions).map(({ text, live }) => (
                <p key={text} className="flex items-start gap-2">
                    <span
                        className={`inline-block w-2 h-2 rounded-full mt-1.5 shrink-0 ${live ? "bg-green-400" : "bg-sky-200/60"}`}
                        aria-hidden="true"
                    />
                    <span>{text}</span>
                </p>
            ))}
            <p className="text-sky-200/80">
                Times are in your time zone ({timeZoneLabel()}).
            </p>
        </div>
    );
}
