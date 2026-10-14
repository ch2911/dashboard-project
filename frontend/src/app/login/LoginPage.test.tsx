// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { supabase } from "../../../lib/supabaseClient";
import LoginPage from "./page";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("../../../lib/supabaseClient", () => ({
    supabase: { auth: { signInWithPassword: vi.fn(), signUp: vi.fn() } },
}));

const auth = vi.mocked(supabase.auth);

function fillIn() {
    render(<LoginPage />);
    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "me@example.com" } });
    fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "hunter22" } });
}

describe("Login page", () => {
    beforeEach(() => {
        vi.stubGlobal("alert", vi.fn());
    });
    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
        vi.unstubAllGlobals();
    });

    it("signs in and goes to the dashboard", async () => {
        auth.signInWithPassword.mockResolvedValue({ error: null } as never);
        fillIn();
        fireEvent.click(screen.getByRole("button", { name: "Login" }));

        await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard"));
        expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: "me@example.com", password: "hunter22" });
    });

    it("shows why signing in failed and stays on the page", async () => {
        auth.signInWithPassword.mockResolvedValue({ error: { message: "Invalid login credentials" } } as never);
        fillIn();
        fireEvent.click(screen.getByRole("button", { name: "Login" }));

        await screen.findByText("Invalid login credentials");
        expect(push).not.toHaveBeenCalled();
        expect((screen.getByRole("button", { name: "Login" }) as HTMLButtonElement).disabled).toBe(false);
    });

    it("signs up and asks the user to confirm their email", async () => {
        auth.signUp.mockResolvedValue({ error: null } as never);
        fillIn();
        fireEvent.click(screen.getByRole("button", { name: "Sign up" }));

        await waitFor(() => expect(alert).toHaveBeenCalledWith("Check your email for confirmation link!"));
        expect(auth.signUp).toHaveBeenCalledWith({ email: "me@example.com", password: "hunter22" });
        expect(push).not.toHaveBeenCalled();
    });

    it("shows why signing up failed", async () => {
        auth.signUp.mockResolvedValue({ error: { message: "User already registered" } } as never);
        fillIn();
        fireEvent.click(screen.getByRole("button", { name: "Sign up" }));
        await screen.findByText("User already registered");
        expect(alert).not.toHaveBeenCalled();
    });
});
