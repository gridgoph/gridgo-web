// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "@/components/shell/AppShell";
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

const { pathnameRef, signOutMock, membershipsRef, userRef, clerkUserRef, openUserProfileMock } =
  vi.hoisted(() => ({
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
  membershipsRef.current = [];
  userRef.current = {
    id: "user_admin",
    email: "admin@example.com",
    name: "Ada Admin",
    role: "super_admin",
  };
  clerkUserRef.current = { ...adaClerk };
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
    expect(
      (footer as HTMLElement).querySelector("img"),
    ).toBeNull();
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
    expect(await screen.findByRole("menuitem", { name: "Open Operations" })).toHaveAttribute(
      "href",
      "/ops/orders",
    );
    expect(screen.queryByRole("menuitem", { name: "Open Super Admin" })).not.toBeInTheDocument();
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

  it("groups ops, admin, and supplier rails with Overview/Jobs kept top-level", () => {
    renderShell("/ops/overview");
    const opsNav = screen.getByRole("navigation", { name: "Primary navigation" });
    expect(within(opsNav).getByRole("link", { name: "Overview" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    // Group labels are static text — never buttons or disclosure triggers.
    expect(within(opsNav).queryByRole("button", { name: "Queue" })).toBeNull();
    expect(within(opsNav).queryByRole("button", { name: "Field" })).toBeNull();
    expect(within(opsNav).queryByRole("button", { name: "Money" })).toBeNull();
    expect(within(opsNav).queryByRole("button", { name: "System" })).toBeNull();
    expect(within(opsNav).getByText("Queue")).toBeInTheDocument();
    expect(within(opsNav).getByText("Field")).toBeInTheDocument();
    expect(within(opsNav).getByText("Money")).toBeInTheDocument();
    expect(within(opsNav).getByText("System")).toBeInTheDocument();
    // Items in every group stay visible without expanding.
    expect(within(opsNav).getByRole("link", { name: "Dispatch" })).toHaveAttribute(
      "href",
      "/ops/dispatch",
    );

    cleanup();
    renderShell("/admin/overview");
    const adminNav = screen.getByRole("navigation", { name: "Primary navigation" });
    expect(within(adminNav).getByRole("link", { name: "Overview" })).toBeInTheDocument();
    expect(within(adminNav).queryByRole("button", { name: "People" })).toBeNull();
    expect(within(adminNav).queryByRole("button", { name: "Catalog" })).toBeNull();
    expect(within(adminNav).queryByRole("button", { name: "Money" })).toBeNull();
    expect(within(adminNav).queryByRole("button", { name: "System" })).toBeNull();
    expect(within(adminNav).getByText("People")).toBeInTheDocument();
    expect(within(adminNav).getByText("Catalog")).toBeInTheDocument();
    expect(within(adminNav).getByText("Money")).toBeInTheDocument();
    expect(within(adminNav).getByText("System")).toBeInTheDocument();
    expect(within(adminNav).getByRole("link", { name: "Roles" })).toBeInTheDocument();

    cleanup();
    renderShell("/supplier/jobs");
    const supplierNav = screen.getByRole("navigation", { name: "Primary navigation" });
    expect(within(supplierNav).getByRole("link", { name: "Jobs" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(supplierNav).queryByRole("button", { name: "Shop" })).toBeNull();
    expect(within(supplierNav).queryByRole("button", { name: "Money" })).toBeNull();
    expect(within(supplierNav).getByText("Shop")).toBeInTheDocument();
    expect(within(supplierNav).getByText("Money")).toBeInTheDocument();
    expect(within(supplierNav).getByRole("link", { name: "Payouts" })).toHaveAttribute(
      "href",
      "/supplier/payouts",
    );
  });

  it("keeps every nav group open so items stay reachable without expanding", () => {
    renderShell("/ops/orders");
    const nav = screen.getByRole("navigation", { name: "Primary navigation" });
    const payments = within(nav).getByRole("link", { name: "Orders" });
    expect(payments).toHaveAttribute("aria-current", "page");
    expect(payments.className).toMatch(/action-yellow/);
    expect(within(nav).getByRole("link", { name: "Sign-up approvals" })).toBeInTheDocument();
    // Other groups stay expanded — no click required.
    expect(within(nav).getByRole("link", { name: "Dispatch" })).toHaveAttribute(
      "href",
      "/ops/dispatch",
    );
    expect(within(nav).getByRole("link", { name: "Escalations" })).toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: "Schedule" })).toBeInTheDocument();
    expect(
      within(nav).getByRole("link", { name: "Supplier payouts" }),
    ).toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: "Audit" })).toBeInTheDocument();
    expect(within(nav).queryByRole("button", { name: "Field" })).toBeNull();
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
});
