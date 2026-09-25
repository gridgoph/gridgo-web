// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/client";

vi.stubGlobal("React", React);

// Base UI radios dispatch a PointerEvent on click. jsdom does not implement it.
class FakePointerEvent extends MouseEvent {
  constructor(type: string, params: MouseEventInit = {}) {
    super(type, params);
  }
}
vi.stubGlobal("PointerEvent", FakePointerEvent);
const { OperationalSettings, settingsChangeReason } =
  await import("@/components/settings/OperationalSettings");
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
  riderCommissionBps: 8500,
  downpaymentPercent: 100,
  deliveryFeeBands: [{ maxDistanceMeters: null, feeMinor: 2500 }],
};

const FULL = "Pay in full at checkout (100%)";
const SPLIT = "75% now, 25% before delivery";

it("offers both checkout splits with the one in force selected", async () => {
  getSettings.mockResolvedValue(stored);
  render(<OperationalSettings />);

  expect(await screen.findByRole("heading", { name: "Checkout payment" })).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: FULL })).toBeChecked();
  expect(screen.getByRole("radio", { name: SPLIT })).not.toBeChecked();
  expect(screen.getByTestId("checkout-payment-in-force")).toHaveTextContent(
    `In force right now: ${FULL}`,
  );
  expect(screen.getByText(/every order already placed keeps the split/, {
    selector: "#checkout-payment-help",
  })).toBeInTheDocument();
  // Nothing has changed, so there is nothing to save.
  expect(screen.getByRole("button", { name: "Save settings" })).toBeDisabled();
});

it("saves 75/25 through the version handshake with a reason naming the change", async () => {
  getSettings.mockResolvedValue(stored);
  updateSettings.mockImplementation(async (input: { downpaymentPercent: number }) => ({
    ...stored,
    version: 8,
    downpaymentPercent: input.downpaymentPercent,
  }));
  render(<OperationalSettings />);

  fireEvent.click(await screen.findByRole("radio", { name: SPLIT }));
  expect(screen.getByTestId("checkout-payment-in-force")).toHaveTextContent(
    `after saving: ${SPLIT}`,
  );
  fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

  await waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(1));
  expect(updateSettings.mock.calls[0][0]).toMatchObject({
    expectedVersion: 7,
    downpaymentPercent: 75,
    reason: "Updated from the portal: checkout payment 100% to 75% up front",
  });
  expect(await screen.findByRole("status")).toHaveTextContent(`Checkout: ${SPLIT}.`);
  expect(screen.getByRole("radio", { name: SPLIT })).toBeChecked();
  expect(screen.getByTestId("checkout-payment-in-force")).not.toHaveTextContent("after saving");
});

it("keeps the choice when someone else saved first, and loads theirs underneath", async () => {
  getSettings
    .mockResolvedValueOnce(stored)
    .mockResolvedValueOnce({ ...stored, version: 8, issueWindowHours: 48 });
  updateSettings.mockRejectedValue(
    new ApiError(409, { error: "settings_version_conflict" }),
  );
  render(<OperationalSettings />);

  fireEvent.click(await screen.findByRole("radio", { name: SPLIT }));
  fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Someone else saved");
  await waitFor(() => expect(getSettings).toHaveBeenCalledTimes(2));
  expect(screen.getByRole("radio", { name: SPLIT })).toBeChecked();
});

it("discards an unsaved choice", async () => {
  getSettings.mockResolvedValue({ ...stored, downpaymentPercent: 75 });
  render(<OperationalSettings />);

  fireEvent.click(await screen.findByRole("radio", { name: FULL }));
  fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
  expect(screen.getByRole("radio", { name: SPLIT })).toBeChecked();
});

it("leaves the control out, and sends nothing for it, when the API does not hold the setting", async () => {
  const { downpaymentPercent: _omitted, ...older } = stored;
  void _omitted;
  getSettings.mockResolvedValue(older);
  updateSettings.mockImplementation(async () => ({ ...older, version: 8 }));
  render(<OperationalSettings />);

  const hours = await screen.findByLabelText("Hours after delivery");
  expect(screen.queryByRole("heading", { name: "Checkout payment" })).not.toBeInTheDocument();
  expect(screen.queryByRole("radio", { name: FULL })).not.toBeInTheDocument();

  fireEvent.change(hours, { target: { value: "48" } });
  fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
  await waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(1));
  expect(updateSettings.mock.calls[0][0]).not.toHaveProperty("downpaymentPercent");
});

it("explains the API's refusal of a split it does not accept", async () => {
  getSettings.mockResolvedValue(stored);
  updateSettings.mockRejectedValue(
    new ApiError(400, { error: "invalid_downpayment_percent", field: "downpaymentPercent" }),
  );
  render(<OperationalSettings />);

  fireEvent.click(await screen.findByRole("radio", { name: SPLIT }));
  fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Checkout takes either the full amount or 75% now and 25% before delivery.",
  );
});

it("names both money changes in one audit line", () => {
  expect(settingsChangeReason(8500, 8000, { from: 100, to: 75 })).toBe(
    "Updated from the portal: rider delivery share 85% to 80%; checkout payment 100% to 75% up front",
  );
  expect(settingsChangeReason(8500, 8500, { from: 100, to: 100 })).toBe(
    "Updated from the portal",
  );
  expect(settingsChangeReason(8500, 8500, { from: undefined, to: undefined })).toBe(
    "Updated from the portal",
  );
});
