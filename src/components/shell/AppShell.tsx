"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useClerk, useUser } from "@clerk/nextjs";
import {
  AlertTriangle,
  ArrowLeftRight,
  Banknote,
  Bike,
  BookOpen,
  CalendarDays,
  CalendarRange,
  ChevronRight,
  ChevronsUpDown,
  CircleUser,
  ClipboardCheck,
  ClipboardList,
  Coins,
  Gauge,
  HandCoins,
  Inbox,
  LayoutDashboard,
  Library,
  LogOut,
  MapPinned,
  Megaphone,
  MessageSquare,
  MessageSquareWarning,
  Package,
  QrCode,
  Route,
  Scale,
  Trophy,
  ScrollText,
  Settings,
  ShieldCheck,
  Siren,
  SlidersHorizontal,
  Store,
  Contact,
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { InboxBell } from "@/components/shell/InboxBell";
import { OrdersQueuePill, ordersWaitingLabel } from "@/components/shell/OrdersQueuePill";
import {
  groupHasActivePage,
  initialGroupOpen,
  isActiveHref,
  readGroupOpenState,
  readRailOpen,
  writeGroupOpen,
  writeRailOpen,
  type GroupOpenState,
} from "@/components/shell/rail-state";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { useAuth } from "@/lib/auth/AuthProvider";
import { LiveProvider } from "@/lib/live/LiveProvider";
import { useOrdersWaitingCount } from "@/lib/live/useOrdersWaitingCount";
import { notificationHref } from "@/lib/live/notificationHref";
import {
  clerkProfileEmail,
  clerkProfileImageUrl,
  clerkProfileName,
  displayInitials,
} from "@/lib/auth/clerk-profile";
import type { Role } from "@/lib/api/types";
import {
  contextTitleForPath,
  navGroupsForRole,
  navItemForPath,
  type NavGroup,
  type NavIconKey,
  type NavItem,
} from "@/lib/nav";
import { portalRolesFromMemberships } from "@/lib/auth/portal-access";
import { homeForRole, roleLabel } from "@/lib/routes";
import { cn } from "@/lib/utils";

const NAV_ICONS: Record<NavIconKey, LucideIcon> = {
  dashboard: Gauge,
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
  riders: Bike,
  rankings: Trophy,
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
  chat: MessageSquare,
  reports: MessageSquareWarning,
  "group-shop": Store,
  "group-money": HandCoins,
  "group-queue": Inbox,
  "group-field": Route,
  "group-system": SlidersHorizontal,
  "group-people": Contact,
  "group-catalog": Library,
};

/** The one live count on the rail: orders waiting on Operations. */
const OrdersWaitingContext = createContext<number | null>(null);

/**
 * Reads the queue once for the whole rail, and only on a rail that has an
 * Orders row — a supplier or Super Admin rail never asks for the list.
 */
function OrdersWaitingCount({ children }: { children: ReactNode }) {
  const count = useOrdersWaitingCount();
  return (
    <OrdersWaitingContext.Provider value={count}>{children}</OrdersWaitingContext.Provider>
  );
}

const ORDERS_NAV_ID = "ops-orders";

function hasOrdersRow(items: readonly NavItem[]): boolean {
  return items.some((item) => item.id === ORDERS_NAV_ID);
}

/** Icon-rail cell: a 44×44 target centred in the 60px column. */
const ICON_CELL =
  "group-data-[collapsible=icon]:size-11! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0!";

/** The selected page: yellow text and icon on the accent wash — never a bar or fill. */
const ACTIVE_PAGE =
  "text-[var(--color-action-yellow)] hover:text-[var(--color-action-yellow)] data-active:font-medium data-active:text-[var(--color-action-yellow)]";

/** Operational settings only — suppliers have no settings route. */
function settingsHrefForRole(role: Role): "/ops/settings" | "/admin/settings" | null {
  if (role === "ops_admin") return "/ops/settings";
  if (role === "super_admin") return "/admin/settings";
  return null;
}

function AccountAvatar({
  name,
  imageUrl,
}: {
  name: string | undefined;
  imageUrl?: string;
}) {
  return (
    <Avatar aria-hidden>
      {imageUrl ? <AvatarImage src={imageUrl} alt="" /> : null}
      <AvatarFallback
        className="bg-foreground text-background text-caption"
        style={{ fontFamily: "var(--font-bold)" }}
      >
        {displayInitials(name)}
      </AvatarFallback>
    </Avatar>
  );
}

/** Footer identity is the Clerk person; the menu still owns GRIDGO settings and sign-out. */
function NavUser({ role }: { role: Role }) {
  const { user, memberships, signOut } = useAuth();
  const { user: clerkUser } = useUser();
  const { openUserProfile } = useClerk();
  const { state } = useSidebar();
  const settingsHref = settingsHrefForRole(role);
  const switchableRoles = portalRolesFromMemberships(memberships ?? []).filter(
    (candidate) => candidate !== role,
  );
  const fallbackName = user?.name?.trim() || "Account";
  const name = clerkProfileName(clerkUser, fallbackName);
  const email = clerkProfileEmail(clerkUser, user?.email?.trim() ?? "");
  const imageUrl = clerkProfileImageUrl(clerkUser);
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
                className="data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-11! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0!"
                aria-label={name}
              />
            }
          >
            <AccountAvatar name={name} imageUrl={imageUrl} />
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
                  <AccountAvatar name={name} imageUrl={imageUrl} />
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
            <DropdownMenuGroup>
              <DropdownMenuItem className="min-h-11" onClick={() => openUserProfile()}>
                <CircleUser aria-hidden />
                Manage account
              </DropdownMenuItem>
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
            {switchableRoles.length > 0 ? (
              <DropdownMenuGroup>
                {switchableRoles.map((nextRole) => (
                  <DropdownMenuItem
                    key={nextRole}
                    render={<Link href={homeForRole(nextRole)} />}
                    className="min-h-11"
                  >
                    <ArrowLeftRight aria-hidden />
                    Open {roleLabel(nextRole)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem className="min-h-11" onClick={() => void signOut()}>
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

function RailNavItem({
  item,
  pathname,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  onNavigate: () => void;
}) {
  const active = isActiveHref(pathname, item.href);
  const Icon = NAV_ICONS[item.icon];
  const ordersWaiting = useContext(OrdersWaitingContext);
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        render={<Link href={item.href} />}
        isActive={active}
        tooltip={item.label}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(ICON_CELL, active && ACTIVE_PAGE)}
      >
        <Icon strokeWidth={active ? 2.25 : 1.75} aria-hidden />
        <span className="group-data-[collapsible=icon]:hidden">{item.label}</span>
      </SidebarMenuButton>
      {!item.ready ? <SidebarMenuBadge>Soon</SidebarMenuBadge> : null}
      {/* Only the Operations queue carries live work on the rail. */}
      {item.id === ORDERS_NAV_ID ? <OrdersQueuePill count={ordersWaiting} /> : null}
    </SidebarMenuItem>
  );
}

/** An unlabeled cluster (Overview / Jobs / Dashboard): plain rows, no parent. */
function RailNavCluster({
  group,
  pathname,
  onNavigate,
}: {
  group: NavGroup;
  pathname: string;
  onNavigate: () => void;
}) {
  return (
    <SidebarGroup className="px-2 py-1">
      <SidebarGroupContent>
        <SidebarMenu>
          {group.items.map((item) => (
            <RailNavItem
              key={item.id}
              item={item}
              pathname={pathname}
              onNavigate={onNavigate}
            />
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function RailNavSubItem({
  item,
  pathname,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  onNavigate: () => void;
}) {
  const active = isActiveHref(pathname, item.href);
  const ordersWaiting = useContext(OrdersWaitingContext);
  const counted = item.id === ORDERS_NAV_ID && Boolean(ordersWaiting);
  return (
    <SidebarMenuSubItem>
      <SidebarMenuSubButton
        render={<Link href={item.href} />}
        isActive={active}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn("min-h-11", counted && "pr-10", active && ACTIVE_PAGE)}
      >
        <span>{item.label}</span>
      </SidebarMenuSubButton>
      {!item.ready ? <SidebarMenuBadge className="top-1/2! -translate-y-1/2">Soon</SidebarMenuBadge> : null}
      {item.id === ORDERS_NAV_ID ? <OrdersQueuePill count={ordersWaiting} /> : null}
    </SidebarMenuSubItem>
  );
}

/**
 * A labeled group on the expanded rail: icon + name + chevron, folding its
 * pages under a thin guide line. Closed with the current page inside, the
 * parent keeps the accent wash so the person still sees where they are, and
 * the queue count climbs onto the parent so folding never hides work.
 */
function RailNavParent({
  group,
  pathname,
  open,
  onOpenChange,
  onNavigate,
}: {
  group: NavGroup;
  pathname: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: () => void;
}) {
  const Icon = NAV_ICONS[group.icon ?? "overview"];
  const ordersWaiting = useContext(OrdersWaitingContext);
  const holdsCurrentPage = groupHasActivePage(group, pathname);
  const showCountOnParent = !open && hasOrdersRow(group.items);
  return (
    <Collapsible
      open={open}
      onOpenChange={onOpenChange}
      render={<SidebarMenuItem data-nav-group={group.id} />}
    >
      <CollapsibleTrigger
        render={<SidebarMenuButton isActive={holdsCurrentPage && !open} />}
        className={cn(showCountOnParent && ordersWaiting && "pr-16")}
      >
        <Icon strokeWidth={1.75} aria-hidden />
        <span className="min-w-0 flex-1 truncate">{group.label}</span>
        <ChevronRight
          aria-hidden
          className="ml-auto text-sidebar-foreground/60 transition-transform duration-200 ease-out group-data-[panel-open]/menu-button:rotate-90 motion-reduce:transition-none"
        />
      </CollapsibleTrigger>
      {showCountOnParent ? (
        <OrdersQueuePill count={ordersWaiting} className="right-8" />
      ) : null}
      <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-200 ease-out data-ending-style:h-0 data-starting-style:h-0 motion-reduce:transition-none">
        <SidebarMenuSub className="mt-0.5 gap-0.5">
          {group.items.map((item) => (
            <RailNavSubItem
              key={item.id}
              item={item}
              pathname={pathname}
              onNavigate={onNavigate}
            />
          ))}
        </SidebarMenuSub>
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * A labeled group on the icon rail: the parent's icon opens its pages in a
 * flyout beside the rail, so every page stays one click deep while folded.
 */
function RailNavFlyout({ group, pathname }: { group: NavGroup; pathname: string }) {
  const Icon = NAV_ICONS[group.icon ?? "overview"];
  const ordersWaiting = useContext(OrdersWaitingContext);
  const holdsCurrentPage = groupHasActivePage(group, pathname);
  const waiting = hasOrdersRow(group.items) && ordersWaiting ? ordersWaiting : null;
  const label = group.label ?? "";
  return (
    <SidebarMenuItem data-nav-group={group.id}>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <SidebarMenuButton
              isActive={holdsCurrentPage}
              tooltip={label}
              aria-label={waiting ? `${label}, ${ordersWaitingLabel(waiting)}` : label}
              className={cn(
                ICON_CELL,
                "data-popup-open:bg-sidebar-accent data-popup-open:text-sidebar-accent-foreground",
              )}
            />
          }
        >
          <Icon strokeWidth={holdsCurrentPage ? 2.25 : 1.75} aria-hidden />
          {waiting ? (
            <span
              aria-hidden
              data-testid="orders-queue-dot"
              className="absolute top-2 right-2 size-2 rounded-pill bg-[var(--color-action-yellow)] ring-2 ring-sidebar"
            />
          ) : null}
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start" sideOffset={10} className="min-w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel>{label}</DropdownMenuLabel>
            {group.items.map((item) => {
              const active = isActiveHref(pathname, item.href);
              const ItemIcon = NAV_ICONS[item.icon];
              const count = item.id === ORDERS_NAV_ID ? waiting : null;
              return (
                <DropdownMenuItem
                  key={item.id}
                  render={<Link href={item.href} />}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "min-h-11",
                    active &&
                      "bg-accent text-[var(--color-action-yellow)] focus:text-[var(--color-action-yellow)]",
                  )}
                >
                  <ItemIcon strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {count ? (
                    <span className="ml-auto rounded-pill bg-[var(--color-action-yellow)] px-1.5 text-[var(--color-action-yellow-on)]">
                      <span className="text-caption" aria-hidden>
                        {count > 99 ? "99+" : count}
                      </span>
                      <span className="sr-only">{ordersWaitingLabel(count)}</span>
                    </span>
                  ) : null}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
}

function RailNavGroups({
  groups,
  pathname,
  onNavigate,
}: {
  groups: readonly NavGroup[];
  pathname: string;
  onNavigate: () => void;
}) {
  const { state, isMobile } = useSidebar();
  // The mobile sheet is always the full rail, whatever the desktop fold says.
  const iconRail = state === "collapsed" && !isMobile;
  const parents = groups.filter((group) => group.label);

  const [openGroups, setOpenGroups] = useState<GroupOpenState>(() => {
    const remembered = readGroupOpenState();
    return Object.fromEntries(
      parents.map((group) => [group.id, initialGroupOpen(group, pathname, remembered)]),
    );
  });

  // Arriving on a page inside a closed group opens it. Adjusted during render
  // (not in an effect) so the new page never paints with its group folded.
  // This is not the person's choice, so it is not remembered.
  const [seenPathname, setSeenPathname] = useState(pathname);
  if (seenPathname !== pathname) {
    setSeenPathname(pathname);
    const holding = parents.find((group) => groupHasActivePage(group, pathname));
    if (holding && !openGroups[holding.id]) {
      setOpenGroups((prev) => ({ ...prev, [holding.id]: true }));
    }
  }

  const setGroupOpen = useCallback((groupId: string, open: boolean) => {
    setOpenGroups((prev) => ({ ...prev, [groupId]: open }));
    writeGroupOpen(groupId, open);
  }, []);

  return (
    <>
      {groups.map((group) =>
        group.label ? null : (
          <RailNavCluster
            key={group.id}
            group={group}
            pathname={pathname}
            onNavigate={onNavigate}
          />
        ),
      )}
      {parents.length > 0 ? (
        <SidebarGroup className="px-2 py-1">
          <SidebarGroupContent>
            <SidebarMenu>
              {parents.map((group) =>
                iconRail ? (
                  <RailNavFlyout key={group.id} group={group} pathname={pathname} />
                ) : (
                  <RailNavParent
                    key={group.id}
                    group={group}
                    pathname={pathname}
                    open={Boolean(openGroups[group.id])}
                    onOpenChange={(open) => setGroupOpen(group.id, open)}
                    onNavigate={onNavigate}
                  />
                ),
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ) : null}
    </>
  );
}

function PortalSidebar({ role }: Pick<Props, "role">) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const groups = navGroupsForRole(role);
  const closeMobile = () => setOpenMobile(false);
  const nav = (
    <RailNavGroups groups={groups} pathname={pathname} onNavigate={closeMobile} />
  );

  return (
    <Sidebar collapsible="icon">
      {/* ── Identity: the mark is the rail's home control, and all that survives
             collapse. There is no second toggle here — the header owns that. ── */}
      <SidebarHeader className="h-14 justify-center border-b border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              className={cn("[&_svg]:size-6", ICON_CELL)}
              render={<Link href={homeForRole(role)} />}
              tooltip="GRIDGO home"
              onClick={closeMobile}
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

      <SidebarContent className="pt-1">
        <nav aria-label="Primary navigation" className="flex min-h-0 flex-col gap-0">
          {groups.some((group) => hasOrdersRow(group.items)) ? (
            <OrdersWaitingCount>{nav}</OrdersWaitingCount>
          ) : (
            nav
          )}
        </nav>
      </SidebarContent>

      <SidebarSeparator />
      <SidebarFooter>
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
  // Folded or expanded is remembered per browser; Ctrl/Cmd+B, the header
  // toggle and the rail edge all go through here.
  const [railOpen, setRailOpen] = useState(readRailOpen);
  const onRailOpenChange = useCallback((open: boolean) => {
    setRailOpen(open);
    writeRailOpen(open);
  }, []);
  const router = useRouter();
  const title = contextTitleForPath(pathname, role);
  const parentItem = navItemForPath(pathname, role);
  const isNested = Boolean(parentItem && pathname !== parentItem.href);

  return (
    <LiveProvider
      role={role}
      onOpenNotification={(notification) => {
        const href = notificationHref(role, notification);
        if (href) router.push(href);
      }}
    >
      <SidebarProvider
        open={railOpen}
        onOpenChange={onRailOpenChange}
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
            <div className="flex items-center gap-1">
              <ThemeToggle />
              <InboxBell role={role} />
            </div>
          </header>

          <div id="main-content" className="flex-1 p-3 md:px-4 md:py-3">
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </LiveProvider>
  );
}
