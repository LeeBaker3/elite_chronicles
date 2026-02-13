import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Tooltip } from "./Tooltip";

describe("Tooltip", () => {
  it("shows tooltip content on hover", async () => {
    render(
      <Tooltip content="Market refresh help" delay={0}>
        <button type="button">Refresh</button>
      </Tooltip>
    );

    const trigger = screen.getByRole("button", { name: "Refresh" });
    fireEvent.mouseEnter(trigger.parentElement as HTMLElement);

    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Market refresh help"
    );
  });

  it("closes tooltip on escape", async () => {
    render(
      <Tooltip content="Session help" delay={0}>
        <button type="button">Session</button>
      </Tooltip>
    );

    const trigger = screen.getByRole("button", { name: "Session" });
    fireEvent.mouseEnter(trigger.parentElement as HTMLElement);
    expect(await screen.findByRole("tooltip")).toBeInTheDocument();

    fireEvent.keyDown(trigger.parentElement as HTMLElement, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
