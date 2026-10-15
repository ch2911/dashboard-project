// Chart labels. Recharts prints the raw tick value, so a domain like "dataMin - 5" gave labels
// such as 196.4510350000001, which were cut off at the axis edge.

/** A y-axis price label: whole numbers for prices from 100 up, two decimals below that. */
export function formatPriceTick(value: number): string {
    return Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(2);
}

/** A tooltip value: a price, or a likely range such as "182.10 to 197.45". */
export function formatTooltipPrice(value: unknown): string {
    if (Array.isArray(value) && value.length === 2) {
        return `${Number(value[0]).toFixed(2)} to ${Number(value[1]).toFixed(2)}`;
    }
    return typeof value === "number" ? value.toFixed(2) : String(value);
}
