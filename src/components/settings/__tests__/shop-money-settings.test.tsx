// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, expect, it, vi } from "vitest";

import type { PlatformSettings } from "@/lib/api/types";

vi.stubGlobal("React", React);
class FakePointerEvent extends MouseEvent {
  constructor(type: string, params: MouseEventInit = {}) {
    super(type, params);
  }
}
vi.stubGlobal("PointerEvent", FakePointerEvent);
const updateSettings = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  updateSettings,
}));
const { ShopMoneySettings } = await import("@/components/settings/ShopMoneySettings");
const { ApiError } = await import("@/lib/api/client");

afterEach(() => {
  cleanup();
  updateSettings.mockReset();
});

const shopMoney = {
  payoutTime: "16:00",
  minimumMinor: 10000,
  payDeadline: "18:00",
  reminderTime: "17:00",
  bonusRateBps: 2000,
  bonusDays: 7,
  bonusCapMinor: 50000,
  businessWeekdays: [1, 2, 3, 4, 5],
  holidays: [],
  extraBusinessDates: [],
  launchedAt: "2026-11-22T00:00:00.000Z",
};
const settings = { version: 12, issueWindowHours: 24, shopMoney } as unknown as PlatformSettings;

function field(label: string) {
  return screen.getByLabelText(label) as HTMLInputElement;
}

it("shows the decided policy and saves only what changed, with a reason, through the version handshake", async () => {
  const onSaved = vi.fn();
  updateSettings.mockResolvedValue({ ...settings, version: 13, shopMoney: { ...shopMoney, payoutTime: "15:30", minimumMinor: 15000 } });
  render(<ShopMoneySettings settings={settings} onSaved={onSaved} onConflict={vi.fn()} />);
  expect(screen.getByTestId("shop-money-in-force")).toHaveTextContent(
    "In force: run at 4:00 PM, minimum ₱100.00, Pay GRIDGO by 6:00 PM, bonus 20% for 7 days up to ₱500.00.",
  );
  const save = screen.getByRole("button", { name: "Save payout settings" });
  expect(save).toBeDisabled();

  await userEvent.clear(field("Payout run"));
  await userEvent.type(field("Payout run"), "15:30");
  await userEvent.clear(field("Minimum payout"));
  await userEvent.type(field("Minimum payout"), "150");
  await userEvent.click(save);

  const dialog = await screen.findByRole("alertdialog");
  expect(within(dialog).getByTestId("shop-money-changes")).toHaveTextContent("payout time 16:00 → 15:30");
  expect(within(dialog).getByTestId("shop-money-changes")).toHaveTextContent("minimum ₱100.00 → ₱150.00");
  await userEvent.click(within(dialog).getByRole("button", { name: "Save payout settings" }));
  expect(within(dialog).getByRole("alert")).toHaveTextContent("Write why for the audit trail.");
  expect(updateSettings).not.toHaveBeenCalled();

  await userEvent.type(within(dialog).getByLabelText("Why"), "Earlier cut-off for the bank");
  await userEvent.click(within(dialog).getByRole("button", { name: "Save payout settings" }));
  await waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(1));
  const sent = updateSettings.mock.calls[0][0];
  expect(sent.expectedVersion).toBe(12);
  expect(sent.shopMoney).toMatchObject({ payoutTime: "15:30", minimumMinor: 15000, reminderTime: "17:00" });
  expect(sent.shopMoney).not.toHaveProperty("launchedAt");
  expect(sent.reason).toBe(
    "Daily shop payouts: payout time 16:00 → 15:30; minimum ₱100.00 → ₱150.00. Earlier cut-off for the bank",
  );
  expect(onSaved).toHaveBeenCalled();
  expect(await screen.findByRole("status")).toHaveTextContent(/next run uses these settings/);
});

it("stops a reminder that comes before the run, and a bad holiday", async () => {
  render(<ShopMoneySettings settings={settings} onSaved={vi.fn()} onConflict={vi.fn()} />);
  await userEvent.clear(field("Pay GRIDGO reminder"));
  await userEvent.type(field("Pay GRIDGO reminder"), "15:00");
  expect(screen.getByText("The reminder comes after the payout run.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Save payout settings" })).toBeDisabled();
  await userEvent.clear(field("Pay GRIDGO reminder"));
  await userEvent.type(field("Pay GRIDGO reminder"), "17:00");
  await userEvent.type(field("Holidays (no run)"), "2026-13-01");
  expect(screen.getByText(/“2026-13-01” is not a date/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Save payout settings" })).toBeDisabled();
});

it("reloads on a version conflict and says why", async () => {
  const onConflict = vi.fn();
  updateSettings.mockRejectedValue(new ApiError(409, { error: "settings_version_conflict" }));
  render(<ShopMoneySettings settings={settings} onSaved={vi.fn()} onConflict={onConflict} />);
  await userEvent.click(screen.getByRole("checkbox", { name: "Saturday" }));
  await userEvent.click(screen.getByRole("button", { name: "Save payout settings" }));
  const dialog = await screen.findByRole("alertdialog");
  await userEvent.type(within(dialog).getByLabelText("Why"), "Saturday runs");
  await userEvent.click(within(dialog).getByRole("button", { name: "Save payout settings" }));
  await waitFor(() => expect(onConflict).toHaveBeenCalled());
  expect(await screen.findByRole("alert")).toHaveTextContent(/Someone else saved settings/);
});

it("says so on an API without shop money", () => {
  render(<ShopMoneySettings settings={{ version: 1 } as PlatformSettings} onSaved={vi.fn()} onConflict={vi.fn()} />);
  expect(screen.getByTestId("shop-money-unavailable")).toBeInTheDocument();
});
