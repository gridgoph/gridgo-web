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
  version: 7,
  issueWindowHours: 24,
  serviceFeeRateBps: 1000,
  organizationDiscountRateBps: 500,
  riderCommissionBps: 8500,
  deliveryFeeBands: [{ maxDistanceMeters: null, feeMinor: 2500 }],
};

it("shows the discount in force and a worked organization order", async () => {
  getSettings.mockResolvedValue(stored);
  render(<OperationalSettings />);

  expect(await screen.findByLabelText("Discount on the shop price")).toHaveValue("5");
  expect(screen.getByTestId("organization-discount-in-force")).toHaveTextContent(
    "In force right now: 5%",
  );
  const example = within(screen.getByTestId("organization-discount-example"));
  expect(example.getByText("Shop is paid").nextElementSibling).toHaveTextContent(
    "₱1,000.00",
  );
  expect(example.getByText("Service fee (10%)").nextElementSibling).toHaveTextContent(
    "₱100.00",
  );
  expect(
    example.getByText("Organization discount (5%)").nextElementSibling,
  ).toHaveTextContent("−₱50.00");
  expect(example.getByText("GRIDGO keeps").nextElementSibling).toHaveTextContent(
    "₱50.00",
  );
  // The organization's own checkout: the fee inside Printing, the discount in pesos.
  const checkout = within(screen.getByTestId("organization-discount-checkout"));
  expect(checkout.getByText("Printing").nextElementSibling).toHaveTextContent(
    "₱1,100.00",
  );
  expect(checkout.getByText("Total").nextElementSibling).toHaveTextContent("₱1,100.00");
  expect(checkout.queryByText(/Service fee/)).toBeNull();
});

it("refuses a discount above the service fee before anything is sent", async () => {
  getSettings.mockResolvedValue(stored);
  render(<OperationalSettings />);

  fireEvent.change(await screen.findByLabelText("Discount on the shop price"), {
    target: { value: "12" },
  });
  expect(screen.getByTestId("organization-discount-problem")).toHaveTextContent(
    "Set the discount to 10% or less, or raise the service fee to at least 12%.",
  );
  expect(screen.getByLabelText("Discount on the shop price")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  expect(screen.getByRole("button", { name: "Save settings" })).toBeDisabled();
  expect(updateSettings).not.toHaveBeenCalled();
});

it("refuses a service fee below the discount, the other way round", async () => {
  getSettings.mockResolvedValue(stored);
  render(<OperationalSettings />);

  fireEvent.change(await screen.findByLabelText("Rate on the shop price"), {
    target: { value: "4" },
  });
  expect(screen.getByTestId("fee-below-discount")).toHaveTextContent(
    "This fee is below the 5% organization discount",
  );
  expect(screen.getByRole("button", { name: "Save settings" })).toBeDisabled();
});

it("saves the discount in basis points with the fee, and names it in the audit reason", async () => {
  getSettings.mockResolvedValue(stored);
  updateSettings.mockImplementation(
    async (input: { organizationDiscountRateBps: number }) => ({
      ...stored,
      version: 8,
      organizationDiscountRateBps: input.organizationDiscountRateBps,
    }),
  );
  render(<OperationalSettings />);

  fireEvent.change(await screen.findByLabelText("Discount on the shop price"), {
    target: { value: "2.5" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

  await waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(1));
  expect(updateSettings.mock.calls[0][0]).toMatchObject({
    expectedVersion: 7,
    serviceFeeRateBps: 1000,
    organizationDiscountRateBps: 250,
    reason: "Updated from the portal: organization discount 5% to 2.5%",
  });
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Approved organizations get 2.5% off, out of that fee.",
  );
});

it("explains the API's own refusal of a fee below the discount", async () => {
  getSettings.mockResolvedValue(stored);
  updateSettings.mockRejectedValue(
    new ApiError(400, { error: "organization_discount_exceeds_service_fee" }),
  );
  render(<OperationalSettings />);

  fireEvent.change(await screen.findByLabelText("Discount on the shop price"), {
    target: { value: "6" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

  expect(
    await screen.findByText(/cannot be lower than the organization discount/),
  ).toBeInTheDocument();
});

it("leaves the control out against an API without organization discounts", async () => {
  const older: Partial<typeof stored> = { ...stored };
  delete older.organizationDiscountRateBps;
  getSettings.mockResolvedValue(older);
  updateSettings.mockResolvedValue({ ...older, version: 8 });
  render(<OperationalSettings />);

  expect(
    await screen.findByTestId("organization-discount-unavailable"),
  ).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Rate on the shop price"), {
    target: { value: "11" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
  await waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(1));
  expect(updateSettings.mock.calls[0][0]).not.toHaveProperty(
    "organizationDiscountRateBps",
  );
});
