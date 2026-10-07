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
import { afterEach, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/client";
import type { Order } from "@/lib/api/types";

vi.stubGlobal("React", React);
const transitionOrder = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  transitionOrder,
}));
const { FileCheckQueue } = await import("@/components/orders/FileCheckQueue");

afterEach(() => {
  cleanup();
  transitionOrder.mockReset();
});

const MIN = 60_000;
const ago = (minutes: number) => new Date(Date.now() - minutes * MIN).toISOString();

function order(
  id: string,
  title: string,
  state: string,
  waitedMinutes: number | null,
  extra: Partial<Order> = {},
): Order {
  return {
    id,
    title,
    state,
    clientId: "c",
    supplierId: "s",
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
    productionItems: [
      { id: `${id}-l`, artworkLinks: [{ url: "https://www.canva.com/design/abc/view" }] },
    ] as Order["productionItems"],
    createdAt: ago(600),
    updatedAt: ago(5),
    timeline: [],
    fileCheck:
      waitedMinutes === null
        ? null
        : {
            status: "pending",
            requestedAt: ago(waitedMinutes),
            reviewedAt: null,
            reason: null,
            waitingSeconds: 0,
          },
    ...extra,
  } as Order;
}

const fresh = order("o-fresh", "Fresh flyers", "needs_qa", 5);
const overdue = order("o-old", "Overnight banner", "needs_qa", 9 * 60);
const unpaid = order("o-unpaid", "Unpaid stickers", "initial_payment_review", 40);
const sentBack = order("o-back", "Blurry poster", "client_correction", null, {
  fileCheck: {
    status: "failed",
    requestedAt: ago(100),
    reviewedAt: ago(50),
    reason: "The link asks for a sign-in.",
    waitingSeconds: 0,
  },
});

function rowNames() {
  const table = screen.getByRole("table", { name: /Files waiting on your check/ });
  return within(table)
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[0].textContent ?? "");
}

it("lists paid files oldest first with the wait, and marks a long one in words", () => {
  render(
    <FileCheckQueue orders={[fresh, overdue, unpaid, sentBack]} onChanged={() => {}} />,
  );

  const names = rowNames();
  expect(names[0]).toContain("Overnight banner");
  expect(names[1]).toContain("Fresh flyers");
  expect(screen.getAllByText("9 h, overdue").length).toBeGreaterThan(0);
  expect(screen.getByTestId("file-check-oldest")).toHaveTextContent("Oldest waiting 9 h");
  expect(screen.getAllByRole("link", { name: /Canva link/ }).length).toBeGreaterThan(0);

  // Still in payment review: listed apart, with its wait, and no Pass.
  const payment = screen
    .getByRole("heading", { name: "Payment first (1)" })
    .closest("section")!;
  expect(within(payment).getByText("Unpaid stickers")).toBeInTheDocument();
  expect(within(payment).getByText("40 min, waiting long")).toBeInTheDocument();

  const back = screen
    .getByRole("heading", { name: "Sent back to the client (1)" })
    .closest("section")!;
  expect(within(back).getByText("“The link asks for a sign-in.”")).toBeInTheDocument();
});

it("passes a file only after the four checks, then re-reads the queue", async () => {
  transitionOrder.mockResolvedValue({ ...overdue, state: "supplier_assigned" });
  const onChanged = vi.fn();
  render(<FileCheckQueue orders={[overdue]} onChanged={onChanged} />);

  fireEvent.click(screen.getAllByRole("button", { name: "Pass" })[0]);
  const dialog = await screen.findByRole("dialog");
  const pass = within(dialog).getByRole("button", { name: "Pass and send to the shop" });
  expect(pass).toBeDisabled();
  for (const box of within(dialog).getAllByRole("checkbox")) fireEvent.click(box);
  expect(pass).toBeEnabled();
  fireEvent.click(pass);

  await waitFor(() => expect(onChanged).toHaveBeenCalled());
  expect(transitionOrder).toHaveBeenCalledWith("o-old", "supplier_assigned", {
    qaChecklist: { artwork: true, spec: true, quantity: true, address: true },
  });
  expect(
    screen.getByText(/Passed. The shop can now see "Overnight banner"/),
  ).toBeInTheDocument();
});

it("sends a file back only with a reason the client reads", async () => {
  transitionOrder.mockResolvedValue({ ...fresh, state: "client_correction" });
  const onChanged = vi.fn();
  render(<FileCheckQueue orders={[fresh]} onChanged={onChanged} />);

  fireEvent.click(screen.getAllByRole("button", { name: "Send back" })[0]);
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Send back to the client" }),
  );
  expect(within(dialog).getByRole("alert")).toHaveTextContent(
    /Say what the client needs to fix/,
  );
  expect(transitionOrder).not.toHaveBeenCalled();

  fireEvent.click(
    within(dialog).getByRole("checkbox", {
      name: "Specification matches what the client ordered",
    }),
  );
  fireEvent.change(within(dialog).getByLabelText("What the client needs to fix"), {
    target: { value: "  Share the link so anyone can view it.  " },
  });
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Send back to the client" }),
  );
  await waitFor(() => expect(onChanged).toHaveBeenCalled());
  expect(transitionOrder).toHaveBeenCalledWith("o-fresh", "client_correction", {
    note: "Share the link so anyone can view it.",
    qaChecklist: { artwork: false, spec: true, quantity: false, address: false },
  });
});

it("explains an API refusal inside the dialog", async () => {
  transitionOrder.mockRejectedValue(
    new ApiError(400, { error: "file_check_reason_required" }),
  );
  render(<FileCheckQueue orders={[fresh]} onChanged={() => {}} />);
  fireEvent.click(screen.getAllByRole("button", { name: "Send back" })[0]);
  const dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("What the client needs to fix"), {
    target: { value: "x" },
  });
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Send back to the client" }),
  );
  expect(
    await within(dialog).findByText(/cannot be sent back without a reason/),
  ).toBeInTheDocument();
});

it("marks and announces a file that arrives while the queue is open", () => {
  const { rerender } = render(<FileCheckQueue orders={[overdue]} onChanged={() => {}} />);
  expect(screen.queryByText("New")).not.toBeInTheDocument();
  rerender(<FileCheckQueue orders={[overdue, fresh]} onChanged={() => {}} />);
  expect(screen.getAllByText("New").length).toBeGreaterThan(0);
  expect(screen.getByText("New file to check: Fresh flyers.")).toBeInTheDocument();
});

it("says so when nothing is waiting", () => {
  render(<FileCheckQueue orders={[sentBack]} onChanged={() => {}} />);
  expect(screen.getByText("No files waiting on you")).toBeInTheDocument();
});

it("never makes a non-HTTPS design link clickable", () => {
  const unsafe = order("o-js", "Unsafe link", "needs_qa", 3, {
    productionItems: [
      { id: "l", artworkLinks: [{ url: "javascript:alert(1)" }] },
    ] as Order["productionItems"],
  });
  const { container } = render(<FileCheckQueue orders={[unsafe]} onChanged={() => {}} />);
  expect(container.querySelector('a[href^="javascript"]')).toBeNull();
  expect(screen.getAllByText(/not a secure link/).length).toBeGreaterThan(0);
});
