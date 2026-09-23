// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { LiveContext, type LiveContextValue } from "@/lib/live/LiveProvider";
import type { InvalidatePing, ProductionNudge } from "@/lib/api/types";

vi.stubGlobal("React", React);

// Base UI's switch dispatches a PointerEvent on click. jsdom does not implement it.
class FakePointerEvent extends MouseEvent {
  constructor(type: string, params: MouseEventInit = {}) {
    super(type, params);
  }
}
vi.stubGlobal("PointerEvent", FakePointerEvent);
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

const nudge: ProductionNudge = {
  enabled: true,
  afterValue: 4,
  afterUnit: "hours",
  repeatValue: 4,
  repeatUnit: "hours",
  maxCount: 3,
};

const stored = {
  version: 4,
  issueWindowHours: 24,
  serviceFeeRateBps: 1000,
  deliveryFeeBands: [{ maxDistanceMeters: null, feeMinor: 2500 }],
  productionNudge: nudge,
};

it("loads the saved cadence and saves a new one", async () => {
  getSettings.mockResolvedValue(stored);
  updateSettings.mockImplementation(async (input: { productionNudge: ProductionNudge }) => ({
    ...stored,
    version: 5,
    productionNudge: input.productionNudge,
  }));
  render(<OperationalSettings />);
  expect(await screen.findByTestId("production-nudge-in-force")).toHaveTextContent(
    "First after 4 hours, then every 4 hours, up to 3 times.",
  );
  fireEvent.change(screen.getByLabelText("First reminder after"), { target: { value: "2" } });
  fireEvent.change(screen.getByLabelText("First reminder after unit"), { target: { value: "days" } });
  fireEvent.change(screen.getByLabelText("Then remind every"), { target: { value: "12" } });
  fireEvent.change(screen.getByLabelText("Stop after"), { target: { value: "5" } });
  fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
  await waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(1));
  expect(updateSettings.mock.calls[0][0].productionNudge).toEqual({
    enabled: true,
    afterValue: 2,
    afterUnit: "days",
    repeatValue: 12,
    repeatUnit: "hours",
    maxCount: 5,
  });
});

it("refuses a wait the API would refuse before sending anything", async () => {
  getSettings.mockResolvedValue(stored);
  render(<OperationalSettings />);
  fireEvent.change(await screen.findByLabelText("First reminder after"), { target: { value: "0" } });
  fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("First reminder is a whole number from 1 to 720");
  expect(updateSettings).not.toHaveBeenCalled();
});

it("sends enabled false when the reminder is turned off", async () => {
  getSettings.mockResolvedValue(stored);
  updateSettings.mockImplementation(async (input: { productionNudge: ProductionNudge }) => ({
    ...stored,
    version: 5,
    productionNudge: input.productionNudge,
  }));
  render(<OperationalSettings />);
  fireEvent.click(await screen.findByRole("switch", { name: "Enabled" }));
  fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
  await waitFor(() => expect(updateSettings).toHaveBeenCalled());
  expect(updateSettings.mock.calls[0][0].productionNudge.enabled).toBe(false);
});

it("keeps an in-progress reminder draft when settings reload", async () => {
  getSettings
    .mockResolvedValueOnce(stored)
    .mockResolvedValueOnce({
      ...stored,
      version: 5,
      issueWindowHours: 36,
      productionNudge: { ...nudge, afterValue: 8 },
    });
  let listener!: (ping: InvalidatePing) => void;
  const live: LiveContextValue = {
    notifications: [],
    unreadCount: 0,
    snapshot: null,
    live: true,
    subscribe: (next) => {
      listener = next;
      return () => undefined;
    },
    markRead: async () => {},
    markAllRead: async () => {},
    remove: async () => {},
    refreshInbox: async () => {},
  };
  render(
    <LiveContext.Provider value={live}>
      <OperationalSettings />
    </LiveContext.Provider>,
  );
  fireEvent.change(await screen.findByLabelText("First reminder after"), { target: { value: "2" } });
  await act(async () => {
    listener({ resource: "settings" });
  });
  await waitFor(() => expect(screen.getByLabelText("Hours after delivery")).toHaveValue("36"));
  expect(screen.getByLabelText("First reminder after")).toHaveValue("2");
});
