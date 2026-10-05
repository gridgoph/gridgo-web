// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/client";
import type { OrganizationStatement as Statement } from "@/lib/api/types";

vi.stubGlobal("React", React);
const getOrganizationStatement = vi.hoisted(() => vi.fn());
const downloadOrganizationStatement = vi.hoisted(() => vi.fn());
const getUser = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  getOrganizationStatement,
  downloadOrganizationStatement,
  getUser,
}));
const { OrganizationStatement } =
  await import("@/components/organizations/OrganizationStatement");

const statement: Statement = {
  notice: "Not a tax document. Official receipts are issued separately.",
  currency: "PHP",
  period: { from: "2026-10-01", to: "2026-10-31", timezone: "Asia/Manila" },
  orderCount: 2,
  totalSpendMinor: 151500,
  discountEarnedMinor: 7000,
  orders: [
    {
      date: "2026-10-03",
      closedAt: "2026-10-03T02:00:00.000Z",
      orderId: "ord_1",
      product: "Flyers",
      amountMinor: 107000,
      organizationDiscountMinor: 5000,
      invoiceNumber: "GG-20261001-ORD1",
      officerOfRecord: "Officer One",
    },
    {
      date: "2026-10-05",
      closedAt: "2026-10-05T02:00:00.000Z",
      orderId: "ord_2",
      product: "Tarpaulin",
      amountMinor: 44500,
      organizationDiscountMinor: 2000,
      invoiceNumber: "GG-20261002-ORD2",
      officerOfRecord: "",
    },
  ],
};

beforeEach(() => {
  getOrganizationStatement.mockResolvedValue(statement);
  getUser.mockResolvedValue({ id: "user_org", name: "Account", orgName: "Science Club" });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("reads the statement the organization exports, marked not a tax document", async () => {
  render(<OrganizationStatement clientId="user_org" tree="ops" />);

  expect(await screen.findByTestId("statement-total")).toHaveTextContent("₱1,515.00");
  expect(screen.getByTestId("statement-count")).toHaveTextContent("2");
  expect(screen.getByTestId("statement-discount")).toHaveTextContent("₱70.00");
  expect(screen.getByText("1 Oct – 31 Oct 2026")).toBeInTheDocument();
  expect(screen.getAllByText("3 Oct 2026").length).toBeGreaterThan(0);
  expect(screen.queryByText("2026-10-03")).not.toBeInTheDocument();
  expect(screen.getByTestId("statement-notice")).toHaveTextContent(
    "Not a tax document. Official receipts are issued separately.",
  );
  expect(
    await screen.findByRole("heading", { name: "Science Club: spend statement" }),
  ).toBeInTheDocument();
  expect(getOrganizationStatement).toHaveBeenCalledWith("user_org", {
    period: "this_month",
  });

  const table = within(screen.getByRole("table", { name: "Orders on this statement" }));
  expect(table.getByRole("link", { name: "Order ord_1" })).toHaveAttribute(
    "href",
    "/ops/orders/ord_1",
  );
  expect(table.getByText("−₱50.00")).toBeInTheDocument();
  expect(table.getByText("Officer One")).toBeInTheDocument();
  expect(table.getByText("Not recorded")).toBeInTheDocument();
});

it("asks for this quarter, and for custom dates only once they make a period", async () => {
  const user = userEvent.setup();
  render(<OrganizationStatement clientId="user_org" tree="admin" />);
  await screen.findByTestId("statement-total");

  await user.click(screen.getByRole("button", { name: "This quarter" }));
  await waitFor(() =>
    expect(getOrganizationStatement).toHaveBeenLastCalledWith("user_org", {
      period: "this_quarter",
    }),
  );

  await user.click(screen.getByRole("button", { name: "Custom dates" }));
  const from = screen.getByLabelText("From");
  const to = screen.getByLabelText("To");
  await user.clear(from);
  await user.type(from, "2026-09-02");
  await user.clear(to);
  await user.type(to, "2026-09-01");
  expect(screen.getByRole("alert")).toHaveTextContent(
    "The end date is before the start date.",
  );
  expect(screen.getByRole("button", { name: "Show these dates" })).toBeDisabled();

  await user.clear(to);
  await user.type(to, "2026-09-30");
  await user.click(screen.getByRole("button", { name: "Show these dates" }));
  await waitFor(() =>
    expect(getOrganizationStatement).toHaveBeenLastCalledWith("user_org", {
      period: "custom",
      from: "2026-09-02",
      to: "2026-09-30",
    }),
  );
});

it("exports the same period as PDF or CSV", async () => {
  const user = userEvent.setup();
  downloadOrganizationStatement.mockResolvedValue(
    new Blob(["csv"], { type: "text/csv" }),
  );
  const createObjectURL = vi.fn(() => "blob:statement");
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => {});
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
  render(<OrganizationStatement clientId="user_org" tree="ops" />);
  await screen.findByTestId("statement-total");

  await user.click(screen.getByRole("button", { name: "Export CSV" }));
  await waitFor(() =>
    expect(downloadOrganizationStatement).toHaveBeenCalledWith(
      "user_org",
      { period: "this_month" },
      "csv",
    ),
  );
  expect(createObjectURL).toHaveBeenCalled();
  expect(click).toHaveBeenCalledTimes(1);
  click.mockRestore();
});

it("explains a statement refused for an organization that is not approved", async () => {
  getOrganizationStatement.mockRejectedValue(
    new ApiError(403, { error: "organization_approval_required" }),
  );
  render(<OrganizationStatement clientId="user_org" tree="ops" />);

  expect(
    await screen.findByText(/only kept for organizations Operations has approved/),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Export PDF" })).toBeDisabled();
});

it("never puts an id that is not a plain id into a request", () => {
  render(<OrganizationStatement clientId="../orders" tree="ops" />);

  expect(screen.getByText("Not an organization link")).toBeInTheDocument();
  expect(getOrganizationStatement).not.toHaveBeenCalled();
  expect(getUser).not.toHaveBeenCalled();
});
