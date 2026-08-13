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

function renderShell(pathname: string) {
  pathnameRef.current = pathname;
  return render(
    <TooltipProvider>
      <AppShell role={pathname.startsWith("/ops") ? "ops_admin" : "super_admin"}>
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
    expect(header?.className).toMatch(/\bh-16\b/);
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
