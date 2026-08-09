"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  Banknote,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  Coins,
  LayoutDashboard,
  LogOut,
  MapPinned,
  Package,
  Scale,
  Search,
  ShieldCheck,
  Truck,
  UserRound,
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
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Logo } from "@/components/ui/Logo";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/lib/auth/AuthProvider";
import type { Role } from "@/lib/api/types";
import {
  contextTitleForPath,
  navForRole,
  navItemForPath,
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

function PortalSidebar({ role }: Pick<Props, "role">) {
  const { user, signOut } = useAuth();
  const pathname = usePathname();
  const { setOpenMobile, state } = useSidebar();
  const items = navForRole(role);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="gap-3 p-3">
        <div className="flex min-h-11 items-center justify-between gap-2 px-1">
          <Logo compact={state === "collapsed"} />
          <SidebarTrigger aria-label="Toggle primary navigation" />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{roleLabel(role)}</SidebarGroupLabel>
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
                        title={item.label}
                        onClick={() => setOpenMobile(false)}
                        aria-current={active ? "page" : undefined}
                      >
                        {active ? (
                          <span
                            className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-[var(--color-action-yellow)]"
                            aria-hidden
                          />
                        ) : null}
                        <Icon strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                        <span>{item.label}</span>
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
      <SidebarFooter className="p-3">
        <div className="min-w-0 px-2 group-data-[collapsible=icon]:hidden">
          <p className="text-caption text-text-muted m-0 truncate">{user?.name}</p>
          <p className="text-caption text-text-muted m-0 truncate">{user?.email}</p>
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton title="Sign out" onClick={() => void signOut()}>
              <LogOut aria-hidden />
              <span>Sign out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

export function AppShell({ role, children }: Props) {
  const { user, signOut } = useAuth();
  const pathname = usePathname();
  const title = contextTitleForPath(pathname, role);
  const parentItem = navItemForPath(pathname, role);
  const isNested = Boolean(parentItem && pathname !== parentItem.href);

  return (
    <SidebarProvider>
      <PortalSidebar role={role} />

      <div className="flex min-w-0 flex-1 flex-col bg-canvas">
        <header className="sticky top-0 z-30 flex min-h-14 items-center gap-3 border-b border-outline bg-surface px-4 py-2 md:px-6 xl:px-8">
          <SidebarTrigger aria-label="Toggle primary navigation" />

          <div className="min-w-0 flex-1">
            {isNested && parentItem ? (
              <Breadcrumb className="hidden sm:block">
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink render={<Link href={parentItem.href} />}>
                      {parentItem.label}
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>{title}</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            ) : (
              <p className="text-overline text-text-muted m-0 hidden uppercase sm:block">
                {roleLabel(role)}
              </p>
            )}
            <h1 className="text-h3 text-text-primary m-0 truncate">{title}</h1>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="outline" aria-label="Account menu" />}
            >
              <UserRound data-icon="inline-start" aria-hidden />
              <span className="hidden max-w-[10rem] truncate sm:inline">
                {user?.name ?? "Account"}
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="truncate">{user?.email}</DropdownMenuLabel>
                {user?.supplierName ? (
                  <DropdownMenuLabel className="truncate">
                    {user.supplierName}
                  </DropdownMenuLabel>
                ) : null}
                <DropdownMenuItem onClick={() => void signOut()}>
                  <LogOut aria-hidden />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main
          id="main-content"
          className="flex-1 px-4 py-4 md:px-6 md:py-6 xl:px-8 xl:py-8"
        >
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
}
