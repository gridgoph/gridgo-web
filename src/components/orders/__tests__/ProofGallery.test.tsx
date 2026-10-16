// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/client";

const { getFileMock, urlMock } = vi.hoisted(() => ({
  getFileMock: vi.fn(),
  urlMock: vi.fn(),
}));

vi.stubGlobal("React", React);
vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>(
    "@/lib/api/client",
  );
  return { ...actual, getFile: getFileMock, getFileDownloadUrl: urlMock };
});

import { ProofGallery } from "@/components/orders/ProofGallery";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const file = (fileId: string, type = "image/jpeg") => ({
  fileId,
  originalFilename: `${fileId}.${type === "application/pdf" ? "pdf" : "jpg"}`,
  declaredContentType: type,
  detectedContentType: type,
  state: "ready",
});

describe("ProofGallery", () => {
  it("shows a frame that did not load, and loads it on Try again", async () => {
    const user = userEvent.setup();
    // A malformed answer is a failed frame, never an unhandled error.
    getFileMock.mockResolvedValueOnce(undefined).mockResolvedValue(file("f1"));
    urlMock.mockResolvedValue("https://files.test/f1");

    render(<ProofGallery fileIds={["f1"]} label="Proof" />);

    expect(await screen.findByText("Did not load")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try proof 1 again" }));
    const frame = await screen.findByRole("button", { name: "Open proof 1" });
    expect(frame.querySelector("img")).toHaveAttribute("src", "https://files.test/f1");
  });

  it("marks a deleted file and a document instead of drawing a broken picture", async () => {
    getFileMock.mockImplementation(async (id: string) => {
      if (id === "gone") throw new ApiError(404, { error: "file_not_found" });
      return file(id, "application/pdf");
    });
    urlMock.mockResolvedValue("https://files.test/doc");

    render(<ProofGallery fileIds={["gone", "doc"]} label="Proof" />);

    expect(await screen.findByRole("button", { name: "Open proof 1, deleted" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Open proof 2, a document" })).toBeInTheDocument();
  });

  it("draws nothing for an empty stage", () => {
    const { container } = render(<ProofGallery fileIds={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
