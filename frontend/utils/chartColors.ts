// Line colours for the dashboard chart, one per pinned stock.
//
// They're light shades because the chart sits on a mid-blue panel (#3b6588 to #4a84b6), where
// darker colours, and blues especially, would disappear. The order was checked with a colour-blindness
// simulation: every pair among the first five stays clearly distinct for people with red-green
// colour blindness and for everyone else, and each colour also differs from the next one in the
// list. With six or more stocks some pairs start to look alike, so the legend and the tooltip name
// every line rather than relying on colour alone.
export const SERIES_COLORS = [
    "#6ee7b7", // emerald
    "#fb923c", // orange
    "#f472b6", // pink
    "#c4b5fd", // violet
    "#fde047", // yellow
    "#f87171", // red
    "#5eead4", // teal
    "#fcd34d", // amber
];

/** Which colour each ticker uses, as an index into SERIES_COLORS. */
export type ColorAssignments = Record<string, number>;

/**
 * Gives each pinned ticker a colour that stays with it, so unpinning one stock doesn't recolour the others.
 *
 * Tickers keep the colour they had in `previous`. A newly pinned ticker takes the first colour in
 * SERIES_COLORS that no other pinned stock is using, which keeps the colour-blind-friendly order for
 * the first few stocks. Past eight stocks it takes the colour used least. Unpinned tickers are dropped.
 */
export function assignSeriesColors(pinned: string[], previous: ColorAssignments = {}): ColorAssignments {
    const assignments: ColorAssignments = {};
    const uses = SERIES_COLORS.map(() => 0);

    for (const ticker of pinned) {
        const index = previous[ticker];
        if (Number.isInteger(index) && index >= 0 && index < SERIES_COLORS.length && uses[index] === 0) {
            assignments[ticker] = index;
            uses[index]++;
        }
    }

    for (const ticker of pinned) {
        if (ticker in assignments) continue;
        const index = uses.indexOf(Math.min(...uses));
        assignments[ticker] = index;
        uses[index]++;
    }

    return assignments;
}

/** The colour for `ticker`, given the assignments from assignSeriesColors. */
export function seriesColor(assignments: ColorAssignments, ticker: string): string {
    return SERIES_COLORS[assignments[ticker] ?? 0];
}
