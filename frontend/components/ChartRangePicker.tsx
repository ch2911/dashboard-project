import { CHART_RANGES, type ChartRange } from "../utils/chartRanges";

/** The 1D / 1W / 1M / 3M buttons above a price chart. */
export default function ChartRangePicker({ value, onChange }: { value: ChartRange; onChange: (range: ChartRange) => void }) {
    return (
        <div className="flex gap-2" role="group" aria-label="Chart time range">
            {CHART_RANGES.map((range) => (
                <button
                    key={range.value}
                    onClick={() => onChange(range.value)}
                    title={range.title}
                    aria-pressed={value === range.value}
                    className={`px-3 py-1 text-sm rounded-md ${value === range.value ? "bg-sky-500" : "bg-white/10 hover:bg-white/20"}`}
                >
                    {range.label}
                </button>
            ))}
        </div>
    );
}
