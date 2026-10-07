// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, expect, it, vi } from "vitest";

vi.stubGlobal("React", React);

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

const stored = {
  version: 4,
  issueWindowHours: 24,
  serviceFeeRateBps: 1000,
  deliveryFeeBands: [{ maxDistanceMeters: null, feeMinor: 2500 }],
};

it("starts off when the API has no printed-invoice switch and saves it on", async () => {
  getSettings.mockResolvedValue(stored);
  updateSettings.mockImplementation(async (input: { physicalInvoiceRequestsEnabled?: boolean }) => ({
    ...stored,
    version: 5,
    physicalInvoiceRequestsEnabled: input.physicalInvoiceRequestsEnabled,
  }));
  render(<OperationalSettings />);

  const toggle = await screen.findByRole("switch", { name: "Accept physical invoice requests" });
  expect(toggle).not.toHaveAttribute("data-checked");
  fireEvent.click(toggle);
  fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

  await waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(1));
  expect(updateSettings.mock.calls[0][0]).toMatchObject({
    expectedVersion: 4,
    physicalInvoiceRequestsEnabled: true,
  });
  expect(updateSettings.mock.calls[0][0].reason).toMatch(/physical invoice requests off to on/);
});

it("saves the switch off again", async () => {
  getSettings.mockResolvedValue({ ...stored, physicalInvoiceRequestsEnabled: true });
  updateSettings.mockImplementation(async (input: { physicalInvoiceRequestsEnabled?: boolean }) => ({
    ...stored,
    version: 5,
    physicalInvoiceRequestsEnabled: input.physicalInvoiceRequestsEnabled,
  }));
  render(<OperationalSettings />);

  const toggle = await screen.findByRole("switch", { name: "Accept physical invoice requests" });
  expect(toggle).toHaveAttribute("data-checked");
  fireEvent.click(toggle);
  fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

  await waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(1));
  expect(updateSettings.mock.calls[0][0].physicalInvoiceRequestsEnabled).toBe(false);
  expect(updateSettings.mock.calls[0][0].reason).toMatch(/physical invoice requests on to off/);
});
