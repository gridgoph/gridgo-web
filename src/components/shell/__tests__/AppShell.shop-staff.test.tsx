// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, within } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "@/components/shell/AppShell";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ShopAccessProvider } from "@/lib/auth/shop-access";

type ClerkProfileMock = {
  id: string;
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  imageUrl: string | null;
  primaryEmailAddress: { emailAddress: string } | null;
};

const adaClerk: ClerkProfileMock = {
  id: "user_clerk",
  fullName: "Ada Admin",
  firstName: "Ada",
  lastName: "Admin",
  imageUrl: "https://img.clerk.com/ada.png",
  primaryEmailAddress: { emailAddress: "admin@example.com" },
};

const {
  pathnameRef,
  signOutMock,
  membershipsRef,
  userRef,
  clerkUserRef,
  openUserProfileMock,
  liveRef,
} = vi.hoisted(() => ({
  pathnameRef: { current: "/admin/overview" },
  signOutMock: vi.fn(),
  membershipsRef: {
    current: [] as Array<{ role: "supplier" | "ops_admin" | "super_admin" }>,
  },
  userRef: {
    current: {
      id: "user_admin",
      email: "admin@example.com",
      name: "Ada Admin",
      role: "super_admin" as const,
    },
  },
  clerkUserRef: {
    current: null as ClerkProfileMock | null,
  },
  openUserProfileMock: vi.fn(),
  liveRef: {
    current: {
      notifications: [] as Array<{
        id: string;
        userId: string;
        title: string;
        body: string;
        read: boolean;
        at: string;
      }>,
      unreadCount: 0,
      snapshot: null as string | null,
      live: false,
      subscribe: () => () => undefined,
      markRead: async () => undefined,
      markAllRead: async () => undefined,
      remove: async () => undefined,
      refreshInbox: async () => undefined,
    },
  },
}));

vi.stubGlobal("React", React);

vi.mock("next/navigation", () => ({
  usePathname: () => pathnameRef.current,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/lib/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: userRef.current,
    memberships: membershipsRef.current,
    signOut: signOutMock,
    loading: false,
  }),
}));

vi.mock("@/lib/live/LiveProvider", () => ({
  LiveProvider: ({ children }: { children: React.ReactNode }) => children,
  useLive: () => liveRef.current,
  useLiveOptional: () => liveRef.current,
}));

const forbiddenRef = vi.hoisted(() => {
  const listeners = new Set<(error: { code: string }) => void>();
  return {
    subscribe: (listener: (error: { code: string }) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit: (code: string) => listeners.forEach((listener) => listener({ code })),
  };
});

const { listOrdersMock, countMocks } = vi.hoisted(() => {
  const ordersRef = { current: [] as Array<Record<string, unknown>> };
  return {
    ordersRef,
    listOrdersMock: vi.fn(async () => ordersRef.current),
    // Every other rail count reads an empty list unless a test says otherwise.
    countMocks: {
      listUsers: vi.fn<(role?: string) => Promise<Array<Record<string, unknown>>>>(
        async () => [],
      ),
      listApprovalCases: vi.fn(async () => ({
        approvalCases: [] as unknown[],
        nextCursor: null,
      })),
      listCatalogReviews: vi.fn(async () => ({
        items: [] as Array<{ id: string }>,
        nextCursor: null,
      })),
      listProductTypeRequests: vi.fn(async () => ({ requests: [] })),
      listEscalations: vi.fn(async () => [] as unknown[]),
      listClaims: vi.fn(async () => [] as Array<{ status: string }>),
      listIssueReports: vi.fn(async () => ({
        reports: [] as unknown[],
        counts: { new: 0, published: 0, dismissed: 0 },
      })),
      listJobs: vi.fn(async () => [] as Array<Record<string, unknown>>),
      listSupportChatThreads: vi.fn(async () => [] as Array<{ unreadCount: number }>),
      getTracker: vi.fn(async () => ({
        fetchedAt: "2026-09-25T00:00:00.000Z",
        items: [] as Array<{ status: string }>,
      })),
      // The Orders count reads the queue context: GRIDGO's default week
      // (Mon–Sat 08:00–17:00 Manila) and the API's dispatch offers, which
      // offer every ready order here, as the API does for one with no stop.
      getSettings: vi.fn(async () => ({
        operatingHours: {
          timeZone: "Asia/Manila",
          schedule: {
            utcOffsetMinutes: 480,
            week: [1, 2, 3, 4, 5, 6].map((weekday) => ({
              weekday,
              opensMinute: 480,
              closesMinute: 1020,
            })),
            closures: [],
          },
          artworkReviewMinutes: 60,
        },
      })),
      listDispatchOffers: vi.fn(async () =>
        ordersRef.current.filter(
          (order: { state?: string }) => order.state === "ready_for_dispatch",
        ),
      ),
    },
  };
});

vi.mock("@/lib/api/client", () => ({
  listOrders: listOrdersMock,
  listUsers: countMocks.listUsers,
  listApprovalCases: countMocks.listApprovalCases,
  listCatalogReviews: countMocks.listCatalogReviews,
  listProductTypeRequests: countMocks.listProductTypeRequests,
  listEscalations: countMocks.listEscalations,
  listClaims: countMocks.listClaims,
  listIssueReports: countMocks.listIssueReports,
  listJobs: countMocks.listJobs,
  getTracker: countMocks.getTracker,
  getSettings: countMocks.getSettings,
  listDispatchOffers: countMocks.listDispatchOffers,
  getMyShopHours: () => new Promise(() => {}),
  getExpressSettings: () => new Promise(() => {}),
  onForbidden: forbiddenRef.subscribe,
}));

vi.mock("@/lib/api/support-chat", () => ({
  listSupportChatThreads: countMocks.listSupportChatThreads,
}));

vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({
    isLoaded: true,
    isSignedIn: Boolean(clerkUserRef.current),
    user: clerkUserRef.current,
  }),
  useClerk: () => ({
    openUserProfile: openUserProfileMock,
  }),
}));

function mockMatchMedia(width = 1280) {
  Object.defineProperty(window, "innerWidth", { writable: true, value: width });
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

beforeEach(() => {
  mockMatchMedia();
  clerkUserRef.current = { ...adaClerk };
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  membershipsRef.current = [];
  userRef.current = {
    id: "user_admin",
    email: "admin@example.com",
    name: "Ada Admin",
    role: "super_admin",
  };
  clerkUserRef.current = { ...adaClerk };
  liveRef.current = {
    notifications: [],
    unreadCount: 0,
    snapshot: null,
    live: false,
    subscribe: () => () => undefined,
    markRead: async () => undefined,
    markAllRead: async () => undefined,
    remove: async () => undefined,
    refreshInbox: async () => undefined,
  };
  vi.clearAllMocks();
});

// ---- Shop Owner and Staff (gridgo-api docs/SHOP_TEAM_API.md) ----

const STAFF_SHOP = {
  id: "user_owner_shop",
  name: "Blueprint Print Co.",
  role: "staff" as const,
  status: "active" as const,
};

function renderSupplier(pathname: string, shop: typeof STAFF_SHOP | null) {
  pathnameRef.current = pathname;
  userRef.current = {
    id: "user_sam",
    email: "sam@example.com",
    name: "Sam Santos",
    role: "supplier" as never,
  };
  return render(
    <TooltipProvider>
      <ShopAccessProvider shop={shop}>
        <AppShell role="supplier">
          <p>Workspace body</p>
        </AppShell>
      </ShopAccessProvider>
    </TooltipProvider>,
  );
}

const OWNER_ONLY_PATHS = [
  "/supplier/shop",
  "/supplier/services",
  "/supplier/catalogue",
  "/supplier/catalogue/cat_1",
  "/supplier/catalogue/new",
  "/supplier/product-types",
  "/supplier/schedule",
  "/supplier/shop-hours",
  "/supplier/capacity",
  "/supplier/payouts",
  "/supplier/record",
  "/supplier/payout-account",
  "/supplier/documents",
  "/supplier/report",
  "/supplier/chat",
  "/supplier/legal",
  "/supplier/privacy",
  "/supplier/performance",
];

describe("AppShell shop Staff mode", () => {
  it("shows Staff To do's Today and All jobs, My shop and the team, with no Money or Messages", () => {
    renderSupplier("/supplier/jobs", STAFF_SHOP);
    const nav = screen.getByRole("navigation", { name: "Primary navigation" });
    expect(within(nav).getByRole("link", { name: /Today/ })).toHaveAttribute("href", "/supplier/dashboard");
    expect(within(nav).getByRole("link", { name: /All jobs/ })).toHaveAttribute("href", "/supplier/jobs");
    expect(within(nav).getByText("My shop")).toBeInTheDocument();
    expect(within(nav).queryByText("Money")).not.toBeInTheDocument();
    expect(within(nav).queryByText("Messages")).not.toBeInTheDocument();
    expect(within(nav).queryByText("Payouts")).not.toBeInTheDocument();
    expect(within(nav).queryByText("Hours")).not.toBeInTheDocument();
    expect(within(nav).queryByText("Products")).not.toBeInTheDocument();
    expect(screen.getByText("Workspace body")).toBeVisible();
  });

  it("lets Staff open My shop and the team", () => {
    for (const path of ["/supplier/my-shop", "/supplier/team"]) {
      renderSupplier(path, STAFF_SHOP);
      expect(screen.getByText("Workspace body")).toBeVisible();
      cleanup();
    }
  });

  it("lets a Manager open products and hours, never Money", () => {
    const manager = { ...STAFF_SHOP, role: "manager" as never };
    for (const path of ["/supplier/catalogue", "/supplier/catalogue/new", "/supplier/shop-hours", "/supplier/schedule"]) {
      renderSupplier(path, manager);
      expect(screen.getByText("Workspace body")).toBeVisible();
      cleanup();
    }
    for (const path of ["/supplier/payouts", "/supplier/payout-account", "/supplier/shop"]) {
      renderSupplier(path, manager);
      expect(screen.getByTestId("shop-owner-only")).toBeVisible();
      cleanup();
    }
  });

  it("shows who is working on a shared PC in the top bar, with no account inbox", () => {
    renderSupplier("/supplier/jobs", STAFF_SHOP);
    expect(screen.getByRole("button", { name: /^Notifications/ })).toBeVisible();
    expect(screen.queryByTestId("worker-bar")).not.toBeInTheDocument();
    cleanup();
    renderSupplier("/supplier/jobs", {
      ...STAFF_SHOP,
      role: "staff" as never,
      worker: { pinStaffId: "shp_ana", name: "Ana", role: "staff" },
    } as never);
    const bar = screen.getByTestId("worker-bar");
    expect(bar).toHaveTextContent("Ana");
    expect(within(bar).getByRole("button", { name: /Switch person/ })).toBeVisible();
    expect(screen.queryByRole("button", { name: /notifications|inbox/i })).not.toBeInTheDocument();
    // The footer is the person at the keyboard, not the account the PC is signed in with.
    const account = document.querySelector('[data-slot="account-menu"]');
    expect(account).toHaveAttribute("aria-label", "Ana");
    expect(account).not.toHaveTextContent("Sam Santos");
  });

  it("names the shop and the Staff role under the account", () => {
    renderSupplier("/supplier/jobs", STAFF_SHOP);
    expect(screen.getAllByText("Blueprint Print Co. · Staff").length).toBeGreaterThan(0);
  });

  it.each(OWNER_ONLY_PATHS)(
    "never mounts the Owner-only page at %s",
    (path) => {
      renderSupplier(path, STAFF_SHOP);
      expect(screen.getByTestId("shop-owner-only")).toBeVisible();
      expect(screen.getByRole("heading", { name: "Owner only" })).toBeVisible();
      expect(screen.queryByText("Workspace body")).not.toBeInTheDocument();
      expect(screen.getByText("Back to To do").closest("a")).toHaveAttribute(
        "href",
        "/supplier/dashboard",
      );
    },
  );

  it("lets Staff open a job and the phone app page", () => {
    for (const path of [
      "/supplier/dashboard",
      "/supplier/jobs/ord_1",
      "/supplier/jobs/ord_1/files",
      "/supplier/phone-app",
      "/supplier/notice",
    ]) {
      renderSupplier(path, STAFF_SHOP);
      expect(screen.getByText("Workspace body")).toBeVisible();
      expect(screen.queryByTestId("shop-owner-only")).not.toBeInTheDocument();
      cleanup();
    }
  });

  it("sends the Staff logo home to Today", () => {
    const { container } = renderSupplier("/supplier/jobs", STAFF_SHOP);
    const home = container.querySelector('[data-slot="sidebar-header"] a');
    expect(home).toHaveAttribute("href", "/supplier/dashboard");
  });

  it("keeps the Owner's rail whole, Team included, with no shop line", () => {
    renderSupplier("/supplier/team", { ...STAFF_SHOP, role: "owner" as never });
    expect(screen.queryByTestId("shop-owner-only")).not.toBeInTheDocument();
    expect(screen.getByText("Workspace body")).toBeVisible();
    const nav = screen.getByRole("navigation", { name: "Primary navigation" });
    const hrefs = within(nav)
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));
    expect(hrefs.length).toBeGreaterThan(1);
    expect(hrefs).toContain("/supplier/team");
    expect(screen.queryByText(/· Staff/)).not.toBeInTheDocument();
  });

  it("treats an existing shop account without a shop summary as its Owner", () => {
    renderSupplier("/supplier/payouts", null);
    expect(screen.getByText("Workspace body")).toBeVisible();
    expect(screen.queryByTestId("shop-owner-only")).not.toBeInTheDocument();
  });
});
