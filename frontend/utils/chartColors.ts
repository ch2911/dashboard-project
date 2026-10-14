// Line colours for the dashboard chart, one per pinned stock, used in this fixed order.
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

/** The colour for the stock at `index` in the pinned list. Colours only repeat past eight stocks. */
export function seriesColor(index: number): string {
    return SERIES_COLORS[index % SERIES_COLORS.length];
}
