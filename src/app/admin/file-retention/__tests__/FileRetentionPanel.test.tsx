// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, within } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const getFileRetention = vi.hoisted(() => vi.fn());

vi.stubGlobal("React", React);
// Only the read exists on this mock: anything that deletes would throw.
vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return {
    ApiError: actual.ApiError,
    isApiError: actual.isApiError,
    getFileRetention: (...args: unknown[]) => getFileRetention(...args),
  };
});

import { FileRetentionPanel } from "@/app/admin/file-retention/_components/FileRetentionPanel";
import { ApiError } from "@/lib/api/client";

afterEach(() => {
  cleanup();
  getFileRetention.mockReset();
});

const report = {
  at: "2026-10-04T10:00:00.000Z",
  dryRun: true,
  deletionEnabled: false,
  total: 5,
  byPurpose: { artwork: 3, catalog_item_photo: 2 },
  deleted: 0,
  failed: 0,
};

describe("File retention panel", () => {
  it("shows automatic deletion off, as a switch nobody can flip here", async () => {
    getFileRetention.mockResolvedValue(report);
    render(<FileRetentionPanel />);
    const toggle = await screen.findByRole("switch", { name: "Automatic deletion is off" });
    expect(toggle).not.toBeChecked();
    expect(toggle).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("Off: counting only")).toBeInTheDocument();
    expect(screen.getByText(/no click here can start deleting files/)).toBeInTheDocument();
  });

  it("counts per file type with each type's period", async () => {
    getFileRetention.mockResolvedValue(report);
    render(<FileRetentionPanel />);
    expect(await screen.findByText("5 files")).toBeInTheDocument();
    const artwork = screen.getByText("Artwork and design files").closest("div")!.parentElement!;
    expect(within(artwork as HTMLElement).getByText(/Kept 30 days after the order is completed/)).toBeInTheDocument();
    expect(screen.getByText("Listing photo").nextSibling).toHaveTextContent("2");
    expect(screen.getByText(/A count only: nothing was deleted/)).toBeInTheDocument();
  });

  it("says when deletion has been turned on", async () => {
    getFileRetention.mockResolvedValue({ ...report, deletionEnabled: true, dryRun: true });
    render(<FileRetentionPanel />);
    expect(await screen.findByRole("switch", { name: "Automatic deletion is on" })).toBeChecked();
    expect(screen.getByText("On: deleting on schedule")).toBeInTheDocument();
  });

  it("explains a refused read", async () => {
    getFileRetention.mockRejectedValue(new ApiError(403, { error: "forbidden" }));
    render(<FileRetentionPanel />);
    expect(await screen.findByText("This action is restricted to Super Admin.")).toBeInTheDocument();
  });
});
