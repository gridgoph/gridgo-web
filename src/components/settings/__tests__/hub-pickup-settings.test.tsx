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

vi.stubGlobal("React", React);
class FakePointerEvent extends MouseEvent {
  constructor(type: string, params: MouseEventInit = {}) {
    super(type, params);
  }
}
vi.stubGlobal("PointerEvent", FakePointerEvent);
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => {} }));
const getSettings = vi.hoisted(() => vi.fn());
const updateSettings = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  getSettings,
  updateSettings,
}));
const { OperationalSettings } = await import("@/components/settings/OperationalSettings");
const { HubPickupSettings } = await import("@/components/settings/HubPickupSettings");

afterEach(() => {
  cleanup();
  getSettings.mockReset();
  updateSettings.mockReset();
});

const point = { lat: 7.09, lng: 125.61, label: "GRIDGO Office" };
const unset = {
  version: 4,
  issueWindowHours: 24,
  serviceFeeRateBps: 1000,
  deliveryFeeBands: [{ maxDistanceMeters: null, feeMinor: 2500 }],
  hubPickup: { point, schedule: null, feeMinor: 0 },
};
const mwf = {
  utcOffsetMinutes: 480,
  week: [1, 3, 5].map((weekday) => ({ weekday, opensMinute: 540, closesMinute: 1020 })),
  closures: [{ startDay: "2026-12-25", endDay: "2026-12-25" }],
};

function hubCard() {
  return screen.getByRole("heading", { name: "Hub pick-up" }).closest("section")!;
}

it("lets Super Admin set the hours from unset and saves the whole object through the handshake", async () => {
  getSettings.mockResolvedValue(unset);
  updateSettings.mockImplementation(async (input) => ({
    ...unset,
    version: 5,
    hubPickup: { point, ...input.hubPickup },
  }));
  render(<OperationalSettings />);

  await screen.findByRole("heading", { name: "Hub pick-up" });
  const card = hubCard();
  expect(within(card).getByTestId("hub-hours-unset")).toHaveTextContent("not set");
  expect(within(card).getByTestId("hub-fee-in-force")).toHaveTextContent("Free (₱0.00)");

  fireEvent.click(within(card).getByRole("button", { name: "Set opening hours" }));
  const save = within(card).getByRole("button", { name: "Save hub pick-up" });
  // A configured week with no open day is refused before it is sent.
  expect(within(card).getByTestId("hub-problem")).toHaveTextContent(/at least one day/);
  expect(save).toBeDisabled();

  fireEvent.click(within(card).getByRole("button", { name: "Add hours on Monday" }));
  fireEvent.change(within(card).getByLabelText("Monday closes"), {
    target: { value: "18:00" },
  });
  expect(save).toBeEnabled();
  fireEvent.click(save);

  await waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(1));
  expect(updateSettings).toHaveBeenCalledWith({
    expectedVersion: 4,
    hubPickup: {
      feeMinor: 0,
      schedule: {
        utcOffsetMinutes: 480,
        week: [{ weekday: 1, opensMinute: 540, closesMinute: 1080 }],
        closures: [],
      },
    },
    reason: "Hub pick-up: opening hours updated",
  });
  expect(
    await within(card).findByText(/Saved. New pick-up orders use these hours/),
  ).toBeInTheDocument();
});

it("warns before a first pick-up charge and reloads on a version conflict", async () => {
  getSettings.mockResolvedValue(unset);
  updateSettings.mockRejectedValue(
    new ApiError(409, { error: "settings_version_conflict" }),
  );
  render(<OperationalSettings />);
  await screen.findByRole("heading", { name: "Hub pick-up" });
  const card = hubCard();

  fireEvent.change(within(card).getByLabelText("Pick-up fee (₱)"), {
    target: { value: "25" },
  });
  expect(within(card).getByTestId("hub-new-charge")).toHaveTextContent(
    /starts charging clients/,
  );
  fireEvent.click(within(card).getByRole("button", { name: "Save hub pick-up" }));

  expect(
    await within(card).findByText(/Someone else saved settings/),
  ).toBeInTheDocument();
  expect(updateSettings.mock.calls[0][0]).toMatchObject({
    hubPickup: { feeMinor: 2500, schedule: null },
    reason: "Hub pick-up: fee ₱0.00 to ₱25.00",
  });
  expect(getSettings).toHaveBeenCalledTimes(2);
});

it("draws the card without controls when it cannot edit", () => {
  render(
    <HubPickupSettings
      settings={{ ...unset, hubPickup: { point, schedule: mwf, feeMinor: 2000 } }}
      canEdit={false}
      onSaved={() => {}}
      onConflict={() => {}}
    />,
  );
  const card = hubCard();
  expect(within(card).getByText("Mon, Wed, Fri: 9:00 AM to 5:00 PM")).toBeInTheDocument();
  expect(within(card).getByText(/Closed Dec 25, 2026/)).toBeInTheDocument();
  expect(within(card).getByTestId("hub-fee-in-force")).toHaveTextContent("₱20.00");
  expect(within(card).queryByRole("textbox")).not.toBeInTheDocument();
  expect(within(card).queryByRole("button")).not.toBeInTheDocument();
  expect(within(card).getByText("Only Super Admin changes these.")).toBeInTheDocument();
});

it("says so when the API has no hub settings", async () => {
  const { hubPickup: _omit, ...older } = unset;
  void _omit;
  getSettings.mockResolvedValue(older);
  render(<OperationalSettings />);
  expect(await screen.findByTestId("hub-unavailable")).toBeInTheDocument();
});

it.each([false, true])(
  "saves pickup availability from %s with version and audited reason",
  async (enabled) => {
    getSettings.mockResolvedValue({ ...unset, hubPickupEnabled: enabled });
    updateSettings.mockImplementation(async (input) => ({
      ...unset,
      ...input,
      version: 5,
    }));
    render(<OperationalSettings />);
    const toggle = await screen.findByRole("switch", {
      name: "Allow hub pick-up for new orders",
    });
    expect(toggle).toHaveAttribute("aria-checked", String(enabled));
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole("button", { name: "Save hub pick-up" }));
    await waitFor(() =>
      expect(updateSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          expectedVersion: 4,
          hubPickupEnabled: !enabled,
          reason: expect.stringContaining(enabled ? "disabled" : "enabled"),
        }),
      ),
    );
  },
);

it("defaults missing pickup availability to off and discards an unsaved toggle", async () => {
  getSettings.mockResolvedValue(unset);
  render(<OperationalSettings />);
  const toggle = await screen.findByRole("switch", {
    name: "Allow hub pick-up for new orders",
  });
  expect(toggle).toHaveAttribute("aria-checked", "false");
  fireEvent.click(toggle);
  fireEvent.click(within(hubCard()).getByRole("button", { name: "Discard" }));
  expect(toggle).toHaveAttribute("aria-checked", "false");
  expect(updateSettings).not.toHaveBeenCalled();
});
