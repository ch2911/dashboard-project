// Settings for the emails sent when a pinned stock moves a lot in a day
// (backend/send_price_alerts.py). Stored per user in Supabase's alert_settings table.

export const DEFAULT_THRESHOLD_PERCENT = 5;
export const MIN_THRESHOLD_PERCENT = 0.5;
export const MAX_THRESHOLD_PERCENT = 50;

export type AlertSettings = { enabled: boolean; thresholdPercent: number };

export const DEFAULT_ALERT_SETTINGS: AlertSettings = {
    enabled: true,
    thresholdPercent: DEFAULT_THRESHOLD_PERCENT,
};

// The threshold typed in the settings form as a number, or an error message to show instead.
export function parseThreshold(input: string): { value: number } | { error: string } {
    const value = Number(input.trim());
    if (input.trim() === "" || !Number.isFinite(value)) {
        return { error: "Enter a percentage, like 5." };
    }
    if (value < MIN_THRESHOLD_PERCENT || value > MAX_THRESHOLD_PERCENT) {
        return { error: `Choose between ${MIN_THRESHOLD_PERCENT}% and ${MAX_THRESHOLD_PERCENT}%.` };
    }
    return { value: Math.round(value * 100) / 100 };
}

// A row from the alert_settings table, or the defaults when the user hasn't saved any.
export function settingsFromRow(row: { enabled: boolean; threshold_percent: number | string } | null): AlertSettings {
    if (!row) return DEFAULT_ALERT_SETTINGS;
    return { enabled: row.enabled, thresholdPercent: Number(row.threshold_percent) };
}

// Demo mode: without a verified email domain, the email provider only delivers to the site
// owner, so alerts are limited to the user whose Supabase id is in NEXT_PUBLIC_ALERT_OWNER_ID.
// Without it set, everyone can use alerts.
export function alertsAvailableTo(userId: string | undefined, ownerId: string | undefined): boolean {
    if (!ownerId) return true;
    return userId === ownerId;
}
