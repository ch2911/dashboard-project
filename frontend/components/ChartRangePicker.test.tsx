// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ChartRangePicker from "./ChartRangePicker";

describe("ChartRangePicker", () => {
    afterEach(cleanup);

    it("shows a button for each range, with the chosen one pressed", () => {
        render(<ChartRangePicker value="week" onChange={() => {}} />);

        const buttons = screen.getAllByRole("button");
        expect(buttons.map((b) => b.textContent)).toEqual(["1D", "1W", "1M", "3M"]);
        expect(screen.getByRole("button", { name: "1W" }).getAttribute("aria-pressed")).toBe("true");
        expect(screen.getByRole("button", { name: "3M" }).getAttribute("aria-pressed")).toBe("false");
    });

    it("reports the range that was clicked", () => {
        const onChange = vi.fn();
        render(<ChartRangePicker value="daily" onChange={onChange} />);

        fireEvent.click(screen.getByRole("button", { name: "1M" }));

        expect(onChange).toHaveBeenCalledWith("month");
    });
});
