// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { supabase } from "../../../../lib/supabaseClient";
import { deleteAccount } from "../../../../utils/api";
import { fakeDeviceTheme } from "../../../../test/fakes";
import SettingsPage from "./page";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("../../../../lib/useAuthRedirect", () => ({
    useAuthRedirect: () => ({ user: { id: "user-1", email: "me@example.com" }, loading: false }),
}));
vi.mock("../../../../lib/supabaseClient", () => ({
    supabase: { auth: { getSession: vi.fn(), signOut: vi.fn() } },
}));
vi.mock("../../../../utils/api", () => ({ deleteAccount: vi.fn() }));
// Tested on its own in components/PriceAlertSettings.test.tsx
vi.mock("../../../../components/PriceAlertSettings", () => ({ default: () => null }));

const getSession = vi.mocked(supabase.auth.getSession);
const signOut = vi.mocked(supabase.auth.signOut);

function hasSession(token: string | null) {
    getSession.mockResolvedValue({ data: { session: token ? { access_token: token } : null } } as never);
}

const radio = (name: string) => screen.getByRole("radio", { name: new RegExp(name) });

describe("Settings page", () => {
    beforeEach(() => {
        localStorage.clear();
        fakeDeviceTheme(false);
    });
    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
        vi.unstubAllGlobals();
    });

    describe("appearance", () => {
        it("shows the saved choice", async () => {
            localStorage.setItem("theme-mode", "system");
            localStorage.setItem("theme-accent", "violet");
            render(<SettingsPage />);
            await waitFor(() => expect(radio("Match my device").getAttribute("aria-checked")).toBe("true"));
            expect(radio("Violet").getAttribute("aria-checked")).toBe("true");
        });

        it("applies and saves a new mode and colour straight away", () => {
            render(<SettingsPage />);
            fireEvent.click(radio("Dark"));
            fireEvent.click(radio("Indigo"));

            expect(document.documentElement.dataset).toMatchObject({ theme: "dark", accent: "indigo" });
            expect(localStorage.getItem("theme-mode")).toBe("dark");
            expect(localStorage.getItem("theme-accent")).toBe("indigo");
            expect(radio("Dark").getAttribute("aria-checked")).toBe("true");
            expect(radio("Light").getAttribute("aria-checked")).toBe("false");
        });
    });

    describe("deleting the profile", () => {
        function startDeleting() {
            render(<SettingsPage />);
            fireEvent.click(screen.getByRole("button", { name: "Delete profile" }));
            return {
                input: screen.getByRole("textbox"),
                confirm: screen.getByRole("button", { name: "Delete my profile" }) as HTMLButtonElement,
            };
        }

        it("shows who is signed in", () => {
            render(<SettingsPage />);
            expect(screen.getByText("Signed in as me@example.com")).toBeTruthy();
        });

        it("only allows deleting once DELETE is typed exactly", () => {
            const { input, confirm } = startDeleting();
            expect(confirm.disabled).toBe(true);
            fireEvent.change(input, { target: { value: "delete" } });
            expect(confirm.disabled).toBe(true);
            fireEvent.change(input, { target: { value: "DELETE" } });
            expect(confirm.disabled).toBe(false);
        });

        it("deletes the profile, signs out and goes to the login page", async () => {
            hasSession("token-123");
            vi.mocked(deleteAccount).mockResolvedValue(null);
            const { input, confirm } = startDeleting();

            fireEvent.change(input, { target: { value: "DELETE" } });
            fireEvent.click(confirm);

            await waitFor(() => expect(push).toHaveBeenCalledWith("/login"));
            expect(deleteAccount).toHaveBeenCalledWith("token-123");
            expect(signOut).toHaveBeenCalled();
        });

        it("shows the server's reason and stays signed in if it fails", async () => {
            hasSession("token-123");
            vi.mocked(deleteAccount).mockResolvedValue("Profile deletion isn't set up on the server.");
            const { input, confirm } = startDeleting();

            fireEvent.change(input, { target: { value: "DELETE" } });
            fireEvent.click(confirm);

            await screen.findByText("Profile deletion isn't set up on the server.");
            expect(signOut).not.toHaveBeenCalled();
            expect(push).not.toHaveBeenCalled();
            // The user can try again
            expect(confirm.disabled).toBe(false);
        });

        it("asks the user to sign in again when the session has expired", async () => {
            hasSession(null);
            const { input, confirm } = startDeleting();

            fireEvent.change(input, { target: { value: "DELETE" } });
            fireEvent.click(confirm);

            await screen.findByText("Please sign in again.");
            expect(deleteAccount).not.toHaveBeenCalled();
        });

        it("can be cancelled, which clears what was typed", () => {
            const { input } = startDeleting();
            fireEvent.change(input, { target: { value: "DELETE" } });
            fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

            expect(screen.queryByRole("textbox")).toBeNull();
            fireEvent.click(screen.getByRole("button", { name: "Delete profile" }));
            expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("");
        });
    });
});
