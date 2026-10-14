// Chart axis labels. Recharts prints the raw tick value, so a domain like "dataMin - 5" gave labels
// such as 196.4510350000001, which were cut off at the axis edge.

/** A y-axis price label: whole numbers for prices from 100 up, two decimals below that. */
export function formatPriceTick(value: number): string {
    return Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(2);
}
