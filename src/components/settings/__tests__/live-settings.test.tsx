// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { LiveContext, type LiveContextValue } from "@/lib/live/LiveProvider";
import type { InvalidatePing } from "@/lib/api/types";

vi.stubGlobal("React", React);
const { OperationalSettings } = await import("@/components/settings/OperationalSettings");
const getSettings = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  getSettings,
}));
afterEach(cleanup);

it("updates clean settings fields and retains edited fields on live refresh", async () => {
  getSettings
    .mockResolvedValueOnce({
      issueWindowHours: 24,
      deliveryFeeBands: [{ maxDistanceMeters: null, feeMinor: 2500 }],
    })
    .mockResolvedValueOnce({
      issueWindowHours: 36,
      deliveryFeeBands: [{ maxDistanceMeters: null, feeMinor: 5000 }],
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
  expect(await screen.findByLabelText("Hours after delivery")).toHaveValue(
    "24",
  );
  fireEvent.change(screen.getByLabelText("Hours after delivery"), {
    target: { value: "48" },
  });
  await act(async () => {
    listener({ resource: "settings" });
  });
  await waitFor(() =>
    expect(screen.getByLabelText("Fee (₱)")).toHaveValue("50.00"),
  );
  expect(screen.getByLabelText("Hours after delivery")).toHaveValue("48");
});
