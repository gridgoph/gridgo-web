// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { afterEach, expect, it, vi } from "vitest";

vi.stubGlobal("React", React);

// Base UI's switch dispatches a PointerEvent on click. jsdom does not implement it.
class FakePointerEvent extends MouseEvent {
  constructor(type: string, params: MouseEventInit = {}) {
    super(type, params);
  }
}
vi.stubGlobal("PointerEvent", FakePointerEvent);

const { OperationalSettings } = await import("@/components/settings/OperationalSettings");
const getSettings = vi.hoisted(() => vi.fn());
const updateSettings = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  getSettings,
  updateSettings,
}));
afterEach(() => {
  cleanup();
  getSettings.mockReset();
  updateSettings.mockReset();
});

const stored = {
  version: 7,
  issueWindowHours: 24,
  serviceFeeRateBps: 1000,
  deliveryFeeBands: [{ maxDistanceMeters: null, feeMinor: 2500 }],
};

it("shows the rate in force and a worked example with the fee on the Operations side only", async () => {
  getSettings.mockResolvedValue(stored);
  render(<OperationalSettings />);

  expect(await screen.findByLabelText("Rate on the shop price")).toHaveValue("10");
  expect(screen.getByTestId("rate-in-force")).toHaveTextContent("10%");

  const client = within(screen.getByTestId("receipt-client"));
  const ops = within(screen.getByTestId("receipt-ops"));
  expect(client.getByText("Items")).toBeInTheDocument();
  expect(client.getByText("₱1,100.00")).toBeInTheDocument();
  // Named on checkout by default, but never as pesos: those are inside Items.
  expect(client.getByText("Service fee · 10%")).toBeInTheDocument();
  expect(client.queryByText("₱100.00")).toBeNull();
  expect(ops.getByText("Service fee (10%)")).toBeInTheDocument();
  expect(ops.getByText("₱100.00")).toBeInTheDocument();
  expect(client.getByText("₱1,150.00")).toBeInTheDocument();
  expect(ops.getByText("₱1,150.00")).toBeInTheDocument();
});

it("re-prices the example as the rate is typed and saves it in basis points", async () => {
  getSettings.mockResolvedValue(stored);
  updateSettings.mockImplementation(async (input: { serviceFeeRateBps: number }) => ({
    ...stored,
    version: 8,
    serviceFeeRateBps: input.serviceFeeRateBps,
  }));
  render(<OperationalSettings />);

  const field = await screen.findByLabelText("Rate on the shop price");
  fireEvent.change(field, { target: { value: "12.5" } });

  const ops = within(screen.getByTestId("receipt-ops"));
  expect(ops.getByText("Service fee (12.5%)")).toBeInTheDocument();
  expect(ops.getByText("₱125.00")).toBeInTheDocument();
  expect(within(screen.getByTestId("receipt-client")).getByText("₱1,125.00")).toBeInTheDocument();
  expect(screen.getByTestId("rate-in-force")).toHaveTextContent("after saving: 12.5%");

  fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
  await waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(1));
  expect(updateSettings.mock.calls[0][0]).toMatchObject({
    expectedVersion: 7,
    serviceFeeRateBps: 1250,
    serviceFeeVisibleToClient: true,
    issueWindowHours: 24,
  });
  expect(await screen.findByRole("status")).toHaveTextContent("12.5% service fee");
  expect(screen.getByTestId("rate-in-force")).toHaveTextContent("12.5%");
  expect(screen.getByTestId("rate-in-force")).not.toHaveTextContent("after saving");
});

it("refuses a rate the API would refuse before sending anything", async () => {
  getSettings.mockResolvedValue(stored);
  render(<OperationalSettings />);

  const field = await screen.findByLabelText("Rate on the shop price");
  fireEvent.change(field, { target: { value: "150" } });
  fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "The service fee is a percentage from 0 to 100",
  );
  expect(updateSettings).not.toHaveBeenCalled();
  // The receipts hold the rate in force rather than going blank on a bad draft.
  expect(within(screen.getByTestId("receipt-ops")).getByText("Service fee (10%)")).toBeInTheDocument();
});

it("saves whether the client checkout names the service fee", async () => {
  getSettings.mockResolvedValue(stored);
  updateSettings.mockImplementation(async (input: { serviceFeeVisibleToClient?: boolean }) => ({
    ...stored,
    version: 8,
    serviceFeeVisibleToClient: input.serviceFeeVisibleToClient,
  }));
  render(<OperationalSettings />);

  const toggle = await screen.findByRole("switch", { name: "Show on client checkout" });
  expect(toggle).toHaveAttribute("data-checked");
  fireEvent.click(toggle);
  // The client's receipt preview follows the switch before it is saved.
  expect(within(screen.getByTestId("receipt-client")).queryByText(/service fee/i)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

  await waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(1));
  expect(updateSettings.mock.calls[0][0]).toMatchObject({
    expectedVersion: 7,
    serviceFeeVisibleToClient: false,
    serviceFeeRateBps: 1000,
  });
});
