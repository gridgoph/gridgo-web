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
const { TesterInviteSettings } =
  await import("@/components/settings/TesterInviteSettings");

const FORM = "https://forms.example.test/signup?entry.123={code}";
const settings: PlatformSettings = {
  version: 4,
  issueWindowHours: 24,
  serviceFeeRateBps: 1000,
  deliveryFeeBands: deliveryZones(),
  hubPickup: { schedule: null, feeMinor: 0 },
  foundingTesterLaunchAt: null,
  testerMonthlyBudgetMinor: null,
  testerSignupFormUrlTemplate: null,
};
const card = () =>
  within(screen.getByRole("region", { name: "Founding Tester invites and budget" }));
const budget = () => card().getByLabelText("Monthly voucher budget (pesos)");
const form = () => card().getByLabelText("Tester sign-up form link");
const save = () => card().getByRole("button", { name: "Save invites and budget" });
const props = { settings, canEdit: true, onSaved: vi.fn(), onConflict: vi.fn() };
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it("shows an unset budget as no limit and an unset form as no shareable link", () => {
  render(<TesterInviteSettings {...props} />);
  expect(budget()).toHaveValue("");
  expect(card().getByText(/In force right now: No limit\./)).toBeInTheDocument();
  expect(
    card().getByText(/Clients can see their invite code but cannot copy or share a link/),
  ).toBeInTheDocument();
  expect(save()).toBeDisabled();
});

it("saves pesos as centavos and the form link on their own, with the version and a reason", async () => {
  getSettings.mockResolvedValue(settings);
  updateSettings.mockImplementation(async (input) => ({
    ...settings,
    ...input,
    version: 5,
  }));
  render(<OperationalSettings />);
  await screen.findByRole("region", { name: "Founding Tester invites and budget" });
  fireEvent.change(budget(), { target: { value: "1,500" } });
  fireEvent.change(form(), { target: { value: FORM } });
  expect(card().getByText(/A client shares a link like:/)).toHaveTextContent(
    "https://forms.example.test/signup?entry.123=EXAMPLECODE",
  );
  fireEvent.click(save());
  await waitFor(() =>
    expect(updateSettings).toHaveBeenCalledWith({
      expectedVersion: 4,
      testerMonthlyBudgetMinor: 150000,
      testerSignupFormUrlTemplate: FORM,
      reason:
        "Founding Tester invites: monthly budget no limit to ₱1,500.00; sign-up form link set",
    }),
  );
  expect(await card().findByRole("status")).toHaveTextContent("Saved.");
  expect(card().getByText(/In force right now: ₱1,500.00 a month/)).toBeInTheDocument();
});

it("sends only what changed, and No limit clears the budget to null", async () => {
  const stored = {
    ...settings,
    testerMonthlyBudgetMinor: 150000,
    testerSignupFormUrlTemplate: FORM,
  };
  updateSettings.mockResolvedValue({
    ...stored,
    testerMonthlyBudgetMinor: null,
    version: 5,
  });
  render(<TesterInviteSettings {...props} settings={stored} />);
  expect(budget()).toHaveValue("1500");
  expect(form()).toHaveValue(FORM);
  fireEvent.click(card().getByRole("button", { name: "No limit" }));
  fireEvent.click(save());
  await waitFor(() =>
    expect(updateSettings).toHaveBeenCalledWith({
      expectedVersion: 4,
      testerMonthlyBudgetMinor: null,
      reason: "Founding Tester invites: monthly budget ₱1,500.00 to no limit",
    }),
  );
});

it("explains a bad budget or form link before Save, and does not send it", () => {
  render(<TesterInviteSettings {...props} />);
  fireEvent.change(budget(), { target: { value: "-5" } });
  expect(card().getByText(/Type an amount in pesos/)).toBeInTheDocument();
  expect(save()).toBeDisabled();
  fireEvent.change(budget(), { target: { value: "" } });
  fireEvent.change(form(), { target: { value: "http://forms.example.test/s?e={code}" } });
  expect(card().getByText("The form link must start with https://.")).toBeInTheDocument();
  expect(save()).toBeDisabled();
  expect(updateSettings).not.toHaveBeenCalled();
});

it("shows the API's refusals in plain words beside the field", async () => {
  updateSettings.mockRejectedValueOnce(
    new ApiError(400, { error: "invalid_tester_signup_form_url" }),
  );
  render(<TesterInviteSettings {...props} />);
  fireEvent.change(form(), { target: { value: FORM } });
  fireEvent.click(save());
  expect(
    await card().findByText(
      "The form link must start with https:// and have {code} once, after the question mark.",
    ),
  ).toBeInTheDocument();

  updateSettings.mockRejectedValueOnce(
    new ApiError(400, { error: "invalid_tester_monthly_budget" }),
  );
  fireEvent.change(budget(), { target: { value: "10" } });
  fireEvent.click(save());
  expect(
    await card().findByText(/Type the budget in pesos, zero or more/),
  ).toBeInTheDocument();
  expect(screen.queryByText(/invalid_tester/)).toBeNull();
});

it("reloads a stale version and keeps what was typed", async () => {
  getSettings
    .mockResolvedValueOnce(settings)
    .mockResolvedValue({ ...settings, version: 6 });
  updateSettings.mockRejectedValueOnce(
    new ApiError(409, { error: "settings_version_conflict", version: 6 }),
  );
  render(<OperationalSettings />);
  await screen.findByRole("region", { name: "Founding Tester invites and budget" });
  fireEvent.change(budget(), { target: { value: "500" } });
  fireEvent.click(save());
  await card().findByText(/Someone else saved settings/);
  await waitFor(() => expect(getSettings).toHaveBeenCalledTimes(2));
  expect(budget()).toHaveValue("500");
  // The retry carries the reloaded version.
  updateSettings.mockResolvedValueOnce({
    ...settings,
    version: 7,
    testerMonthlyBudgetMinor: 50000,
  });
  fireEvent.click(save());
  await waitFor(() =>
    expect(updateSettings).toHaveBeenLastCalledWith(
      expect.objectContaining({ expectedVersion: 6, testerMonthlyBudgetMinor: 50000 }),
    ),
  );
});

it("says so on an API from before invites", () => {
  const {
    testerMonthlyBudgetMinor: _budget,
    testerSignupFormUrlTemplate: _form,
    ...older
  } = settings;
  void _budget;
  void _form;
  render(<TesterInviteSettings {...props} settings={older} />);
  expect(card().getByText(/These settings are not available yet/)).toBeInTheDocument();
  expect(card().queryByRole("button", { name: "Save invites and budget" })).toBeNull();
});

it("after a conflict, does not resend a field that was edited back to what it was", async () => {
  const stored = { ...settings, testerMonthlyBudgetMinor: 150000 };
  getSettings
    .mockResolvedValueOnce(stored)
    .mockResolvedValue({ ...stored, version: 6, testerMonthlyBudgetMinor: 300000 });
  updateSettings.mockRejectedValueOnce(
    new ApiError(409, { error: "settings_version_conflict", version: 6 }),
  );
  render(<OperationalSettings />);
  await screen.findByRole("region", { name: "Founding Tester invites and budget" });
  // The budget is changed and changed back; only the form link is a real edit.
  fireEvent.change(budget(), { target: { value: "2000" } });
  fireEvent.change(budget(), { target: { value: "1,500" } });
  fireEvent.change(form(), { target: { value: FORM } });
  fireEvent.click(save());
  await waitFor(() =>
    expect(updateSettings).toHaveBeenCalledWith({
      expectedVersion: 4,
      testerSignupFormUrlTemplate: FORM,
      reason: "Founding Tester invites: sign-up form link set",
    }),
  );
  await card().findByText(/Someone else saved settings/);
  // The other person's budget shows; the form link draft stays.
  await waitFor(() => expect(budget()).toHaveValue("3000"));
  expect(form()).toHaveValue(FORM);
  updateSettings.mockResolvedValueOnce({
    ...stored,
    version: 7,
    testerMonthlyBudgetMinor: 300000,
    testerSignupFormUrlTemplate: FORM,
  });
  fireEvent.click(save());
  await waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(2));
  expect(updateSettings).toHaveBeenLastCalledWith({
    expectedVersion: 6,
    testerSignupFormUrlTemplate: FORM,
    reason: "Founding Tester invites: sign-up form link set",
  });
});

it("will not save over settings it could not re-read after a conflict, and retries the read", async () => {
  getSettings
    .mockResolvedValueOnce(settings)
    .mockRejectedValueOnce(new ApiError(503, { error: "service_unavailable" }))
    .mockResolvedValue({ ...settings, version: 6 });
  updateSettings.mockRejectedValueOnce(
    new ApiError(409, { error: "settings_version_conflict", version: 6 }),
  );
  render(<OperationalSettings />);
  await screen.findByRole("region", { name: "Founding Tester invites and budget" });
  fireEvent.change(budget(), { target: { value: "500" } });
  fireEvent.click(save());
  expect(
    await card().findByText(/the latest settings could not be read\. Retry reading them/),
  ).toBeInTheDocument();
  const banner = screen
    .getAllByRole("alert")
    .find((node) => /These may be out of date/.test(node.textContent ?? ""));
  expect(banner).toBeDefined();
  expect(card().getAllByText(/Last read \(may be out of date\):/).length).toBeGreaterThan(
    0,
  );
  expect(save()).toBeDisabled();
  expect(budget()).toHaveValue("500");

  fireEvent.click(within(banner!).getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(save()).toBeEnabled());
  expect(screen.queryByText(/These may be out of date/)).toBeNull();
  updateSettings.mockResolvedValueOnce({
    ...settings,
    version: 7,
    testerMonthlyBudgetMinor: 50000,
  });
  fireEvent.click(save());
  await waitFor(() =>
    expect(updateSettings).toHaveBeenLastCalledWith(
      expect.objectContaining({ expectedVersion: 6, testerMonthlyBudgetMinor: 50000 }),
    ),
  );
});
