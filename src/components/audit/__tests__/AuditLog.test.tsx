// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AuditEntry, AuditPage } from "@/lib/api/types";

vi.setConfig({ testTimeout: 30_000 });

const api = vi.hoisted(() => ({
  listAuditPage: vi.fn(),
  downloadAuditCsv: vi.fn(),
}));
const nav = vi.hoisted(() => ({ params: new URLSearchParams(), push: vi.fn() }));

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
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: vi.fn() }),
  useSearchParams: () => nav.params,
  usePathname: () => "/admin/audit",
}));
vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return { ...actual, ...api };
});

import { AuditLog } from "@/components/audit/AuditLog";
import { ApiError } from "@/lib/api/client";

const override: AuditEntry = {
  id: "aud_2",
  at: "2026-10-15T04:16:27.000Z",
  actorId: "user_ops",
  actorName: "Operations Lead",
  actorRole: "ops_admin",
  app: "dashboard",
  device: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130.0 Safari/537.36",
  action: "order.production_override",
  entityType: "order",
  entityId: "ord_1",
  orderId: "ord_1",
  before: { id: "ord_1", state: "production", totalMinor: 445000, updatedAt: "2026-10-15T04:00:00.000Z" },
  after: { id: "ord_1", state: "ready_for_dispatch", totalMinor: 445000, updatedAt: "2026-10-15T04:16:27.000Z" },
  detail: null,
  reason: "Shop phoned: job packed, the app would not load the photo",
};

const fee: AuditEntry = {
  id: "aud_1",
  at: "2026-10-15T03:00:00.000Z",
  actorId: "user_super",
  actorName: "Super Admin",
  actorRole: "super_admin",
  app: "dashboard",
  device: null,
  action: "settings.operational_update",
  entityType: "settings",
  entityId: "operational",
  orderId: null,
  before: { serviceFeeRateBps: 1000 },
  after: { serviceFeeRateBps: 1200 },
  detail: null,
  reason: "Fee review for November",
};

const page = (audit: AuditEntry[], extra: Partial<AuditPage> = {}): AuditPage => ({
  audit,
  limit: 100,
  offset: 0,
  nextOffset: null,
  legacy: false,
  ...extra,
});

beforeEach(() => {
  // jsdom cannot follow the download link the export clicks.
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  nav.params = new URLSearchParams();
  nav.push.mockReset();
  api.listAuditPage.mockReset();
  api.downloadAuditCsv.mockReset();
  api.listAuditPage.mockResolvedValue(page([override, fee]));
});

afterEach(() => {
  cleanup();
});

describe("AuditLog", () => {
  it("lists entries newest first with what changed in words", async () => {
    render(<AuditLog />);

    await screen.findByText("2 entries, newest first.");
    expect(screen.getAllByText("Moved job on for the shop").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Ready for dispatch").length).toBeGreaterThan(0);
    expect(screen.getAllByText("12%").length).toBeGreaterThan(0);
    // The bookkeeping timestamp is not the change worth a row.
    expect(screen.queryByText(/Updated at/)).not.toBeInTheDocument();
    expect(api.listAuditPage).toHaveBeenCalledWith({ limit: 100 });
  });

  it("sends the URL's filters to the API with Manila days as UTC times", async () => {
    nav.params = new URLSearchParams("person=Maria&action=order.transition&from=2026-10-01&to=2026-10-31&orderId=ord_1");
    render(<AuditLog />);

    await screen.findByText("2 matching entries, newest first.");
    expect(api.listAuditPage).toHaveBeenCalledWith({
      person: "Maria",
      action: "order.transition",
      orderId: "ord_1",
      from: "2026-09-30T16:00:00.000Z",
      to: "2026-10-31T15:59:59.999Z",
      limit: 100,
    });
  });

  it("applies typed filters through the URL, and refuses a reversed date range", async () => {
    const user = userEvent.setup();
    render(<AuditLog />);
    await screen.findByText("2 entries, newest first.");

    await user.type(screen.getByLabelText("Person"), "Maria");
    await user.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(nav.push).toHaveBeenCalledWith("/admin/audit?person=Maria");

    nav.push.mockReset();
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-10-31" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-10-01" } });
    await user.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(nav.push).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("The From date is after the To date.");
  });

  it("opens an entry with the reason, the old value beside the new, and the rest folded", async () => {
    const user = userEvent.setup();
    render(<AuditLog />);
    await screen.findByText("2 entries, newest first.");

    await user.click(screen.getAllByRole("button", { name: "View entry" })[0]);
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByText("Reason given")).toBeInTheDocument();
    expect(within(sheet).getByText(override.reason!)).toBeInTheDocument();
    const table = within(sheet).getByRole("table");
    const stepRow = within(table)
      .getAllByRole("row")
      .find((row) => row.textContent?.includes("Step"))!;
    expect(stepRow).toHaveTextContent("In production");
    expect(stepRow).toHaveTextContent("Ready for dispatch");
    expect(within(sheet).getByText("Show 2 fields that stayed the same")).toBeInTheDocument();
    expect(within(sheet).getByText("Chrome on macOS")).toBeInTheDocument();
    expect(within(sheet).getByRole("link", { name: "ord_1" })).toHaveAttribute("href", "/admin/orders/ord_1");
  });

  it("loads older entries from the next offset", async () => {
    const user = userEvent.setup();
    api.listAuditPage
      .mockResolvedValueOnce(page([override], { nextOffset: 100 }))
      .mockResolvedValueOnce(page([fee], { offset: 100 }));
    render(<AuditLog />);

    await screen.findByText("1 entry shown, newest first. Older ones follow.");
    await user.click(screen.getByRole("button", { name: "Show older entries" }));
    await screen.findByText("2 entries, newest first.");
    expect(api.listAuditPage).toHaveBeenLastCalledWith({ limit: 100, offset: 100 });
  });

  it("exports the same filters with a pinned upper bound", async () => {
    const user = userEvent.setup();
    nav.params = new URLSearchParams("action=settings.operational_update");
    api.downloadAuditCsv.mockResolvedValue(new Blob(["id\r\n"]));
    const createObjectURL = vi.fn(() => "blob:audit");
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
    render(<AuditLog />);
    await screen.findByText("2 matching entries, newest first.");

    await user.click(screen.getByRole("button", { name: "Export these entries (CSV)" }));

    await waitFor(() => expect(api.downloadAuditCsv).toHaveBeenCalled());
    const [query, options] = api.downloadAuditCsv.mock.calls[0];
    expect(query.action).toBe("settings.operational_update");
    expect(Number.isFinite(Date.parse(query.to))).toBe(true);
    expect(options.orderId).toBeUndefined();
    await waitFor(() => expect(createObjectURL).toHaveBeenCalled());
  });

  it("says plainly when the server still runs the older log", async () => {
    api.listAuditPage.mockResolvedValue(page([fee], { legacy: true }));
    render(<AuditLog />);
    expect(await screen.findByText("This server has the older audit log")).toBeInTheDocument();
  });

  it("keeps the rows on screen when a refresh fails", async () => {
    const user = userEvent.setup();
    render(<AuditLog />);
    await screen.findByText("2 entries, newest first.");

    api.listAuditPage.mockRejectedValueOnce(new ApiError(503, { error: "unavailable" }));
    await user.click(screen.getByRole("button", { name: "Refresh" }));

    expect(await screen.findByText(/The entries below are from the last read\./)).toBeInTheDocument();
    expect(screen.getAllByText("Moved job on for the shop").length).toBeGreaterThan(0);
  });

  it("explains a refused read without raw codes", async () => {
    api.listAuditPage.mockRejectedValue(new ApiError(403, { error: "forbidden" }));
    render(<AuditLog />);
    expect(await screen.findByText("Only Super Admin can read the whole audit log.")).toBeInTheDocument();
  });
});
