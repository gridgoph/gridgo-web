// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { OrderWorkspace } from "@/components/orders/OrderWorkspace";
import { setTokenProvider } from "@/lib/api/client";
import type { Order, OrderPayments, PaymentRecord } from "@/lib/api/types";

vi.stubGlobal("React", React);
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "order1" }) }));
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => {} }));
vi.mock("@/components/orders/EvidencePreview", () => ({
  EvidencePlate: ({ fileId }: { fileId: string }) => <div>Receipt {fileId}</div>,
  EvidenceStrip: () => null,
}));
vi.mock("@/components/orders/ReceiptReferenceOcr", () => ({
  ReceiptReferenceOcr: () => null,
}));
const record = (status: PaymentRecord["status"], amountMinor: number): PaymentRecord => ({ status, amountMinor, method: "qr_manual", reference: "REFERENCE", submittedAt: "2026-09-15T10:00:00Z", confirmedAt: status === "confirmed" ? "2026-09-15T10:01:00Z" : null, confirmedBy: null, confirmationSource: null });
function fixture(initialStatus: PaymentRecord["status"] = "confirmed", finalStatus: PaymentRecord["status"] = "pending_confirmation"): Order {
  return { id: "order1", clientId: "client1", supplierId: "shop1", riderId: "rider1", state: "out_for_delivery", title: "Flyers", quantity: 2, size: "A4", material: "Paper", deadline: null, address: "Davao", totalMinor: 55020, deliveryFeeMinor: 0, paymentMethod: "qr_manual", paymentStatus: "initial_payment_confirmed", promisedDate: null, artworkName: null, createdAt: "2026-09-15T10:00:00Z", updatedAt: "2026-09-15T10:00:00Z", timeline: [], payments: { initial: record(initialStatus, 41265), final_online: { ...record(finalStatus, 13755), proofFileId: "final-receipt" } } as unknown as OrderPayments };
}
let order: Order;
let mutations: { path: string; body: unknown }[];
let refuse = false;
beforeEach(() => {
  vi.stubGlobal("React", React);
  order = fixture(); mutations = []; refuse = false;
  setTokenProvider(() => "fixture-token");
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    if (init?.method === "POST") {
      mutations.push({ path, body: JSON.parse(String(init.body)) });
      if (refuse) return new Response(JSON.stringify({ error: "payment_not_pending" }), { status: 409 });
      const payments = order.payments as unknown as Record<string, PaymentRecord>;
      const reject = path.endsWith("/reject");
      order = { ...order, payments: { ...payments, final_online: { ...payments.final_online, status: reject ? "not_submitted" : "confirmed", reference: reject ? null : "REFERENCE", proofFileId: reject ? null : "final-receipt", rejectionReason: reject ? "The transfer could not be matched to this order." : null } } as OrderPayments };
    }
    return new Response(JSON.stringify({ order }), { headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => { cleanup(); setTokenProvider(() => null); vi.unstubAllGlobals(); });
const renderWorkspace = () => render(<OrderWorkspace queueHref="/ops/orders" />);
function moneyRow(label: string) { const term = screen.getByText(label, { selector: "dt" }); return term.nextElementSibling; }

it("keeps the submitted final installment actionable while delivery is in progress", async () => {
  renderWorkspace();
  expect(await screen.findByRole("button", { name: "Confirm balance payment" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Reject balance" })).toBeEnabled();
  expect(screen.getByText("Needs review")).toBeInTheDocument();
  expect(screen.getByText("Receipt final-receipt")).toBeInTheDocument();
  expect(moneyRow("Paid")).toHaveTextContent("₱412.65");
  expect(moneyRow("Remaining")).toHaveTextContent("₱137.55");
  expect(mutations).toEqual([]);
});
it("confirms only final_online and updates money without changing the delivery stage", async () => {
  renderWorkspace();
  await userEvent.click(await screen.findByRole("button", { name: "Confirm balance payment" }));
  expect(await within(screen.getByRole("heading", { name: /^Payment\b/ }).closest("section")!).findByText("Done")).toBeInTheDocument();
  expect(mutations).toEqual([{ path: "/orders/order1/payments/final_online/confirm", body: {} }]);
  expect(moneyRow("Paid")).toHaveTextContent("₱550.20");
  expect(moneyRow("Remaining")).toHaveTextContent("₱0.00");
  expect(order.state).toBe("out_for_delivery");
});
it("rejects the final installment with a client-visible reason", async () => {
  renderWorkspace();
  await userEvent.click(await screen.findByRole("button", { name: "Reject balance" }));
  expect(await screen.findByText("Awaiting client")).toBeInTheDocument();
  expect(mutations).toEqual([{ path: "/orders/order1/payments/final_online/reject", body: { reason: "The transfer could not be matched to this order." } }]);
  expect(screen.queryByRole("button", { name: "Confirm balance payment" })).not.toBeInTheDocument();
  expect(moneyRow("Paid")).toHaveTextContent("₱412.65");
});
it("counts neither unconfirmed initial nor pending final as Paid", async () => {
  order = fixture("pending_confirmation");
  renderWorkspace();
  await screen.findByRole("button", { name: "Confirm balance payment" });
  expect(moneyRow("Paid")).toHaveTextContent("₱0.00");
  expect(moneyRow("Remaining")).toHaveTextContent("₱550.20");
});
it("shows a failed decision and keeps the payment available for recovery", async () => {
  refuse = true;
  renderWorkspace();
  await userEvent.click(await screen.findByRole("button", { name: "Confirm balance payment" }));
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Confirm balance payment" })).toBeEnabled();
  expect(moneyRow("Paid")).toHaveTextContent("₱412.65");
});
