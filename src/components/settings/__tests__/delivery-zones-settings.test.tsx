// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { afterEach, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/client";
import { deliveryZones } from "@/test/delivery-zones";

vi.stubGlobal("React", React);
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
  version: 6,
  issueWindowHours: 24,
  serviceFeeRateBps: 1000,
  riderCommissionBps: 8500,
  deliveryFeeBands: deliveryZones(),
};

function zoneRow(zone: string) {
  return within(screen.getByTestId(`zone-${zone}`));
}

it("shows the four fixed zones as named rows with their prices", async () => {
  getSettings.mockResolvedValue(stored);
  render(<OperationalSettings />);

  expect(await screen.findByLabelText("Nearby flat fee")).toHaveValue("25.00");
  const rows = within(screen.getByRole("region", { name: "Delivery distance zones" }))
    .getAllByRole("listitem");
  expect(rows.map((row) => within(row).getByRole("heading").textContent)).toEqual([
    "Nearby",
    "Away",
    "Long Distance",
    "Out of Zone",
  ]);
  expect(zoneRow("nearby").getByText("0–5 km")).toBeInTheDocument();
  expect(zoneRow("away").getByText("5–10 km")).toBeInTheDocument();
  expect(zoneRow("long_distance").getByText("10–15 km")).toBeInTheDocument();
  expect(zoneRow("out_of_zone").getByText("Over 15 km")).toBeInTheDocument();

  expect(screen.getByLabelText("Away flat fee")).toHaveValue("50.00");
  expect(screen.getByLabelText("Long Distance flat fee")).toHaveValue("75.00");
  expect(screen.getByLabelText("Out of Zone base fee")).toHaveValue("75.00");
  expect(screen.getByLabelText("Out of Zone per kilometre")).toHaveValue("10.00");
  // Out of Zone has no flat fee, and nothing adds, removes or renames a zone.
  expect(screen.queryByLabelText("Out of Zone flat fee")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /add|remove/i })).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/km\)/)).not.toBeInTheDocument();
});

it("marks the shipped prices as placeholders", async () => {
  getSettings.mockResolvedValue({
    ...stored,
    deliveryFeeBands: deliveryZones({ nearby: 3000, away: 6000 }),
  });
  render(<OperationalSettings />);

  await screen.findByLabelText("Nearby flat fee");
  expect(screen.getByTestId("zones-placeholder-note")).toHaveTextContent(
    "Prices marked Placeholder are the starting figures the API shipped with",
  );
  expect(zoneRow("nearby").queryByText("Placeholder")).not.toBeInTheDocument();
  expect(zoneRow("away").queryByText("Placeholder")).not.toBeInTheDocument();
  expect(zoneRow("long_distance").getByText("Placeholder")).toBeInTheDocument();
  expect(zoneRow("out_of_zone").getByText("Placeholder")).toBeInTheDocument();
});

it("prices an Out of Zone delivery as the fields are typed", async () => {
  getSettings.mockResolvedValue(stored);
  render(<OperationalSettings />);

  const example = await screen.findByTestId("out-of-zone-example");
  expect(example).toHaveTextContent("16.2 km counts as 17 km: ₱75 + 17 × ₱10 = ₱245");

  fireEvent.change(screen.getByLabelText("Out of Zone base fee"), { target: { value: "90" } });
  fireEvent.change(screen.getByLabelText("Out of Zone per kilometre"), {
    target: { value: "12.50" },
  });
  expect(example).toHaveTextContent("16.2 km counts as 17 km: ₱90 + 17 × ₱12.50 = ₱302.50");

  // An unreadable field falls back to the price in force, so the sum never goes blank.
  fireEvent.change(screen.getByLabelText("Out of Zone per kilometre"), {
    target: { value: "ten" },
  });
  expect(example).toHaveTextContent("₱90 + 17 × ₱10 = ₱260");
  expect(screen.getByLabelText("Out of Zone per kilometre")).toHaveAttribute("aria-invalid", "true");
});

it("saves every price as the full four-zone table through the version handshake", async () => {
  getSettings.mockResolvedValue(stored);
  const saved = deliveryZones({
    nearby: 3000,
    away: 6000,
    long_distance: 9000,
    baseFeeMinor: 8000,
    perKmMinor: 1200,
  });
  updateSettings.mockResolvedValue({ ...stored, version: 7, deliveryFeeBands: saved });
  render(<OperationalSettings />);

  fireEvent.change(await screen.findByLabelText("Nearby flat fee"), { target: { value: "30" } });
  fireEvent.change(screen.getByLabelText("Away flat fee"), { target: { value: "60" } });
  fireEvent.change(screen.getByLabelText("Long Distance flat fee"), { target: { value: "90.00" } });
  fireEvent.change(screen.getByLabelText("Out of Zone base fee"), { target: { value: "80" } });
  fireEvent.change(screen.getByLabelText("Out of Zone per kilometre"), { target: { value: "12" } });
  expect(zoneRow("nearby").getByText("In force now: ₱25.00")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

  await waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(1));
  const input = updateSettings.mock.calls[0][0];
  expect(input.expectedVersion).toBe(6);
  expect(input.deliveryFeeBands).toEqual(saved);
  expect(input.reason).toBe(
    "Updated from the portal: delivery zones Nearby ₱25.00 to ₱30.00, Away ₱50.00 to ₱60.00, Long Distance ₱75.00 to ₱90.00, Out of Zone ₱75.00 + ₱10.00 per km to ₱80.00 + ₱12.00 per km",
  );

  expect(await screen.findByText(/price delivery from these zones/)).toBeInTheDocument();
  expect(screen.getByLabelText("Out of Zone per kilometre")).toHaveValue("12.00");
  expect(screen.queryByText("Placeholder")).not.toBeInTheDocument();
  expect(screen.queryByTestId("zones-placeholder-note")).not.toBeInTheDocument();
  expect(screen.queryByText(/In force now/)).not.toBeInTheDocument();
});

it("refuses an unreadable price before sending anything", async () => {
  getSettings.mockResolvedValue(stored);
  render(<OperationalSettings />);

  fireEvent.change(await screen.findByLabelText("Away flat fee"), { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Away needs a fee in pesos, like 50.00.",
  );
  expect(updateSettings).not.toHaveBeenCalled();
});

it("keeps the typed prices when someone else saved first, and takes theirs everywhere else", async () => {
  getSettings
    .mockResolvedValueOnce(stored)
    .mockResolvedValueOnce({
      ...stored,
      version: 7,
      deliveryFeeBands: deliveryZones({ nearby: 3500, away: 6500 }),
    });
  updateSettings.mockRejectedValueOnce(new ApiError(409, { error: "settings_version_conflict" }));
  render(<OperationalSettings />);

  fireEvent.change(await screen.findByLabelText("Nearby flat fee"), { target: { value: "30" } });
  fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Someone else saved these settings a moment ago.",
  );
  await waitFor(() => expect(zoneRow("nearby").getByText("In force now: ₱35.00")).toBeInTheDocument());
  expect(screen.getByLabelText("Nearby flat fee")).toHaveValue("30");
  expect(zoneRow("nearby").queryByText("Placeholder")).not.toBeInTheDocument();
  // Their Away price was not touched here, so it moves with the reload.
  expect(screen.getByLabelText("Away flat fee")).toHaveValue("65.00");

  updateSettings.mockResolvedValueOnce({
    ...stored,
    version: 8,
    deliveryFeeBands: deliveryZones({ nearby: 3000, away: 6500 }),
  });
  fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
  await waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(2));
  expect(updateSettings.mock.calls[1][0].deliveryFeeBands).toEqual(
    deliveryZones({ nearby: 3000, away: 6500 }),
  );
  expect(updateSettings.mock.calls[1][0]).toMatchObject({
    expectedVersion: 7,
    reason: "Updated from the portal: delivery zones Nearby ₱35.00 to ₱30.00",
  });
});

it("discards typed prices back to the ones in force", async () => {
  getSettings.mockResolvedValue(stored);
  render(<OperationalSettings />);

  fireEvent.change(await screen.findByLabelText("Out of Zone base fee"), {
    target: { value: "100" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));

  expect(screen.getByLabelText("Out of Zone base fee")).toHaveValue("75.00");
  expect(screen.getByRole("button", { name: "Save settings" })).toBeDisabled();
});

it("shows an older API's bands without offering edits it would not understand", async () => {
  const legacy = [
    { maxDistanceMeters: 4999, feeMinor: 2500 },
    { maxDistanceMeters: 10000, feeMinor: 5000 },
    { maxDistanceMeters: null, feeMinor: 7500 },
  ];
  getSettings.mockResolvedValue({ ...stored, deliveryFeeBands: legacy });
  updateSettings.mockResolvedValue({ ...stored, version: 7, deliveryFeeBands: legacy });
  render(<OperationalSettings />);

  expect(await screen.findByTestId("zones-unavailable")).toHaveTextContent(
    "still prices delivery by its older distance bands",
  );
  expect(screen.queryByLabelText("Nearby flat fee")).not.toBeInTheDocument();
  expect(screen.getByText("Over 10 km")).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("Hours after delivery"), { target: { value: "48" } });
  fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
  await waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(1));
  expect(updateSettings.mock.calls[0][0].deliveryFeeBands).toEqual(legacy);
});
