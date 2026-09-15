// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import React, { useState } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AppShell } from "@/components/shell/AppShell";
import { TooltipProvider } from "@/components/ui/tooltip";
import AdminOrderPage from "@/app/admin/orders/[id]/page";
import OpsOrderPage from "@/app/ops/orders/[id]/page";
import AdminEscalationsPage from "@/app/admin/escalations/page";
import OpsEscalationsPage from "@/app/ops/escalations/page";
import { setTokenProvider } from "@/lib/api/client";
import type { Notification, Order, PortalRole } from "@/lib/api/types";

const navigation = vi.hoisted((): { push: (path: string) => void } => ({
  push: () => {},
}));
vi.stubGlobal("React", React);
vi.mock("next/navigation", () => ({
  usePathname: () => window.location.pathname,
  useParams: () => ({ id: "fixture_order" }),
  useRouter: () => navigation,
}));
vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({ user: null }),
  useClerk: () => ({ openUserProfile: vi.fn() }),
}));
vi.mock("@/lib/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: { id: "fixture_identity", name: "Test operator" },
    memberships: [],
    refresh: vi.fn(),
    signOut: vi.fn(),
  }),
}));

afterEach(() => {
  cleanup();
  setTokenProvider(() => null);
  vi.unstubAllGlobals();
});

// These optional HTML files are renders of the exercised components, not
// hand-written mockups. Authentication and HTTP responses are test fixtures.
function capture(name: string, role: PortalRole) {
  const directory = process.env.GRIDGO_TEST_EVIDENCE_DIR;
  if (!directory) return;
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    join(directory, `${name}.html`),
    `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GRIDGO test evidence</title><link rel="stylesheet" href="portal.css"></head>
<body><aside style="position:fixed;bottom:8px;right:8px;max-width:calc(100% - 16px);z-index:10000;padding:12px;font-family:system-ui;background:var(--color-surface-variant);color:var(--color-text-primary)">Integration test render · fixture identity and API · ${role} · ${window.location.pathname}</aside>${document.body.innerHTML}</body></html>`,
  );
}

it.each([
  ["ops_admin", "/ops/orders", OpsOrderPage],
  ["super_admin", "/admin/overview", AdminOrderPage],
] as const)(
  "opens a %s inbox slip into its real order page and refreshes it from SSE",
  async (role, home, Page) => {
    vi.stubGlobal("React", React);
    window.history.replaceState({}, "", home);
    window.matchMedia = (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    });
    const at = "2026-09-15T00:00:00.000Z";
    let row: Notification = {
      id: "fixture_notification",
      userId: "fixture_identity",
      orderId: "fixture_order",
      title: "Payment submitted",
      body: "A client's transfer is ready for confirmation.",
      type: "ops_order_progress",
      read: false,
      at,
    };
    let order: Order = {
      id: "fixture_order",
      clientId: "fixture_client",
      supplierId: "fixture_shop",
      riderId: null,
      title: "Community event flyers",
      state: "initial_payment_review",
      quantity: 500,
      unit: "piece",
      size: "A5",
      material: "Coated paper",
      finish: "Full colour",
      deadline: null,
      address: "Davao City — fixture delivery address",
      deliveryFeeMinor: 10000,
      totalMinor: 200000,
      paymentMethod: "qr",
      paymentStatus: "pending_confirmation",
      payments: {
        downpayment: {
          amountMinor: 150000,
          method: "qr",
          status: "pending_confirmation",
          reference: "FIXTURE-TRANSFER",
          submittedAt: at,
          confirmedAt: null,
          confirmedBy: null,
          confirmationSource: null,
        },
      },
      promisedDate: null,
      artworkName: null,
      createdAt: at,
      updatedAt: at,
      timeline: [],
    };
    let stream!: ReadableStreamDefaultController<Uint8Array>;
    const requests: Array<{ path: string; method: string; role: string | null }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const headers = new Headers(init?.headers);
      expect(headers.get("Authorization")).toBe("Bearer fixture-token");
      requests.push({
        path: url.pathname,
        method: init?.method ?? "GET",
        role: headers.get("X-GRIDGO-Role"),
      });
      const json = (data: unknown) =>
        new Response(JSON.stringify(data), {
          headers: { "Content-Type": "application/json" },
        });
      if (url.pathname === "/notifications/stream") {
        expect(url.searchParams.get("role")).toBe(role);
        return new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              stream = controller;
              init?.signal?.addEventListener("abort", () => controller.close(), {
                once: true,
              });
            },
          }),
          { headers: { "Content-Type": "text/event-stream" } },
        );
      }
      if (url.pathname === "/notifications")
        return json({ notifications: [row], snapshot: row.id });
      if (url.pathname === `/notifications/${row.id}` && init?.method === "PATCH") {
        expect(JSON.parse(String(init.body))).toEqual({ read: true });
        row = { ...row, read: true };
        return json({ notification: row });
      }
      if (url.pathname === `/orders/${order.id}`) return json({ order });
      if (url.pathname === "/orders") return json({ orders: [order] });
      if (url.pathname === "/escalations")
        return json({
          escalations: [
            {
              id: "fixture_escalation",
              type: "pickup_check",
              status: "open",
              orderId: order.id,
              riderId: "fixture_rider",
              supplierId: "fixture_shop",
              failedCheckCodes: ["quantity"],
              evidenceFileIds: [],
              failureNote: "One bundle is missing at pickup.",
              createdAt: at,
              resolvedAt: null,
              resolvedBy: null,
              resolution: null,
            },
          ],
        });
      throw new Error(`Unexpected fixture request: ${url.pathname}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    setTokenProvider(() => "fixture-token");
    function Portal() {
      const [path, setPath] = useState(home as string);
      navigation.push = (next) => {
        window.history.pushState({}, "", next);
        setPath(next);
      };
      return (
        <TooltipProvider>
          <AppShell role={role}>
            {path === home ? (
              <p>Open the inbox to inspect the submitted payment.</p>
            ) : path.endsWith("/escalations") ? (
              role === "super_admin" ? (
                <AdminEscalationsPage />
              ) : (
                <OpsEscalationsPage />
              )
            ) : (
              <Page />
            )}
          </AppShell>
        </TooltipProvider>
      );
    }
    render(<Portal />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Notifications, 1 unread" }),
    );
    expect(await screen.findByText("Floor live")).toBeVisible();
    capture(`${role}-inbox`, role);
    await user.click(screen.getByRole("button", { name: /Payment submitted/ }));
    const destination =
      role === "super_admin"
        ? "/admin/orders/fixture_order"
        : "/ops/orders/fixture_order";
    expect(window.location.pathname).toBe(destination);
    expect(
      await screen.findByRole("heading", { name: "Community event flyers" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Confirm this payment" })).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Approve and send to the shop" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: role === "super_admin" ? "Back to overview" : "Back to queue",
      }),
    ).toHaveAttribute("href", home);
    if (role === "ops_admin")
      expect(screen.getByRole("link", { name: "Riders" })).toHaveAttribute(
        "href",
        "/ops/riders",
      );
    expect(row.read).toBe(true);
    expect(requests).toContainEqual({
      path: `/notifications/${row.id}`,
      method: "PATCH",
      role,
    });
    capture(`${role}-order-payment`, role);

    order = {
      ...order,
      state: "needs_qa",
      payments: {
        downpayment: {
          ...order.payments!.downpayment!,
          status: "confirmed",
          confirmedAt: at,
        },
      },
    };
    await act(async () => {
      stream.enqueue(
        new TextEncoder().encode(
          `event: invalidate\ndata: ${JSON.stringify({ resource: "orders", id: order.id })}\n\n`,
        ),
      );
    });
    expect(
      await screen.findByRole("button", { name: "Approve and send to the shop" }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Confirm this payment" }),
    ).not.toBeInTheDocument();
    expect(window.location.pathname).toBe(destination);
    await waitFor(() =>
      expect(
        requests.filter((request) => request.path === `/orders/${order.id}`),
      ).toHaveLength(2),
    );
    expect(
      requests
        .filter((request) => request.path === `/orders/${order.id}`)
        .every((request) => request.role === role),
    ).toBe(true);
    capture(`${role}-order-live-refresh`, role);

    row = {
      ...row,
      id: "fixture_pickup",
      type: "pickup_check_escalation",
      title: "Pickup needs an instruction",
      read: false,
    };
    await act(async () => {
      stream.enqueue(
        new TextEncoder().encode(
          `event: notification\ndata: ${JSON.stringify({ notification: row })}\n\n`,
        ),
      );
    });
    await user.click(
      await screen.findByRole("button", { name: "Notifications, 1 unread" }),
    );
    await user.click(
      await screen.findByRole("button", { name: /Pickup needs an instruction/ }),
    );
    expect(window.location.pathname).toBe(
      role === "super_admin" ? "/admin/escalations" : "/ops/escalations",
    );
    expect(await screen.findByText("One bundle is missing at pickup.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Give an instruction" })).toBeEnabled();
    capture(`${role}-escalations`, role);
  },
);
