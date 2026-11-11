// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { afterEach, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/client";

vi.stubGlobal("React", React);
vi.stubGlobal("PointerEvent", MouseEvent);
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => {} }));
const getSettings = vi.hoisted(() => vi.fn());
const updateSettings = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  getSettings,
  updateSettings,
}));
const { ReceiptScanSetting } = await import("@/components/settings/ReceiptScanSetting");

afterEach(() => {
  cleanup();
  getSettings.mockReset();
  updateSettings.mockReset();
});

const TITLE = "Require receipt scan before calling a rider";
const base = {
  version: 12,
  issueWindowHours: 24,
  serviceFeeRateBps: 1000,
  deliveryFeeBands: [],
  shopReceiptScanRequired: false,
};

const card = () => within(screen.getByRole("region", { name: TITLE }));

it("lets Super Admin turn it on with a reason, through the version handshake", async () => {
  getSettings.mockResolvedValue(base);
  updateSettings.mockResolvedValue({ ...base, version: 13, shopReceiptScanRequired: true });
  render(<ReceiptScanSetting canEdit />);

  const toggle = await screen.findByRole("switch", { name: TITLE });
  expect(card().getByText(/cannot call a rider for an order until it has scanned/)).toBeInTheDocument();
  expect(toggle).not.toBeChecked();
  fireEvent.click(toggle);

  // No reason, no save: the audit log needs one.
  fireEvent.click(card().getByRole("button", { name: "Save" }));
  expect(await card().findByRole("alert")).toHaveTextContent("Say why you are changing this");
  expect(updateSettings).not.toHaveBeenCalled();

  fireEvent.change(card().getByLabelText("Why you are changing it"), {
    target: { value: "Shop app has the upload step" },
  });
  fireEvent.click(card().getByRole("button", { name: "Save" }));

  await waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(1));
  expect(updateSettings).toHaveBeenCalledWith({
    expectedVersion: 12,
    shopReceiptScanRequired: true,
    reason: "Finance: receipt scan before calling a rider turned on. Shop app has the upload step",
  });
  expect(await card().findByRole("status")).toHaveTextContent(
    "Saved. Shops now send their receipt scan before calling a rider.",
  );
  expect(card().getByText(/In force right now: On/)).toBeInTheDocument();
});

it("shows Operations the state with no control", async () => {
  getSettings.mockResolvedValue({ ...base, shopReceiptScanRequired: true });
  render(<ReceiptScanSetting canEdit={false} />);

  expect(await screen.findByTestId("receipt-scan-read-only")).toHaveTextContent("On");
  expect(card().getByText("Only Super Admin changes this.")).toBeInTheDocument();
  expect(card().queryByRole("switch")).not.toBeInTheDocument();
  expect(card().queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
});

it("reloads after a version conflict and keeps the choice and reason typed", async () => {
  getSettings
    .mockResolvedValueOnce(base)
    .mockResolvedValueOnce({ ...base, version: 14, issueWindowHours: 48 });
  updateSettings.mockRejectedValue(
    new ApiError(409, { error: "settings_version_conflict", version: 14 }),
  );
  render(<ReceiptScanSetting canEdit />);

  fireEvent.click(await screen.findByRole("switch", { name: TITLE }));
  fireEvent.change(card().getByLabelText("Why you are changing it"), {
    target: { value: "Pilot ready" },
  });
  fireEvent.click(card().getByRole("button", { name: "Save" }));

  expect(await card().findByRole("alert")).toHaveTextContent(
    "Someone else saved settings a moment ago",
  );
  expect(getSettings).toHaveBeenCalledTimes(2);
  expect(card().getByRole("switch", { name: TITLE })).toBeChecked();
  expect(card().getByLabelText("Why you are changing it")).toHaveValue("Pilot ready");

  // The second save carries the version read after the conflict.
  updateSettings.mockResolvedValue({ ...base, version: 15, shopReceiptScanRequired: true });
  fireEvent.click(card().getByRole("button", { name: "Save" }));
  await waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(2));
  expect(updateSettings.mock.calls[1][0]).toMatchObject({ expectedVersion: 14 });
});

it("says so on an API without the switch", async () => {
  const { shopReceiptScanRequired: _omit, ...older } = base;
  void _omit;
  getSettings.mockResolvedValue(older);
  render(<ReceiptScanSetting canEdit />);
  expect(await screen.findByText(/This setting is not available yet/)).toBeInTheDocument();
  expect(screen.queryByRole("switch")).not.toBeInTheDocument();
});
