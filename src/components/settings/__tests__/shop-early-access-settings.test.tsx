// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
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
const { ShopEarlyAccessSettings } = await import(
  "@/components/settings/ShopEarlyAccessSettings"
);

const settings: PlatformSettings = {
  version: 4,
  issueWindowHours: 24,
  serviceFeeRateBps: 1000,
  deliveryFeeBands: deliveryZones(),
  hubPickup: { schedule: null, feeMinor: 0 },
  shopEarlyAccessEnabled: false,
};
const card = () => within(screen.getByRole("region", { name: "Shop app early access" }));
const toggle = () => card().getByRole("switch");
const dialog = () => within(screen.getByRole("alertdialog"));
const props = { settings, canEdit: true, onSaved: vi.fn(), onConflict: vi.fn() };
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it("shows a plain closed state, says what it does, and writes nothing on a flip", () => {
  render(<ShopEarlyAccessSettings {...props} />);
  expect(card().getByText("Shop app early access: closed")).toBeInTheDocument();
  expect(
    card().getByText(/print shops can sign up on the website to test the shop app/),
  ).toBeInTheDocument();
  expect(toggle()).not.toBeChecked();
  fireEvent.click(toggle());
  expect(dialog().getByText("Open shop app early access?")).toBeInTheDocument();
  expect(dialog().getByText(/The shop form on the website opens/)).toBeInTheDocument();
  expect(updateSettings).not.toHaveBeenCalled();
  // Cancel leaves it closed.
  fireEvent.click(dialog().getByRole("button", { name: "Cancel" }));
  expect(updateSettings).not.toHaveBeenCalled();
  expect(toggle()).not.toBeChecked();
});

it("needs a reason, then opens it through the version handshake", async () => {
  getSettings.mockResolvedValue(settings);
  updateSettings.mockImplementation(async (input) => ({ ...settings, ...input, version: 5 }));
  render(<OperationalSettings />);
  await screen.findByRole("region", { name: "Shop app early access" });
  fireEvent.click(toggle());
  fireEvent.click(dialog().getByRole("button", { name: "Open shop early access" }));
  expect(dialog().getByRole("alert")).toHaveTextContent("Say why you are changing this");
  expect(updateSettings).not.toHaveBeenCalled();
  fireEvent.change(dialog().getByLabelText("Why you are changing it"), {
    target: { value: "Shop app release confirmed" },
  });
  fireEvent.click(dialog().getByRole("button", { name: "Open shop early access" }));
  await waitFor(() =>
    expect(updateSettings).toHaveBeenCalledWith({
      expectedVersion: 4,
      shopEarlyAccessEnabled: true,
      reason: "Shop app early access opened. Shop app release confirmed",
    }),
  );
  expect(await card().findByRole("status")).toHaveTextContent(
    "Shop app early access is open",
  );
  expect(card().getByText("Shop app early access: open")).toBeInTheDocument();
  expect(toggle()).toBeChecked();
});

it("closes it with its own confirmation", async () => {
  const onSaved = vi.fn();
  const open = { ...settings, shopEarlyAccessEnabled: true };
  updateSettings.mockResolvedValue({ ...open, shopEarlyAccessEnabled: false, version: 5 });
  render(<ShopEarlyAccessSettings {...props} settings={open} onSaved={onSaved} />);
  fireEvent.click(toggle());
  expect(dialog().getByText("Close shop app early access?")).toBeInTheDocument();
  fireEvent.change(dialog().getByLabelText("Why you are changing it"), {
    target: { value: "Pausing" },
  });
  fireEvent.click(dialog().getByRole("button", { name: "Close shop early access" }));
  await waitFor(() =>
    expect(updateSettings).toHaveBeenCalledWith({
      expectedVersion: 4,
      shopEarlyAccessEnabled: false,
      reason: "Shop app early access closed. Pausing",
    }),
  );
  expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ shopEarlyAccessEnabled: false }));
});

it("reloads a stale version and says to check the state in force", async () => {
  getSettings
    .mockResolvedValueOnce(settings)
    .mockResolvedValue({ ...settings, shopEarlyAccessEnabled: true, version: 5 });
  updateSettings.mockRejectedValue(new ApiError(409, { error: "settings_version_conflict" }));
  render(<OperationalSettings />);
  await screen.findByRole("region", { name: "Shop app early access" });
  fireEvent.click(toggle());
  fireEvent.change(dialog().getByLabelText("Why you are changing it"), {
    target: { value: "Release confirmed" },
  });
  fireEvent.click(dialog().getByRole("button", { name: "Open shop early access" }));
  // The dialog closes on a stale version; the card says what happened.
  await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  expect(await card().findByRole("alert")).toHaveTextContent(
    "Someone else saved settings a moment ago",
  );
  await waitFor(() => expect(getSettings).toHaveBeenCalledTimes(2));
  expect(await card().findByText("Shop app early access: open")).toBeInTheDocument();
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
});

it("says so on an API without the setting", () => {
  const older = { ...settings };
  delete older.shopEarlyAccessEnabled;
  render(<ShopEarlyAccessSettings {...props} settings={older} />);
  expect(card().getByText(/not available yet/)).toBeInTheDocument();
  expect(card().queryByRole("switch")).not.toBeInTheDocument();
});

/** Source files under `src` (tests excluded) whose text matches. */
function importersOf(pattern: RegExp, self: string): string[] {
  const root = path.resolve(__dirname, "../../..");
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) {
        if (name !== "__tests__") walk(full);
      } else if (/\.tsx?$/.test(name) && name !== self && pattern.test(readFileSync(full, "utf8"))) {
        found.push(path.relative(root, full));
      }
    }
  };
  walk(root);
  return found;
}

it("is mounted only from the Super Admin settings screen", () => {
  expect(importersOf(/ShopEarlyAccessSettings/, "ShopEarlyAccessSettings.tsx")).toEqual([
    "components/settings/OperationalSettings.tsx",
  ]);
  // OperationalSettings itself mounts only under /admin; /ops/settings is SuperAdminOnly.
  const pages = importersOf(
    /from "@\/components\/settings\/OperationalSettings"/,
    "OperationalSettings.tsx",
  );
  expect(pages.length).toBeGreaterThan(0);
  for (const file of pages) expect(file.startsWith("app/admin/")).toBe(true);
});
