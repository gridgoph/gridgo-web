// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import type { PlatformSettings } from "@/lib/api/types";
import { deliveryZones } from "@/test/delivery-zones";

vi.stubGlobal("React", React);
vi.stubGlobal("PointerEvent", MouseEvent);
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => {} }));
const { getSettings, updateSettings } = vi.hoisted(() => ({
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
}));
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  getSettings,
  updateSettings,
}));
const { OperationalSettings } = await import("@/components/settings/OperationalSettings");
const { CoverSpineSettings } = await import("@/components/settings/CoverSpineSettings");
const settings: PlatformSettings = {
  version: 4,
  issueWindowHours: 24,
  serviceFeeRateBps: 1000,
  deliveryFeeBands: deliveryZones(),
  coverSpineRequired: false,
  hubPickup: { schedule: null, feeMinor: 0 },
};
const card = () => within(screen.getByRole("region", { name: "Hardbound cover and spine" }));
const toggle = () => card().getByRole("switch", { name: "Require cover and spine" });
const save = () => card().getByRole("button", { name: "Save cover and spine" });
const props = { settings, canEdit: true, onSaved: vi.fn(), onConflict: vi.fn() };
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it.each([false, true])(
  "saves a change from %s on its own with a version and reason",
  async (required) => {
    getSettings.mockResolvedValue({ ...settings, coverSpineRequired: required });
    updateSettings.mockImplementation(async (input) => ({ ...settings, ...input, version: 5 }));
    render(<OperationalSettings />);
    await screen.findByRole("region", { name: "Hardbound cover and spine" });
    expect(toggle()).toHaveAttribute("aria-checked", String(required));
    expect(save()).toBeDisabled();
    fireEvent.click(toggle());
    expect(updateSettings).not.toHaveBeenCalled();
    fireEvent.click(save());
    await waitFor(() =>
      expect(updateSettings).toHaveBeenCalledWith({
        expectedVersion: 4,
        coverSpineRequired: !required,
        reason: `Cover and spine required at checkout: ${required ? "on to off" : "off to on"}`,
      }),
    );
    expect(await card().findByRole("status")).toHaveTextContent("Cover and spine setting saved.");
    expect(card().getByText(/In force right now/)).toHaveTextContent(required ? "Off" : "On");
  },
);

it("explains when to turn it on, and discards without writing", () => {
  render(<CoverSpineSettings {...props} />);
  expect(card().getByText(/customer app version with the spine form/)).toBeInTheDocument();
  expect(card().getByText(/the shop asks the client, as before/)).toBeInTheDocument();
  fireEvent.click(toggle());
  fireEvent.click(card().getByRole("button", { name: "Discard" }));
  expect(toggle()).toHaveAttribute("aria-checked", "false");
  expect(updateSettings).not.toHaveBeenCalled();
});

it("reloads a stale version, keeps the choice, and retries only on an explicit save", async () => {
  getSettings.mockResolvedValueOnce(settings).mockResolvedValue({ ...settings, version: 6 });
  updateSettings
    .mockRejectedValueOnce(new ApiError(409, { error: "settings_version_conflict" }))
    .mockResolvedValue({ ...settings, version: 7, coverSpineRequired: true });
  render(<OperationalSettings />);
  await screen.findByRole("region", { name: "Hardbound cover and spine" });
  fireEvent.click(toggle());
  fireEvent.click(save());
  await card().findByText(/Someone else saved settings/);
  await waitFor(() => expect(getSettings).toHaveBeenCalledTimes(2));
  expect(toggle()).toHaveAttribute("aria-checked", "true");
  fireEvent.click(save());
  await waitFor(() =>
    expect(updateSettings).toHaveBeenLastCalledWith({
      expectedVersion: 6,
      coverSpineRequired: true,
      reason: "Cover and spine required at checkout: off to on",
    }),
  );
});

it("is read only for anyone but Super Admin, and silent on an older API", () => {
  const { rerender } = render(<CoverSpineSettings {...props} canEdit={false} />);
  expect(card().queryByRole("switch")).not.toBeInTheDocument();
  expect(card().queryByRole("button")).not.toBeInTheDocument();
  expect(card().getByText(/In force right now: Off/)).toBeInTheDocument();
  expect(card().getByText("Only Super Admin changes these.")).toBeInTheDocument();
  rerender(<CoverSpineSettings {...props} settings={{ ...settings, coverSpineRequired: undefined }} />);
  expect(card().getByText(/not available yet/)).toBeInTheDocument();
  expect(card().queryByRole("switch")).not.toBeInTheDocument();
});

it("leaves a refused change available for retry", async () => {
  let reject!: (error: unknown) => void;
  updateSettings.mockReturnValue(new Promise((_resolve, fail) => (reject = fail)));
  render(<CoverSpineSettings {...props} />);
  fireEvent.click(toggle());
  fireEvent.click(save());
  expect(card().getByRole("button", { name: "Saving…" })).toBeDisabled();
  await act(async () => reject(new ApiError(403, { error: "forbidden" })));
  expect(card().getByText("Only Super Admin can change this setting.")).toBeInTheDocument();
  expect(save()).toBeEnabled();
  expect(props.onSaved).not.toHaveBeenCalled();
});

it("is not carried in the page save", async () => {
  getSettings.mockResolvedValue(settings);
  updateSettings.mockResolvedValue({ ...settings, version: 5, issueWindowHours: 48 });
  render(<OperationalSettings />);
  await screen.findByRole("region", { name: "Hardbound cover and spine" });
  fireEvent.click(toggle());
  fireEvent.change(screen.getByLabelText("Hours after delivery"), { target: { value: "48" } });
  fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
  await waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(1));
  expect(updateSettings.mock.calls[0][0]).not.toHaveProperty("coverSpineRequired");
  expect(toggle()).toHaveAttribute("aria-checked", "true");
});
