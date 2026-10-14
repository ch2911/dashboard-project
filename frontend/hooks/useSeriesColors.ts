"use client";

import { useEffect, useMemo, useRef } from "react";
import { assignSeriesColors, type ColorAssignments } from "../utils/chartColors";

const STORAGE_KEY = "seriesColors";

function loadAssignments(): ColorAssignments {
    try {
        const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
        return stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
    } catch {
        return {};
    }
}

/**
 * Colour assignments for the pinned stocks that stay put when a stock is unpinned. They're saved in
 * the browser so each stock also keeps its colour after a reload.
 */
export function useSeriesColors(pinned: string[]): ColorAssignments {
    const previous = useRef<ColorAssignments | null>(null);

    const assignments = useMemo(() => {
        if (previous.current === null) {
            previous.current = typeof window === "undefined" ? {} : loadAssignments();
        }
        return assignSeriesColors(pinned, previous.current);
    }, [pinned]);

    useEffect(() => {
        // An empty list is what's shown while the pinned stocks load, so it doesn't replace real colours
        if (pinned.length === 0) return;
        previous.current = assignments;
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(assignments));
        } catch {
            // Storage can be unavailable, for example in a private window. Colours then last until a reload.
        }
    }, [pinned, assignments]);

    return assignments;
}
