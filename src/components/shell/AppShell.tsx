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
  ChevronsUpDown,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

function AccountInitials({ name }: { name: string | undefined }) {
  return (
    <span
      aria-hidden
      className="bg-foreground text-background flex size-8 shrink-0 items-center justify-center rounded-lg text-caption"
      style={{ fontFamily: "var(--font-bold)" }}
    >
      {displayInitials(name)}
    </span>
  );
}

/** shadcn / UAGC NavUser — footer trigger opens Settings + Log out. */
function NavUser({ role }: { role: Role }) {
  const { user, signOut } = useAuth();
  const { state } = useSidebar();
  const settingsHref = settingsHrefForRole(role);
  const name = user?.name?.trim() || "Account";
  const email = user?.email?.trim() ?? "";
  const collapsed = state === "collapsed";

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                data-slot="account-menu"
                className="data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-11!"
                aria-label={name}
              />
            }
          >
            <AccountInitials name={user?.name} />
            <div className="grid min-w-0 flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
              <span className="truncate" style={{ fontFamily: "var(--font-medium)" }}>
                {name}
              </span>
              <span className="text-muted-foreground truncate text-xs">
                {roleLabel(role)}
              </span>
            </div>
            <ChevronsUpDown className="ml-auto group-data-[collapsible=icon]:hidden" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-56"
            align="end"
            side={collapsed ? "left" : "bottom"}
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="p-0 font-normal text-foreground">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <AccountInitials name={user?.name} />
                  <div className="grid min-w-0 flex-1 text-left leading-tight">
                    <span
                      className="truncate"
                      style={{ fontFamily: "var(--font-medium)" }}
                    >
                      {name}
                    </span>
                    {email ? (
                      <span className="text-muted-foreground truncate text-xs">
                        {email}
                      </span>
                    ) : null}
                  </div>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            {settingsHref ? (
              <DropdownMenuGroup>
                <DropdownMenuItem
                  render={<Link href={settingsHref} />}
                  className="min-h-11"
                >
                  <Settings aria-hidden />
                  Settings
                </DropdownMenuItem>
              </DropdownMenuGroup>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                className="min-h-11"
                onClick={() => void signOut()}
              >
                <LogOut aria-hidden />
                Log out
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
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
              className="[&_svg]:size-6 group-data-[collapsible=icon]:size-11! group-data-[collapsible=icon]:pl-1!"
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
                            "text-[var(--color-action-yellow)] hover:text-[var(--color-action-yellow)] data-active:font-medium data-active:text-[var(--color-action-yellow)]",
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
      <SidebarFooter className="group-data-[collapsible=icon]:p-1.5">
        <NavUser role={role} />
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
