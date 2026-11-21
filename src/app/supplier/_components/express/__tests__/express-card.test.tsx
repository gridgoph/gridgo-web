// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Order } from "@/lib/api/types";

const m = vi.hoisted(() => ({
  accept: vi.fn(),
  decline: vi.fn(),
  getOrder: vi.fn(),
  transition: vi.fn(),
  pickup: vi.fn(),
  getFile: vi.fn(),
  push: vi.fn(),
}));

vi.stubGlobal("React", React);
class FakePointerEvent extends MouseEvent {}
vi.stubGlobal("PointerEvent", FakePointerEvent);

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: m.push }) }));
vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return {
    ...actual,
    acceptExpressJob: m.accept,
    declineExpressJob: m.decline,
    getOrder: m.getOrder,
    transitionOrder: m.transition,
    enterExpressPickupCode: m.pickup,
    getFile: m.getFile,
  };
});

import { ApiError } from "@/lib/api/client";
import { ExpressJobCard } from "../ExpressJobCard";
import { CounterCodeSheet } from "../CounterCodeSheet";
import { ExpressDonePanel } from "../ExpressDonePanel";

function express(over: Partial<Order> = {}): Order {
  return {
    id: "ord_3ff0128e105a",
    title: "Document printing",
    state: "supplier_assigned",
    orderType: "express",
    fulfillmentMode: "pickup",
    paymentClassification: "in_app",
    supplierPriceMinor: 12_000,
    shopAcceptance: {
      supplierId: "shop_1",
      assignedAt: new Date(Date.now() - 30_000).toISOString(),
      deadlineAt: new Date(Date.now() + 270_000).toISOString(),
      workingMinutes: 5,
      status: "pending",
    },
    expressOrder: {
      acceptBy: new Date(Date.now() + 270_000).toISOString(),
      printSettings: [
        { fileId: "file_a", pages: { printed: 12, total: 12 }, copies: 1, paper: "a4", colour: "bw", sides: "one" },
      ],
    },
    ...over,
  } as Order;
}

function card(order: Order, props: Partial<React.ComponentProps<typeof ExpressJobCard>> = {}) {
  const onChanged = vi.fn();
  const onHandedOver = vi.fn();
  render(
    <ExpressJobCard
      order={order}
      showMoney
      shortcuts
      onChanged={onChanged}
      onHandedOver={onHandedOver}
      {...props}
    />,
  );
  return { onChanged, onHandedOver };
}

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Express offer card", () => {
  it("shows the work, how the client paid, the clock and what the shop earns", () => {
    card(express());
    expect(screen.getByRole("heading", { name: /12 pages · B&W/ })).toBeVisible();
    expect(screen.getByText(/Client picks up · Paid in app/)).toBeVisible();
    expect(screen.getByRole("timer")).toBeInTheDocument();
    expect(screen.getByText("₱120.00")).toBeVisible();
    expect(screen.getByRole("button", { name: /Accept/ })).toHaveAttribute("aria-keyshortcuts", "A");
    expect(screen.getByRole("button", { name: /Accept/ })).toHaveTextContent("Dawata · or press A");
  });

  it("never shows Staff what the job pays", () => {
    card(express(), { showMoney: false });
    expect(screen.queryByText("You earn")).not.toBeInTheDocument();
    expect(screen.queryByText("₱120.00")).not.toBeInTheDocument();
  });

  it("accepts on A, but not while typing in a field", async () => {
    m.accept.mockResolvedValue(undefined);
    m.getOrder.mockResolvedValue(express({ state: "payment_authorized" }));
    const { onChanged } = card(express());
    const field = document.createElement("input");
    document.body.appendChild(field);
    fireEvent.keyDown(field, { key: "a" });
    expect(m.accept).not.toHaveBeenCalled();
    field.remove();
    fireEvent.keyDown(document.body, { key: "a" });
    await waitFor(() => expect(m.accept).toHaveBeenCalledWith("ord_3ff0128e105a", false));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("asks for the note tick before accepting a job with a client note", async () => {
    const order = express();
    (order.expressOrder as { printSettings: Array<Record<string, unknown>> }).printSettings[0].note =
      "Staple top-left";
    card(order);
    expect(screen.getByText(/Staple top-left/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /Accept/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/read the client/);
    expect(m.accept).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox"));
    m.accept.mockResolvedValue(undefined);
    m.getOrder.mockResolvedValue(order);
    fireEvent.click(screen.getByRole("button", { name: /Accept/ }));
    await waitFor(() => expect(m.accept).toHaveBeenCalledWith(order.id, true));
  });
});

describe("Express accepted card", () => {
  it("opens the files and marks ready on R in one step", async () => {
    const order = express({ state: "payment_authorized" });
    order.shopAcceptance = { ...order.shopAcceptance!, status: "accepted" };
    m.transition.mockResolvedValue({ ...order, state: "ready_for_dispatch" });
    const { onChanged } = card(order);
    fireEvent.click(screen.getByRole("button", { name: /Open files/ }));
    expect(m.push).toHaveBeenCalledWith("/supplier/jobs/ord_3ff0128e105a/files");
    expect(screen.getByRole("button", { name: /It's ready/ })).toHaveAttribute("aria-keyshortcuts", "R");
    fireEvent.keyDown(document.body, { key: "r" });
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(m.transition).toHaveBeenCalledTimes(1);
    expect(m.transition).toHaveBeenCalledWith(order.id, "ready_for_dispatch", expect.anything());
  });

  it("falls back to on the press, then ready, on an API without the one step", async () => {
    const order = express({ state: "payment_authorized" });
    order.shopAcceptance = { ...order.shopAcceptance!, status: "accepted" };
    m.transition
      .mockRejectedValueOnce(new ApiError(409, { error: "transition_not_allowed" }))
      .mockResolvedValueOnce({ ...order, state: "production" })
      .mockResolvedValueOnce({ ...order, state: "ready_for_dispatch" });
    m.getOrder.mockResolvedValue(order);
    const { onChanged } = card(order);
    fireEvent.click(screen.getByRole("button", { name: /It's ready/ }));
    await waitFor(() =>
      expect(onChanged).toHaveBeenCalledWith(expect.objectContaining({ state: "ready_for_dispatch" })),
    );
    expect(m.transition.mock.calls.map((call) => call[1])).toEqual([
      "ready_for_dispatch",
      "production",
      "ready_for_dispatch",
    ]);
  });
});

describe("typed handover", () => {
  it("hands over on the sixth digit, with no button to press", async () => {
    m.pickup.mockResolvedValue(undefined);
    const onHandedOver = vi.fn();
    render(
      <CounterCodeSheet
        order={express({ state: "ready_for_dispatch" })}
        open
        onOpenChange={() => {}}
        onHandedOver={onHandedOver}
      />,
    );
    expect(screen.getByText("Already paid. Don't collect cash.")).toBeVisible();
    const input = screen.getByLabelText("Client's code, 6 numbers");
    fireEvent.change(input, { target: { value: "01234" } });
    expect(m.pickup).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "012345" } });
    await waitFor(() => expect(m.pickup).toHaveBeenCalledWith("ord_3ff0128e105a", "012345"));
    await waitFor(() => expect(onHandedOver).toHaveBeenCalled());
  });

  it("clears a wrong code and says so", async () => {
    m.pickup.mockRejectedValue(new ApiError(409, { error: "express_pickup_code_mismatch" }));
    const onHandedOver = vi.fn();
    render(
      <CounterCodeSheet
        order={express({ state: "ready_for_dispatch", paymentClassification: "cash" })}
        open
        onOpenChange={() => {}}
        onHandedOver={onHandedOver}
      />,
    );
    expect(screen.queryByText("Already paid. Don't collect cash.")).not.toBeInTheDocument();
    const input = screen.getByLabelText("Client's code, 6 numbers");
    fireEvent.change(input, { target: { value: "999999" } });
    expect(await screen.findByRole("alert")).toHaveTextContent("That code doesn't match");
    expect(input).toHaveValue("");
    expect(onHandedOver).not.toHaveBeenCalled();
  });
});

describe("typed handover lockout", () => {
  it("unlocks the code field when GRIDGO's retry time passes", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      m.pickup.mockRejectedValue(
        new ApiError(429, {
          error: "express_pickup_attempts_exceeded",
          retryAfter: new Date(Date.now() + 60_000).toISOString(),
        }),
      );
      render(
        <CounterCodeSheet
          order={express({ state: "ready_for_dispatch" })}
          open
          onOpenChange={() => {}}
          onHandedOver={() => {}}
        />,
      );
      const input = screen.getByLabelText("Client's code, 6 numbers");
      fireEvent.change(input, { target: { value: "999999" } });
      expect(await screen.findByRole("alert")).toHaveTextContent("Too many wrong codes");
      expect(input).toBeDisabled();
      await act(async () => {
        vi.advanceTimersByTime(30_000);
      });
      expect(input).toBeDisabled();
      // No other interaction: the deadline alone unlocks it.
      await act(async () => {
        vi.advanceTimersByTime(31_000);
      });
      expect(input).toBeEnabled();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("Done panel", () => {
  it("thanks the shop with no delete reminder when nothing was downloaded", () => {
    render(
      <ExpressDonePanel
        order={express({
          state: "completed",
          fileAccesses: [
            { jobId: "", userId: "u", deviceId: "d", fileId: "file_a", action: "opened", firstAt: "2026-11-22T05:00:00Z", lastAt: "2026-11-22T05:00:00Z", count: 1 },
          ],
        })}
        open
        showMoney={false}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText("Handed over. Salamat po!")).toBeVisible();
    expect(screen.queryByText(/delete the client/)).not.toBeInTheDocument();
    expect(screen.queryByText(/₱/)).not.toBeInTheDocument();
  });

  it("asks the shop to delete a downloaded file, once", async () => {
    m.getFile.mockResolvedValue({ id: "file_a", originalFilename: "Thesis.pdf" });
    const order = express({
      state: "completed",
      fileAccesses: [
        { jobId: "", userId: "u", deviceId: "d", fileId: "file_a", action: "downloaded", firstAt: "2026-11-22T05:00:00Z", lastAt: "2026-11-22T05:00:00Z", count: 1 },
      ],
    });
    const onClose = vi.fn();
    render(<ExpressDonePanel order={order} open showMoney onClose={onClose} />);
    expect(screen.getByText(/₱120.00 is added/)).toBeVisible();
    expect(await screen.findByText("Thesis.pdf")).toBeVisible();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "I deleted it" }));
    });
    expect(onClose).toHaveBeenCalled();
    cleanup();
    render(<ExpressDonePanel order={order} open showMoney onClose={onClose} />);
    expect(screen.queryByText(/delete the client/)).not.toBeInTheDocument();
  });
});
