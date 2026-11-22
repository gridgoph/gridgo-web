"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  BadgeCheck,
  BookText,
  Boxes,
  ChevronRight,
  Clock3,
  FileText,
  Gauge,
  MessageSquareWarning,
  QrCode,
  Smartphone,
  Star,
  Store,
  Tag,
  UserLock,
  UsersRound,
  Zap,
} from "lucide-react";

import { Switch } from "@/components/ui/switch";
import { useSupplierLegal } from "@/app/supplier/_components/SupplierLegalGate";
import { ShopCard } from "@/components/my-shop/ShopCard";
import { ShopProducts } from "@/components/my-shop/ShopProducts";
import { ShopStatusPanel } from "@/components/my-shop/ShopStatusPanel";
import { TeamStrip } from "@/components/my-shop/TeamStrip";
import { useMyShopStatus } from "@/components/my-shop/useMyShopStatus";
import { payoutProviderLabel } from "@/components/orders/PayoutDestination";
import {
  ApiError,
  getExpressSettings,
  getMyPayoutAccount,
  updateExpressSettings,
} from "@/lib/api/client";
import type { ExpressSettings, SupplierPayoutAccount } from "@/lib/api/types";
import { useShopAccess } from "@/lib/auth/shop-access";
import { SHOP_STATUS_CHANGED } from "@/lib/shop-status";
import type { ShopCapabilities } from "@/lib/shop-team";
import { useSupplierDesktop } from "@/lib/useSupplierDesktop";

type Place = { href: string; title: string; body: string; icon: LucideIcon };

/** The shop's own pages, in the phone app's order: products, staff, hours, shop and papers, pay. */
const MAIN: Place[] = [
  { href: "/supplier/catalogue", title: "Products", body: "What clients can order from you", icon: Tag },
  { href: "/supplier/team", title: "Staff", body: "They get jobs. Only you see Money.", icon: UsersRound },
  { href: "/supplier/shop-hours", title: "Hours", body: "When you're open, closed days, close for now", icon: Clock3 },
  { href: "/supplier/shop", title: "Shop details", body: "Name, contact and where you print", icon: Store },
  { href: "/supplier/documents", title: "Shop papers", body: "Business permit, ID and verification", icon: BadgeCheck },
  { href: "/supplier/payout-account", title: "Where you get paid", body: "The account GRIDGO pays your jobs to", icon: QrCode },
];

const MORE: Place[] = [
  { href: "/supplier/product-types", title: "Product types", body: "Ask GRIDGO for a new kind of product", icon: Boxes },
  { href: "/supplier/services", title: "Services", body: "The kinds of printing you're approved for", icon: FileText },
  { href: "/supplier/capacity", title: "Capacity", body: "How much you can make a day", icon: Gauge },
  { href: "/supplier/record", title: "Reviews", body: "What clients say and your shop's record", icon: Star },
  { href: "/supplier/legal", title: "Legal", body: "The agreements your shop accepted", icon: BookText },
  { href: "/supplier/privacy", title: "Your data", body: "See or delete what GRIDGO keeps", icon: UserLock },
  { href: "/supplier/report", title: "Report a problem", body: "Tell GRIDGO something isn't working", icon: MessageSquareWarning },
  { href: "/supplier/phone-app", title: "Phone app", body: "Get jobs on your phone too", icon: Smartphone },
];

function PlaceLink({ place }: { place: Place }) {
  const Icon = place.icon;
  return (
    <Link
      href={place.href}
      className="gg-card hover:bg-overlay-hover flex min-h-16 items-center gap-3 p-3 no-underline"
    >
      <span
        className="bg-surface-variant text-text-primary flex size-10 shrink-0 items-center justify-center rounded-field"
        aria-hidden
      >
        <Icon className="size-5" strokeWidth={1.75} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-body text-text-primary" style={{ fontFamily: "var(--font-medium)" }}>
          {place.title}
        </span>
        <span className="text-caption text-text-muted">{place.body}</span>
      </span>
      <ChevronRight className="text-text-muted size-4 shrink-0" aria-hidden />
    </Link>
  );
}

type SwitchState =
  | { kind: "loading" }
  | { kind: "ready"; settings: ExpressSettings }
  | { kind: "unsupported" }
  | { kind: "failed" };

/**
 * Turning Express off for the whole shop (gridgo-api#419): new Express jobs
 * stop coming, each product keeps its own Express setting for when it is back
 * on, and work already accepted is not touched.
 */
function ExpressSwitch() {
  const [state, setState] = useState<SwitchState>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setState({ kind: "ready", settings: await getExpressSettings() });
    } catch (err) {
      setState(
        err instanceof ApiError && (err.status === 404 || err.status === 405)
          ? { kind: "unsupported" }
          : { kind: "failed" },
      );
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(next: boolean) {
    if (state.kind !== "ready" || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const settings = await updateExpressSettings(next, state.settings.version);
      setState({ kind: "ready", settings });
      window.dispatchEvent(new Event(SHOP_STATUS_CHANGED));
    } catch (err) {
      if (err instanceof ApiError && err.code === "shop_profile_stale") {
        setMessage("Your shop changed on another screen. This shows the latest; try again.");
        await load();
      } else {
        setMessage("The switch did not change. Try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  const on = state.kind === "ready" ? state.settings.expressEnabled : false;

  return (
    <section
      aria-labelledby="express-switch-heading"
      className="gg-card flex flex-col gap-2 border-2 border-text-primary p-4"
    >
      <div className="flex items-center gap-3">
        <Zap className="size-6 shrink-0" style={{ color: "var(--color-info)" }} aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 id="express-switch-heading" className="text-h3 text-text-primary m-0">
            {state.kind === "ready" ? (on ? "Express is on" : "Express is off") : "Express"}
          </h2>
          <p className="text-body text-text-secondary m-0">
            {state.kind === "ready"
              ? on
                ? "Nearby clients can send you document jobs now. 5 minutes to accept. Busy? Turn it off, no penalty."
                : "No new Express jobs come in. Each product keeps its own Express setting for when you turn it back on."
              : state.kind === "unsupported"
                ? "Express is set on each product for now. Turn it on or off in Products."
                : state.kind === "failed"
                  ? "Could not read the Express switch. Reload the page to try again."
                  : "Checking…"}
          </p>
        </div>
        {state.kind === "ready" ? (
          <Switch
            checked={on}
            disabled={busy}
            aria-labelledby="express-switch-heading"
            onCheckedChange={(next) => void toggle(Boolean(next))}
          />
        ) : null}
      </div>
      {message ? (
        <p className="text-body text-error m-0" role="alert">
          {message}
        </p>
      ) : null}
    </section>
  );
}

/** "GCash ••4821": enough to recognise the account, never the whole number. */
function payoutSummary(account: SupplierPayoutAccount | null): string {
  if (!account) return "Not set yet. Add it so GRIDGO can pay you.";
  const tail = account.accountNumber?.replace(/\D/g, "").slice(-4);
  return [payoutProviderLabel(account), tail ? `••${tail}` : null].filter(Boolean).join(" ");
}

/**
 * My shop (gridgoph/gridgo-web#327, #328): the shop card with its open/closed
 * sign, products, the team, and the Shop status panel, then the shop's own
 * pages. At 1280px and wider the status panel sits beside the rest; below it,
 * the phone app's single column. Owners change everything; Managers change
 * hours and products; Staff read. Only the Owner sees where the shop gets paid.
 */
export default function SupplierMyShopPage() {
  const { notices } = useSupplierLegal();
  const access = useShopAccess();
  const { can } = access;
  const desktop = useSupplierDesktop();
  const { state, busy, message, save } = useMyShopStatus();
  const [payout, setPayout] = useState<string | null>(null);

  useEffect(() => {
    if (!can.money) return;
    void getMyPayoutAccount()
      .then((account) => setPayout(payoutSummary(account)))
      .catch(() => setPayout("Open to check it"));
  }, [can.money]);

  const status = state.kind === "ready" ? state.status : null;
  const name = status?.shopName ?? access.shop?.name ?? "Your shop";
  const unsupported = state.kind === "unsupported";

  const panel = unsupported ? (
    can.editStatus ? <ExpressSwitch /> : null
  ) : state.kind === "failed" ? (
    <p className="text-body text-text-secondary m-0" role="alert">
      Could not read your shop status. Reload the page to try again.
    </p>
  ) : (
    <ShopStatusPanel
      status={status}
      loading={state.kind === "loading"}
      canEdit={can.editStatus}
      canEditHours={can.editHours}
      busy={busy}
      message={message}
      payoutLine={can.money ? (payout ?? "Checking…") : null}
      onSave={(patch) => void save(patch)}
    />
  );

  const places = MAIN.filter((place) => placeAllowed(place.href, can));
  const more = MORE.filter((place) => placeAllowed(place.href, can));

  const main = (
    <>
      {status ? (
        <ShopCard
          name={name}
          status={status}
          canEdit={can.editStatus}
          canEditHours={can.editHours}
          busy={busy}
          onSave={(patch) => void save(patch)}
        />
      ) : null}
      {desktop ? null : panel}
      {can.editProducts ? <ShopProducts /> : null}
      <TeamStrip manage={can.manageTeam} />

      {notices.length && can.money ? (
        <section aria-labelledby="doc-updates-heading" className="gg-card flex flex-col gap-2 p-4">
          <h2 id="doc-updates-heading" className="text-h3 text-text-primary m-0">
            Document updates
          </h2>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {notices.map((doc) => (
              <li key={doc.id}>
                <Link
                  href={`/supplier/legal/${encodeURIComponent(doc.id)}`}
                  className="text-body text-text-primary underline"
                >
                  {doc.title}
                </Link>
                {doc.changeSummary ? (
                  <p className="text-caption text-text-secondary m-0">{doc.changeSummary}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {places.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {places.map((place) => (
            <PlaceLink key={place.href} place={place} />
          ))}
        </div>
      ) : null}

      {more.length ? (
        <>
          <h2 className="text-h3 text-text-primary m-0 mt-2">More</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {more.map((place) => (
              <PlaceLink key={place.href} place={place} />
            ))}
          </div>
        </>
      ) : null}
    </>
  );

  if (!desktop) {
    return (
      <div className="flex flex-col gap-4" data-layout="phone">
        {main}
      </div>
    );
  }
  return (
    <div
      className="grid grid-cols-[minmax(0,1fr)_22.5rem] items-start gap-4"
      data-layout="desktop"
    >
      <div className="flex min-w-0 flex-col gap-4">{main}</div>
      <aside className="sticky top-[4.25rem] flex flex-col gap-4">{panel}</aside>
    </div>
  );
}

/**
 * Which of the shop's own pages this role can open. The rest would only say
 * "Owner only", so they are not offered.
 */
function placeAllowed(href: string, can: ShopCapabilities): boolean {
  if (can.money) return true;
  if (href === "/supplier/catalogue") return false; // the products section covers it
  if (href === "/supplier/team") return false; // the team strip covers it
  if (href === "/supplier/shop-hours") return can.editHours;
  return href === "/supplier/phone-app";
}
