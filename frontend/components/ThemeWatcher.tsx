"use client";

import { useEffect } from "react";
import { followDeviceTheme } from "../utils/theme";

/** Switches between light and dark when the device does, for people who chose "Match my device". */
export default function ThemeWatcher() {
    useEffect(() => followDeviceTheme(), []);
    return null;
}
