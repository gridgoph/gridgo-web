// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Order } from "@/lib/api/types";

const m = vi.hoisted(() => ({
  getOrder: vi.fn(),
  getFile: vi.fn(),
  signed: vi.fn(),
  record: vi.fn(),
  transition: vi.fn(),
  fetchBlob: vi.fn(),
  save: vi.fn(),
  push: vi.fn(),
}));

vi.stubGlobal("React", React);
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "ord_3ff0128e105a" }),
  useRouter: () => ({ push: m.push }),
}));
vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return {
    ...actual,
    getOrder: m.getOrder,
    getFile: m.getFile,
    getFileDownloadUrl: m.signed,
    recordShopFileAccess: m.record,
    transitionOrder: m.transition,
  };
});
vi.mock("@/lib/file-save", () => ({ fetchRemoteBlob: m.fetchBlob, saveBlob: m.save }));

import SupplierJobFilesPage from "../page";

const ORDER = {
  id: "ord_3ff0128e105a",
  title: "Document printing",
  state: "payment_authorized",
  orderType: "express",
  fulfillmentMode: "pickup",
  shopAcceptance: {
    supplierId: "shop_1",
    assignedAt: "2026-11-22T05:00:00.000Z",
    deadlineAt: "2026-11-22T05:05:00.000Z",
    workingMinutes: 5,
    status: "accepted",
  },
  expressOrder: {
    printSettings: [
      { fileId: "file_a", pages: { printed: 12, total: 12 }, copies: 2, paper: "a4", colour: "bw", sides: "one", note: "Staple top-left" },
    ],
  },
  fileAccesses: [],
} as unknown as Order;

function fileMeta(type: string, name: string) {
  return { id: "file_a", originalFilename: name, detectedContentType: type, declaredContentType: type };
}

beforeEach(() => {
  window.localStorage.clear();
  URL.createObjectURL = vi.fn(() => "blob:local/1");
  URL.revokeObjectURL = vi.fn();
  m.getOrder.mockResolvedValue(ORDER);
  m.signed.mockResolvedValue("https://storage.example/signed");
  m.fetchBlob.mockResolvedValue(new Blob(["%PDF"], { type: "application/pdf" }));
  m.record.mockImplementation(async (_order: string, fileId: string, body: { action: string }) => [
    { jobId: "", userId: "u", deviceId: "d", fileId, action: body.action, firstAt: "2026-11-22T05:00:00Z", lastAt: "2026-11-22T05:00:00Z", count: 1 },
  ]);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("job file viewer", () => {
  it("shows a PDF in the page with Print first, the settings and the client's note", async () => {
    m.getFile.mockResolvedValue(fileMeta("application/pdf", "Thesis.pdf"));
    render(<SupplierJobFilesPage />);
    const frame = await screen.findByTitle(/Client file/);
    expect(frame).toHaveAttribute("src", "blob:local/1");
    expect(screen.getByRole("button", { name: /^Print/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Download" })).toBeEnabled();
    expect(screen.getByRole("list", { name: "Print settings" })).toHaveTextContent("A4");
    expect(screen.getByRole("list", { name: "Print settings" })).toHaveTextContent("Staple top-left");
    expect(screen.getByText("Best: print from here")).toBeVisible();
    expect(screen.getByText("If you download it")).toBeVisible();
    // The device id goes with the signed link, and the open is recorded.
    expect(m.signed).toHaveBeenCalledWith("file_a", { deviceId: expect.any(String) });
    await waitFor(() =>
      expect(m.record).toHaveBeenCalledWith(
        ORDER.id,
        "file_a",
        expect.objectContaining({ action: "opened", jobId: "" }),
      ),
    );
  });

  it("prints the file from the frame, not the page around it", async () => {
    m.getFile.mockResolvedValue(fileMeta("application/pdf", "Thesis.pdf"));
    render(<SupplierJobFilesPage />);
    const frame = (await screen.findByTitle(/Client file/)) as HTMLIFrameElement;
    const print = vi.fn();
    Object.defineProperty(frame, "contentWindow", { value: { focus: vi.fn(), print } });
    fireEvent.click(screen.getByRole("button", { name: /^Print/ }));
    expect(print).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: "p", ctrlKey: true });
    expect(print).toHaveBeenCalledTimes(2);
    expect(m.save).not.toHaveBeenCalled();
  });

  it("records a download and remembers it for the delete reminder", async () => {
    m.getFile.mockResolvedValue(fileMeta("application/pdf", "Thesis.pdf"));
    render(<SupplierJobFilesPage />);
    await screen.findByTitle(/Client file/);
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    await waitFor(() => expect(m.save).toHaveBeenCalledWith(expect.any(Blob), "Thesis.pdf"));
    await waitFor(() =>
      expect(m.record).toHaveBeenCalledWith(
        ORDER.id,
        "file_a",
        expect.objectContaining({ action: "downloaded" }),
      ),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(/Saved Thesis.pdf/);
  });

  it("offers a Word file as a download only, and never fetches it to show", async () => {
    m.getFile.mockResolvedValue(
      fileMeta("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Letter.docx"),
    );
    render(<SupplierJobFilesPage />);
    expect(await screen.findByText(/cannot show this kind of file/)).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Print/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download to print" })).toBeEnabled();
    expect(m.signed).not.toHaveBeenCalled();
    expect(m.record).not.toHaveBeenCalled();
  });

  it("marks the job ready on R and goes back to Today", async () => {
    m.getFile.mockResolvedValue(fileMeta("application/pdf", "Thesis.pdf"));
    m.transition.mockResolvedValue({ ...ORDER, state: "ready_for_dispatch" });
    render(<SupplierJobFilesPage />);
    await screen.findByTitle(/Client file/);
    fireEvent.keyDown(document.body, { key: "r" });
    await waitFor(() => expect(m.push).toHaveBeenCalledWith("/supplier/dashboard"));
    expect(m.transition).toHaveBeenCalledWith(ORDER.id, "ready_for_dispatch", expect.anything());
  });
});
