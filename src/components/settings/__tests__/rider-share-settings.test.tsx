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
const { OperationalSettings, settingsChangeReason } =
  await import("@/components/settings/OperationalSettings");
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
  riderCommissionBps: 8500,
  deliveryFeeBands: [{ maxDistanceMeters: null, feeMinor: 2500 }],
};

it("shows the split in force and a worked ₱25 delivery", async () => {
  getSettings.mockResolvedValue(stored);
  render(<OperationalSettings />);

  expect(await screen.findByLabelText("Rider keeps")).toHaveValue("85");
  expect(screen.getByTestId("rider-share-in-force")).toHaveTextContent(
    "In force right now: Rider keeps 85% · GRIDGO keeps 15%",
  );
  expect(screen.getByTestId("rider-share-split")).toHaveTextContent(
    "Rider keeps 85% · GRIDGO keeps 15%",
  );
  const example = within(screen.getByTestId("rider-share-example"));
  expect(example.getByText("Rider gets (85%)")).toBeInTheDocument();
  expect(example.getByText("₱21.25")).toBeInTheDocument();
  expect(example.getByText("GRIDGO keeps (15%)")).toBeInTheDocument();
  expect(example.getByText("₱3.75")).toBeInTheDocument();
  expect(example.getByText("₱25.00")).toBeInTheDocument();
  expect(
    screen.getByText(/Applies to orders placed from now on/, {
      selector: "#rider-share-help",
    }),
  ).toBeInTheDocument();
});

it("moves GRIDGO's side live as the rider share is typed", async () => {
  getSettings.mockResolvedValue(stored);
  render(<OperationalSettings />);

  fireEvent.change(await screen.findByLabelText("Rider keeps"), {
    target: { value: "80" },
  });

  expect(screen.getByTestId("rider-share-split")).toHaveTextContent(
    "Rider keeps 80% · GRIDGO keeps 20%",
  );
  const example = within(screen.getByTestId("rider-share-example"));
  expect(example.getByText("₱20.00")).toBeInTheDocument();
  expect(example.getByText("₱5.00")).toBeInTheDocument();
  expect(screen.getByTestId("rider-share-in-force")).toHaveTextContent(
    "after saving: rider 80%",
  );
});

it("saves the share in basis points through the version handshake with a reason", async () => {
  getSettings.mockResolvedValue(stored);
  updateSettings.mockImplementation(async (input: { riderCommissionBps: number }) => ({
    ...stored,
    version: 5,
    riderCommissionBps: input.riderCommissionBps,
  }));
  render(<OperationalSettings />);

  fireEvent.change(await screen.findByLabelText("Rider keeps"), {
    target: { value: "87.5" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

  await waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(1));
  expect(updateSettings.mock.calls[0][0]).toMatchObject({
    expectedVersion: 4,
    riderCommissionBps: 8750,
    reason: "Updated from the portal: rider delivery share 85% to 87.5%",
  });
  expect(await screen.findByRole("status")).toHaveTextContent(
    "give the rider 87.5% of each delivery fee",
  );
  expect(screen.getByTestId("rider-share-in-force")).toHaveTextContent(
    "Rider keeps 87.5% · GRIDGO keeps 12.5%",
  );
  expect(screen.getByTestId("rider-share-in-force")).not.toHaveTextContent(
    "after saving",
  );
});

it.each([["150"], ["-5"], ["85.555"], [""], ["eighty"]])(
  "refuses %j before sending anything",
  async (typed) => {
    getSettings.mockResolvedValue(stored);
    render(<OperationalSettings />);

    const field = await screen.findByLabelText("Rider keeps");
    fireEvent.change(field, { target: { value: typed } });
    expect(field).toHaveAttribute("aria-invalid", "true");
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The rider share is a percentage from 0 to 100 with up to two decimals, like 85 or 87.5.",
    );
    expect(updateSettings).not.toHaveBeenCalled();
    // The example holds the share in force rather than going blank.
    expect(screen.getByTestId("rider-share-split")).toHaveTextContent("Rider keeps 85%");
  },
);

it("explains the API's own refusal of a rider share", async () => {
  getSettings.mockResolvedValue(stored);
  updateSettings.mockRejectedValue(
    new ApiError(400, {
      error: "invalid_rider_commission_rate",
      field: "riderCommissionBps",
    }),
  );
  render(<OperationalSettings />);

  fireEvent.change(await screen.findByLabelText("Rider keeps"), {
    target: { value: "90" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "The rider share is a percentage from 0 to 100",
  );
});

it("keeps the typed share when someone else saved first, then saves against their version", async () => {
  getSettings
    .mockResolvedValueOnce(stored)
    .mockResolvedValue({ ...stored, version: 5, riderCommissionBps: 9000 });
  updateSettings
    .mockRejectedValueOnce(new ApiError(409, { error: "settings_version_conflict" }))
    .mockImplementation(async (input: { riderCommissionBps: number }) => ({
      ...stored,
      version: 6,
      riderCommissionBps: input.riderCommissionBps,
    }));
  render(<OperationalSettings />);

  fireEvent.change(await screen.findByLabelText("Rider keeps"), {
    target: { value: "80" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Someone else saved these settings a moment ago.",
  );
  await waitFor(() =>
    expect(screen.getByTestId("rider-share-in-force")).toHaveTextContent(
      "In force right now: Rider keeps 90% · GRIDGO keeps 10%",
    ),
  );
  expect(screen.getByLabelText("Rider keeps")).toHaveValue("80");

  fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
  await waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(2));
  expect(updateSettings.mock.calls[1][0]).toMatchObject({
    expectedVersion: 5,
    riderCommissionBps: 8000,
    reason: "Updated from the portal: rider delivery share 90% to 80%",
  });
});

it("says the API holds no split yet, and sends no rider share, against an older API", async () => {
  const { riderCommissionBps: _omit, ...older } = stored;
  void _omit;
  getSettings.mockResolvedValue(older);
  updateSettings.mockImplementation(async () => ({
    ...older,
    version: 5,
    issueWindowHours: 48,
  }));
  render(<OperationalSettings />);

  expect(await screen.findByTestId("rider-share-unavailable")).toHaveTextContent(
    "every delivery fee goes to the rider in full",
  );
  expect(screen.queryByLabelText("Rider keeps")).toBeNull();

  fireEvent.change(screen.getByLabelText("Hours after delivery"), {
    target: { value: "48" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
  await waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(1));
  expect(updateSettings.mock.calls[0][0]).not.toHaveProperty("riderCommissionBps");
  expect(updateSettings.mock.calls[0][0].reason).toBe("Updated from the portal");
});

it("names only a real rider share change in the audit reason", () => {
  expect(settingsChangeReason(8500, 8500)).toBe("Updated from the portal");
  expect(settingsChangeReason(undefined, null)).toBe("Updated from the portal");
  expect(settingsChangeReason(8500, 8000)).toBe(
    "Updated from the portal: rider delivery share 85% to 80%",
  );
});
