// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ id: "a", get: vi.fn(), pdf: vi.fn() }));
vi.stubGlobal("React", React);
vi.mock("next/navigation", () => ({ useParams: () => ({ versionId: m.id }) }));
vi.mock("@/lib/api/supplier-self", () => ({
  getSupplierLegalVersion: m.get,
  getSupplierLegalPdf: m.pdf,
}));
import Page from "../page";
afterEach(cleanup);
beforeEach(() => {
  m.id = "a";
  m.get.mockReset();
  m.pdf.mockReset();
});
it("does not keep the old text visible when a different document fails", async () => {
  m.get
    .mockResolvedValueOnce({ document: { title: "Terms A", text: "Old text" } })
    .mockRejectedValueOnce(new Error("offline"));
  const view = render(<Page />);
  await screen.findByText("Old text");
  m.id = "b";
  view.rerender(<Page />);
  await screen.findByRole("alert");
  expect(screen.queryByText("Old text")).not.toBeInTheDocument();
  m.get.mockResolvedValueOnce({ document: { title: "Terms C", text: "Fresh text" } });
  m.id = "c";
  view.rerender(<Page />);
  await screen.findByText("Fresh text");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
it("does not offer a PDF for a text-only version", async () => {
  m.get.mockResolvedValue({
    document: { title: "Terms", text: "Plain text", pdfUrl: null },
  });
  render(<Page />);
  await screen.findByText("Plain text");
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Open PDF" })).not.toBeInTheDocument(),
  );
});
