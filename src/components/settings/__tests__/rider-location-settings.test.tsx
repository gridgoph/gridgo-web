// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/client";

vi.stubGlobal("React", React);
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
  version: 4,
  issueWindowHours: 24,
  serviceFeeRateBps: 1000,
  riderCommissionBps: 8500,
  // Deprecated by gridgo-api#229: still stored, never shown or sent here.
  clientRiderLocationRevealDistanceMeters: 1000,
  riderLocationRefreshIntervalSeconds: 20,
  riderLocationStaleAfterSeconds: 120,
  deliveryFeeBands: [{ maxDistanceMeters: null, feeMinor: 2500 }],
};

const REFRESH = "Map refresh (seconds)";
const STALE = "Stale after (seconds)";

it("saves both values through the version handshake with an audit line", async () => {
  getSettings.mockResolvedValue(stored);
  updateSettings.mockImplementation(async (input) => ({ ...stored, ...input, version: 5 }));
  render(<OperationalSettings />);
  const refresh = await screen.findByLabelText(REFRESH);
  const stale = screen.getByLabelText(STALE);
  expect(refresh).toHaveValue("20");
  expect(stale).toHaveValue("120");
  expect(screen.queryByLabelText("Reveal distance (meters)")).toBeNull();

  fireEvent.change(refresh, { target: { value: "15" } });
  fireEvent.change(stale, { target: { value: "300" } });
  fireEvent.click(screen.getByRole("button", { name: "Save rider tracking" }));
  await waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(1));
  const sent = updateSettings.mock.calls[0][0];
  expect(sent).toEqual({
    expectedVersion: 4,
    riderLocationRefreshIntervalSeconds: 15,
    riderLocationStaleAfterSeconds: 300,
    reason: "Rider tracking: map refresh 20 s to 15 s; stale after 120 s to 300 s",
  });
  expect(sent).not.toHaveProperty("clientRiderLocationRevealDistanceMeters");
  expect(await screen.findByText(/flagged after 5 minutes/)).toBeInTheDocument();
});

it("discards a draft back to the values in force", async () => {
  getSettings.mockResolvedValue(stored);
  render(<OperationalSettings />);
  const refresh = await screen.findByLabelText(REFRESH);
  fireEvent.change(refresh, { target: { value: "25" } });
  fireEvent.click(screen.getByRole("button", { name: "Discard" }));
  expect(refresh).toHaveValue("20");
  expect(screen.getByRole("button", { name: "Save rider tracking" })).toBeDisabled();
});

it.each([
  [REFRESH, "14"],
  [REFRESH, "31"],
  [REFRESH, "20.5"],
  [STALE, "29"],
  [STALE, "601"],
  [STALE, ""],
])("refuses %s = %s before sending", async (label, value) => {
  getSettings.mockResolvedValue(stored);
  render(<OperationalSettings />);
  const field = await screen.findByLabelText(label);
  fireEvent.change(field, { target: { value } });
  expect(field).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByRole("button", { name: "Save rider tracking" })).toBeDisabled();
  expect(updateSettings).not.toHaveBeenCalled();
});

it("keeps the draft after a version conflict and saves against the new version", async () => {
  getSettings
    .mockResolvedValueOnce(stored)
    .mockResolvedValue({ ...stored, version: 5, riderLocationRefreshIntervalSeconds: 25 });
  updateSettings
    .mockRejectedValueOnce(new ApiError(409, { error: "settings_version_conflict" }))
    .mockResolvedValue({ ...stored, version: 6, riderLocationStaleAfterSeconds: 180 });
  render(<OperationalSettings />);
  fireEvent.change(await screen.findByLabelText(STALE), { target: { value: "180" } });
  fireEvent.click(screen.getByRole("button", { name: "Save rider tracking" }));
  await screen.findByText(/Someone else saved settings/);
  // Their refresh value loads in underneath; the typed threshold stays.
  await waitFor(() => expect(screen.getByLabelText(REFRESH)).toHaveValue("25"));
  expect(screen.getByLabelText(STALE)).toHaveValue("180");
  fireEvent.click(screen.getByRole("button", { name: "Save rider tracking" }));
  await waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(2));
  expect(updateSettings.mock.calls[1][0]).toMatchObject({
    expectedVersion: 5,
    riderLocationRefreshIntervalSeconds: 25,
    riderLocationStaleAfterSeconds: 180,
  });
});

it("names the field the API refused", async () => {
  getSettings.mockResolvedValue(stored);
  updateSettings.mockRejectedValue(
    new ApiError(400, {
      error: "invalid_rider_tracking_setting",
      field: "riderLocationStaleAfterSeconds",
    }),
  );
  render(<OperationalSettings />);
  fireEvent.change(await screen.findByLabelText(STALE), { target: { value: "90" } });
  fireEvent.click(screen.getByRole("button", { name: "Save rider tracking" }));
  expect(await screen.findByText(/refused the stale after value/)).toBeInTheDocument();
});

it("says so on an API without the tracking settings, and sends nothing for them", async () => {
  const {
    riderLocationRefreshIntervalSeconds: _r,
    riderLocationStaleAfterSeconds: _s,
    ...older
  } = stored;
  expect([_r, _s]).toEqual([20, 120]);
  getSettings.mockResolvedValue(older);
  updateSettings.mockResolvedValue({ ...older, version: 5 });
  render(<OperationalSettings />);
  expect(await screen.findByTestId("rider-tracking-unavailable")).toBeInTheDocument();
  expect(screen.queryByLabelText(REFRESH)).toBeNull();
  fireEvent.change(screen.getByLabelText("Rider keeps"), { target: { value: "80" } });
  fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
  await waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(1));
  const sent = updateSettings.mock.calls[0][0];
  expect(sent).not.toHaveProperty("riderLocationRefreshIntervalSeconds");
  expect(sent).not.toHaveProperty("clientRiderLocationRevealDistanceMeters");
});
