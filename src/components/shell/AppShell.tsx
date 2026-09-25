"use client";

import {
  useCallback,
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
  SidebarGroupLabel,
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
import { NavCountsProvider, useNavCounts } from "@/lib/live/useNavCounts";
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
  navSectionsForRole,
  type NavCountKey,
  type NavGroup,
  type NavIconKey,
  type NavItem,
} from "@/lib/nav";
import {
  compactCount,
  countedName,
  groupCount,
  groupCountPhrase,
  groupNeedsAttention,
  itemCount,
  itemCountPhrase,
  itemNeedsAttention,
  showOpenGroupTotal,
} from "@/lib/nav-counts";
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

/** Each count source this rail shows, once — read once for the whole rail. */
function railCountSources(role: Role): NavCountKey[] {
  const sources = new Set<NavCountKey>();
  for (const group of navGroupsForRole(role)) {
    for (const item of group.items) if (item.count) sources.add(item.count);
  }
  return [...sources];
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

/**
 * A count sitting right after its row's label — never pushed to the far edge,
 * where it read as belonging to the chevron rather than the page.
 *
 * - filled yellow: work that blocks an order until this desk moves it
 * - filled monochrome: any other count
 * - outlined: an open group's total, so it reads as "the sum of what is
 *   below" rather than a second copy of one row's number — and only when it
 *   sums two or more rows (`showOpenGroupTotal`)
 *
 * It is absent, not zero, when nothing is waiting. The number is decorative;
 * the row's `aria-label` carries the count in words ("Orders, 3 need action"). Type and colour sit on
 * plain spans rather than a merged primitive (see AGENTS.md, Design tokens).
 */
function NavCountBadge({
  count,
  attention,
  total,
}: {
  count: number;
  attention: boolean;
  total?: "open" | "closed";
}) {
  if (!count) return null;
  const outlined = total === "open";
  return (
    <span
      aria-hidden
      data-slot="nav-count"
      data-tone={outlined ? "total" : attention ? "attention" : "quiet"}
      className={cn(
        "inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-pill px-1.5 tabular-nums group-data-[collapsible=icon]:hidden",
        outlined
          ? "text-sidebar-foreground/70 ring-1 ring-sidebar-foreground/30 ring-inset"
          : attention
            ? "bg-[var(--color-action-yellow)] text-[var(--color-action-yellow-on)]"
            : "bg-sidebar-foreground/12 text-sidebar-foreground",
      )}
    >
      <span className="text-caption" style={{ fontFamily: "var(--font-medium)" }}>
        {compactCount(count)}
      </span>
    </span>
  );
}

/**
 * The icon rail's version: a small number on the corner of the icon, ringed
 * in the rail colour so it reads as sitting on top of the glyph.
 */
function RailCountBubble({ count, attention }: { count: number; attention: boolean }) {
  if (!count) return null;
  return (
    <span
      aria-hidden
      data-slot="rail-count"
      data-tone={attention ? "attention" : "quiet"}
      className={cn(
        "pointer-events-none absolute top-0.5 right-0.5 hidden h-4 min-w-4 items-center justify-center rounded-pill px-1 tabular-nums ring-2 ring-sidebar group-data-[collapsible=icon]:flex",
        attention
          ? "bg-[var(--color-action-yellow)] text-[var(--color-action-yellow-on)]"
          : "bg-sidebar-foreground text-sidebar",
      )}
    >
      <span className="text-nav" style={{ fontFamily: "var(--font-bold)" }}>
        {compactCount(count)}
      </span>
    </span>
  );
}

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
  const counts = useNavCounts();
  const count = itemCount(item, counts);
  const attention = itemNeedsAttention(item, counts);
  const phrase = itemCountPhrase(item, counts);
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        render={<Link href={item.href} />}
        isActive={active}
        tooltip={countedName(item.label, phrase)}
        // The number is drawn, not read; the name says it in words.
        aria-label={phrase ? countedName(item.label, phrase) : undefined}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn("relative", ICON_CELL, active && ACTIVE_PAGE)}
      >
        <Icon strokeWidth={active ? 2.25 : 1.75} aria-hidden />
        <span className="min-w-0 truncate group-data-[collapsible=icon]:hidden">
          {item.label}
        </span>
        <NavCountBadge count={count} attention={attention} />
        <RailCountBubble count={count} attention={attention} />
      </SidebarMenuButton>
      {!item.ready ? <SidebarMenuBadge>Soon</SidebarMenuBadge> : null}
    </SidebarMenuItem>
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
  const counts = useNavCounts();
  const phrase = itemCountPhrase(item, counts);
  return (
    <SidebarMenuSubItem>
      <SidebarMenuSubButton
        render={<Link href={item.href} />}
        isActive={active}
        aria-label={phrase ? countedName(item.label, phrase) : undefined}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn("min-h-11", active && ACTIVE_PAGE)}
      >
        <span className="min-w-0 truncate">{item.label}</span>
        <NavCountBadge
          count={itemCount(item, counts)}
          attention={itemNeedsAttention(item, counts)}
        />
      </SidebarMenuSubButton>
      {!item.ready ? <SidebarMenuBadge className="top-1/2! -translate-y-1/2">Soon</SidebarMenuBadge> : null}
    </SidebarMenuSubItem>
  );
}

/**
 * A labeled group on the expanded rail: icon + name + total + chevron, folding
 * its pages under a thin guide line. Closed with the current page inside, the
 * parent keeps the accent wash so the person still sees where they are, and
 * the group's total stays beside its name so folding never hides work.
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
  const counts = useNavCounts();
  const holdsCurrentPage = groupHasActivePage(group, pathname);
  const phrase = groupCountPhrase(group, counts);
  return (
    <Collapsible
      open={open}
      onOpenChange={onOpenChange}
      render={<SidebarMenuItem data-nav-group={group.id} />}
    >
      <CollapsibleTrigger
        render={<SidebarMenuButton isActive={holdsCurrentPage && !open} />}
        aria-label={phrase ? countedName(group.label ?? "", phrase) : undefined}
      >
        <Icon strokeWidth={1.75} aria-hidden />
        <span className="min-w-0 truncate">{group.label}</span>
        <NavCountBadge
          count={open && !showOpenGroupTotal(group, counts) ? 0 : groupCount(group, counts)}
          attention={groupNeedsAttention(group, counts)}
          total={open ? "open" : "closed"}
        />
        <ChevronRight
          aria-hidden
          className="ml-auto text-sidebar-foreground/60 transition-transform duration-200 ease-out group-data-[panel-open]/menu-button:rotate-90 motion-reduce:transition-none"
        />
      </CollapsibleTrigger>
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
 * The group's total rides on the icon; each page's own count is in the flyout.
 */
function RailNavFlyout({ group, pathname }: { group: NavGroup; pathname: string }) {
  const Icon = NAV_ICONS[group.icon ?? "overview"];
  const counts = useNavCounts();
  const holdsCurrentPage = groupHasActivePage(group, pathname);
  const label = group.label ?? "";
  const name = countedName(label, groupCountPhrase(group, counts));
  return (
    <SidebarMenuItem data-nav-group={group.id}>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <SidebarMenuButton
              isActive={holdsCurrentPage}
              tooltip={name}
              aria-label={name}
              className={cn(
                "relative",
                ICON_CELL,
                "data-popup-open:bg-sidebar-accent data-popup-open:text-sidebar-accent-foreground",
              )}
            />
          }
        >
          <Icon strokeWidth={holdsCurrentPage ? 2.25 : 1.75} aria-hidden />
          <RailCountBubble
            count={groupCount(group, counts)}
            attention={groupNeedsAttention(group, counts)}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start" sideOffset={10} className="min-w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel>{label}</DropdownMenuLabel>
            {group.items.map((item) => {
              const active = isActiveHref(pathname, item.href);
              const ItemIcon = NAV_ICONS[item.icon];
              const phrase = itemCountPhrase(item, counts);
              return (
                <DropdownMenuItem
                  key={item.id}
                  render={<Link href={item.href} />}
                  aria-label={phrase ? countedName(item.label, phrase) : undefined}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "min-h-11",
                    active &&
                      "bg-accent text-[var(--color-action-yellow)] focus:text-[var(--color-action-yellow)]",
                  )}
                >
                  <ItemIcon strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                  <span className="min-w-0 truncate">{item.label}</span>
                  <FlyoutCount item={item} />
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
}

/** The flyout sits outside the sidebar, so its pill uses popover colours. */
function FlyoutCount({ item }: { item: NavItem }) {
  const counts = useNavCounts();
  const count = itemCount(item, counts);
  if (!count) return null;
  return (
    <span
      aria-hidden
      data-slot="nav-count"
      data-tone={itemNeedsAttention(item, counts) ? "attention" : "quiet"}
      className={cn(
        "inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-pill px-1.5 tabular-nums",
        itemNeedsAttention(item, counts)
          ? "bg-[var(--color-action-yellow)] text-[var(--color-action-yellow-on)]"
          : "bg-foreground/12 text-foreground",
      )}
    >
      <span className="text-caption" style={{ fontFamily: "var(--font-medium)" }}>
        {compactCount(count)}
      </span>
    </span>
  );
}

function RailNavGroups({
  role,
  pathname,
  onNavigate,
}: {
  role: Role;
  pathname: string;
  onNavigate: () => void;
}) {
  const { state, isMobile } = useSidebar();
  // The mobile sheet is always the full rail, whatever the desktop fold says.
  const iconRail = state === "collapsed" && !isMobile;
  const sections = navSectionsForRole(role);
  const parents = navGroupsForRole(role).filter((group) => group.label);

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
      {sections.map((section) => {
        const headingId = `rail-section-${section.label.toLowerCase()}`;
        return (
          <SidebarGroup
            key={section.label}
            data-nav-section={section.label}
            // On the icon rail the headings are gone, so a hairline keeps the
            // sections apart without words.
            className="px-2 py-1 group-data-[collapsible=icon]:not-first:border-t group-data-[collapsible=icon]:not-first:border-sidebar-border"
            aria-labelledby={iconRail ? undefined : headingId}
            role="group"
          >
            {/* sidebar-07's small muted heading. Not rendered on the icon rail,
                where it would be an invisible label with nothing to read. */}
            {iconRail ? null : (
              <SidebarGroupLabel id={headingId} className="h-7">
                <span
                  className="text-caption text-sidebar-foreground/60"
                  style={{ fontFamily: "var(--font-medium)" }}
                >
                  {section.label}
                </span>
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                {section.groups.map((group) => {
                  if (!group.label) {
                    return group.items.map((item) => (
                      <RailNavItem
                        key={item.id}
                        item={item}
                        pathname={pathname}
                        onNavigate={onNavigate}
                      />
                    ));
                  }
                  return iconRail ? (
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
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        );
      })}
    </>
  );
}

function PortalSidebar({ role }: Pick<Props, "role">) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const closeMobile = () => setOpenMobile(false);
  const countSources = railCountSources(role);

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
          <NavCountsProvider sources={countSources} pathname={pathname}>
            <RailNavGroups role={role} pathname={pathname} onNavigate={closeMobile} />
          </NavCountsProvider>
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
