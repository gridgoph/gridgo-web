// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, within } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SupplierMyShopPage from "@/app/supplier/my-shop/page";
import type { ShopRole } from "@/lib/api/types";

const access = vi.hoisted(() => ({ role: "owner" as string }));
const api = vi.hoisted(() => ({
  getMyShopStatus: vi.fn(),
  updateMyShopStatus: vi.fn(),
  getMyPayoutAccount: vi.fn(),
  getMyShopTeam: vi.fn(),
}));

vi.stubGlobal("React", React);
vi.mock("@/lib/api/shop-status", () => ({
  getMyShopStatus: api.getMyShopStatus,
  updateMyShopStatus: api.updateMyShopStatus,
}));
vi.mock("@/lib/api/shop-team", () => ({ getMyShopTeam: api.getMyShopTeam }));
vi.mock("@/lib/api/client", async (original) => ({
  ...(await original<typeof import("@/lib/api/client")>()),
  getMyPayoutAccount: api.getMyPayoutAccount,
  getExpressSettings: vi.fn(),
}));
vi.mock("@/components/my-shop/ShopProducts", () => ({
  ShopProducts: () => <section aria-label="Products">products</section>,
}));
vi.mock("@/app/supplier/_components/SupplierLegalGate", () => ({
  useSupplierLegal: () => ({ notices: [] }),
}));
vi.mock("@/lib/live/useLiveReload", () => ({ useLiveReload: () => undefined }));
vi.mock("@/lib/auth/shop-access", async () => {
  const { shopCapabilities } = await import("@/lib/shop-team");
  return {
    useShopAccess: () => ({
      shop: { id: "shop_1", name: "Test Print Shop", role: access.role, status: "active" },
      staff: access.role !== "owner",
      manager: access.role === "manager",
      role: access.role,
      worker: null,
      can: shopCapabilities(access.role as ShopRole),
    }),
  };
});

function setWidth(desktop: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: desktop && query === "(min-width: 1280px)",
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

beforeEach(async () => {
  const { normalizeMyShopStatus } = await import("@/lib/my-shop-status");
  access.role = "owner";
  setWidth(true);
  api.getMyShopStatus.mockResolvedValue(
    normalizeMyShopStatus({
      version: 2,
      shopName: "Test Print Shop",
      hours: { isOpenNow: true, schedule: { week: [{ weekday: 1, opensMinute: 480, closesMinute: 1080 }] } },
      todayHours: [{ opensMinute: 480, closesMinute: 1080 }],
      isOpenNow: true,
      expressEnabled: true,
      nightJobs: "until_23",
      printerDemandPings: false,
      pausedUntil: null,
    }),
  );
  api.getMyPayoutAccount.mockResolvedValue({ provider: "bank", accountName: "Test", accountNumber: "0000004821", institution: "Test bank" });
  api.getMyShopTeam.mockResolvedValue({ members: [], invites: [], pinStaff: [], stats: null, settings: null });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.matchMedia = undefined as never;
});

describe("My shop by role", () => {
  it("gives the Owner the sign, products, team, status panel and where they get paid", async () => {
    render(<SupplierMyShopPage />);
    const panel = await screen.findByRole("region", { name: "Shop status" });
    expect(await within(panel).findByRole("link", { name: /Where you get paid/ })).toHaveTextContent("••4821");
    expect(screen.getByRole("region", { name: "Products" })).toBeInTheDocument();
    expect(screen.getByTestId("team-strip")).toHaveTextContent("Manage team");
    expect(screen.getByTestId("shop-sign")).toHaveTextContent("OPEN");
    expect(screen.getByText("Night until 11 PM")).toBeVisible();
    expect(document.querySelector('[data-layout="desktop"]')).not.toBeNull();
  });

  it("gives a Manager products and hours, but never payout or the switches", async () => {
    access.role = "manager";
    render(<SupplierMyShopPage />);
    const panel = await screen.findByRole("region", { name: "Shop status" });
    expect(within(panel).getByText("Only the shop owner can change these.")).toBeVisible();
    expect(within(panel).queryByText("Where you get paid")).not.toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: /Hours/ })).toBeVisible();
    expect(screen.getByRole("region", { name: "Products" })).toBeInTheDocument();
    expect(api.getMyPayoutAccount).not.toHaveBeenCalled();
    expect(screen.queryByRole("link", { name: /Shop details/ })).not.toBeInTheDocument();
  });

  it("gives Staff a read-only shop with no products, prices or payout", async () => {
    access.role = "staff";
    render(<SupplierMyShopPage />);
    const panel = await screen.findByRole("region", { name: "Shop status" });
    expect(within(panel).getByText("Only the shop owner can change these.")).toBeVisible();
    expect(screen.queryByRole("region", { name: "Products" })).not.toBeInTheDocument();
    expect(within(panel).queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByText("Where you get paid")).not.toBeInTheDocument();
    expect(screen.getByTestId("team-strip")).toHaveTextContent("See the team");
    expect(within(screen.getByTestId("shop-sign")).queryByRole("button")).not.toBeInTheDocument();
    expect(api.getMyPayoutAccount).not.toHaveBeenCalled();
  });

  it("keeps the phone's single column below 1280px", async () => {
    setWidth(false);
    render(<SupplierMyShopPage />);
    await screen.findByRole("region", { name: "Shop status" });
    expect(document.querySelector('[data-layout="phone"]')).not.toBeNull();
    expect(document.querySelector("aside")).toBeNull();
  });
});
