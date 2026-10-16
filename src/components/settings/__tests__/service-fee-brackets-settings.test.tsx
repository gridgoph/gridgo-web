// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { afterEach, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/client";
import { bracketSchedule, localPreview, SHIPPED_BRACKETS } from "@/lib/service-fee-brackets";

vi.stubGlobal("React", React);
// Base UI's radio dispatches a PointerEvent on click. jsdom does not implement it.
class FakePointerEvent extends MouseEvent {
  constructor(type: string, params: MouseEventInit = {}) {
    super(type, params);
  }
}
vi.stubGlobal("PointerEvent", FakePointerEvent);
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => {} }));
const getSettings = vi.hoisted(() => vi.fn());
const updateSettings = vi.hoisted(() => vi.fn());
const previewServiceFee = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  getSettings,
  updateSettings,
  previewServiceFee,
}));
const { OperationalSettings } = await import("@/components/settings/OperationalSettings");
const { ServiceFeeBrackets } = await import("@/components/settings/ServiceFeeBrackets");

afterEach(() => {
  cleanup();
  getSettings.mockReset();
  updateSettings.mockReset();
  previewServiceFee.mockReset();
});

const shipped = bracketSchedule(SHIPPED_BRACKETS);
const NOW = new Date("2026-10-15T02:00:00Z");
const stored = {
  version: 43,
  issueWindowHours: 24,
  serviceFeeRateBps: 1000,
  organizationDiscountRateBps: 500,
  deliveryFeeBands: [{ maxDistanceMeters: null, feeMinor: 2500 }],
  serviceFeeSchedule: shipped,
  scheduledServiceFee: null,
};

/** What the API answers for a proposal: today's table against it. */
function previewFor(proposed: typeof shipped) {
  return {
    version: 43,
    current: shipped,
    proposed,
    examples: localPreview(shipped, proposed),
  };
}

function renderCard(settings = stored) {
  const onSaved = vi.fn();
  const onConflict = vi.fn();
  render(
    <ServiceFeeBrackets
      settings={settings as never}
      canEdit
      onSaved={onSaved}
      onConflict={onConflict}
      now={() => NOW}
    />,
  );
  return { onSaved, onConflict };
}

it("previews a rate change on the six reference prices through the API", async () => {
  const proposed = bracketSchedule([
    { upToMinor: 200_000, rateBps: 4_000 },
    { upToMinor: 2_000_000, rateBps: 2_500 },
    { upToMinor: null, rateBps: 1_500 },
  ]);
  previewServiceFee.mockResolvedValue(previewFor(proposed));
  renderCard();

  const preview = screen.getByTestId("service-fee-preview");
  // Before any edit: the table in force, worked out locally.
  expect(within(preview).getAllByText("₱2,000.00 × 45% + ₱3,000.00 × 25%").length).toBeGreaterThan(0);

  fireEvent.change(screen.getByLabelText("Rate on that part, bracket 1"), {
    target: { value: "40" },
  });
  await waitFor(() => expect(previewServiceFee).toHaveBeenCalledTimes(1), { timeout: 2000 });
  expect(previewServiceFee).toHaveBeenCalledWith({
    expectedVersion: 43,
    serviceFeeBrackets: proposed.brackets,
  });
  await screen.findByText("Today's table against yours, worked out by the API on six reference prices.");
  const table = within(screen.getByTestId("service-fee-preview")).getByRole("table");
  const row = within(table).getByRole("row", { name: /₱5,000\.00/ });
  // ₱1,650 today; ₱2,000 × 40% + ₱3,000 × 25% = ₱1,550 after.
  expect(row).toHaveTextContent("₱1,650.00");
  expect(row).toHaveTextContent("₱1,550.00");
  expect(row).toHaveTextContent("−₱100.00");
  expect(row).toHaveTextContent("₱2,000.00 × 40% + ₱3,000.00 × 25%");
});

it("needs a reason, confirms, then saves the whole table through the handshake", async () => {
  previewServiceFee.mockImplementation(async ({ serviceFeeBrackets }) =>
    previewFor(bracketSchedule(serviceFeeBrackets)),
  );
  const saved = {
    ...stored,
    version: 44,
    serviceFeeSchedule: {
      ...bracketSchedule([
        { upToMinor: 200_000, rateBps: 4_500 },
        { upToMinor: 2_000_000, rateBps: 2_000 },
        { upToMinor: null, rateBps: 1_500 },
      ]),
      settingsVersion: 44,
      effectiveFrom: NOW.toISOString(),
    },
  };
  updateSettings.mockResolvedValue(saved);
  const { onSaved } = renderCard();

  fireEvent.change(screen.getByLabelText("Rate on that part, bracket 2"), {
    target: { value: "20" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save service fee" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Write why the fee is changing");
  expect(updateSettings).not.toHaveBeenCalled();

  fireEvent.change(screen.getByLabelText("Why the fee is changing"), {
    target: { value: "Report 5A07D2C2" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save service fee" }));
  const dialog = await screen.findByRole("alertdialog");
  expect(within(dialog).getByText("Change the service fee now?")).toBeVisible();
  expect(within(dialog).getByText("₱2,000 to ₱20,000").nextSibling).toHaveTextContent("20%");
  expect(within(dialog).getByTestId("service-fee-confirm-terms")).toHaveTextContent(
    "Report 5A07D2C2",
  );
  fireEvent.click(within(dialog).getByRole("button", { name: "Change the fee now" }));

  await waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(1));
  expect(updateSettings).toHaveBeenCalledWith({
    expectedVersion: 43,
    serviceFeeBrackets: [
      { upToMinor: 200_000, rateBps: 4_500 },
      { upToMinor: 2_000_000, rateBps: 2_000 },
      { upToMinor: null, rateBps: 1_500 },
    ],
    reason: "Report 5A07D2C2",
  });
  expect(onSaved).toHaveBeenCalledWith(saved);
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Saved. Orders priced from now on use 45% to ₱2,000, 20% to ₱20,000, 15% above.",
  );
});

it("schedules a change for a Manila date and time", async () => {
  previewServiceFee.mockImplementation(async ({ serviceFeeBrackets }) =>
    previewFor(bracketSchedule(serviceFeeBrackets)),
  );
  updateSettings.mockResolvedValue({
    ...stored,
    version: 44,
    scheduledServiceFee: {
      ...bracketSchedule([{ upToMinor: null, rateBps: 3_000 }]),
      effectiveFrom: "2026-11-30T16:00:00.000Z",
    },
  });
  renderCard();

  // Down to one bracket: remove the two above the first, which then covers every peso.
  fireEvent.click(screen.getByRole("button", { name: "Remove bracket 3" }));
  fireEvent.click(screen.getByRole("button", { name: "Remove bracket 2" }));
  expect(screen.getByText("Every peso of the shop price")).toBeVisible();
  fireEvent.change(screen.getByLabelText("Rate on that part, bracket 1"), {
    target: { value: "30" },
  });
  fireEvent.click(screen.getByText("On a date and time (Manila)"));
  fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2026-12-01" } });
  fireEvent.change(screen.getByLabelText("Start time"), { target: { value: "00:00" } });
  fireEvent.change(screen.getByLabelText("Why the fee is changing"), {
    target: { value: "Holiday pricing" },
  });

  await waitFor(() =>
    expect(previewServiceFee).toHaveBeenLastCalledWith({
      expectedVersion: 43,
      serviceFeeBrackets: [{ upToMinor: null, rateBps: 3_000 }],
      serviceFeeEffectiveFrom: "2026-12-01T00:00:00+08:00",
    }),
  { timeout: 2000 });

  fireEvent.click(screen.getByRole("button", { name: "Save service fee" }));
  const dialog = await screen.findByRole("alertdialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Schedule the change" }));
  await waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(1));
  expect(updateSettings).toHaveBeenCalledWith({
    expectedVersion: 43,
    serviceFeeBrackets: [{ upToMinor: null, rateBps: 3_000 }],
    serviceFeeEffectiveFrom: "2026-12-01T00:00:00+08:00",
    reason: "Holiday pricing",
  });
});

it("refuses a start that has already passed before asking the API", () => {
  renderCard();
  fireEvent.click(screen.getByText("On a date and time (Manila)"));
  fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2026-10-01" } });
  fireEvent.change(screen.getByLabelText("Why the fee is changing"), { target: { value: "x" } });
  fireEvent.click(screen.getByRole("button", { name: "Save service fee" }));
  expect(screen.getByRole("alert")).toHaveTextContent("That time has passed.");
  expect(updateSettings).not.toHaveBeenCalled();
});

it("names a limit that does not go up, on its own row", () => {
  renderCard();
  fireEvent.change(screen.getByLabelText("Up to, bracket 2, in pesos"), {
    target: { value: "1500" },
  });
  expect(within(screen.getByTestId("service-fee-bracket-1")).getByRole("alert")).toHaveTextContent(
    "Bracket 2 must end above ₱2,000.00, where bracket 1 ends.",
  );
  expect(screen.getByRole("button", { name: "Save service fee" })).toBeDisabled();
});

it("reloads underneath when someone saved first", async () => {
  previewServiceFee.mockResolvedValue(previewFor(shipped));
  updateSettings.mockRejectedValue(
    new ApiError(409, { error: "settings_version_conflict", version: 44 }),
  );
  const { onConflict } = renderCard();
  fireEvent.change(screen.getByLabelText("Rate on that part, bracket 3"), {
    target: { value: "10" },
  });
  fireEvent.change(screen.getByLabelText("Why the fee is changing"), { target: { value: "x" } });
  fireEvent.click(screen.getByRole("button", { name: "Save service fee" }));
  fireEvent.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Change the fee now" }),
  );
  await waitFor(() => expect(onConflict).toHaveBeenCalled());
  expect(screen.getByRole("alert")).toHaveTextContent("Someone else saved settings a moment ago.");
});

it("shows a scheduled change and withdraws it by saving today's table now", async () => {
  const pending = {
    ...bracketSchedule([{ upToMinor: null, rateBps: 3_000 }]),
    effectiveFrom: "2026-11-30T16:00:00.000Z",
  };
  updateSettings.mockResolvedValue({ ...stored, version: 44 });
  renderCard({ ...stored, scheduledServiceFee: pending } as never);

  const notice = screen.getByTestId("service-fee-scheduled");
  expect(notice).toHaveTextContent("30% on every peso");
  expect(notice).toHaveTextContent("Until then new orders are priced at 45% to ₱2,000");
  expect(screen.getByText("Change scheduled")).toBeVisible();

  fireEvent.click(within(notice).getByRole("button", { name: "Withdraw this change" }));
  fireEvent.click(screen.getByRole("button", { name: "Save service fee" }));
  const dialog = await screen.findByRole("alertdialog");
  expect(within(dialog).getByText("Withdraw the scheduled change?")).toBeVisible();
  fireEvent.click(within(dialog).getByRole("button", { name: "Withdraw the change" }));
  await waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(1));
  const body = updateSettings.mock.calls[0][0];
  expect(body.serviceFeeBrackets).toEqual(SHIPPED_BRACKETS);
  expect(body).not.toHaveProperty("serviceFeeEffectiveFrom");
  expect(body.reason).toMatch(/^Withdraw the change scheduled for /);
});

it("replaces the flat rate field on Operational settings and leaves it out of Save settings", async () => {
  getSettings.mockResolvedValue(stored);
  updateSettings.mockResolvedValue({ ...stored, version: 44, issueWindowHours: 48 });
  render(<OperationalSettings />);

  await screen.findByRole("region", { name: "Service fee" });
  expect(screen.queryByLabelText("Rate on the shop price")).toBeNull();
  expect(screen.getByRole("region", { name: "Service fee on checkout" })).toBeVisible();
  // A ₱1,000 job under the brackets carries ₱450; the organization's 5% (₱50) comes out of it.
  expect(screen.getByTestId("receipt-ops")).toHaveTextContent("₱450.00");
  expect(screen.getByTestId("organization-discount-example")).toHaveTextContent("₱400.00");

  fireEvent.change(screen.getByLabelText("Hours after delivery"), { target: { value: "48" } });
  fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
  await waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(1));
  expect(updateSettings.mock.calls[0][0]).not.toHaveProperty("serviceFeeRateBps");
  expect(updateSettings.mock.calls[0][0]).not.toHaveProperty("serviceFeeBrackets");
});

it("caps the organization discount at the fee instead of refusing it under brackets", async () => {
  getSettings.mockResolvedValue({ ...stored, serviceFeeRateBps: 300 });
  render(<OperationalSettings />);
  await screen.findByRole("region", { name: "Service fee" });
  // 5% is above the legacy 3% rate, but brackets price new orders: nothing to refuse.
  expect(screen.queryByTestId("organization-discount-problem")).toBeNull();
  expect(screen.getByRole("button", { name: "Save settings" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Discount on the shop price"), {
    target: { value: "60" },
  });
  // ₱600 off a ₱450 fee is capped at the fee.
  expect(screen.getByTestId("organization-discount-example")).toHaveTextContent("₱0.00");
  expect(screen.queryByTestId("organization-discount-problem")).toBeNull();
});
