// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React, { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AuditEntry } from "@/lib/api/types";

vi.setConfig({ testTimeout: 30_000 });

const api = vi.hoisted(() => ({
  listOrderAudit: vi.fn(),
  downloadAuditCsv: vi.fn(),
}));

vi.stubGlobal("React", React);
class FakePointerEvent extends MouseEvent {
  constructor(type: string, params: MouseEventInit = {}) {
    super(type, params);
  }
}
vi.stubGlobal("PointerEvent", FakePointerEvent);

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return { ...actual, ...api };
});

import { OrderAuditPanel, orderAuditSummary, useOrderAudit } from "@/components/audit/OrderAuditPanel";
import { ApiError } from "@/lib/api/client";

const shopChange: AuditEntry = {
  id: "aud_3",
  at: "2026-10-15T04:00:00.000Z",
  actorId: "user_super",
  actorName: "Super Admin",
  actorRole: "super_admin",
  app: "dashboard",
  device: null,
  action: "order.supplier_changed",
  entityType: "order",
  entityId: "ord_1",
  orderId: "ord_1",
  before: { supplierId: "user_shop_a" },
  after: { supplierId: "user_shop_b" },
  detail: null,
  reason: "First shop could not meet the deadline",
};

/** The workspace's wiring: the row reads only once it is opened. */
function Harness({ tree }: { tree: "admin" | "ops" }) {
  const [open, setOpen] = useState(false);
  const state = useOrderAudit("ord_1", open);
  return (
    <div>
      <p data-testid="summary">{orderAuditSummary(state, tree)}</p>
      <button type="button" onClick={() => setOpen(true)}>
        Open row
      </button>
      {open ? (
        <OrderAuditPanel
          orderId="ord_1"
          tree={tree}
          state={state}
          names={{ user_shop_a: "Shop A", user_shop_b: "Shop B" }}
        />
      ) : null}
    </div>
  );
}

beforeEach(() => {
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  api.listOrderAudit.mockReset();
  api.downloadAuditCsv.mockReset();
  api.listOrderAudit.mockResolvedValue({ audit: [shopChange], limit: 50, offset: 0, nextOffset: null, legacy: false });
});

afterEach(() => {
  cleanup();
});

describe("OrderAuditPanel", () => {
  it("reads nothing until the row opens, then shows the order's own entries", async () => {
    const user = userEvent.setup();
    render(<Harness tree="admin" />);
    expect(api.listOrderAudit).not.toHaveBeenCalled();
    expect(screen.getByTestId("summary")).toHaveTextContent("Every recorded action on this order");

    await user.click(screen.getByRole("button", { name: "Open row" }));

    expect(await screen.findByText("Changed the shop")).toBeInTheDocument();
    expect(api.listOrderAudit).toHaveBeenCalledWith("ord_1", { limit: 50 });
    // IDs read by the names the workspace already knows.
    expect(screen.getByText("Shop A (user_shop_a)")).toBeInTheDocument();
    expect(screen.getByText("Shop B (user_shop_b)")).toBeInTheDocument();
    expect(screen.getByText("Reason: First shop could not meet the deadline")).toBeInTheDocument();
    expect(screen.getByTestId("summary")).toHaveTextContent("1 entry. Latest: Changed the shop, Super Admin");
    expect(screen.getByRole("link", { name: "Search them in the audit log" })).toHaveAttribute(
      "href",
      "/admin/audit?orderId=ord_1",
    );
  });

  it("tells Operations what its view holds and keeps it in its own tree", async () => {
    const user = userEvent.setup();
    api.listOrderAudit.mockResolvedValue({ audit: [], limit: 50, offset: 0, nextOffset: null, legacy: false });
    render(<Harness tree="ops" />);
    await user.click(screen.getByRole("button", { name: "Open row" }));

    expect(await screen.findByText("No staff corrections or file deletions are recorded on this order.")).toBeInTheDocument();
    expect(screen.getByText(/Super Admin sees every action on the order/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Search them in the audit log" })).not.toBeInTheDocument();
    expect(screen.getByTestId("summary")).toHaveTextContent("No corrections or deletions recorded");
  });

  it("downloads this order's entries only", async () => {
    const user = userEvent.setup();
    api.downloadAuditCsv.mockResolvedValue(new Blob(["id\r\n"]));
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() }));
    render(<Harness tree="ops" />);
    await user.click(screen.getByRole("button", { name: "Open row" }));
    await screen.findByText("Changed the shop");

    await user.click(screen.getByRole("button", { name: "Download these entries (CSV)" }));

    await waitFor(() => expect(api.downloadAuditCsv).toHaveBeenCalled());
    expect(api.downloadAuditCsv.mock.calls[0][1]).toMatchObject({ orderId: "ord_1" });
  });

  it("says when the server has no per-order audit yet", async () => {
    const user = userEvent.setup();
    api.listOrderAudit.mockRejectedValue(new ApiError(404, { error: "not_found" }));
    render(<Harness tree="admin" />);
    await user.click(screen.getByRole("button", { name: "Open row" }));

    expect(await screen.findByText(/does not keep an audit list per order yet/)).toBeInTheDocument();
    expect(screen.getByTestId("summary")).toHaveTextContent("could not be loaded");
  });
});
