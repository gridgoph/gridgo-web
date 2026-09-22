// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getFileDownloadUrl: vi.fn(async () => "https://cdn.example/sample.jpg"),
}));

vi.stubGlobal("React", React);

vi.mock("@/lib/api/client", () => ({
  getFileDownloadUrl: mocks.getFileDownloadUrl,
}));

import { SamplePhoto } from "@/app/supplier/_components/SamplePhoto";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SamplePhoto viewer", () => {
  it("opens a zoom dialog from a stored photo", async () => {
    const user = userEvent.setup();
    mocks.getFileDownloadUrl.mockResolvedValueOnce("https://cdn.example/sample.jpg");
    render(<SamplePhoto fileId="file_1" alt="Flyers on the rack" />);

    await user.click(await screen.findByRole("button", { name: "Open Flyers on the rack larger" }));

    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByText("Pinch or scroll to look closer.")).toBeVisible();
    expect(screen.getAllByAltText("Flyers on the rack").length).toBeGreaterThan(1);
  });

  it("does not offer a viewer on an empty plate", () => {
    render(<SamplePhoto alt="Flyers" emptyLabel="No sample yet" />);

    expect(screen.getByText("No sample yet")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Open Flyers larger" }),
    ).not.toBeInTheDocument();
  });
});
