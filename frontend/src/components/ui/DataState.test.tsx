import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DataState } from "./DataState";

describe("DataState", () => {
  it("renders title and description", () => {
    render(
      <DataState
        variant="empty"
        title="No cargo"
        description="Install a cargo hold to continue."
      />
    );

    expect(screen.getByText("No cargo")).toBeInTheDocument();
    expect(
      screen.getByText("Install a cargo hold to continue.")
    ).toBeInTheDocument();
  });

  it("uses alert semantics for error variant", () => {
    render(
      <DataState
        variant="error"
        title="Cargo unavailable"
        description="Retry the cargo uplink."
      />
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("runs action callback when action button is clicked", () => {
    const onAction = vi.fn();

    render(
      <DataState
        variant="empty"
        title="No sessions"
        description="Start a story session."
        actionLabel="Start"
        onAction={onAction}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
