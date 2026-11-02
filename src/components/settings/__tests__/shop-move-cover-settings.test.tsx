// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/client";
import type { PlatformSettings } from "@/lib/api/types";

vi.stubGlobal("React", React);
const { OperationalSettings } = await import("@/components/settings/OperationalSettings");
const { ShopMoveCover } = await import("@/components/settings/ShopMoveCover");
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
  shopMoveCoverBps: 5000,
  deliveryFeeBands: [{ maxDistanceMeters: null, feeMinor: 2500 }],
};

const FIELD = "GRIDGO covers up to";
const SAVE = "Save substitute-shop cover";

it("lets Super Admin change the cover through its own versioned save with a reason", async () => {
  getSettings.mockResolvedValue(stored);
  updateSettings.mockImplementation(async (input) => ({ ...stored, ...input, version: 5 }));
  render(<OperationalSettings />);
  const field = await screen.findByLabelText(FIELD);
  expect(field).toHaveValue("50");
  expect(screen.getByRole("button", { name: SAVE })).toBeDisabled();

  fireEvent.change(field, { target: { value: "62.5" } });
  expect(screen.getByTestId("shop-move-cover-in-force")).toHaveTextContent(
    "In force right now: 50% · after saving: 62.5%",
  );
  fireEvent.click(screen.getByRole("button", { name: SAVE }));
  await waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(1));
  expect(updateSettings.mock.calls[0][0]).toEqual({
    expectedVersion: 4,
    shopMoveCoverBps: 6250,
    reason: "Substitute-shop cover: 50% to 62.5% of the original service fee",
  });
  expect(await screen.findByText(/GRIDGO now covers up to 62.5%/)).toBeInTheDocument();
});

it("never carries the cover inside the page's Save settings", async () => {
  getSettings.mockResolvedValue(stored);
  updateSettings.mockResolvedValue({ ...stored, version: 5 });
  render(<OperationalSettings />);
  fireEvent.change(await screen.findByLabelText("Rider keeps"), { target: { value: "80" } });
  fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
  await waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(1));
  expect(updateSettings.mock.calls[0][0]).not.toHaveProperty("shopMoveCoverBps");
});

it.each(["", "-1", "100.5", "12.345", "abc"])("refuses %j before sending", async (value) => {
  getSettings.mockResolvedValue(stored);
  render(<OperationalSettings />);
  const field = await screen.findByLabelText(FIELD);
  fireEvent.change(field, { target: { value } });
  expect(field).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByRole("button", { name: SAVE })).toBeDisabled();
  expect(updateSettings).not.toHaveBeenCalled();
});

it("keeps the draft after a version conflict and saves against the new version", async () => {
  getSettings
    .mockResolvedValueOnce(stored)
    .mockResolvedValue({ ...stored, version: 7, shopMoveCoverBps: 4000 });
  updateSettings
    .mockRejectedValueOnce(new ApiError(409, { error: "settings_version_conflict" }))
    .mockResolvedValue({ ...stored, version: 8, shopMoveCoverBps: 3000 });
  render(<OperationalSettings />);
  fireEvent.change(await screen.findByLabelText(FIELD), { target: { value: "30" } });
  fireEvent.click(screen.getByRole("button", { name: SAVE }));
  expect(await screen.findByText(/Someone else saved settings/)).toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByTestId("shop-move-cover-in-force")).toHaveTextContent("In force right now: 40%"),
  );
  expect(screen.getByLabelText(FIELD)).toHaveValue("30");
  fireEvent.click(screen.getByRole("button", { name: SAVE }));
  await waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(2));
  expect(updateSettings.mock.calls[1][0]).toEqual({
    expectedVersion: 7,
    shopMoveCoverBps: 3000,
    reason: "Substitute-shop cover: 40% to 30% of the original service fee",
  });
});

it("explains the API's refusals", async () => {
  getSettings.mockResolvedValue(stored);
  updateSettings
    .mockRejectedValueOnce(new ApiError(403, { error: "forbidden" }))
    .mockRejectedValueOnce(new ApiError(400, { error: "invalid_shop_move_cover" }));
  render(<OperationalSettings />);
  fireEvent.change(await screen.findByLabelText(FIELD), { target: { value: "20" } });
  fireEvent.click(screen.getByRole("button", { name: SAVE }));
  expect(await screen.findByText("Only Super Admin can change the substitute-shop cover.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: SAVE }));
  expect(await screen.findByText(/Set GRIDGO's cover from 0% to 100%/)).toBeInTheDocument();
});

it("is read-only for Operations: no save, and the value in force", () => {
  render(
    <ShopMoveCover
      settings={stored as unknown as PlatformSettings}
      canEdit={false}
      onSaved={vi.fn()}
      onConflict={vi.fn()}
    />,
  );
  expect(screen.getByLabelText(FIELD)).toBeDisabled();
  expect(screen.getByLabelText(FIELD)).toHaveValue("50");
  expect(screen.queryByRole("button", { name: SAVE })).toBeNull();
  expect(screen.getByText("Only Super Admin changes this.")).toBeInTheDocument();
});

it("links Super Admin to settings when shown read-only elsewhere", () => {
  render(
    <ShopMoveCover
      settings={stored as unknown as PlatformSettings}
      canEdit={false}
      onSaved={vi.fn()}
      onConflict={vi.fn()}
      editHref="/admin/settings"
    />,
  );
  expect(screen.getByRole("link", { name: "Change it in Operational settings" })).toHaveAttribute(
    "href",
    "/admin/settings",
  );
});

it("says so on an API without the setting", async () => {
  const { shopMoveCoverBps: _cover, ...older } = stored;
  expect(_cover).toBe(5000);
  getSettings.mockResolvedValue(older);
  render(<OperationalSettings />);
  expect(await screen.findByTestId("shop-move-cover-unavailable")).toBeInTheDocument();
  expect(screen.queryByLabelText(FIELD)).toBeNull();
});
