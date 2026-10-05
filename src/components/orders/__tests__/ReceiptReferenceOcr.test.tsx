// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getFileContent = vi.hoisted(() => vi.fn());
const getFileDownloadUrl = vi.hoisted(() => vi.fn());
const recognizeReceipt = vi.hoisted(() => vi.fn());

vi.stubGlobal("React", React);
vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return {
    ApiError: actual.ApiError,
    isApiError: actual.isApiError,
    getFileContent: (...args: unknown[]) => getFileContent(...args),
    getFileDownloadUrl: (...args: unknown[]) => getFileDownloadUrl(...args),
  };
});
vi.mock("@/lib/receiptOcrRecognize", () => ({
  recognizeReceipt: (...args: unknown[]) => recognizeReceipt(...args),
}));

import { ReceiptReferenceOcr } from "@/components/orders/ReceiptReferenceOcr";
import { ApiError } from "@/lib/api/client";

const receiptBytes = new Blob(["png"], { type: "image/png" });

afterEach(() => {
  cleanup();
  getFileContent.mockReset();
  getFileDownloadUrl.mockReset();
  recognizeReceipt.mockReset();
});

beforeEach(() => {
  getFileContent.mockResolvedValue(receiptBytes);
  getFileDownloadUrl.mockResolvedValue("https://files.test/receipt.jpg");
});

describe("ReceiptReferenceOcr", () => {
  it("fills Client reference from the receipt when the client sent none", async () => {
    recognizeReceipt.mockResolvedValue({
      text: "Ref. No. 1234567890123",
      confidence: 80,
    });
    render(<ReceiptReferenceOcr fileId="file_proof" submittedReference={null} />);
    expect(screen.getByText("Reading the reference from the receipt…")).toBeInTheDocument();
    expect(await screen.findByText("1234567890123")).toBeInTheDocument();
    expect(screen.getByText("Read from the receipt.")).toBeInTheDocument();
  });

  it("confirms a matching submitted reference", async () => {
    recognizeReceipt.mockResolvedValue({
      text: "Ref. No. 1234567890123",
      confidence: 80,
    });
    render(
      <ReceiptReferenceOcr fileId="file_proof" submittedReference="1234567890123" />,
    );
    expect(await screen.findByText("Receipt reads the same number.")).toBeInTheDocument();
    expect(screen.getAllByText("1234567890123")).toHaveLength(1);
  });

  it("suggests the printed number when it differs from the client", async () => {
    recognizeReceipt.mockResolvedValue({
      text: "Ref. No. 9044838604781",
      confidence: 80,
    });
    render(
      <ReceiptReferenceOcr fileId="file_proof" submittedReference="TYPEDREF01" />,
    );
    expect(await screen.findByText("TYPEDREF01")).toBeInTheDocument();
    expect(screen.getByText("9044838604781")).toBeInTheDocument();
    expect(screen.getByText(/different from what the client sent/)).toBeInTheDocument();
  });

  it("says so when the screenshot cannot be read", async () => {
    recognizeReceipt.mockResolvedValue({
      text: "₱51.75\nSep 4, 2026",
      confidence: 10,
    });
    render(
      <ReceiptReferenceOcr fileId="file_proof" submittedReference="TYPEDREF01" />,
    );
    expect(
      await screen.findByText("The number could not be read. Check the picture."),
    ).toBeInTheDocument();
    expect(screen.getByText("TYPEDREF01")).toBeInTheDocument();
  });
  it("reads the receipt bytes through the API, not the storage link", async () => {
    recognizeReceipt.mockResolvedValue({ text: "Ref. No. 9044838604781", confidence: 80 });
    render(<ReceiptReferenceOcr fileId="file_proof" submittedReference={null} />);
    expect(await screen.findByText("9044838604781")).toBeInTheDocument();
    expect(getFileContent).toHaveBeenCalledWith("file_proof");
    expect(recognizeReceipt.mock.calls[0][0]).toBe(receiptBytes);
    expect(getFileDownloadUrl).not.toHaveBeenCalled();
  });

  it.each([
    ["an API without the route", new ApiError(404, { error: "not_found" })],
    ["a storage read failure", new ApiError(502, { error: "storage_unavailable" })],
    ["a network failure", new TypeError("Failed to fetch")],
  ])("falls back to the signed storage link after %s", async (_label, error) => {
    getFileContent.mockRejectedValue(error);
    recognizeReceipt.mockResolvedValue({ text: "Ref. No. 9044838604781", confidence: 80 });
    render(<ReceiptReferenceOcr fileId="file_proof" submittedReference={null} />);
    expect(await screen.findByText("9044838604781")).toBeInTheDocument();
    expect(recognizeReceipt.mock.calls[0][0]).toBe("https://files.test/receipt.jpg");
  });

  it("does not retry through the storage link when the API refuses the reader", async () => {
    getFileContent.mockRejectedValue(new ApiError(403, { error: "forbidden" }));
    render(
      <ReceiptReferenceOcr fileId="file_proof" submittedReference="TYPEDREF01" />,
    );
    expect(
      await screen.findByText("The number could not be read. Check the picture."),
    ).toBeInTheDocument();
    expect(getFileDownloadUrl).not.toHaveBeenCalled();
    expect(recognizeReceipt).not.toHaveBeenCalled();
    expect(screen.getByText("TYPEDREF01")).toBeInTheDocument();
  });

  it("keeps the client's reference when neither the API nor the link can load it", async () => {
    getFileContent.mockRejectedValue(new ApiError(404, { error: "not_found" }));
    getFileDownloadUrl.mockRejectedValue(new TypeError("Failed to fetch"));
    render(
      <ReceiptReferenceOcr fileId="file_proof" submittedReference="TYPEDREF01" />,
    );
    expect(
      await screen.findByText("The number could not be read. Check the picture."),
    ).toBeInTheDocument();
    expect(screen.getByText("TYPEDREF01")).toBeInTheDocument();
  });
});
