// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

import { HubDesk } from "@/components/hub/HubDesk";

vi.stubGlobal("React", React);

const api = vi.hoisted(() => ({
  getHub: vi.fn(async () => ({
    hub: {
      id: "primary",
      name: "GRIDGO pickup hub",
      schedule: {
        utcOffsetMinutes: 480,
        week: [1, 3, 5].map((weekday) => ({
          weekday,
          opensMinute: 540,
          closesMinute: 1020,
        })),
        closures: [],
      },
    },
    sop: ["Scan the client QR and verify the matching OTP before handover."],
  })),
  listHubWaiting: vi.fn(async () => [
    {
      orderId: "ord_fresh",
      state: "awaiting_collection",
      readyAt: "2026-10-05T01:00:00.000Z",
      missedDays: 0,
      operationsRequired: false,
      redeliveryRequest: null,
    },
    {
      orderId: "ord_late",
      state: "awaiting_collection",
      readyAt: "2026-09-28T01:00:00.000Z",
      missedDays: 3,
      operationsRequired: true,
      redeliveryRequest: null,
    },
  ]),
  listHubHandouts: vi.fn(async ({ before }: { before?: string | null } = {}) =>
    before
      ? {
          handouts: [
            {
              id: "h_old",
              orderId: "ord_old",
              staffId: "s1",
              staffName: "Hub Person",
              hubId: "primary",
              at: "2026-09-01T02:00:00.000Z",
            },
          ],
          staffTotals: [{ staffId: "s1", name: "Hub Person", count: 2 }],
          nextCursor: null,
        }
      : {
          handouts: [
            {
              id: "h_new",
              orderId: "ord_new",
              staffId: "s1",
              staffName: "Hub Person",
              hubId: "primary",
              at: "2026-10-04T02:00:00.000Z",
            },
          ],
          staffTotals: [{ staffId: "s1", name: "Hub Person", count: 2 }],
          nextCursor: "cursor_1",
        },
  ),
  listHubCodeMismatches: vi.fn(async () => []),
  listOrders: vi.fn(async () => [{ id: "ord_late", title: "Tarpaulin 3x6" }]),
}));

vi.mock("@/lib/api/client", async () => ({
  ...(await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client")),
  ...api,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("puts the order Operations must act on first, with its missed hub days", async () => {
  render(<HubDesk tree="ops" />);

  expect(
    await screen.findByRole("tab", { name: /Waiting \(2, 1 for Operations\)/ }),
  ).toBeInTheDocument();
  expect(screen.getByText(/GRIDGO pickup hub, open Mon, Wed, Fri/)).toBeInTheDocument();
  const table = screen.getByRole("table", { name: "Pick-up orders waiting at the hub" });
  const rows = within(table).getAllByRole("row").slice(1);
  expect(rows[0]).toHaveTextContent("Tarpaulin 3x6");
  expect(rows[0]).toHaveTextContent("Needs Operations");
  expect(within(rows[0]).getByLabelText("3 hub days missed")).toBeInTheDocument();
  expect(rows[1]).toHaveTextContent("Waiting for the client");
  expect(within(rows[0]).getByRole("link", { name: /Tarpaulin 3x6/ })).toHaveAttribute(
    "href",
    "/ops/orders/ord_late",
  );
});

it("counts every staff member's handovers and pages the log", async () => {
  render(<HubDesk tree="admin" />);
  await userEvent.click(await screen.findByRole("tab", { name: "Handovers (2)" }));

  expect(screen.getByText("Handovers by staff member")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Staff" })).toHaveAttribute(
    "href",
    "/admin/staff",
  );
  await userEvent.click(screen.getByRole("button", { name: "Load older handovers" }));
  expect(api.listHubHandouts).toHaveBeenLastCalledWith({ before: "cursor_1", limit: 50 });
  const log = screen.getByRole("table", { name: "Hub handovers, newest first" });
  expect(within(log).getByText("ord_new")).toBeInTheDocument();
  expect(await within(log).findByText("ord_old")).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Load older handovers" }),
  ).not.toBeInTheDocument();
});
