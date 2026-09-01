// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, within } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Timeline } from "@/components/orders/Timeline";
import type { TimelineEntry } from "@/lib/api/types";

vi.stubGlobal("React", React);
afterEach(cleanup);

const ENTRIES: TimelineEntry[] = [
  { at: "2026-08-31T15:24:00.000Z", state: "downpayment_review", by: "user_ops", note: "Placed" },
  { at: "2026-08-31T15:25:00.000Z", state: "needs_qa", by: "user_ops", note: "Confirmed" },
  { at: "2026-08-31T15:26:00.000Z", state: "out_for_delivery", by: "user_rider", note: "In transit" },
];

function labels(): string[] {
  return within(screen.getByRole("list"))
    .getAllByRole("listitem")
    .map((li) => li.textContent ?? "");
}

describe("Timeline", () => {
  it("reads oldest first by default, so Operations still gets a record", () => {
    render(<Timeline entries={ENTRIES} />);
    const rendered = labels();
    expect(rendered[0]).toContain("Downpayment needs confirming");
    expect(rendered[2]).toContain("Out for delivery");
  });

  it("puts the most recent event on top when asked", () => {
    render(<Timeline entries={ENTRIES} newestFirst />);
    const rendered = labels();
    expect(rendered[0]).toContain("Out for delivery");
    expect(rendered[2]).toContain("Downpayment needs confirming");
  });

  it("marks the latest event, whichever end of the list it sits at", () => {
    const { unmount } = render(<Timeline entries={ENTRIES} newestFirst />);
    expect(labels()[0]).toContain("Now");
    unmount();

    render(<Timeline entries={ENTRIES} />);
    const rendered = labels();
    expect(rendered[2]).toContain("Now");
    expect(rendered[0]).not.toContain("Now");
  });

  it("finds the latest by timestamp, not by array position", () => {
    const shuffled = [ENTRIES[1], ENTRIES[2], ENTRIES[0]];
    render(<Timeline entries={shuffled} newestFirst />);
    const rendered = labels();
    expect(rendered[0]).toContain("Out for delivery");
    expect(rendered[0]).toContain("Now");
  });

  it("says so when there is nothing to show", () => {
    render(<Timeline entries={[]} />);
    expect(screen.getByText("No timeline events yet.")).toBeInTheDocument();
  });
});
