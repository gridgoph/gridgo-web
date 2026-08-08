"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  Banknote,
  Bell,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  Coins,
  LayoutDashboard,
  LogOut,
  MapPinned,
  Menu,
  Package,
  Scale,
  Search,
  ShieldCheck,
  Truck,
  UserRound,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/Logo";
import { useAuth } from "@/lib/auth/AuthProvider";
import type { Role } from "@/lib/api/types";
import {
  contextTitleForPath,
  navForRole,
  type NavIconKey,
} from "@/lib/nav";
import { roleLabel } from "@/lib/routes";

const NAV_ICONS: Record<NavIconKey, LucideIcon> = {
  jobs: Package,
  catalogue: BookOpen,
  schedule: CalendarDays,
  capacity: ClipboardCheck,
  payouts: Wallet,
  overview: LayoutDashboard,
  qa: ClipboardList,
  matching: Search,
  recovery: AlertTriangle,
  dispatch: Truck,
  claims: Scale,
  audit: ClipboardList,
  verification: ShieldCheck,
  roles: Users,
  zones: MapPinned,
  credits: Coins,
  finance: Banknote,
  planning: CalendarDays,
};

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
  const items = navForRole(role);
  const title = contextTitleForPath(pathname, role);

  const rail = (
    <nav className="flex h-full min-h-0 flex-col p-3" aria-label="Primary">
      <div className="mb-3 flex shrink-0 items-center justify-between px-2 pt-1">
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

      <p className="text-overline text-text-muted mb-2 shrink-0 px-3 uppercase">
        {roleLabel(role)}
      </p>

      {/* Scroll long role lists so the rail does not eat the workspace at 768. */}
      <ul className="m-0 flex min-h-0 list-none flex-1 flex-col gap-0.5 overflow-y-auto p-0">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = NAV_ICONS[item.icon];
          return (
            <li key={item.id}>
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
                  className="shrink-0"
                  aria-hidden
                />
                <span
                  className="min-w-0 truncate"
                  style={active ? { fontFamily: "var(--font-bold)" } : undefined}
                >
                  {item.label}
                </span>
                {!item.ready ? (
                  <span className="text-caption text-text-muted ml-auto shrink-0">
                    Soon
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 shrink-0 border-t border-outline-subtle pt-3">
        <p className="text-caption text-text-muted truncate px-3">
          {user?.name}
        </p>
        <p className="text-caption text-text-muted mb-2 truncate px-3">
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
      {/* Desktop / tablet rail — fixed width so nine entries stay usable at 768 */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-outline bg-surface md:flex lg:w-60">
        {rail}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div
          className="fixed inset-0 z-40 md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
        >
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
            <p className="text-overline text-text-muted m-0 hidden uppercase sm:block">
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
              <span className="hidden max-w-[10rem] truncate sm:inline">
                {user?.name ?? "Account"}
              </span>
            </Button>
            {accountOpen ? (
              <div
                role="menu"
                className="absolute right-0 mt-1 w-56 rounded-card border border-outline bg-surface p-2 shadow-sheet"
              >
                <p className="text-caption text-text-muted truncate px-2 py-1">
                  {user?.email}
                </p>
                {user?.supplierName ? (
                  <p className="text-caption text-text-secondary truncate px-2 pb-2">
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
