// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "@/components/shell/AppShell";
import { TooltipProvider } from "@/components/ui/tooltip";

const { pathnameRef } = vi.hoisted(() => ({
  pathnameRef: { current: "/admin/overview" },
}));

vi.stubGlobal("React", React);

vi.mock("next/navigation", () => ({
  usePathname: () => pathnameRef.current,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/lib/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: {
      id: "user_admin",
      email: "admin@example.com",
      name: "Ada Admin",
      role: "super_admin",
    },
    signOut: vi.fn(),
    loading: false,
  }),
}));

function mockMatchMedia(width = 1280) {
  Object.defineProperty(window, "innerWidth", { writable: true, value: width });
  window.matchMedia = ((query: string) =>
    ({
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
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AppShell chrome", () => {
  it("uses the 3×3 mark in the rail", () => {
    const { container } = renderShell("/admin/overview");
    const mark = container.querySelector('[data-slot="logo-mark"]');
    expect(mark?.querySelectorAll("circle")).toHaveLength(9);
  });

  it("stretches the header divider to the header, not a short tick", () => {
    const { container } = renderShell("/admin/overview");
    const header = container.querySelector("header");
    const divider = header?.querySelector('[data-slot="separator"]');
    expect(divider).toBeInTheDocument();
    expect(divider?.className).not.toMatch(/h-6/);
    expect(header?.className).toMatch(/\bh-14\b/);
  });

  it("keeps the nav toggle in the header and parks it next to the rail", () => {
    const { container } = renderShell("/admin/overview");
    const header = container.querySelector("header");
    expect(header).toBeTruthy();
    expect(
      within(header as HTMLElement).getByRole("button", {
        name: "Toggle primary navigation",
      }),
    ).toBeInTheDocument();
    expect(header?.className).toMatch(/\bpl-1\.5\b/);
    expect(header?.className).not.toMatch(/xl:px-8/);
    expect(
      header?.querySelector('[data-slot="sidebar-trigger"]'),
    ).toBe(header?.firstElementChild?.firstElementChild);
  });

  it("puts identity and sign-out in the sidebar footer, not the header", () => {
    const { container } = renderShell("/admin/overview");
    const header = container.querySelector("header");
    expect(
      screen.queryByRole("button", { name: "Account menu" }),
    ).not.toBeInTheDocument();
    expect(
      header && within(header).queryByRole("button", { name: "Sign out" }),
    ).toBeNull();

    const card = container.querySelector('[data-slot="account-card"]');
    expect(card).toBeInTheDocument();
    expect(card).toHaveTextContent("Ada Admin");
    expect(card).toHaveTextContent("Super Admin");
    expect(card).toHaveTextContent("AA");
    expect(
      within(card as HTMLElement).getByRole("button", { name: "Sign out" }),
    ).toBeInTheDocument();
    expect(
      within(card as HTMLElement).getByRole("link", {
        name: "Operational settings",
      }),
    ).toHaveAttribute("href", "/admin/settings");
  });

  it("links the footer gear to Operations settings and hides it for suppliers", () => {
    const { container: ops } = renderShell("/ops/overview");
    const opsCard = ops.querySelector('[data-slot="account-card"]');
    expect(opsCard).toHaveTextContent("Operations");
    expect(
      within(opsCard as HTMLElement).getByRole("link", {
        name: "Operational settings",
      }),
    ).toHaveAttribute("href", "/ops/settings");

    cleanup();
    const { container: supplier } = renderShell("/supplier/jobs");
    const supplierCard = supplier.querySelector('[data-slot="account-card"]');
    expect(supplierCard).toHaveTextContent("Supplier partner");
    expect(
      within(supplierCard as HTMLElement).queryByRole("link", {
        name: "Operational settings",
      }),
    ).not.toBeInTheDocument();
    expect(
      within(supplierCard as HTMLElement).getByRole("button", { name: "Sign out" }),
    ).toBeInTheDocument();
  });

  it("marks the active nav item with yellow text and no left bar", () => {
    const { container } = renderShell("/admin/overview");
    const nav = screen.getByRole("navigation", { name: "Primary navigation" });
    const current = within(nav).getByRole("link", { name: "Overview" });
    expect(current).toHaveAttribute("aria-current", "page");
    expect(current.className).toMatch(/action-yellow/);
    expect(current.className).not.toMatch(/border-l/);
    expect(container.querySelector(".w-1.rounded-r-full")).toBeNull();
    expect(
      nav.querySelector('[class*="inset-y-2"][class*="left-0"]'),
    ).toBeNull();
  });

  it("keeps a nested parent crumb as a same-tab link with a destination tooltip", async () => {
    const user = userEvent.setup();
    renderShell("/ops/qa/ord_demo");

    const crumb = screen.getByRole("navigation", { name: "breadcrumb" });
    const parent = within(crumb).getByRole("link", { name: "Back to QA queue" });
    expect(parent).toHaveAttribute("href", "/ops/qa");
    expect(parent).not.toHaveAttribute("target");
    expect(parent).toHaveAttribute("data-base-ui-tooltip-trigger");
    expect(parent).toHaveTextContent("QA queue");

    await user.hover(parent);
    expect(
      await screen.findByText("Back to QA queue", { selector: "[data-slot='tooltip-content']" }),
    ).toBeInTheDocument();

    const current = within(crumb).getByText("QA workspace");
    expect(current.tagName).not.toBe("A");
    expect(current.closest("a")).toBeNull();
  });
});
