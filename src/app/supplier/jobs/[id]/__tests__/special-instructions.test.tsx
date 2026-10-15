// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Order, OrderChangeRequest } from "@/lib/api/types";

const { getOrderMock, transitionOrderMock, declineJobMock, requestOrderChangeMock } = vi.hoisted(
  () => ({
    getOrderMock: vi.fn(),
    transitionOrderMock: vi.fn(),
    declineJobMock: vi.fn(),
    requestOrderChangeMock: vi.fn(),
  }),
);

vi.stubGlobal("React", React);
// Base UI's checkbox dispatches a PointerEvent on click; jsdom has none.
vi.stubGlobal("PointerEvent", MouseEvent);

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "job-1" }),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return {
    ...actual,
    getOrder: getOrderMock,
    transitionOrder: transitionOrderMock,
    declineJob: declineJobMock,
    requestOrderChange: requestOrderChangeMock,
  };
});

import SupplierJobDetailPage from "@/app/supplier/jobs/[id]/page";
import { ApiError } from "@/lib/api/client";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const NOTE = "Keep a 5 mm white border. Text me [masked].";

function job(partial: Partial<Order> = {}): Order {
  return {
    id: "job-1",
    clientId: "c1",
    supplierId: "shop_1",
    riderId: null,
    state: "supplier_assigned",
    title: "Flyers",
    deadline: "2026-10-01T08:00:00.000Z",
    address: "Somewhere",
    deliveryFeeMinor: 0,
    totalMinor: 0,
    paymentMethod: null,
    paymentStatus: "paid",
    readyBy: "2026-09-25T08:00:00.000Z",
    supplierSubtotalMinor: 40000,
    artworkName: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    timeline: [],
    productionItems: [
      { id: "line_1", itemName: "Flyers", quantity: 1, measurement: null, specialInstructions: NOTE },
    ],
    specialInstructionLines: [{ lineItemId: "line_1", text: NOTE }],
    changeRequests: [],
    ...partial,
  } as Order;
}

describe("special instructions on the offer", () => {
  it("shows the notes and refuses to accept until they are ticked, then sends the tick", async () => {
    const user = userEvent.setup();
    getOrderMock.mockResolvedValue(job());
    transitionOrderMock.mockResolvedValue(job({ state: "payment_authorized" }));

    render(<SupplierJobDetailPage />);

    const card = await screen.findByTestId("special-instructions");
    expect(within(card).getByText(NOTE)).toBeInTheDocument();
    expect(within(card).getByText("You tick that you read these when you accept.")).toBeInTheDocument();

    const tick = screen.getByRole("checkbox", { name: /I.ve read the special instructions/ });
    expect(tick).not.toBeChecked();

    await user.click(screen.getByRole("button", { name: "Accept job" }));
    expect(
      await screen.findByText("Tick that you read the special instructions to accept."),
    ).toBeInTheDocument();
    expect(transitionOrderMock).not.toHaveBeenCalled();

    await user.click(tick);
    await user.click(screen.getByRole("button", { name: "Accept job" }));
    await waitFor(() =>
      expect(transitionOrderMock).toHaveBeenCalledWith("job-1", "payment_authorized", {
        note: "Accepted",
        specialInstructionsRead: true,
      }),
    );
  });

  it("says GRIDGO's refusal in the shop's words", async () => {
    const user = userEvent.setup();
    getOrderMock.mockResolvedValue(job());
    transitionOrderMock.mockRejectedValue(
      new ApiError(409, { error: "special_instructions_acknowledgement_required" }),
    );

    render(<SupplierJobDetailPage />);
    await user.click(
      await screen.findByRole("checkbox", { name: /I.ve read the special instructions/ }),
    );
    await user.click(screen.getByRole("button", { name: "Accept job" }));
    expect(
      await screen.findByText("Read the special instructions and tick that you read them, then accept."),
    ).toBeInTheDocument();
  });

  it("declines with GRIDGO's reason for notes that are not possible", async () => {
    const user = userEvent.setup();
    getOrderMock.mockResolvedValue(job());
    declineJobMock.mockResolvedValue(undefined);

    render(<SupplierJobDetailPage />);
    await user.click(await screen.findByRole("button", { name: "Not possible? Decline this job" }));

    const dialog = await screen.findByRole("alertdialog", { name: "Decline this job?" });
    expect(
      within(dialog).getByRole("radio", { name: "The special instructions are not possible" }),
    ).toBeChecked();
    await user.click(within(dialog).getByRole("button", { name: "Confirm decline" }));

    await waitFor(() =>
      expect(declineJobMock).toHaveBeenCalledWith("job-1", "Special instructions not possible"),
    );
    expect(transitionOrderMock).not.toHaveBeenCalled();
  });

  it("asks for a reason before declining from the plain Decline button", async () => {
    const user = userEvent.setup();
    getOrderMock.mockResolvedValue(job());

    render(<SupplierJobDetailPage />);
    await user.click(await screen.findByRole("button", { name: "Decline" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Decline this job?" });
    await user.click(within(dialog).getByRole("button", { name: "Confirm decline" }));
    expect(await within(dialog).findByText("Choose why you are declining.")).toBeInTheDocument();
    expect(declineJobMock).not.toHaveBeenCalled();
  });

  it("accepts a job without notes exactly as before", async () => {
    const user = userEvent.setup();
    const plain = { productionItems: [], specialInstructionLines: [], specialInstructions: "" };
    getOrderMock.mockResolvedValue(job(plain));
    transitionOrderMock.mockResolvedValue(job({ ...plain, state: "payment_authorized" }));

    render(<SupplierJobDetailPage />);
    await user.click(await screen.findByRole("button", { name: "Accept job" }));
    await waitFor(() =>
      expect(transitionOrderMock).toHaveBeenCalledWith("job-1", "payment_authorized", {
        note: "Accepted",
      }),
    );
    expect(screen.queryByTestId("special-instructions")).not.toBeInTheDocument();
  });
});

describe("change requests on the job", () => {
  const accepted = () =>
    job({
      state: "production",
      specialInstructionsAcknowledgement: { supplierId: "shop_1", at: "2026-10-15T11:41:54.928Z" },
    });

  it("sends the change with the shop's extra in centavos and one key per body", async () => {
    const user = userEvent.setup();
    getOrderMock.mockResolvedValue(accepted());
    requestOrderChangeMock.mockResolvedValue({ id: "change_1" });

    render(<SupplierJobDetailPage />);
    const card = await screen.findByTestId("special-instructions");
    expect(within(card).getByText(/Read and ticked/)).toBeInTheDocument();

    await user.click(within(card).getByRole("button", { name: "Costs more? Request a change" }));
    const dialog = await screen.findByRole("dialog", { name: "Request a change" });

    await user.click(within(dialog).getByRole("button", { name: "Review request" }));
    expect(within(dialog).getByText("Say what you will do differently.")).toBeInTheDocument();
    expect(within(dialog).getByText("Tell the client why the job needs this change.")).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText("What will you do differently?"), "Staple twice on the left");
    await user.type(within(dialog).getByLabelText("Extra for your shop (₱)"), "150.50");
    await user.type(within(dialog).getByLabelText("Why does the job need this change?"), "Second finishing pass");
    await user.click(within(dialog).getByRole("button", { name: "Review request" }));

    expect(
      await screen.findByRole("dialog", { name: "Send this change request?" }),
    ).toHaveTextContent("for ₱150.50 extra");
    await user.click(screen.getByRole("button", { name: "Send request" }));

    await waitFor(() => expect(requestOrderChangeMock).toHaveBeenCalledTimes(1));
    const [orderId, body, key] = requestOrderChangeMock.mock.calls[0];
    expect(orderId).toBe("job-1");
    expect(body).toEqual({
      lineItemId: "line_1",
      reason: "Second finishing pass",
      proposedSpec: "Staple twice on the left",
      extraPrincipalMinor: 15050,
    });
    expect(typeof key).toBe("string");
    expect(key.length).toBeGreaterThan(0);
    expect(
      await screen.findByText(
        "Change request sent for ₱150.50 extra. The client approves or declines it.",
      ),
    ).toBeInTheDocument();
  });

  it("follows the request's state and hides a second request while one is open", async () => {
    const pending: OrderChangeRequest = {
      id: "change_1",
      lineItemId: "line_1",
      status: "pending_confirmation",
      version: 3,
      reason: "Second finishing pass",
      proposedSpec: "Staple twice on the left",
      extraPrincipalMinor: 15000,
      createdAt: "2026-10-15T11:41:57.538Z",
      originalInstructions: NOTE,
    };
    getOrderMock.mockResolvedValue({ ...accepted(), changeRequests: [pending] });

    render(<SupplierJobDetailPage />);
    const card = await screen.findByTestId("change-request");
    expect(within(card).getByText("Payment being checked")).toBeInTheDocument();
    expect(within(card).getByText("Staple twice on the left")).toBeInTheDocument();
    expect(
      within(card).getByText("₱150.00 extra for your shop if the client pays for the change."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Costs more? Request a change" }),
    ).not.toBeInTheDocument();
  });
});
