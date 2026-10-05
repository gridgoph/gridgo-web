// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RoleMembership } from "@/lib/api/types";

const auth = vi.hoisted(() => ({ memberships: [] as RoleMembership[] }));

vi.stubGlobal("React", React);
vi.mock("@/lib/auth/AuthProvider", () => ({
  useAuth: () => ({ memberships: auth.memberships }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import OpsAuditPage from "@/app/ops/audit/page";
import OpsSettingsPage from "@/app/ops/settings/page";

const OPS_ONLY = [{ role: "ops_admin" }] as RoleMembership[];
const BOTH = [{ role: "ops_admin" }, { role: "super_admin" }] as RoleMembership[];

afterEach(() => {
  cleanup();
  auth.memberships = [];
});

describe("Operations settings and audit routes", () => {
  it("shows Super Admin only on settings, with no form, and says who to ask", () => {
    auth.memberships = OPS_ONLY;
    render(<OpsSettingsPage />);
    expect(screen.getByRole("heading", { name: "Super Admin only" })).toBeVisible();
    expect(screen.getByText(/Ask a Super Admin/)).toBeVisible();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("form")).toBeNull();
    expect(screen.queryByRole("button", { name: /save/i })).toBeNull();
    expect(screen.queryByLabelText(/service fee/i)).toBeNull();
    expect(screen.queryByLabelText(/delivery/i)).toBeNull();
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
