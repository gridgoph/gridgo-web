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
// Base UI's switch and checkbox dispatch a PointerEvent on click. jsdom does not implement it.
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
const { ProductionPenalties } = await import("@/components/settings/ProductionPenalties");

afterEach(() => {
  cleanup();
  getSettings.mockReset();
  updateSettings.mockReset();
});

const penalty = {
  deductionsEnabled: false,
  minorBps: 500,
  moderateBps: 1500,
  severeBps: 3000,
};
const stored = {
  version: 7,
  issueWindowHours: 24,
  serviceFeeRateBps: 1000,
  deliveryFeeBands: [{ maxDistanceMeters: null, feeMinor: 2500 }],
  productionPenalty: penalty,
};

it("lets Super Admin save the three rates through the version handshake", async () => {
  getSettings.mockResolvedValue(stored);
  updateSettings.mockResolvedValue({
    ...stored,
    version: 8,
    productionPenalty: { ...penalty, minorBps: 800 },
  });
  render(<OperationalSettings />);

  const minor = await screen.findByLabelText("Share of what is still owed", {
    selector: "#penalty-rate-minor",
  });
  expect(minor).toHaveValue("5");
  expect(
    within(screen.getByTestId("penalty-tier-minor")).getByText(
      "₱500.00 off, ₱9,500.00 still paid",
    ),
  ).toBeInTheDocument();

  fireEvent.change(minor, { target: { value: "8" } });
  expect(
    within(screen.getByTestId("penalty-tier-minor")).getByText(
      "₱800.00 off, ₱9,200.00 still paid",
    ),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Save penalty rates" }));

  await waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(1));
  expect(updateSettings).toHaveBeenCalledWith({
    expectedVersion: 7,
    productionPenalty: {
      deductionsEnabled: false,
      minorBps: 800,
      moderateBps: 1500,
      severeBps: 3000,
    },
    reason: "Late-production penalties from the portal: minor 5% to 8%",
  });
  expect(
    await screen.findByText(/Saved. Late jobs from now on are warned at these rates/),
  ).toBeInTheDocument();
});

it("refuses a later tier that takes less before anything is sent", async () => {
  getSettings.mockResolvedValue(stored);
  render(<OperationalSettings />);

  fireEvent.change(
    await screen.findByLabelText("Share of what is still owed", {
      selector: "#penalty-rate-severe",
    }),
    {
      target: { value: "10" },
    },
  );
  expect(screen.getByTestId("penalty-problem")).toHaveTextContent(
    /A later tier can never take less/,
  );
  expect(screen.getByRole("button", { name: "Save penalty rates" })).toBeDisabled();
});

it("needs an explicit acknowledgement before turning real deductions on", async () => {
  getSettings.mockResolvedValue(stored);
  updateSettings.mockResolvedValue({
    ...stored,
    version: 8,
    productionPenalty: { ...penalty, deductionsEnabled: true },
  });
  render(<OperationalSettings />);

  expect(await screen.findByTestId("penalty-gate")).toHaveTextContent("Warnings only");
  fireEvent.click(screen.getByRole("switch", { name: "Deduct from shop payouts" }));

  const dialog = await screen.findByRole("alertdialog");
  expect(
    within(dialog).getByText("Deduct real money from shops' payouts?"),
  ).toBeInTheDocument();
  expect(within(dialog).getByTestId("penalty-confirm-terms")).toHaveTextContent(
    "5% / 15% / 30%",
  );
  const turnOn = within(dialog).getByRole("button", { name: "Turn on deductions" });
  expect(turnOn).toBeDisabled();
  expect(updateSettings).not.toHaveBeenCalled();

  fireEvent.click(within(dialog).getByRole("checkbox"));
  expect(turnOn).toBeEnabled();
  fireEvent.click(turnOn);

  await waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(1));
  expect(updateSettings).toHaveBeenCalledWith({
    expectedVersion: 7,
    productionPenalty: { ...penalty, deductionsEnabled: true },
    reason: "Late-production penalties from the portal: real deductions turned on",
  });
});

it("keeps deductions off when the dialog is dismissed", async () => {
  getSettings.mockResolvedValue(stored);
  render(<OperationalSettings />);

  fireEvent.click(
    await screen.findByRole("switch", { name: "Deduct from shop payouts" }),
  );
  fireEvent.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Keep warnings only",
    }),
  );

  await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  expect(updateSettings).not.toHaveBeenCalled();
  expect(
    screen.getByRole("switch", { name: "Deduct from shop payouts" }),
  ).not.toBeChecked();
});

it("reloads underneath a stale version", async () => {
  getSettings.mockResolvedValueOnce(stored).mockResolvedValue({ ...stored, version: 9 });
  updateSettings.mockRejectedValue(
    new ApiError(409, { error: "settings_version_conflict" }),
  );
  render(<OperationalSettings />);

  fireEvent.change(
    await screen.findByLabelText("Share of what is still owed", {
      selector: "#penalty-rate-minor",
    }),
    {
      target: { value: "6" },
    },
  );
  fireEvent.click(screen.getByRole("button", { name: "Save penalty rates" }));

  expect(
    await screen.findByText(/Someone else saved settings a moment ago/),
  ).toBeInTheDocument();
  await waitFor(() => expect(getSettings).toHaveBeenCalledTimes(2));
});

it("draws the rates and the switch without controls when it cannot edit", async () => {
  render(
    <ProductionPenalties
      settings={stored as never}
      canEdit={false}
      onSaved={() => {}}
      onConflict={() => {}}
    />,
  );

  expect(await screen.findByTestId("penalty-rate-moderate-value")).toHaveTextContent(
    "15%",
  );
  expect(
    screen.queryByRole("switch", { name: "Deduct from shop payouts" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Save penalty rates" }),
  ).not.toBeInTheDocument();
  expect(screen.getByText(/Only Super Admin changes these/)).toBeInTheDocument();
});

it("leaves penalties out of the main save", async () => {
  getSettings.mockResolvedValue(stored);
  updateSettings.mockResolvedValue({ ...stored, version: 8, issueWindowHours: 48 });
  render(<OperationalSettings />);

  fireEvent.change(await screen.findByLabelText("Hours after delivery"), {
    target: { value: "48" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

  await waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(1));
  expect(updateSettings.mock.calls[0][0]).not.toHaveProperty("productionPenalty");
});

it("says so on an API without penalties", async () => {
  getSettings.mockResolvedValue({ ...stored, productionPenalty: undefined });
  render(<OperationalSettings />);

  expect(await screen.findByTestId("penalty-unavailable")).toBeInTheDocument();
});
