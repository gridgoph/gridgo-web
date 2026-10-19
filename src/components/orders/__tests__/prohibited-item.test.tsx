// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/client";
import type { Order, RefundRequest } from "@/lib/api/types";
import { buildFileCheckQueue } from "@/lib/file-check";
import { presentOrderState } from "@/lib/order-state";
import {
  prohibitedItemCancelled,
  prohibitedItemHold,
  prohibitedReasonProblem,
} from "@/lib/prohibited-item";

vi.stubGlobal("React", React);
// Base UI radios dispatch a PointerEvent on click. jsdom does not implement it.
class FakePointerEvent extends MouseEvent {
  constructor(type: string, params: MouseEventInit = {}) {
    super(type, params);
  }
}
vi.stubGlobal("PointerEvent", FakePointerEvent);
const transitionOrder = vi.hoisted(() => vi.fn());
const fileRefundRequest = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  transitionOrder,
  fileRefundRequest,
}));
const { FileCheckQueue } = await import("@/components/orders/FileCheckQueue");
const { ProhibitedItemDialog, ProhibitedItemPanel } =
  await import("@/components/orders/ProhibitedItem");

afterEach(() => {
  cleanup();
  transitionOrder.mockReset();
  fileRefundRequest.mockReset();
});

const at = "2026-10-19T02:00:00.000Z";

function order(extra: Partial<Order> = {}): Order {
  return {
    id: "o-1",
    title: "Logo stickers",
    state: "needs_qa",
    clientId: "c",
    supplierId: null,
    riderId: null,
    quantity: 100,
    unit: "piece",
    deadline: null,
    address: "Davao",
    totalMinor: 10000,
    deliveryFeeMinor: 0,
    paymentMethod: "qr_manual",
    paymentStatus: "initial_payment_confirmed",
    promisedDate: null,
    artworkName: null,
    artworkFileIds: [],
    productionItems: [],
    createdAt: at,
    updatedAt: at,
    timeline: [],
    fileCheck: {
      status: "pending",
      requestedAt: at,
      reviewedAt: null,
      reason: null,
      waitingSeconds: 0,
    },
    ...extra,
  } as Order;
}

const REASON = "This design copies a registered brand logo.";

function held(extra: Partial<Order> = {}): Order {
  return order({
    state: "client_correction",
    fileCheck: {
      status: "failed",
      requestedAt: at,
      reviewedAt: at,
      reviewedBy: "ops-1",
      reason: REASON,
      reasonCode: "prohibited_item",
      waitingSeconds: 0,
    },
    ...extra,
  });
}

describe("prohibited-item rules", () => {
  it("reads a hold and a cancellation from the file check", () => {
    expect(prohibitedItemHold(held())).toBe(true);
    expect(prohibitedItemHold(order())).toBe(false);
    // An ordinary send-back is not a hold.
    const sentBack = held();
    sentBack.fileCheck = { ...sentBack.fileCheck!, reasonCode: null };
    expect(prohibitedItemHold(sentBack)).toBe(false);
    const cancelled = held({ state: "cancelled" });
    cancelled.fileCheck = { ...cancelled.fileCheck!, status: "cancelled" };
    expect(prohibitedItemHold(cancelled)).toBe(false);
    expect(prohibitedItemCancelled(cancelled)).toBe(true);
  });

  it("shows the hold wherever the order's status shows", () => {
    expect(presentOrderState("client_correction", held()).label).toBe(
      "On hold: prohibited item",
    );
    const cancelled = held({ state: "cancelled" });
    cancelled.fileCheck = { ...cancelled.fileCheck!, status: "cancelled" };
    expect(presentOrderState("cancelled", cancelled).label).toBe(
      "Cancelled: prohibited item",
    );
    // An earlier state in the history keeps its own words.
    expect(presentOrderState("needs_qa", held()).label).toBe("Needs QA review");
    expect(presentOrderState("client_correction").label).toBe(
      "Awaiting client correction",
    );
  });

  it("lists held orders apart from ordinary send-backs", () => {
    const sentBack = held({ id: "o-2" });
    sentBack.fileCheck = { ...sentBack.fileCheck!, reasonCode: null };
    const queue = buildFileCheckQueue([held(), sentBack]);
    expect(queue.held.map((row) => row.id)).toEqual(["o-1"]);
    expect(queue.sentBack.map((row) => row.id)).toEqual(["o-2"]);
  });

  it("needs a client-visible reason of at most 2,000 characters", () => {
    expect(prohibitedReasonProblem("hold", "  ")).toMatch(/cannot be printed/);
    expect(prohibitedReasonProblem("release", "")).toMatch(/hold is lifted/);
    expect(prohibitedReasonProblem("cancel", "x".repeat(2001))).toMatch(/2,000/);
    expect(prohibitedReasonProblem("cancel", REASON)).toBeNull();
  });
});

describe("from the file-check queue", () => {
  it("holds the order with the reason code and the client's reason", async () => {
    transitionOrder.mockResolvedValue(held());
    const onChanged = vi.fn();
    render(<FileCheckQueue orders={[order()]} onChanged={onChanged} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Prohibited item" })[0]);
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Hold the order" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent(/cannot be printed/);
    expect(transitionOrder).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByLabelText("Why it cannot be printed"), {
      target: { value: `  ${REASON}  ` },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Hold the order" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(transitionOrder).toHaveBeenCalledWith("o-1", "client_correction", {
      reasonCode: "prohibited_item",
      note: REASON,
    });
    expect(fileRefundRequest).not.toHaveBeenCalled();
    expect(screen.getByText(/On hold. The client has your reason/)).toBeInTheDocument();
  });

  it("cancels a paid order through the full cancellation refund", async () => {
    fileRefundRequest.mockResolvedValue({ id: "rf-1" });
    const onChanged = vi.fn();
    render(<FileCheckQueue orders={[order()]} onChanged={onChanged} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Prohibited item" })[0]);
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("radio", { name: "Cancel with a full refund" }),
    );
    fireEvent.change(within(dialog).getByLabelText("Why it cannot be printed"), {
      target: { value: REASON },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Open the full refund" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(fileRefundRequest).toHaveBeenCalledWith(
      "o-1",
      { kind: "cancellation", reasonCode: "prohibited_item", reason: REASON },
      expect.any(String),
    );
    expect(transitionOrder).not.toHaveBeenCalled();
    expect(screen.getByText(/Full refund opened/)).toBeInTheDocument();
  });

  it("retries a failed refund with the same key", async () => {
    fileRefundRequest
      .mockRejectedValueOnce(new ApiError(503, { error: "unavailable" }))
      .mockResolvedValueOnce({ id: "rf-1" });
    render(<FileCheckQueue orders={[order()]} onChanged={() => {}} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Prohibited item" })[0]);
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("radio", { name: "Cancel with a full refund" }),
    );
    fireEvent.change(within(dialog).getByLabelText("Why it cannot be printed"), {
      target: { value: REASON },
    });
    const submit = within(dialog).getByRole("button", { name: "Open the full refund" });
    fireEvent.click(submit);
    await within(dialog).findByRole("alert");
    fireEvent.click(within(dialog).getByRole("button", { name: "Open the full refund" }));
    await waitFor(() => expect(fileRefundRequest).toHaveBeenCalledTimes(2));
    expect(fileRefundRequest.mock.calls[0][2]).toBe(fileRefundRequest.mock.calls[1][2]);
  });

  it("cancels a test order without money", async () => {
    transitionOrder.mockResolvedValue(order({ state: "cancelled" }));
    const onChanged = vi.fn();
    render(
      <FileCheckQueue orders={[order({ reviewData: true })]} onChanged={onChanged} />,
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Prohibited item" })[0]);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/A test order moves no money/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("radio", { name: "Cancel the test order" }));
    fireEvent.change(within(dialog).getByLabelText("Why it cannot be printed"), {
      target: { value: REASON },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Cancel the test order" }),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(transitionOrder).toHaveBeenCalledWith("o-1", "cancelled", {
      reasonCode: "prohibited_item",
      reason: REASON,
    });
    expect(fileRefundRequest).not.toHaveBeenCalled();
  });

  it("explains a refusal once production started", async () => {
    transitionOrder.mockRejectedValue(
      new ApiError(409, { error: "prohibited_item_before_production_only" }),
    );
    render(<FileCheckQueue orders={[order()]} onChanged={() => {}} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Prohibited item" })[0]);
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Why it cannot be printed"), {
      target: { value: REASON },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Hold the order" }));
    expect(
      await within(dialog).findByText(/Production has already started/),
    ).toBeInTheDocument();
  });

  it("does not offer a hold while GRIDGO is closed", async () => {
    render(
      <ProhibitedItemDialog
        order={order()}
        mode="decide"
        holdClosed
        onCancel={() => {}}
        onDone={() => {}}
      />,
    );
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Hold the order" })).toBeDisabled();
    fireEvent.click(
      within(dialog).getByRole("radio", { name: "Cancel with a full refund" }),
    );
    expect(
      within(dialog).getByRole("button", { name: "Open the full refund" }),
    ).toBeEnabled();
  });

  it("lists a held order with its reason in its own section", () => {
    render(<FileCheckQueue orders={[held()]} onChanged={() => {}} />);
    const section = screen
      .getByRole("heading", { name: "On hold for a prohibited item (1)" })
      .closest("section")!;
    expect(within(section).getByText("Logo stickers")).toBeInTheDocument();
    expect(within(section).getByText("On hold: prohibited item")).toBeInTheDocument();
    expect(within(section).getByText(`“${REASON}”`)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Sent back to the client/ })).toBeNull();
  });
});

describe("on the workspace", () => {
  const panel = (o: Order, refunds: RefundRequest[] | null = [], handlers = {}) =>
    render(
      <ProhibitedItemPanel
        order={o}
        refunds={refunds}
        names={{ "ops-1": "Test operator" }}
        tree="ops"
        busy={false}
        onRelease={() => {}}
        onCancelOrder={() => {}}
        {...handlers}
      />,
    );

  it("shows the hold, its reason and who held it, with release and cancel", () => {
    const onRelease = vi.fn();
    const onCancelOrder = vi.fn();
    panel(held(), [], { onRelease, onCancelOrder });
    expect(screen.getByText("On hold: prohibited item")).toBeInTheDocument();
    expect(screen.getByText(`“${REASON}”`)).toBeInTheDocument();
    expect(screen.getByText(/by Test operator/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Release to the file check" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel with a full refund" }));
    expect(onRelease).toHaveBeenCalled();
    expect(onCancelOrder).toHaveBeenCalled();
  });

  it("links the open refund and holds release until it is closed", () => {
    const o = held({ refundHold: true } as Partial<Order>);
    o.fileCheck = { ...o.fileCheck!, refundRequestId: "rf-1" };
    panel(o, [{ id: "rf-1", status: "approved" } as RefundRequest]);
    expect(screen.getByText("Approved, not yet sent")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open the refund case" })).toHaveAttribute(
      "href",
      "/ops/refunds/rf-1",
    );
    expect(
      screen.queryByRole("button", { name: "Release to the file check" }),
    ).toBeNull();
    expect(screen.getByText(/reject or withdraw the refund/)).toBeInTheDocument();
  });

  it("shows a settled cancellation and its paid refund", () => {
    const o = held({ state: "cancelled" });
    o.fileCheck = { ...o.fileCheck!, status: "cancelled", refundRequestId: "rf-1" };
    panel(o, [{ id: "rf-1", status: "paid" } as RefundRequest]);
    expect(screen.getByText("Cancelled: prohibited item")).toBeInTheDocument();
    expect(screen.getByText("Paid to the client")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("releases the hold back to the file check with a note", async () => {
    transitionOrder.mockResolvedValue(order());
    const onDone = vi.fn();
    render(
      <ProhibitedItemDialog
        order={held()}
        mode="release"
        onCancel={() => {}}
        onDone={onDone}
      />,
    );
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Why the hold is lifted"), {
      target: { value: "The client showed the brand's written permission." },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Release to the file check" }),
    );
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(transitionOrder).toHaveBeenCalledWith("o-1", "needs_qa", {
      note: "The client showed the brand's written permission.",
    });
  });
});
