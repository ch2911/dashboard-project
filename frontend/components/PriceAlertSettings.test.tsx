// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { queueQueries } from "../test/fakes";

// Shared with every fresh copy of the component that renderSettings imports
const { from, useAuth } = vi.hoisted(() => ({ from: vi.fn(), useAuth: vi.fn() }));
vi.mock("../lib/supabaseClient", () => ({ supabase: { from } }));
vi.mock("../lib/useAuth", () => ({ useAuth }));

const OWNER = { id: "owner-1" };
const VISITOR = { id: "visitor-1" };

// The owner id is read when the module loads, as Next.js bakes it into the build
async function renderSettings({ user = OWNER, ownerId = "" } = {}) {
    vi.stubEnv("NEXT_PUBLIC_ALERT_OWNER_ID", ownerId);
    vi.resetModules();
    useAuth.mockReturnValue({ user, loading: false });
    const { default: PriceAlertSettings } = await import("./PriceAlertSettings");
    render(<PriceAlertSettings />);
    await screen.findByRole("button", { name: "Save" });
}

const threshold = () => screen.getByRole("spinbutton") as HTMLInputElement;
const enabled = () => screen.getByRole("checkbox") as HTMLInputElement;

describe("PriceAlertSettings", () => {
    beforeEach(() => {
        from.mockReset();
    });
    afterEach(() => {
        cleanup();
        vi.unstubAllEnvs();
    });

    it("shows the user's saved settings", async () => {
        const [load] = queueQueries(from, { data: { enabled: false, threshold_percent: "7.50" }, error: null });
        await renderSettings();

        expect(load.eq).toHaveBeenCalledWith("user_id", "owner-1");
        expect(enabled().checked).toBe(false);
        expect(threshold().value).toBe("7.5");
        expect(threshold().disabled).toBe(true);
    });

    it("starts with alerts on at 5% when nothing is saved", async () => {
        queueQueries(from, { data: null, error: null });
        await renderSettings();
        expect(enabled().checked).toBe(true);
        expect(threshold().value).toBe("5");
    });

    it("says so when the settings can't be loaded", async () => {
        queueQueries(from, { data: null, error: { message: "down" } });
        await renderSettings();
        expect(screen.getByText("Couldn't load your alert settings.")).toBeTruthy();
    });

    it("saves a new threshold for the user", async () => {
        const [, save] = queueQueries(from, { data: null, error: null }, { error: null });
        await renderSettings();

        fireEvent.change(threshold(), { target: { value: "2.5" } });
        fireEvent.click(screen.getByRole("button", { name: "Save" }));

        await screen.findByText("Saved.");
        expect(save.upsert).toHaveBeenCalledWith(
            expect.objectContaining({ user_id: "owner-1", enabled: true, threshold_percent: 2.5 }),
        );
    });

    it("explains an invalid threshold instead of saving it", async () => {
        queueQueries(from, { data: null, error: null });
        await renderSettings();

        fireEvent.change(threshold(), { target: { value: "80" } });
        // The browser's own min/max check would stop the click, so submit directly to reach ours
        fireEvent.submit(threshold().closest("form")!);

        await screen.findByText("Choose between 0.5% and 50%.");
        expect(from).toHaveBeenCalledTimes(1);
    });

    it("says so when saving fails", async () => {
        queueQueries(from, { data: null, error: null }, { error: { message: "nope" } });
        await renderSettings();
        fireEvent.click(screen.getByRole("button", { name: "Save" }));
        await screen.findByText("Couldn't save your alert settings. Please try again.");
    });

    describe("in demo mode", () => {
        it("lets the site owner change their settings", async () => {
            queueQueries(from, { data: null, error: null }, { error: null });
            await renderSettings({ user: OWNER, ownerId: "owner-1" });

            expect(screen.getByText(/only sent to you, the site owner/)).toBeTruthy();
            expect((screen.getByRole("group") as HTMLFieldSetElement).disabled).toBe(false);
            fireEvent.click(screen.getByRole("button", { name: "Save" }));
            await screen.findByText("Saved.");
        });

        it("turns the settings off for everyone else and never saves them", async () => {
            queueQueries(from, { data: null, error: null });
            await renderSettings({ user: VISITOR, ownerId: "owner-1" });

            expect(screen.getByText(/turned off for your account/)).toBeTruthy();
            expect((screen.getByRole("group") as HTMLFieldSetElement).disabled).toBe(true);
            // A disabled form can still be submitted from the keyboard in some browsers
            fireEvent.submit(screen.getByRole("button", { name: "Save" }).closest("form")!);
            await waitFor(() => expect(from).toHaveBeenCalledTimes(1));
            expect(screen.queryByText("Saved.")).toBeNull();
        });
    });
});
