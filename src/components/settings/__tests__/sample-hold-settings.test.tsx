// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/client";
import type { PlatformSettings } from "@/lib/api/types";

vi.stubGlobal("React", React);
const { OperationalSettings } = await import("@/components/settings/OperationalSettings");
const { SampleBatchHoldSettings } = await import("@/components/settings/SampleBatchHoldSettings");
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
  version: 4,
  issueWindowHours: 24,
  serviceFeeRateBps: 1000,
  riderCommissionBps: 8500,
  sampleBatchHoldDays: 14,
  deliveryFeeBands: [{ maxDistanceMeters: null, feeMinor: 2500 }],
};

const FIELD = "Hold the batch price for";
const SAVE = "Save sample batch hold";

it("lets Super Admin change it through its own versioned save with a reason", async () => {
  getSettings.mockResolvedValue(stored);
  updateSettings.mockImplementation(async (input) => ({ ...stored, ...input, version: 5 }));
  render(<OperationalSettings />);
  const field = await screen.findByLabelText(FIELD);
  expect(field).toHaveValue("14");
  expect(screen.getByRole("button", { name: SAVE })).toBeDisabled();

  fireEvent.change(field, { target: { value: "21" } });
  expect(screen.getByTestId("sample-hold-in-force")).toHaveTextContent(
    "In force right now: 14 days · after saving: 21 days",
  );
  fireEvent.click(screen.getByRole("button", { name: SAVE }));
  await waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(1));
  expect(updateSettings.mock.calls[0][0]).toEqual({
    expectedVersion: 4,
    sampleBatchHoldDays: 21,
    reason: "Sample batch hold: 14 days to 21 days",
  });
  expect(await screen.findByText(/hold their batch price for 21 days/)).toBeInTheDocument();
});

it("never carries the sample batch hold inside the page's Save settings", async () => {
  getSettings.mockResolvedValue(stored);
  updateSettings.mockResolvedValue({ ...stored, version: 5 });
  render(<OperationalSettings />);
  fireEvent.change(await screen.findByLabelText("Rider keeps"), { target: { value: "80" } });
  fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
  await waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(1));
  expect(updateSettings.mock.calls[0][0]).not.toHaveProperty("sampleBatchHoldDays");
});

it.each(["", "0", "91", "7.5", "abc"])("refuses %j before sending", async (value) => {
  getSettings.mockResolvedValue(stored);
  render(<OperationalSettings />);
  const field = await screen.findByLabelText(FIELD);
  fireEvent.change(field, { target: { value } });
  expect(field).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByRole("button", { name: SAVE })).toBeDisabled();
  expect(updateSettings).not.toHaveBeenCalled();
});

it("explains a refusal for anyone but Super Admin and a version conflict", async () => {
  getSettings
    .mockResolvedValueOnce(stored)
    .mockResolvedValue({ ...stored, version: 9, sampleBatchHoldDays: 10 });
  updateSettings
    .mockRejectedValueOnce(new ApiError(403, { error: "forbidden" }))
    .mockRejectedValueOnce(new ApiError(409, { error: "settings_version_conflict" }));
  render(<OperationalSettings />);
  fireEvent.change(await screen.findByLabelText(FIELD), { target: { value: "3" } });
  fireEvent.click(screen.getByRole("button", { name: SAVE }));
  expect(await screen.findByText("Only Super Admin can change the sample batch hold.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: SAVE }));
  expect(await screen.findByText(/Someone else saved settings/)).toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByTestId("sample-hold-in-force")).toHaveTextContent(
      "In force right now: 10 days",
    ),
  );
  expect(screen.getByLabelText(FIELD)).toHaveValue("3");
});

it("is read-only for Operations: no save, the value in force", () => {
  render(
    <SampleBatchHoldSettings
      settings={stored as unknown as PlatformSettings}
      canEdit={false}
      onSaved={vi.fn()}
      onConflict={vi.fn()}
    />,
  );
  expect(screen.getByLabelText(FIELD)).toBeDisabled();
  expect(screen.getByLabelText(FIELD)).toHaveValue("14");
  expect(screen.queryByRole("button", { name: SAVE })).toBeNull();
  expect(screen.getByText("Only Super Admin changes this.")).toBeInTheDocument();
});

it("says so when the API does not hold the setting yet", () => {
  const { sampleBatchHoldDays: _omit, ...older } = stored;
  void _omit;
  render(
    <SampleBatchHoldSettings
      settings={older as unknown as PlatformSettings}
      canEdit
      onSaved={vi.fn()}
      onConflict={vi.fn()}
    />,
  );
  expect(screen.getByTestId("sample-hold-unavailable")).toBeInTheDocument();
  expect(screen.queryByLabelText(FIELD)).toBeNull();
});
