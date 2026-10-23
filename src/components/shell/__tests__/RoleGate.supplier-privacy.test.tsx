// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  path: "/supplier/privacy",
  projection: vi.fn(),
  user: {
    id: "shop",
    role: "supplier",
    name: "Shop",
    email: "shop@example.test",
    accountStatus: "suspended",
  },
}));
vi.stubGlobal("React", React);
vi.mock("next/navigation", () => ({
  usePathname: () => m.path,
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock("@/lib/auth/AuthProvider", () => ({
  useAuth: () => ({
    status: "mapped",
    revision: 1,
    user: m.user,
    memberships: [{ role: "supplier" }],
    signOut: vi.fn(),
    refresh: vi.fn(),
  }),
}));
vi.mock("@/components/shell/AppShell", () => ({
  AppShell: () => <div>Ordinary portal shell</div>,
}));
vi.mock("@/lib/api/client", async () => ({
  ...(await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client")),
  getPortalRoleProjection: m.projection,
}));
import { RoleGate } from "../RoleGate";
afterEach(cleanup);
beforeEach(() => {
  m.path = "/supplier/privacy";
  m.projection.mockReset().mockResolvedValue({
    user: m.user,
    membership: { role: "supplier" },
    capabilities: {},
  });
});
it("permits own privacy actions on a held account without mounting the ordinary shell", async () => {
  render(
    <RoleGate allow="supplier">
      <div>Own privacy requests</div>
    </RoleGate>,
  );
  await screen.findByText("Own privacy requests");
  expect(screen.queryByText("Ordinary portal shell")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Sign out" })).toBeVisible();
});
it("still refuses a work page on the same held identity", async () => {
  m.path = "/supplier/jobs";
  render(
    <RoleGate allow="supplier">
      <div>Private jobs</div>
    </RoleGate>,
  );
  await screen.findByRole("heading", { name: "This account is suspended." });
  expect(screen.queryByText("Private jobs")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Your data" })).toHaveAttribute(
    "href",
    "/supplier/privacy",
  );
});
it("does not open privacy pages without the fixed supplier membership projection", async () => {
  const { ApiError } = await import("@/lib/api/client");
  m.projection.mockRejectedValue(new ApiError(403, { error: "membership_required" }));
  render(
    <RoleGate allow="supplier">
      <div>Own privacy requests</div>
    </RoleGate>,
  );
  await screen.findByRole("heading", { name: /cannot open/ });
  expect(screen.queryByText("Own privacy requests")).not.toBeInTheDocument();
});
