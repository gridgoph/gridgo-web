// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "@/components/shell/AppShell";
import {
  RAIL_GROUPS_STORAGE_KEY,
  RAIL_OPEN_STORAGE_KEY,
} from "@/components/shell/rail-state";
import { navForRole, navGroupsForRole, type PortalRole } from "@/lib/nav";
import { TooltipProvider } from "@/components/ui/tooltip";

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

const { ordersRef, listOrdersMock, countMocks } = vi.hoisted(() => {
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
    },
  };
});

vi.mock("@/lib/api/client", () => ({
  listOrders: listOrdersMock,
  listUsers: countMocks.listUsers,
  listApprovalCases: countMocks.listApprovalCases,
  listEscalations: countMocks.listEscalations,
  listClaims: countMocks.listClaims,
  listIssueReports: countMocks.listIssueReports,
  listJobs: countMocks.listJobs,
  getTracker: countMocks.getTracker,
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

function roleForPath(pathname: string) {
  if (pathname.startsWith("/ops")) return "ops_admin" as const;
  if (pathname.startsWith("/supplier")) return "supplier" as const;
  return "super_admin" as const;
}

function renderShell(pathname: string) {
  pathnameRef.current = pathname;
  return render(
    <TooltipProvider>
      <AppShell role={roleForPath(pathname)}>
        <p>Workspace body</p>
      </AppShell>
    </TooltipProvider>,
  );
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

describe("AppShell chrome", () => {
  it("uses the 3×3 mark in the rail", () => {
    const { container } = renderShell("/admin/overview");
    const mark = container.querySelector('[data-slot="logo-mark"]');
    expect(mark?.querySelectorAll("circle")).toHaveLength(9);
  });

  it("centers the collapsed-rail header mark on the nav icon column", () => {
    const { container } = renderShell("/admin/overview");
    const header = container.querySelector('[data-slot="sidebar-header"]');
    const home = header?.querySelector("a");
    expect(home).toBeTruthy();
    // Icon-rail: 44×44 cell, centered in the 60px column (8px group pad each side).
    expect(home?.className).toMatch(/group-data-\[collapsible=icon\]:size-11/);
    expect(home?.className).toMatch(/group-data-\[collapsible=icon\]:justify-center/);
    expect(home?.className).not.toMatch(/group-data-\[collapsible=icon\]:pl-1/);
    // Expanded lockup stays a left-aligned text row; the wordmark only hides on collapse.
    expect(home).toHaveTextContent("GRIDGO");
    expect(home).toHaveTextContent("Super Admin");
    const wordmark = [...(home?.querySelectorAll("div") ?? [])].find((el) =>
      el.className.includes("group-data-[collapsible=icon]:hidden"),
    );
    expect(wordmark).toBeTruthy();
    expect(wordmark?.className).not.toMatch(/justify-center/);
  });

  it("stretches the header divider to the header, not a short tick", () => {
    const { container } = renderShell("/admin/overview");
    const header = container.querySelector("header");
    const divider = header?.querySelector('[data-slot="separator"]');
    expect(divider).toBeInTheDocument();
    expect(divider?.className).not.toMatch(/h-6/);
    expect(header?.className).toMatch(/\bh-14\b/);
  });

  it("keeps one whole-rail toggle in the header and collapses the icon rail", async () => {
    const user = userEvent.setup();
    const { container } = renderShell("/admin/overview");
    const header = container.querySelector("header");
    expect(header).toBeTruthy();
    const toggle = within(header as HTMLElement).getByRole("button", {
      name: "Toggle primary navigation",
    });
    expect(toggle).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Toggle primary navigation" }),
    ).toHaveLength(1);
    expect(header?.className).toMatch(/\bpl-1\.5\b/);
    expect(header?.className).not.toMatch(/xl:px-8/);
    expect(header?.querySelector('[data-slot="sidebar-trigger"]')).toBe(
      header?.firstElementChild?.firstElementChild,
    );
    const rail = container.querySelector('[data-slot="sidebar"]');
    expect(rail).toHaveAttribute("data-state", "expanded");
    await user.click(toggle);
    expect(rail).toHaveAttribute("data-state", "collapsed");
    expect(rail).toHaveAttribute("data-collapsible", "icon");
  });

  it("puts a header bell with an unread count and no extra nav item", () => {
    liveRef.current = {
      ...liveRef.current,
      unreadCount: 2,
      notifications: [
        {
          id: "ntf_1",
          userId: "user_admin",
          title: "Payment submitted",
          body: "A shop sent QR proof.",
          read: false,
          at: "2026-09-03T00:00:00.000Z",
        },
      ],
    };
    const { container } = renderShell("/ops/overview");
    const header = container.querySelector("header");
    expect(header).toBeTruthy();
    expect(
      within(header as HTMLElement).getByRole("button", {
        name: "Notifications, 2 unread",
      }),
    ).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Primary navigation" });
    expect(within(nav).queryByRole("link", { name: /notification/i })).toBeNull();
  });

  it("puts identity in a footer menu trigger, not the header", () => {
    const { container } = renderShell("/admin/overview");
    const header = container.querySelector("header");
    expect(
      header && within(header).queryByRole("button", { name: /Ada Admin/ }),
    ).toBeNull();
    expect(
      header && within(header).queryByRole("button", { name: "Sign out" }),
    ).toBeNull();

    const footer = container.querySelector('[data-slot="sidebar-footer"]');
    expect(footer).toBeInTheDocument();
    const trigger = within(footer as HTMLElement).getByRole("button", {
      name: /Ada Admin/,
    });
    expect(trigger).toHaveAttribute("data-slot", "account-menu");
    expect(trigger).toHaveTextContent("Ada Admin");
    expect(trigger).toHaveTextContent("Super Admin");
    expect(trigger).toHaveTextContent("AA");
    expect(trigger.querySelector("svg")).not.toBeNull();
    expect(trigger.querySelector('[data-slot="avatar"]')).not.toBeNull();
    expect(
      within(footer as HTMLElement).queryByRole("button", { name: "Sign out" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Log out" })).toBeNull();
  });

  it("shows the Clerk person instead of the portal API display name", () => {
    userRef.current = {
      ...userRef.current,
      name: "Operations Lead",
      email: "ops@example.com",
    };
    clerkUserRef.current = {
      id: "user_clerk_ops",
      fullName: "Giorno Giovanna",
      firstName: "Giorno",
      lastName: "Giovanna",
      imageUrl: "https://img.clerk.com/giorno.png",
      primaryEmailAddress: { emailAddress: "giorno@example.com" },
    };
    const { container } = renderShell("/ops/overview");
    const footer = container.querySelector('[data-slot="sidebar-footer"]');
    const trigger = within(footer as HTMLElement).getByRole("button", {
      name: /Giorno Giovanna/,
    });
    expect(trigger).toHaveTextContent("Giorno Giovanna");
    expect(trigger).toHaveTextContent("Operations");
    expect(trigger).not.toHaveTextContent("Operations Lead");
    expect(trigger.querySelector('[data-slot="avatar"]')).not.toBeNull();
  });

  it("falls back to the portal name when Clerk has not loaded a profile", () => {
    clerkUserRef.current = null;
    userRef.current = { ...userRef.current, name: "Operations Lead" };
    const { container } = renderShell("/ops/overview");
    const footer = container.querySelector('[data-slot="sidebar-footer"]');
    expect(
      within(footer as HTMLElement).getByRole("button", { name: /Operations Lead/ }),
    ).toBeInTheDocument();
    expect((footer as HTMLElement).querySelector("img")).toBeNull();
  });

  it("opens the Clerk account profile from the footer menu", async () => {
    const user = userEvent.setup();
    const { container } = renderShell("/ops/overview");
    const footer = container.querySelector('[data-slot="sidebar-footer"]');
    await user.click(
      within(footer as HTMLElement).getByRole("button", { name: /Ada Admin/ }),
    );
    await user.click(await screen.findByRole("menuitem", { name: "Manage account" }));
    expect(openUserProfileMock).toHaveBeenCalledTimes(1);
  });

  it("opens Log out and Settings for admin, Settings for ops, and no Settings for suppliers", async () => {
    const user = userEvent.setup();
    const { container: admin } = renderShell("/admin/overview");
    const adminFooter = admin.querySelector('[data-slot="sidebar-footer"]');
    await user.click(
      within(adminFooter as HTMLElement).getByRole("button", {
        name: /Ada Admin/,
      }),
    );
    expect(await screen.findByRole("menuitem", { name: "Log out" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Settings" })).toHaveAttribute(
      "href",
      "/admin/settings",
    );

    cleanup();
    const { container: ops } = renderShell("/ops/overview");
    const opsFooter = ops.querySelector('[data-slot="sidebar-footer"]');
    expect(opsFooter).toHaveTextContent("Operations");
    await user.click(
      within(opsFooter as HTMLElement).getByRole("button", {
        name: /Ada Admin/,
      }),
    );
    expect(await screen.findByRole("menuitem", { name: "Log out" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Settings" })).toHaveAttribute(
      "href",
      "/ops/settings",
    );

    cleanup();
    const { container: supplier } = renderShell("/supplier/jobs");
    const supplierFooter = supplier.querySelector('[data-slot="sidebar-footer"]');
    expect(supplierFooter).toHaveTextContent("Supplier partner");
    await user.click(
      within(supplierFooter as HTMLElement).getByRole("button", {
        name: /Ada Admin/,
      }),
    );
    expect(await screen.findByRole("menuitem", { name: "Log out" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Settings" })).not.toBeInTheDocument();
  });

  it("offers the other portal workspace when the identity has both memberships", async () => {
    membershipsRef.current = [{ role: "super_admin" }, { role: "ops_admin" }];
    const user = userEvent.setup();
    const { container } = renderShell("/admin/overview");
    const footer = container.querySelector('[data-slot="sidebar-footer"]');
    await user.click(
      within(footer as HTMLElement).getByRole("button", {
        name: /Ada Admin/,
      }),
    );
    expect(
      await screen.findByRole("menuitem", { name: "Open Operations" }),
    ).toHaveAttribute("href", "/ops/orders");
    expect(
      screen.queryByRole("menuitem", { name: "Open Super Admin" }),
    ).not.toBeInTheDocument();
  });

  it("invokes portal sign-out from the account menu Log out item", async () => {
    const user = userEvent.setup();
    const { container } = renderShell("/admin/overview");
    const footer = container.querySelector('[data-slot="sidebar-footer"]');
    await user.click(
      within(footer as HTMLElement).getByRole("button", {
        name: /Ada Admin/,
      }),
    );
    await user.click(await screen.findByRole("menuitem", { name: "Log out" }));
    expect(signOutMock).toHaveBeenCalledTimes(1);
  });

  it("marks the active nav item with yellow text, accent wash, and no left bar", () => {
    const { container } = renderShell("/admin/overview");
    const nav = screen.getByRole("navigation", { name: "Primary navigation" });
    const current = within(nav).getByRole("link", { name: "Overview" });
    expect(current).toHaveAttribute("aria-current", "page");
    expect(current.className).toMatch(/action-yellow/);
    expect(current.className).toMatch(/group-data-\[collapsible=icon\]:justify-center/);
    expect(current.className).toMatch(/group-data-\[collapsible=icon\]:size-11/);
    expect(current.className).toMatch(/data-active:bg-sidebar-accent/);
    expect(current.className).not.toMatch(/data-active:bg-transparent/);
    expect(current.className).not.toMatch(/border-l/);
    expect(container.querySelector(".w-1.rounded-r-full")).toBeNull();
    expect(nav.querySelector('[class*="inset-y-2"][class*="left-0"]')).toBeNull();
  });

  it("keeps unlabeled clusters as plain rows and turns labeled groups into disclosures", () => {
    renderShell("/ops/overview");
    const opsNav = screen.getByRole("navigation", { name: "Primary navigation" });
    expect(within(opsNav).getByRole("link", { name: "Overview" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(opsNav).getByRole("link", { name: "Chat" })).toBeInTheDocument();
    expect(within(opsNav).getByRole("link", { name: "Issue reports" })).toBeInTheDocument();
    for (const label of ["Queue", "Field", "Money", "System"]) {
      const trigger = within(opsNav).getByRole("button", { name: label });
      expect(trigger).toHaveAttribute("aria-expanded", "false");
      expect(trigger.querySelector(".lucide-chevron-right")).not.toBeNull();
    }
    // A folded group's pages are out of the tab order until it opens.
    expect(within(opsNav).queryByRole("link", { name: "Dispatch" })).toBeNull();

    cleanup();
    renderShell("/admin/overview");
    const adminNav = screen.getByRole("navigation", { name: "Primary navigation" });
    expect(within(adminNav).getByRole("link", { name: "Overview" })).toBeInTheDocument();
    for (const label of ["People", "Catalog", "Money", "System"]) {
      expect(within(adminNav).getByRole("button", { name: label })).toBeInTheDocument();
    }

    cleanup();
    renderShell("/supplier/jobs");
    const supplierNav = screen.getByRole("navigation", { name: "Primary navigation" });
    expect(within(supplierNav).getByRole("link", { name: "Jobs" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    for (const label of ["Shop", "Money"]) {
      expect(within(supplierNav).getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("opens the group holding the current page and leaves the rest folded", () => {
    renderShell("/ops/orders");
    const nav = screen.getByRole("navigation", { name: "Primary navigation" });
    expect(within(nav).getByRole("button", { name: "Queue" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    const orders = within(nav).getByRole("link", { name: "Orders" });
    expect(orders).toHaveAttribute("aria-current", "page");
    expect(orders.className).toMatch(/action-yellow/);
    expect(orders.closest('[data-slot="sidebar-menu-sub"]')).not.toBeNull();
    expect(within(nav).getByRole("link", { name: "Sign-up approvals" })).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: "Field" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(within(nav).queryByRole("link", { name: "Dispatch" })).toBeNull();
  });

  it("opens the group of a nested page, even one the person folded", () => {
    window.localStorage.setItem(
      RAIL_GROUPS_STORAGE_KEY,
      JSON.stringify({ "ops-money": false }),
    );
    renderShell("/ops/payouts/ord_demo");
    const nav = screen.getByRole("navigation", { name: "Primary navigation" });
    expect(within(nav).getByRole("button", { name: "Money" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(within(nav).getByRole("link", { name: "Supplier payouts" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("opens a folded group when navigation lands inside it", () => {
    const { rerender } = renderShell("/ops/overview");
    const nav = screen.getByRole("navigation", { name: "Primary navigation" });
    expect(within(nav).getByRole("button", { name: "Field" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    pathnameRef.current = "/ops/dispatch";
    rerender(
      <TooltipProvider>
        <AppShell role="ops_admin">
          <p>Workspace body</p>
        </AppShell>
      </TooltipProvider>,
    );
    expect(within(nav).getByRole("button", { name: "Field" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(within(nav).getByRole("link", { name: "Dispatch" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("remembers which groups the person opened and closed", async () => {
    const user = userEvent.setup();
    renderShell("/ops/orders");
    let nav = screen.getByRole("navigation", { name: "Primary navigation" });
    await user.click(within(nav).getByRole("button", { name: "Field" }));
    expect(within(nav).getByRole("button", { name: "Field" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await user.click(within(nav).getByRole("button", { name: "Queue" }));
    expect(
      JSON.parse(window.localStorage.getItem(RAIL_GROUPS_STORAGE_KEY) ?? "{}"),
    ).toEqual({ "ops-field": true, "ops-queue": false });

    cleanup();
    renderShell("/ops/overview");
    nav = screen.getByRole("navigation", { name: "Primary navigation" });
    expect(within(nav).getByRole("button", { name: "Field" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(within(nav).getByRole("link", { name: "Dispatch" })).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: "Queue" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("survives unreadable remembered state", () => {
    window.localStorage.setItem(RAIL_GROUPS_STORAGE_KEY, "{not json");
    window.localStorage.setItem(RAIL_OPEN_STORAGE_KEY, "sideways");
    const { container } = renderShell("/ops/orders");
    expect(container.querySelector('[data-slot="sidebar"]')).toHaveAttribute(
      "data-state",
      "expanded",
    );
    expect(screen.getByRole("button", { name: "Queue" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("remembers the folded icon rail across visits and toggles with Ctrl/Cmd+B", async () => {
    const user = userEvent.setup();
    const { container } = renderShell("/admin/overview");
    await user.click(screen.getByRole("button", { name: "Toggle primary navigation" }));
    expect(window.localStorage.getItem(RAIL_OPEN_STORAGE_KEY)).toBe("false");

    cleanup();
    const { container: again } = renderShell("/admin/overview");
    const rail = again.querySelector('[data-slot="sidebar"]');
    expect(rail).toHaveAttribute("data-state", "collapsed");
    expect(rail).toHaveAttribute("data-collapsible", "icon");

    await user.keyboard("{Control>}b{/Control}");
    expect(rail).toHaveAttribute("data-state", "expanded");
    expect(window.localStorage.getItem(RAIL_OPEN_STORAGE_KEY)).toBe("true");
    await user.keyboard("{Meta>}b{/Meta}");
    expect(rail).toHaveAttribute("data-state", "collapsed");
    expect(container).toBeTruthy();
  });

  it("opens a folded group's pages in a flyout from the icon rail", async () => {
    window.localStorage.setItem(RAIL_OPEN_STORAGE_KEY, "false");
    const user = userEvent.setup();
    renderShell("/ops/dispatch");
    const nav = screen.getByRole("navigation", { name: "Primary navigation" });
    const field = within(nav).getByRole("button", { name: "Field" });
    expect(field).toHaveAttribute("aria-expanded", "false");
    expect(field).toHaveAttribute("data-active");
    await user.click(field);
    const dispatch = await screen.findByRole("menuitem", { name: "Dispatch" });
    await vi.waitFor(() =>
      expect(within(nav).getByRole("button", { name: "Field" })).toHaveAttribute(
        "aria-expanded",
        "true",
      ),
    );
    expect(dispatch).toHaveAttribute("href", "/ops/dispatch");
    expect(dispatch).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("menuitem", { name: "Riders" })).toHaveAttribute(
      "href",
      "/ops/riders",
    );
  });

  describe("every rail page stays reachable", () => {
    const cases: Array<[PortalRole, string]> = [
      ["supplier", "/supplier/dashboard"],
      ["ops_admin", "/ops/overview"],
      ["super_admin", "/admin/overview"],
    ];

    it.each(cases)("%s: from the expanded rail", async (role, home) => {
      const user = userEvent.setup();
      renderShell(home);
      const nav = screen.getByRole("navigation", { name: "Primary navigation" });
      for (const group of navGroupsForRole(role)) {
        if (!group.label) continue;
        const trigger = within(nav).getByRole("button", { name: group.label });
        if (trigger.getAttribute("aria-expanded") !== "true") await user.click(trigger);
      }
      const hrefs = within(nav)
        .getAllByRole("link")
        .map((link) => link.getAttribute("href"));
      expect(hrefs.sort()).toEqual(navForRole(role).map((item) => item.href).sort());
    });

    it.each(cases)("%s: from the icon rail", async (role, home) => {
      window.localStorage.setItem(RAIL_OPEN_STORAGE_KEY, "false");
      const user = userEvent.setup();
      renderShell(home);
      const nav = screen.getByRole("navigation", { name: "Primary navigation" });
      const reached = within(nav)
        .getAllByRole("link")
        .map((link) => link.getAttribute("href"));
      for (const group of navGroupsForRole(role)) {
        if (!group.label) continue;
        await user.click(within(nav).getByRole("button", { name: group.label }));
        const items = await screen.findAllByRole("menuitem");
        reached.push(...items.map((item) => item.getAttribute("href")));
        await user.keyboard("{Escape}");
      }
      expect(reached.sort()).toEqual(navForRole(role).map((item) => item.href).sort());
    });
  });

  it("keeps a nested parent crumb as a same-tab link with a destination tooltip", async () => {
    const user = userEvent.setup();
    renderShell("/ops/orders/ord_demo");

    const crumb = screen.getByRole("navigation", { name: "breadcrumb" });
    const parent = within(crumb).getByRole("link", { name: "Back to Orders" });
    expect(parent).toHaveAttribute("href", "/ops/orders");
    expect(parent).not.toHaveAttribute("target");
    expect(parent).toHaveAttribute("data-base-ui-tooltip-trigger");
    expect(parent).toHaveTextContent("Orders");

    await user.hover(parent);
    expect(
      await screen.findByText("Back to Orders", {
        selector: "[data-slot='tooltip-content']",
      }),
    ).toBeInTheDocument();

    const current = within(crumb).getByText("Order workspace");
    expect(current.tagName).not.toBe("A");
    expect(current.closest("a")).toBeNull();
  });

  describe("section headings", () => {
    const headings = (nav: HTMLElement) =>
      Array.from(nav.querySelectorAll('[data-slot="sidebar-group-label"]')).map(
        (label) => label.textContent,
      );

    it("heads each role's rail with small muted section labels", () => {
      renderShell("/ops/overview");
      let nav = screen.getByRole("navigation", { name: "Primary navigation" });
      expect(headings(nav)).toEqual(["Desk", "Work", "Platform"]);
      // Each heading names its run of rows for assistive tech too.
      const work = within(nav).getByRole("group", { name: "Work" });
      for (const label of ["Queue", "Field", "Money"]) {
        expect(within(work).getByRole("button", { name: label })).toBeInTheDocument();
      }
      expect(
        within(within(nav).getByRole("group", { name: "Desk" })).getByRole("link", {
          name: "Chat",
        }),
      ).toBeInTheDocument();

      cleanup();
      renderShell("/admin/overview");
      nav = screen.getByRole("navigation", { name: "Primary navigation" });
      expect(headings(nav)).toEqual(["Desk", "Manage", "Platform"]);

      cleanup();
      renderShell("/supplier/dashboard");
      nav = screen.getByRole("navigation", { name: "Primary navigation" });
      expect(headings(nav)).toEqual(["Work", "Business"]);
    });

    it("drops the headings on the icon rail", () => {
      window.localStorage.setItem(RAIL_OPEN_STORAGE_KEY, "false");
      renderShell("/ops/overview");
      const nav = screen.getByRole("navigation", { name: "Primary navigation" });
      expect(nav.querySelector('[data-slot="sidebar-group-label"]')).toBeNull();
      expect(within(nav).queryByText("Desk")).toBeNull();
      expect(nav.querySelectorAll("[data-nav-section]")).toHaveLength(3);
    });
  });

  describe("count badges", () => {
    beforeEach(() => {
      ordersRef.current = [];
      listOrdersMock.mockClear();
    });

    const waiting = [
      {
        id: "ord_transfer",
        state: "initial_payment_review",
        payments: { downpayment: { status: "pending_confirmation" } },
      },
      { id: "ord_artwork", state: "needs_qa" },
      { id: "ord_with_shop", state: "production" },
    ];

    function withSignups(count: number) {
      countMocks.listUsers.mockImplementation(async (role?: string) =>
        role === "supplier"
          ? Array.from({ length: count }, (_, i) => ({
              id: `sup_${i}`,
              verificationStatus: "pending",
            }))
          : [{ id: "rider_ok", verificationStatus: "approved" }],
      );
    }

    afterEach(() => {
      countMocks.listUsers.mockImplementation(async () => []);
      countMocks.listSupportChatThreads.mockImplementation(async () => []);
    });

    it("sits the count right after the Orders label, in yellow, and names it", async () => {
      ordersRef.current = waiting;
      renderShell("/ops/orders");

      const orders = await screen.findByRole("link", { name: "Orders, 2 need action" });
      expect(orders).toHaveAttribute("href", "/ops/orders");
      const badge = orders.querySelector('[data-slot="nav-count"]') as HTMLElement;
      expect(badge).toHaveTextContent("2");
      expect(badge).toHaveAttribute("data-tone", "attention");
      expect(badge.className).toContain("--color-action-yellow");
      // Inline: the badge is inside the row, straight after the label, not a
      // sibling pinned to the far edge.
      expect(badge.previousElementSibling).toHaveTextContent(/^Orders$/);
      expect(badge.className).not.toMatch(/\babsolute\b|right-/);
    });

    it("gives every other count a quiet monochrome pill", async () => {
      withSignups(2);
      renderShell("/ops/approvals");

      const approvals = await screen.findByRole("link", {
        name: "Sign-up approvals, 2 waiting for review",
      });
      const badge = approvals.querySelector('[data-slot="nav-count"]') as HTMLElement;
      expect(badge).toHaveAttribute("data-tone", "quiet");
      expect(badge.className).not.toContain("action-yellow");
    });

    it("puts the sum beside a folded group's name", async () => {
      ordersRef.current = waiting;
      withSignups(3);
      renderShell("/ops/overview");

      const queue = await screen.findByRole("button", { name: "Queue, 5 need action" });
      expect(queue).toHaveAttribute("aria-expanded", "false");
      const total = queue.querySelector('[data-slot="nav-count"]') as HTMLElement;
      expect(total).toHaveTextContent("5");
      // Filled while folded, yellow because an order is among the five.
      expect(total).toHaveAttribute("data-tone", "attention");
      expect(total.previousElementSibling).toHaveTextContent(/^Queue$/);
      expect(listOrdersMock).toHaveBeenCalledTimes(1);
    });

    it("outlines an open group's total so it reads as the sum of the rows below", async () => {
      ordersRef.current = waiting;
      withSignups(3);
      const user = userEvent.setup();
      renderShell("/ops/overview");

      const queue = await screen.findByRole("button", { name: "Queue, 5 need action" });
      await user.click(queue);
      expect(queue).toHaveAttribute("aria-expanded", "true");
      expect(queue.querySelector('[data-slot="nav-count"]')).toHaveAttribute(
        "data-tone",
        "total",
      );
      expect(
        await screen.findByRole("link", { name: "Orders, 2 need action" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Sign-up approvals, 3 waiting for review" }),
      ).toBeInTheDocument();
    });

    it("drops an open group's total when a single row carries the count", async () => {
      ordersRef.current = waiting;
      renderShell("/ops/orders");

      const orders = await screen.findByRole("link", { name: "Orders, 2 need action" });
      expect(orders.querySelector('[data-slot="nav-count"]')).toHaveTextContent("2");
      const queue = screen.getByRole("button", { name: "Queue, 2 need action" });
      expect(queue).toHaveAttribute("aria-expanded", "true");
      expect(queue.querySelector('[data-slot="nav-count"]')).toBeNull();
    });

    it("reads 99+ past ninety-nine", async () => {
      countMocks.listSupportChatThreads.mockImplementation(async () => [
        { unreadCount: 80 },
        { unreadCount: 70 },
      ]);
      renderShell("/ops/overview");

      const chat = await screen.findByRole("link", { name: "Chat, 99+ unread" });
      expect(chat.querySelector('[data-slot="nav-count"]')).toHaveTextContent("99+");
    });

    it("counts Needs decision on the Super Admin Tracker row, quietly", async () => {
      countMocks.getTracker.mockImplementation(async () => ({
        fetchedAt: "2026-09-25T00:00:00.000Z",
        items: [{ status: "needs-decision" }, { status: "needs-decision" }, { status: "live" }],
      }));
      renderShell("/admin/tracker");

      const tracker = await screen.findByRole("link", { name: "Tracker, 2 need a decision" });
      expect(tracker).toHaveAttribute("href", "/admin/tracker");
      const badge = tracker.querySelector('[data-slot="nav-count"]') as HTMLElement;
      expect(badge).toHaveTextContent("2");
      expect(badge).toHaveAttribute("data-tone", "quiet");
      expect(badge.previousElementSibling).toHaveTextContent(/^Tracker$/);
    });

    it("never shows or reads the Tracker on an Operations or supplier rail", async () => {
      renderShell("/ops/overview");
      await vi.waitFor(() => expect(listOrdersMock).toHaveBeenCalled());
      let nav = screen.getByRole("navigation", { name: "Primary navigation" });
      expect(within(nav).queryByRole("link", { name: /Tracker/ })).toBeNull();

      cleanup();
      renderShell("/supplier/dashboard");
      await vi.waitFor(() => expect(countMocks.listJobs).toHaveBeenCalled());
      nav = screen.getByRole("navigation", { name: "Primary navigation" });
      expect(within(nav).queryByRole("link", { name: /Tracker/ })).toBeNull();
      expect(countMocks.getTracker).not.toHaveBeenCalled();
    });

    it("draws nothing at zero", async () => {
      ordersRef.current = [{ id: "ord_with_shop", state: "production" }];
      renderShell("/ops/overview");

      await vi.waitFor(() => expect(listOrdersMock).toHaveBeenCalled());
      await vi.waitFor(() => expect(countMocks.listSupportChatThreads).toHaveBeenCalled());
      const nav = screen.getByRole("navigation", { name: "Primary navigation" });
      expect(nav.querySelector('[data-slot="nav-count"]')).toBeNull();
      expect(within(nav).getByRole("button", { name: "Queue" })).toBeInTheDocument();
      expect(within(nav).getByRole("link", { name: "Chat" })).toBeInTheDocument();
    });

    it("marks the group icon on the icon rail and lists each count in the flyout", async () => {
      window.localStorage.setItem(RAIL_OPEN_STORAGE_KEY, "false");
      ordersRef.current = waiting;
      withSignups(1);
      const user = userEvent.setup();
      renderShell("/ops/overview");

      const queue = await screen.findByRole("button", { name: "Queue, 3 need action" });
      const bubble = queue.querySelector('[data-slot="rail-count"]') as HTMLElement;
      expect(bubble).toHaveTextContent("3");
      expect(bubble).toHaveAttribute("data-tone", "attention");

      await user.click(queue);
      expect(
        await screen.findByRole("menuitem", { name: "Orders, 2 need action" }),
      ).toHaveAttribute("href", "/ops/orders");
      expect(
        screen.getByRole("menuitem", { name: "Sign-up approvals, 1 waiting for review" }),
      ).toHaveAttribute("href", "/ops/approvals");
    });

    it("reads only the counts a rail shows", async () => {
      renderShell("/supplier/dashboard");
      await vi.waitFor(() => expect(countMocks.listJobs).toHaveBeenCalledTimes(1));
      expect(listOrdersMock).not.toHaveBeenCalled();
      expect(countMocks.listUsers).not.toHaveBeenCalled();
      expect(countMocks.listSupportChatThreads).not.toHaveBeenCalled();

      cleanup();
      countMocks.listJobs.mockClear();
      renderShell("/admin/overview");
      await vi.waitFor(() => expect(countMocks.listSupportChatThreads).toHaveBeenCalled());
      expect(listOrdersMock).not.toHaveBeenCalled();
      expect(countMocks.listEscalations).not.toHaveBeenCalled();
      expect(countMocks.listJobs).not.toHaveBeenCalled();
    });
  });
});
