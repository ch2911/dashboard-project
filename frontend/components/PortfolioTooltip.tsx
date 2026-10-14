// The box that appears when you hover over the dashboard chart. It lists the stocks from the
// highest price to the lowest, so it reads in the same order as the lines from top to bottom.

export type TooltipRow = {
    dataKey?: string | number;
    name?: string | number;
    value?: unknown;
    color?: string;
};

const isForecast = (row: TooltipRow) => String(row.dataKey).endsWith("-pred");

/** Rows with a price, highest first. */
export function sortTooltipRows(rows: readonly TooltipRow[]): TooltipRow[] {
    const withPrice = rows.filter((row) => typeof row.value === "number" && Number.isFinite(row.value));
    // Where a stock's forecast starts, it repeats the last real price, so only show the real one there
    const actualKeys = new Set(withPrice.filter((row) => !isForecast(row)).map((row) => String(row.dataKey)));
    return withPrice
        .filter((row) => !(isForecast(row) && actualKeys.has(String(row.dataKey).replace(/-pred$/, ""))))
        .sort((a, b) => (b.value as number) - (a.value as number));
}

type Props = {
    active?: boolean;
    payload?: readonly TooltipRow[];
    label?: string | number;
};

export default function PortfolioTooltip({ active, payload, label }: Props) {
    if (!active || !payload?.length) return null;
    const rows = sortTooltipRows(payload);
    if (!rows.length) return null;

    return (
        <div className="rounded-lg bg-white px-3 py-2 text-sm text-slate-900 shadow-lg">
            <p className="mb-1 font-semibold">{label}</p>
            <ul className="space-y-1">
                {rows.map((row) => (
                    <li key={String(row.dataKey)} className="flex items-center gap-2">
                        {/* A sample of the line (dashed for forecasts) shows which line this row is */}
                        <svg width="18" height="8" aria-hidden="true">
                            <line x1="0" y1="4" x2="18" y2="4" stroke={row.color} strokeWidth="3"
                                  strokeDasharray={isForecast(row) ? "4 3" : undefined} />
                        </svg>
                        <span className="flex-1 pr-3">{row.name}</span>
                        <span className="font-medium tabular-nums">${(row.value as number).toFixed(2)}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}
