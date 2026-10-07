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
  clientRiderLocationRevealDistanceMeters: 1000,
  deliveryFeeBands: [{ maxDistanceMeters: null, feeMinor: 2500 }],
};

it("saves whole meters through the version handshake and discards drafts", async () => {
  getSettings.mockResolvedValue(stored);
  updateSettings.mockImplementation(async (input) => ({
    ...stored,
    ...input,
    version: 5,
  }));
  render(<OperationalSettings />);
  const field = await screen.findByLabelText("Reveal distance (meters)");
  expect(field).toHaveValue("1000");
  fireEvent.change(field, { target: { value: "500" } });
  fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
  expect(field).toHaveValue("1000");
  fireEvent.change(field, { target: { value: "1500" } });
  fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
  await waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(1));
  expect(updateSettings.mock.calls[0][0]).toMatchObject({
    expectedVersion: 4,
    clientRiderLocationRevealDistanceMeters: 1500,
  });
  expect(updateSettings.mock.calls[0][0].reason).toBeTruthy();
  expect(await screen.findByRole("status")).toHaveTextContent("active deliveries");
});

it.each(["0", "-1", "1.5", "", "many", "9007199254740992"])(
  "rejects invalid meters: %s",
  async (value) => {
    getSettings.mockResolvedValue(stored);
    render(<OperationalSettings />);
    fireEvent.change(await screen.findByLabelText("Reveal distance (meters)"), {
      target: { value },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    expect(updateSettings).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Reveal distance (meters)")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  },
);

it("preserves a draft after a stale-version reload and saves with the new version", async () => {
  getSettings
    .mockResolvedValueOnce(stored)
    .mockResolvedValue({
      ...stored,
      version: 5,
      clientRiderLocationRevealDistanceMeters: 2000,
    });
  updateSettings
    .mockRejectedValueOnce(new ApiError(409, { error: "settings_version_conflict" }))
    .mockResolvedValue({
      ...stored,
      version: 6,
      clientRiderLocationRevealDistanceMeters: 500,
    });
  render(<OperationalSettings />);
  fireEvent.change(await screen.findByLabelText("Reveal distance (meters)"), {
    target: { value: "500" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
  await screen.findByText(/Someone else saved/);
  expect(await screen.findByLabelText("Reveal distance (meters)")).toHaveValue("500");
  fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
  await waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(2));
  expect(updateSettings.mock.calls[1][0]).toMatchObject({
    expectedVersion: 5,
    clientRiderLocationRevealDistanceMeters: 500,
  });
});

it("does not offer or send a setting that the API has not released", async () => {
  const { clientRiderLocationRevealDistanceMeters: _radius, ...older } = stored;
  expect(_radius).toBe(1000);
  getSettings.mockResolvedValue(older);
  updateSettings.mockResolvedValue({ ...older, version: 5 });
  render(<OperationalSettings />);
  await screen.findByLabelText("Rider keeps");
  expect(screen.queryByLabelText("Reveal distance (meters)")).toBeNull();
  fireEvent.change(screen.getByLabelText("Rider keeps"), { target: { value: "80" } });
  fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
  await waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(1));
  expect(updateSettings.mock.calls[0][0]).not.toHaveProperty(
    "clientRiderLocationRevealDistanceMeters",
  );
});
