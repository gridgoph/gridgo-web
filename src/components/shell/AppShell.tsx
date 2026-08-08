"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/Logo";
import { useAuth } from "@/lib/auth/AuthProvider";
import type { Role } from "@/lib/api/types";
import { roleLabel } from "@/lib/routes";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

const NAV: Record<"supplier" | "ops_admin" | "super_admin", NavItem[]> = {
  supplier: [{ href: "/supplier/jobs", label: "Job inbox", icon: Package }],
  ops_admin: [{ href: "/ops/qa", label: "QA queue", icon: ClipboardList }],
  super_admin: [
    { href: "/admin/overview", label: "Overview", icon: LayoutDashboard },
  ],
};

const CONTEXT_TITLE: Record<string, string> = {
  "/supplier/jobs": "Assigned jobs",
  "/ops/qa": "QA queue",
  "/admin/overview": "Platform overview",
};

function contextTitle(pathname: string): string {
  if (pathname.startsWith("/supplier/jobs/")) return "Order workspace";
  if (pathname.startsWith("/ops/qa/")) return "QA workspace";
  for (const [prefix, title] of Object.entries(CONTEXT_TITLE)) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return title;
  }
  return "GRIDGO";
}

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

type Props = {
  role: Role;
  children: ReactNode;
};

export function AppShell({ role, children }: Props) {
  const { user, signOut } = useAuth();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const items = NAV[role as keyof typeof NAV] ?? [];
  const title = contextTitle(pathname);

  const rail = (
    <nav
      className="flex h-full flex-col gap-1 p-3"
      aria-label="Primary"
    >
      <div className="mb-4 flex items-center justify-between px-2 pt-1">
        <Logo />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation"
        >
          <X aria-hidden />
        </Button>
      </div>

      <p className="text-overline text-text-muted mb-2 px-3 uppercase">
        {roleLabel(role)}
      </p>

      <ul className="flex list-none flex-col gap-1 p-0 m-0">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`relative flex min-h-11 items-center gap-3 rounded-field px-3 text-body transition-colors duration-200 ${
                  active
                    ? "bg-surface-variant text-text-primary"
                    : "text-text-secondary hover:bg-overlay-hover"
                }`}
                aria-current={active ? "page" : undefined}
              >
                {active ? (
                  <span
                    className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full"
                    style={{ backgroundColor: "var(--color-action-yellow)" }}
                    aria-hidden
                  />
                ) : null}
                <Icon
                  size={18}
                  strokeWidth={active ? 2.25 : 1.75}
                  aria-hidden
                />
                <span
                  className={active ? "font-[family-name:var(--font-bold)]" : undefined}
                  style={active ? { fontFamily: "var(--font-bold)" } : undefined}
                >
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="mt-auto border-t border-outline-subtle pt-3">
        <p className="text-caption text-text-muted px-3 truncate">
          {user?.name}
        </p>
        <p className="text-caption text-text-muted px-3 truncate mb-2">
          {user?.email}
        </p>
        <Button
          type="button"
          variant="outline"
          fullWidth
          className="justify-start"
          onClick={() => void signOut()}
        >
          <LogOut data-icon="inline-start" aria-hidden />
          Sign out
        </Button>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-dvh bg-canvas">
      {/* Desktop / tablet rail */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-outline bg-surface">
        {rail}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button
            type="button"
            className="absolute inset-0 border-0 p-0"
            style={{ backgroundColor: "var(--color-scrim)" }}
            aria-label="Dismiss navigation"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative z-10 flex h-full w-[min(100%,280px)] flex-col bg-surface shadow-sheet">
            {rail}
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex min-h-14 items-center gap-3 border-b border-outline bg-surface px-4 py-2 md:px-6 xl:px-8">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <Menu aria-hidden />
          </Button>

          <div className="min-w-0 flex-1">
            <p className="text-overline text-text-muted m-0 uppercase hidden sm:block">
              {roleLabel(role)}
            </p>
            <h1 className="text-h3 text-text-primary m-0 truncate">{title}</h1>
          </div>

          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Notifications"
            title="Notifications"
          >
            <Bell aria-hidden />
          </Button>

          <div className="relative">
            <Button
              type="button"
              variant="outline"
              aria-expanded={accountOpen}
              aria-haspopup="menu"
              aria-label="Account menu"
              onClick={() => setAccountOpen((v) => !v)}
            >
              <UserRound data-icon="inline-start" aria-hidden />
              <span className="hidden sm:inline max-w-[10rem] truncate">
                {user?.name ?? "Account"}
              </span>
            </Button>
            {accountOpen ? (
              <div
                role="menu"
                className="absolute right-0 mt-1 w-56 rounded-card border border-outline bg-surface p-2 shadow-sheet"
              >
                <p className="text-caption text-text-muted px-2 py-1 truncate">
                  {user?.email}
                </p>
                {user?.supplierName ? (
                  <p className="text-caption text-text-secondary px-2 pb-2 truncate">
                    {user.supplierName}
                  </p>
                ) : null}
                <Button
                  type="button"
                  role="menuitem"
                  variant="outline"
                  fullWidth
                  className="justify-start"
                  onClick={() => {
                    setAccountOpen(false);
                    void signOut();
                  }}
                >
                  <LogOut data-icon="inline-start" aria-hidden />
                  Sign out
                </Button>
              </div>
            ) : null}
          </div>
        </header>

        <main
          id="main-content"
          className="flex-1 px-4 py-4 md:px-6 md:py-6 xl:px-8 xl:py-8"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
