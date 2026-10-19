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
const { FoundingTesterLaunch } =
  await import("@/components/settings/FoundingTesterLaunch");

const settings: PlatformSettings = {
  version: 4,
  issueWindowHours: 24,
  serviceFeeRateBps: 1000,
  deliveryFeeBands: deliveryZones(),
  hubPickup: { schedule: null, feeMinor: 0 },
  foundingTesterLaunchAt: null,
};
const card = () =>
  within(screen.getByRole("region", { name: "Founding Tester launch date" }));
const input = () => card().getByLabelText("Launch date and time (Manila time)");
const save = () => card().getByRole("button", { name: "Save launch date" });
const props = { settings, canEdit: true, onSaved: vi.fn(), onConflict: vi.fn() };
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it("explains the date in plain words and shows an unset date as open to everyone", () => {
  render(<FoundingTesterLaunch {...props} />);
  expect(
    card().getByText(
      /Only client accounts created before this date can earn the Founding Tester label/,
    ),
  ).toBeInTheDocument();
  expect(
    card().getByText(/Leave it empty and every client account can/),
  ).toBeInTheDocument();
  expect(card().getByText(/In force right now/)).toHaveTextContent(
    "Not set. Every client account can earn the label.",
  );
  expect(input()).toHaveValue("");
  expect(save()).toBeDisabled();
});

it("saves a Manila date as UTC on its own, with the version and a reason", async () => {
  getSettings.mockResolvedValue(settings);
  updateSettings.mockImplementation(async (input) => ({
    ...settings,
    ...input,
    version: 5,
  }));
  render(<OperationalSettings />);
  await screen.findByRole("region", { name: "Founding Tester launch date" });
  fireEvent.change(input(), { target: { value: "2026-11-01T00:00" } });
  expect(card().getByRole("note")).toHaveTextContent(
    "only accounts created before Nov 1, 2026, 12:00 AM (Manila) can earn the label",
  );
  fireEvent.click(save());
  await waitFor(() =>
    expect(updateSettings).toHaveBeenCalledWith({
      expectedVersion: 4,
      foundingTesterLaunchAt: "2026-10-31T16:00:00.000Z",
      reason: "Founding Tester launch date (Manila): not set to Nov 1, 2026, 12:00 AM",
    }),
  );
  expect(await card().findByRole("status")).toHaveTextContent("Launch date saved.");
  expect(card().getByText(/In force right now/)).toHaveTextContent(
    "Nov 1, 2026, 12:00 AM, Manila time",
  );
});

it("shows a stored date in Manila time and clears it to empty", async () => {
  const onSaved = vi.fn();
  const stored = { ...settings, foundingTesterLaunchAt: "2026-10-31T16:00:00.000Z" };
  updateSettings.mockResolvedValue({
    ...stored,
    foundingTesterLaunchAt: null,
    version: 5,
  });
  render(<FoundingTesterLaunch {...props} settings={stored} onSaved={onSaved} />);
  expect(input()).toHaveValue("2026-11-01T00:00");
  fireEvent.click(card().getByRole("button", { name: "Clear date" }));
  expect(input()).toHaveValue("");
  expect(card().getByRole("note")).toHaveTextContent(
    "every client account can earn the label, whenever it was created",
  );
  fireEvent.click(save());
  await waitFor(() =>
    expect(updateSettings).toHaveBeenCalledWith({
      expectedVersion: 4,
      foundingTesterLaunchAt: null,
      reason: "Founding Tester launch date (Manila): Nov 1, 2026, 12:00 AM to not set",
    }),
  );
  expect(onSaved).toHaveBeenCalledWith(
    expect.objectContaining({ foundingTesterLaunchAt: null }),
  );
  expect(await card().findByRole("status")).toHaveTextContent(
    "Launch date cleared. Every client account can now earn the label.",
  );
});

it("discards without writing and keeps the stored date", () => {
  const stored = { ...settings, foundingTesterLaunchAt: "2026-10-31T16:00:00.000Z" };
  render(<FoundingTesterLaunch {...props} settings={stored} />);
  fireEvent.change(input(), { target: { value: "2026-12-01T09:30" } });
  fireEvent.click(card().getByRole("button", { name: "Discard" }));
  expect(input()).toHaveValue("2026-11-01T00:00");
  expect(save()).toBeDisabled();
  expect(updateSettings).not.toHaveBeenCalled();
});

it("reloads a stale version and keeps the typed date", async () => {
  getSettings
    .mockResolvedValueOnce(settings)
    .mockResolvedValue({ ...settings, version: 6 });
  updateSettings.mockRejectedValueOnce(
    new ApiError(409, { error: "settings_version_conflict" }),
  );
  render(<OperationalSettings />);
  await screen.findByRole("region", { name: "Founding Tester launch date" });
  fireEvent.change(input(), { target: { value: "2026-11-01T00:00" } });
  fireEvent.click(save());
  await card().findByText(/Someone else saved settings/);
  await waitFor(() => expect(getSettings).toHaveBeenCalledTimes(2));
  expect(input()).toHaveValue("2026-11-01T00:00");
});

it("says so on an API from before the launch date", () => {
  const { foundingTesterLaunchAt: _omit, ...older } = settings;
  void _omit;
  render(<FoundingTesterLaunch {...props} settings={older} />);
  expect(card().getByText(/The launch date is not available yet/)).toBeInTheDocument();
  expect(card().queryByRole("button", { name: "Save launch date" })).toBeNull();
});
