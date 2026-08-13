"use client";

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  Banknote,
  BookOpen,
  CalendarDays,
  CalendarRange,
  ClipboardCheck,
  ClipboardList,
  Coins,
  LayoutDashboard,
  LogOut,
  MapPinned,
  Megaphone,
  Package,
  QrCode,
  Scale,
  ScrollText,
  Settings,
  ShieldCheck,
  Siren,
  Truck,
  UserRoundCheck,
  UserSearch,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button, buttonVariants } from "@/components/ui/button";
import { Logo } from "@/components/ui/Logo";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/lib/auth/AuthProvider";
import type { Role } from "@/lib/api/types";
import {
  contextTitleForPath,
  navForRole,
  navItemForPath,
  type NavIconKey,
} from "@/lib/nav";
import { homeForRole, roleLabel } from "@/lib/routes";
import { cn } from "@/lib/utils";

const NAV_ICONS: Record<NavIconKey, LucideIcon> = {
  jobs: Package,
  catalogue: BookOpen,
  schedule: CalendarDays,
  capacity: ClipboardCheck,
  payouts: Wallet,
  overview: LayoutDashboard,
  qa: ClipboardList,
  payments: QrCode,
  approvals: UserRoundCheck,
  matching: UserSearch,
  recovery: AlertTriangle,
  dispatch: Truck,
  escalations: Siren,
  claims: Scale,
  settings: Settings,
  audit: ScrollText,
  verification: ShieldCheck,
  roles: Users,
  zones: MapPinned,
  credits: Coins,
  finance: Banknote,
  planning: CalendarRange,
  broadcast: Megaphone,
};

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** First letters of the display name — the footer card has no photo. */
function displayInitials(name: string | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const first = parts[0]?.[0];
    const last = parts[parts.length - 1]?.[0];
    if (first && last) return `${first}${last}`.toUpperCase();
  }
  if (parts[0] && parts[0].length >= 2) return parts[0].slice(0, 2).toUpperCase();
  if (parts[0]?.[0]) return parts[0][0].toUpperCase();
  return "?";
}

/** Operational settings only — suppliers have no settings route. */
function settingsHrefForRole(role: Role): "/ops/settings" | "/admin/settings" | null {
  if (role === "ops_admin") return "/ops/settings";
  if (role === "super_admin") return "/admin/settings";
  return null;
}

function AccountCard({ role }: { role: Role }) {
  const { user, signOut } = useAuth();
  const settingsHref = settingsHrefForRole(role);
  const name = user?.name?.trim() || "Account";

  return (
    <div
      data-slot="account-card"
      className="flex items-center gap-2 rounded-xl border border-sidebar-border bg-background p-3 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-1 group-data-[collapsible=icon]:border-transparent group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:p-0"
    >
      <span
        aria-hidden
        className="bg-foreground text-background flex size-11 shrink-0 items-center justify-center rounded-full text-caption"
        style={{ fontFamily: "var(--font-bold)" }}
      >
        {displayInitials(user?.name)}
      </span>
      <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
        <p
          className="text-body text-sidebar-foreground m-0 truncate"
          style={{ fontFamily: "var(--font-medium)" }}
        >
          {name}
        </p>
        <p className="text-caption text-text-muted m-0 truncate">
          {roleLabel(role)}
        </p>
      </div>
      <div className="flex shrink-0 flex-col">
        {settingsHref ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Link
                  href={settingsHref}
                  aria-label="Operational settings"
                  className={buttonVariants({ variant: "ghost", size: "icon" })}
                />
              }
            >
              <Settings aria-hidden />
            </TooltipTrigger>
            <TooltipContent>Operational settings</TooltipContent>
          </Tooltip>
        ) : null}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                aria-label="Sign out"
                onClick={() => void signOut()}
              />
            }
          >
            <LogOut aria-hidden />
          </TooltipTrigger>
          <TooltipContent>Sign out</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

type Props = {
  role: Role;
  children: ReactNode;
};

function PortalSidebar({ role }: Pick<Props, "role">) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const items = navForRole(role);

  return (
    <Sidebar collapsible="icon">
      {/* ── Identity: the mark is the rail's home control, and all that survives
             collapse. There is no second toggle here — the header owns that. ── */}
      <SidebarHeader className="h-14 justify-center border-b border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              className="[&_svg]:size-6 group-data-[collapsible=icon]:size-11!"
              render={<Link href={homeForRole(role)} />}
              tooltip="GRIDGO home"
              onClick={() => setOpenMobile(false)}
            >
              <span className="flex size-6 shrink-0 items-center justify-center">
                <Logo compact />
              </span>
              <div className="grid min-w-0 flex-1 text-left group-data-[collapsible=icon]:hidden">
                <span
                  className="text-body-lg truncate tracking-tight"
                  style={{ fontFamily: "var(--font-black)" }}
                >
                  GRIDGO
                </span>
                <span className="text-caption text-text-muted truncate">
                  {roleLabel(role)}
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <nav aria-label="Primary navigation">
              <SidebarMenu>
                {items.map((item) => {
                  const active = isActive(pathname, item.href);
                  const Icon = NAV_ICONS[item.icon];
                  return (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton
                        render={<Link href={item.href} />}
                        isActive={active}
                        tooltip={item.label}
                        onClick={() => setOpenMobile(false)}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          active &&
                            "text-[var(--color-action-yellow)] hover:text-[var(--color-action-yellow)] data-active:bg-transparent data-active:font-medium data-active:text-[var(--color-action-yellow)]",
                        )}
                      >
                        <Icon strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                        <span className="group-data-[collapsible=icon]:hidden">
                          {item.label}
                        </span>
                      </SidebarMenuButton>
                      {!item.ready ? <SidebarMenuBadge>Soon</SidebarMenuBadge> : null}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </nav>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarSeparator />
      <SidebarFooter className="p-2 group-data-[collapsible=icon]:p-1.5">
        <AccountCard role={role} />
      </SidebarFooter>

      {/* Drag/click edge — the rail is how a collapsed sidebar comes back
          without hunting for a button. */}
      <SidebarRail />
    </Sidebar>
  );
}

export function AppShell({ role, children }: Props) {
  const pathname = usePathname();
  const title = contextTitleForPath(pathname, role);
  const parentItem = navItemForPath(pathname, role);
  const isNested = Boolean(parentItem && pathname !== parentItem.href);

  return (
    <SidebarProvider
      // The rail has to clear GRIDGO's 44x44 control floor. shadcn's 3rem
      // assumes a 32px button, which leaves the label clipped mid-word.
      style={{ "--sidebar-width-icon": "3.75rem" } as CSSProperties}
    >
      <PortalSidebar role={role} />

      <SidebarInset className="bg-canvas">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-stretch gap-2 border-b border-outline bg-surface pl-1.5 pr-3">
          {/* The only navigation toggle in the shell. Tight left padding keeps
              it next to the rail; the header has no second account control. */}
          <div className="flex items-center">
            <SidebarTrigger aria-label="Toggle primary navigation" />
          </div>
          <Separator orientation="vertical" className="hidden sm:block" />

          <div className="flex min-w-0 flex-1 items-center">
            {isNested && parentItem ? (
              <>
                <h1 className="sr-only">{title}</h1>
                <Breadcrumb className="min-w-0">
                  <BreadcrumbList>
                    <BreadcrumbItem>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <BreadcrumbLink
                              render={<Link href={parentItem.href} />}
                              aria-label={`Back to ${parentItem.label}`}
                            />
                          }
                        >
                          {parentItem.label}
                        </TooltipTrigger>
                        <TooltipContent>{`Back to ${parentItem.label}`}</TooltipContent>
                      </Tooltip>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbPage className="text-h3 text-text-primary truncate">
                        {title}
                      </BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>
              </>
            ) : (
              <h1 className="text-h3 text-text-primary m-0 truncate">{title}</h1>
            )}
          </div>
        </header>

        <div id="main-content" className="flex-1 p-3 md:px-4 md:py-3">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
