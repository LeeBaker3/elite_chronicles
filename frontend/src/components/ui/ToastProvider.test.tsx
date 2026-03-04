import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ToastProvider, useToast } from "./ToastProvider";

function Harness() {
    const { showToast } = useToast();

    return (
        <>
            <button
                type="button"
                onClick={() => {
                    showToast({
                        message: "Unable to load stations.",
                        variant: "warning",
                        actionLabel: "Retry",
                        onAction: () => undefined,
                        durationMs: 0,
                    });
                }}
            >
                Warn
            </button>
            <button
                type="button"
                onClick={() => {
                    showToast({ message: "Trade complete.", variant: "success", durationMs: 0 });
                }}
            >
                Success
            </button>
            <button
                type="button"
                onClick={() => {
                    showToast({
                        message: "Persistent notice.",
                        variant: "info",
                        durationMs: 20,
                        persistent: true,
                    });
                }}
            >
                Persistent
            </button>
        </>
    );
}

describe("ToastProvider", () => {
    it("renders toast from context", () => {
        render(
            <ToastProvider>
                <Harness />
            </ToastProvider>
        );

        fireEvent.click(screen.getByRole("button", { name: "Success" }));
        expect(screen.getByText("Trade complete.")).toBeInTheDocument();
    });

    it("renders action CTA and dismisses toast", () => {
        render(
            <ToastProvider>
                <Harness />
            </ToastProvider>
        );

        fireEvent.click(screen.getByRole("button", { name: "Warn" }));
        expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
        expect(screen.queryByText("Unable to load stations.")).not.toBeInTheDocument();
    });

    it("dedupes identical messages by variant", () => {
        render(
            <ToastProvider>
                <Harness />
            </ToastProvider>
        );

        fireEvent.click(screen.getByRole("button", { name: "Success" }));
        fireEvent.click(screen.getByRole("button", { name: "Success" }));

        expect(screen.getAllByText("Trade complete.")).toHaveLength(1);
    });

    it("throws when useToast is outside provider", () => {
        const Broken = () => {
            useToast();
            return null;
        };

        expect(() => render(<Broken />)).toThrow(
            "useToast must be used within ToastProvider"
        );
    });

    it("keeps persistent toasts visible after timeout", () => {
        vi.useFakeTimers();

        render(
            <ToastProvider>
                <Harness />
            </ToastProvider>
        );

        fireEvent.click(screen.getByRole("button", { name: "Persistent" }));
        expect(screen.getByText("Persistent notice.")).toBeInTheDocument();

        vi.advanceTimersByTime(50);
        expect(screen.getByText("Persistent notice.")).toBeInTheDocument();

        vi.useRealTimers();
    });
});
