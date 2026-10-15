// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, within } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RoleMembership } from "@/lib/api/types";

const auth = vi.hoisted(() => ({ memberships: [] as RoleMembership[] }));
const getSettings = vi.hoisted(() => vi.fn());

vi.stubGlobal("React", React);
vi.mock("@/lib/auth/AuthProvider", () => ({
  useAuth: () => ({ memberships: auth.memberships }),
}));
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => {} }));
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  getSettings,
}));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import OpsAuditPage from "@/app/ops/audit/page";
import OpsSettingsPage from "@/app/ops/settings/page";

const OPS_ONLY = [{ role: "ops_admin" }] as RoleMembership[];
const BOTH = [{ role: "ops_admin" }, { role: "super_admin" }] as RoleMembership[];

const SETTINGS = {
  version: 4,
  issueWindowHours: 24,
  serviceFeeRateBps: 1000,
  deliveryFeeBands: [],
  serviceFeeSchedule: {
    version: 2,
    rounding: "half_up_once",
    brackets: [
      { upToMinor: 200000, rateBps: 4500 },
      { upToMinor: 2000000, rateBps: 2500 },
      { upToMinor: null, rateBps: 1500 },
    ],
  },
  scheduledServiceFee: null,
};

afterEach(() => {
  cleanup();
  auth.memberships = [];
  getSettings.mockReset();
});

describe("Operations settings and audit routes", () => {
  it("shows Super Admin only on settings, with no form, and says who to ask", () => {
    auth.memberships = OPS_ONLY;
    getSettings.mockResolvedValue(SETTINGS);
    render(<OpsSettingsPage />);
    expect(screen.getByRole("heading", { name: "Super Admin only" })).toBeVisible();
    expect(screen.getByText(/Ask a Super Admin/)).toBeVisible();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("form")).toBeNull();
    expect(screen.queryByRole("button", { name: /save/i })).toBeNull();
    expect(screen.queryByLabelText(/delivery/i)).toBeNull();
  });

  it("lets Operations read the service fee brackets, with nothing to change", async () => {
    auth.memberships = OPS_ONLY;
    getSettings.mockResolvedValue(SETTINGS);
    render(<OpsSettingsPage />);
    const card = await screen.findByRole("region", { name: "Service fee" });
    expect(within(card).getByText("First ₱2,000")).toBeVisible();
    expect(within(card).getByText("Above ₱20,000")).toBeVisible();
    expect(within(card).getByText("Only Super Admin changes the service fee.")).toBeVisible();
    expect(within(card).queryByRole("textbox")).toBeNull();
    expect(within(card).queryByRole("button")).toBeNull();
    // ₱5,000 under the brackets in force.
    expect(within(card).getAllByText("₱2,000.00 × 45% + ₱3,000.00 × 25%").length).toBeGreaterThan(0);
  });

  it("shows Super Admin only on audit, with no rows", () => {
    auth.memberships = OPS_ONLY;
    render(<OpsAuditPage />);
    expect(screen.getByRole("heading", { name: "Super Admin only" })).toBeVisible();
    expect(screen.getByText(/Ask a Super Admin/)).toBeVisible();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("row")).toBeNull();
  });

  it("links a person who is also Super Admin to the same page in that workspace", () => {
    auth.memberships = BOTH;
    getSettings.mockResolvedValue(SETTINGS);
    render(<OpsSettingsPage />);
    expect(
      screen.getByRole("link", { name: "Open settings as Super Admin" }),
    ).toHaveAttribute("href", "/admin/settings");
    cleanup();

    render(<OpsAuditPage />);
    expect(
      screen.getByRole("link", { name: "Open the audit log as Super Admin" }),
    ).toHaveAttribute("href", "/admin/audit");
    expect(screen.queryByText(/Ask a Super Admin/)).toBeNull();
  });
});
