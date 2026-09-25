// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { act, cleanup, render, screen } from "@testing-library/react";
import React, { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RoleGate } from "@/components/shell/RoleGate";
import { listJobs } from "@/lib/api/client";
import type { ApprovalCaseSummary } from "@/lib/api/types";

/**
 * gridgoph/gridgo-web#77: a suspended shop saw an endless run of
 * `GET /jobs 403 forbidden` and no explanation. These tests drive the real API
 * client against a stubbed `fetch`, and stand in for the shell with a
 * component that reads `/jobs` on mount and on the live-reload fallback
 * cadence, the way the rail count and the supplier pages do.
 */

const { authState, pathnameRef } = vi.hoisted(() => ({
  authState: {
    revision: 1,
    user: { id: "user_dara_blueprint", email: "dara@example.com", name: "Dara Blueprint", role: "supplier" },
    memberships: [{ role: "supplier" }],
    status: "mapped",
    loading: false,
    signOut: vi.fn(),
    refresh: vi.fn(),
  },
  pathnameRef: { current: "/supplier/dashboard" },
}));

vi.stubGlobal("React", React);

vi.mock("next/navigation", () => {
  const router = { replace: vi.fn() };
  return { usePathname: () => pathnameRef.current, useRouter: () => router };
});

vi.mock("@/lib/auth/AuthProvider", () => ({ useAuth: () => authState }));

const POLL_MS = 30_000;

vi.mock("@/components/shell/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => {
    useEffect(() => {
      const read = () => void listJobs().catch(() => undefined);
      read();
      const interval = setInterval(read, POLL_MS);
      return () => clearInterval(interval);
    }, []);
    return <div data-testid="supplier-shell">{children}</div>;
  },
}));

function approvalCase(
  status: ApprovalCaseSummary["status"],
  reasons: Partial<Pick<ApprovalCaseSummary, "suspensionReason" | "rejectionReason">> = {},
): ApprovalCaseSummary & { kind: "supplier" } {
  return {
    id: "apc_dara",
    kind: "supplier",
    status,
    version: 3,
    applicationRevision: 1,
    submittedAt: "2026-09-01T00:00:00.000Z",
    decidedAt: "2026-09-18T00:00:00.000Z",
    rejectionReason: null,
    suspensionReason: null,
    updatedAt: "2026-09-18T00:00:00.000Z",
    ...reasons,
  };
}

function supplierProjection(standing: ReturnType<typeof approvalCase> | null) {
  const approved = standing?.status === "approved";
  return {
    user: { id: "user_dara_blueprint", email: "dara@example.com", name: "Dara Blueprint", createdAt: "2026-09-01T00:00:00.000Z" },
    membership: { role: "supplier" },
    supplierProfile: {
      shopName: "Blueprint Print Co.",
      contactName: "Dara Blueprint",
      shop: { lat: 14.6, lng: 121, label: "Quezon City" },
      pickupAvailable: true,
      updatedAt: "2026-09-01T00:00:00.000Z",
    },
    approvalCase: standing,
    readiness: { readyForApproval: true, missing: [] },
    capabilities: {
      editCatalogue: standing?.status !== "suspended",
      editSettings: standing?.status !== "suspended",
      receiveJobOffers: approved,
      acceptJobs: approved,
    },
  };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
let projections: unknown[] = [];
let jobsResponse: () => Response = () => json(200, { jobs: [] });

function pathOf(input: RequestInfo | URL): string {
  return new URL(String(input), "http://api.test").pathname;
}

function callsTo(path: string): number {
  return fetchMock.mock.calls.filter(([input]) => pathOf(input) === path).length;
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  projections = [];
  jobsResponse = () => json(200, { jobs: [] });
  fetchMock.mockImplementation(async (input) => {
    const path = pathOf(input);
    if (path === "/auth/me/supplier") {
      const next = projections.length > 1 ? projections.shift() : projections[0];
      return json(200, next);
    }
    if (path === "/jobs") return jobsResponse();
    return json(404, { error: "not_found" });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  fetchMock.mockReset();
  authState.signOut = vi.fn();
  pathnameRef.current = "/supplier/dashboard";
});

describe("RoleGate supplier standing (#77)", () => {
  it("shows a suspended shop the notice with its reason and never reads /jobs", async () => {
    projections = [
      supplierProjection(approvalCase("suspended", { suspensionReason: "Verification suspended" })),
    ];

    render(
      <RoleGate allow="supplier">
        <p>Supplier dashboard</p>
      </RoleGate>,
    );

    expect(
      await screen.findByRole("heading", { name: "Your shop is suspended on GRIDGO" }),
    ).toBeVisible();
    expect(screen.getByText("Verification suspended")).toBeVisible();
    expect(screen.getByRole("link", { name: /Contact Operations/ })).toHaveAttribute(
      "href",
      "https://gridgo.talasora.com/report",
    );
    expect(screen.queryByText("Supplier dashboard")).not.toBeInTheDocument();
    expect(screen.queryByTestId("supplier-shell")).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS * 3);
    });
    expect(callsTo("/jobs")).toBe(0);
    expect(callsTo("/auth/me/supplier")).toBe(1);
  });

  it("signs a suspended shop out from the notice", async () => {
    projections = [supplierProjection(approvalCase("suspended"))];
    render(
      <RoleGate allow="supplier">
        <p>Supplier dashboard</p>
      </RoleGate>,
    );

    await screen.findByRole("heading", { name: "Your shop is suspended on GRIDGO" });
    screen.getByRole("button", { name: "Sign out" }).click();
    expect(authState.signOut).toHaveBeenCalledTimes(1);
  });

  it("reopens the workspace from Check again once the suspension is lifted", async () => {
    projections = [
      supplierProjection(approvalCase("suspended")),
      supplierProjection(approvalCase("approved")),
    ];
    render(
      <RoleGate allow="supplier">
        <p>Supplier dashboard</p>
      </RoleGate>,
    );

    await screen.findByRole("heading", { name: "Your shop is suspended on GRIDGO" });
    expect(callsTo("/jobs")).toBe(0);
    await act(async () => {
      screen.getByRole("button", { name: "Check again" }).click();
    });

    expect(await screen.findByText("Supplier dashboard")).toBeVisible();
    expect(callsTo("/auth/me/supplier")).toBe(2);
  });

  it("explains a suspension with no recorded reason without inventing one", async () => {
    projections = [supplierProjection(approvalCase("suspended"))];
    render(
      <RoleGate allow="supplier">
        <p>Supplier dashboard</p>
      </RoleGate>,
    );

    await screen.findByRole("heading", { name: "Your shop is suspended on GRIDGO" });
    expect(screen.getByText(/No reason was recorded/)).toBeVisible();
  });

  it("tells a rejected shop why and where to reapply, without reading /jobs", async () => {
    projections = [
      supplierProjection(approvalCase("rejected", { rejectionReason: "Shop photo is unreadable" })),
    ];
    render(
      <RoleGate allow="supplier">
        <p>Supplier dashboard</p>
      </RoleGate>,
    );

    expect(
      await screen.findByRole("heading", { name: "Your shop application was not approved" }),
    ).toBeVisible();
    expect(screen.getByText("Shop photo is unreadable")).toBeVisible();
    expect(callsTo("/jobs")).toBe(0);
  });

  it("switches to the notice when /jobs turns 403 mid-session, then stops polling", async () => {
    projections = [
      supplierProjection(approvalCase("approved")),
      supplierProjection(approvalCase("suspended", { suspensionReason: "Verification suspended" })),
    ];
    jobsResponse = () => json(200, { jobs: [] });

    render(
      <RoleGate allow="supplier">
        <p>Supplier dashboard</p>
      </RoleGate>,
    );
    expect(await screen.findByText("Supplier dashboard")).toBeVisible();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(callsTo("/jobs")).toBe(1);

    // A Super Admin suspends the shop; the next read is refused.
    jobsResponse = () => json(403, { error: "forbidden" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS);
    });

    expect(
      await screen.findByRole("heading", { name: "Your shop is suspended on GRIDGO" }),
    ).toBeVisible();
    expect(screen.getByText("Verification suspended")).toBeVisible();
    expect(screen.queryByText("Supplier dashboard")).not.toBeInTheDocument();

    const jobsAtNotice = callsTo("/jobs");
    expect(jobsAtNotice).toBe(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS * 5);
    });
    expect(callsTo("/jobs")).toBe(jobsAtNotice);
    expect(callsTo("/auth/me/supplier")).toBe(2);
  });

  it("leaves an approved shop in its workspace when one read is refused", async () => {
    projections = [supplierProjection(approvalCase("approved"))];
    jobsResponse = () => json(403, { error: "forbidden" });

    render(
      <RoleGate allow="supplier">
        <p>Supplier dashboard</p>
      </RoleGate>,
    );
    expect(await screen.findByText("Supplier dashboard")).toBeVisible();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // The re-check still says approved, so nothing is taken away.
    expect(screen.getByTestId("supplier-shell")).toBeVisible();
    expect(screen.queryByRole("heading", { name: /suspended/ })).not.toBeInTheDocument();
  });

  it("leaves an approved shop entirely alone when its reads succeed", async () => {
    projections = [supplierProjection(approvalCase("approved"))];

    render(
      <RoleGate allow="supplier">
        <p>Supplier dashboard</p>
      </RoleGate>,
    );
    expect(await screen.findByText("Supplier dashboard")).toBeVisible();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS * 2);
    });

    expect(callsTo("/jobs")).toBe(3);
    expect(callsTo("/auth/me/supplier")).toBe(1);
  });

  it("keeps a pending shop in its workspace, as before", async () => {
    projections = [supplierProjection(approvalCase("pending"))];
    jobsResponse = () => json(403, { error: "forbidden" });

    render(
      <RoleGate allow="supplier">
        <p>Supplier dashboard</p>
      </RoleGate>,
    );
    expect(await screen.findByText("Supplier dashboard")).toBeVisible();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS);
    });
    expect(screen.getByTestId("supplier-shell")).toBeVisible();
    expect(screen.queryByRole("heading", { name: /suspended|not approved/ })).not.toBeInTheDocument();
  });
});
