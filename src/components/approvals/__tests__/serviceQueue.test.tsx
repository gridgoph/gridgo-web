// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { LiveContext, type LiveContextValue } from "@/lib/live/LiveProvider";
import type { InvalidatePing, SupplierService } from "@/lib/api/types";
import OpsApprovals from "@/app/ops/approvals/page";
vi.stubGlobal("React", React);
const list = vi.hoisted(() => vi.fn<() => Promise<SupplierService[]>>(async () => []));
const listUsers = vi.hoisted(() => vi.fn(async () => []));
const getTaxonomy = vi.hoisted(() =>
  vi.fn(async () => ({ categories: [], materials: [], finishes: [] })),
);
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("tab=services"),
  usePathname: () => "/ops/approvals",
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock("@/components/approvals/SignupApprovals", () => ({
  SignupApprovals: () => <p>Signup queue</p>,
}));
vi.mock("@/lib/api/client", async () => ({
  ...(await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client")),
  listSupplierServices: list,
  listUsers,
  getTaxonomy,
}));
afterEach(() => {
  cleanup();
  list.mockReset();
  list.mockResolvedValue([]);
  listUsers.mockReset();
  listUsers.mockResolvedValue([]);
  getTaxonomy.mockReset();
  getTaxonomy.mockResolvedValue({ categories: [], materials: [], finishes: [] });
});
it("opens the real service review queue within the Operations route", async () => {
  render(<OpsApprovals />);
  expect(await screen.findByText("No service lines")).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Service lines" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(list).toHaveBeenCalledTimes(1);
});

it.each(["approvals", "services", "identity"] as const)(
  "refreshes the mounted service queue on %s",
  async (resource) => {
    let listener!: (ping: InvalidatePing) => void;
    const live: LiveContextValue = {
      notifications: [],
      unreadCount: 0,
      snapshot: null,
      live: true,
      subscribe: (next) => {
        listener = next;
        return () => undefined;
      },
      markRead: async () => {},
      markAllRead: async () => {},
      remove: async () => {},
      refreshInbox: async () => {},
    };
    render(
      <LiveContext.Provider value={live}>
        <OpsApprovals />
      </LiveContext.Provider>,
    );
    expect(await screen.findByText("No service lines")).toBeInTheDocument();
    list.mockResolvedValue([
      {
        id: "service_new",
        supplierId: "user_new_shop",
        categoryCode: "flyers",
        state: "pending_verification",
        zones: [],
        updatedAt: "2026-09-15T00:00:00Z",
        materialCodes: [],
        finishCodes: [],
        productFamilyIds: [],
        sizeMin: null,
        sizeMax: null,
        qtyMin: null,
        qtyMax: null,
        pricingBasis: "per_piece",
        referenceRateMinor: 0,
        turnaroundHours: 24,
        capacityDaily: null,
        capacityWeekly: null,
        equipmentNotes: "",
        verifiedAt: null,
        suspendedAt: null,
        suspendReason: null,
        withdrawnAt: null,
        createdAt: "2026-09-15T00:00:00Z",
      },
    ]);
    await act(async () => {
      listener({ resource });
    });
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("user_new_shop")).toBeInTheDocument();
    expect(screen.getByText("Shop details unavailable")).toBeInTheDocument();
    expect(screen.queryByText("No service lines")).not.toBeInTheDocument();
  },
);
