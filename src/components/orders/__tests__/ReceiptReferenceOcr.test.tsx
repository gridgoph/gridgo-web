// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getFileDownloadUrl = vi.hoisted(() => vi.fn());
const recognizeReceiptFromUrl = vi.hoisted(() => vi.fn());

vi.stubGlobal("React", React);
vi.mock("@/lib/api/client", () => ({
  getFileDownloadUrl: (...args: unknown[]) => getFileDownloadUrl(...args),
}));
vi.mock("@/lib/receiptOcrRecognize", () => ({
  recognizeReceiptFromUrl: (...args: unknown[]) => recognizeReceiptFromUrl(...args),
}));

import { ReceiptReferenceOcr } from "@/components/orders/ReceiptReferenceOcr";

afterEach(() => {
  cleanup();
  getFileDownloadUrl.mockReset();
  recognizeReceiptFromUrl.mockReset();
});

beforeEach(() => {
  getFileDownloadUrl.mockResolvedValue("https://files.test/receipt.jpg");
});

describe("ReceiptReferenceOcr", () => {
  it("fills Client reference from the receipt when the client sent none", async () => {
    recognizeReceiptFromUrl.mockResolvedValue({
      text: "Ref. No. 1234567890123",
      confidence: 80,
    });
    render(<ReceiptReferenceOcr fileId="file_proof" submittedReference={null} />);
    expect(screen.getByText("Reading the reference from the receipt…")).toBeInTheDocument();
    expect(await screen.findByText("1234567890123")).toBeInTheDocument();
    expect(screen.getByText("Read from the receipt.")).toBeInTheDocument();
  });

  it("confirms a matching submitted reference", async () => {
    recognizeReceiptFromUrl.mockResolvedValue({
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
    recognizeReceiptFromUrl.mockResolvedValue({
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
    recognizeReceiptFromUrl.mockResolvedValue({
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
});
