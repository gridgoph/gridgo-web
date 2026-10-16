"use client";

/**
 * One shop's hours for the GRIDGO Team (`GET /ops/shops/:supplierId/hours`):
 * open now or not, today's extension and the after-hours notice, the weekly
 * hours and every closure date. The shop owns its hours; staff may only
 * switch Temporarily closed, with a reason the audit log keeps
 * (`PATCH /ops/shops/:supplierId/hours`). One implementation for Operations
 * and Super Admin.
 */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft } from "lucide-react";

import { ClosureRows } from "@/components/shop-hours/ClosureRows";
import { DispatchNotice } from "@/components/shop-hours/DispatchNotice";
import { ShopStatusPanel } from "@/components/shop-hours/ShopStatusPanel";
import { WeekStrip } from "@/components/shop-hours/WeekStrip";
import { shopHoursHref, type ShopHoursTree } from "@/components/shop-hours/paths";
import { useTicker } from "@/components/shop-hours/useConfirm";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { SkeletonLines } from "@/components/ui/loading";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  getShopHours,
  isApiError,
  listShopHours,
  setShopTemporarilyClosed,
} from "@/lib/api/client";
import type { ShopHours } from "@/lib/api/types";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { useSerializedLoad } from "@/lib/live/useSerializedLoad";
import {
  STAFF_REASON_MAX,
  dayLengthLabel,
  extensionToday,
  manilaClock,
  timeLabel,
  weekDraftOf,
} from "@/lib/shop-hours";
import { shopHoursErrorMessage, shopHoursRouteMissing } from "@/lib/shop-hours-errors";

type Loaded = { hours: ShopHours; shopName: string | null };

export function ShopHoursDetail({
  tree,
  supplierId,
}: {
  tree: ShopHoursTree;
  supplierId: string;
}) {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "unknown_shop">("loading");
  const [closing, setClosing] = useState<boolean | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const now = useTicker(30_000);
  const busy = useRef(false);

  const load = useSerializedLoad(
    useCallback(async () => {
      try {
        const [hours, list] = await Promise.all([
          getShopHours(supplierId),
          // Only the list carries the shop's name; a failed read leaves it out.
          listShopHours().catch(() => null),
        ]);
        const shopName = list?.find((row) => row.supplierId === supplierId)?.shopName ?? null;
        setData((previous) => ({ hours, shopName: shopName ?? previous?.shopName ?? null }));
        setError(null);
        setState("ready");
      } catch (err) {
        if (isApiError(err) && err.code === "supplier_profile_not_found") setState("unknown_shop");
        else if (shopHoursRouteMissing(err)) setState("missing");
        else setError(shopHoursErrorMessage(err, "staff", "This shop's hours did not load."));
      }
    }, [supplierId]),
  );

  useEffect(() => {
    void load();
  }, [load]);

  useLiveReload(["catalog", "notifications", "settings"], () => {
    if (!busy.current) return load();
  });

  if (state === "unknown_shop") {
    return (
      <EmptyState
        title="No shop with this link"
        body="GRIDGO has no shop details for this account. Go back to the shop list and open the shop from there."
        action={<BackLink tree={tree} />}
      />
    );
  }
  if (state === "missing") {
    return (
      <EmptyState
        title="Shop hours are not open yet"
        body="This connection to GRIDGO does not have shop hours yet. Check again after the next update."
        action={
          <Button variant="secondary" onClick={() => void load()}>
            Check again
          </Button>
        }
      />
    );
  }
  if (!data) {
    if (error) {
      return (
        <ErrorState
          title="This shop's hours did not load"
          body={error}
          action={
            <Button variant="secondary" onClick={() => void load()}>
              Try again
            </Button>
          }
        />
      );
    }
    return <SkeletonLines lines={8} />;
  }

  const { hours } = data;
  const shopLabel = data.shopName ?? "This shop";
  const clock = manilaClock(now);
  const extension = extensionToday(hours, now);
  const usual = hours.week.find((row) => row.weekday === clock.weekday) ?? null;
  const week = weekDraftOf(hours.week);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <BackLink tree={tree} />
        <h2 className="text-h2 text-text-primary m-0">{shopLabel}</h2>
        <p className="text-body text-text-secondary m-0 max-w-prose">
          The shop sets its own hours, closure dates and extensions, on the website or in the shop
          app. The GRIDGO Team can close it for now. Times are Philippine time.
        </p>
      </header>

      {error ? (
        <p className="text-body text-error m-0" role="alert">
          {error}
        </p>
      ) : null}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-4">
          <ShopStatusPanel hours={hours} now={now} reader="staff" headingLevel={3} />

          <section
            className="rounded-card border border-outline bg-surface flex flex-col gap-2 p-4"
            aria-labelledby="staff-closed-label"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <h3 id="staff-closed-label" className="text-h3 text-text-primary m-0">
                  <label htmlFor="staff-temporarily-closed">Temporarily closed</label>
                </h3>
                <p className="text-body text-text-secondary m-0 max-w-prose">
                  {hours.temporarilyClosed
                    ? "Clients see this shop as closed with no reopening date and cannot order from it. GRIDGO sends it no new jobs. Its accepted jobs keep their dates."
                    : "Close this shop with no reopening date, for example while it cannot take work. Its accepted jobs keep their dates."}
                </p>
              </div>
              <span className="flex min-h-11 min-w-11 shrink-0 items-center justify-center">
                <Switch
                  id="staff-temporarily-closed"
                  checked={hours.temporarilyClosed}
                  disabled={closing !== null}
                  onCheckedChange={(checked) => {
                    setNotice(null);
                    setClosing(Boolean(checked));
                  }}
                />
              </span>
            </div>
            {notice ? (
              <p className="text-caption text-success m-0" role="status">
                {notice}
              </p>
            ) : null}
          </section>

          <section
            className="rounded-card border border-outline bg-surface flex flex-col gap-3 p-4"
            aria-labelledby="staff-extension-heading"
          >
            <h3 id="staff-extension-heading" className="text-h3 text-text-primary m-0">
              Today&rsquo;s extension
            </h3>
            {extension && usual ? (
              <div className="rounded-field bg-surface-variant flex flex-col gap-1 p-3">
                <p className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-bold)" }}>
                  Open until {timeLabel(extension.closesMinute)} today
                </p>
                <p className="text-caption text-text-muted m-0">
                  Usually closes at {timeLabel(usual.closesMinute)}. The extra hours count from{" "}
                  {timeLabel(extension.opensMinute)}. New jobs are timed with them; accepted jobs
                  keep their dates.
                </p>
              </div>
            ) : (
              <p className="text-body text-text-secondary m-0">
                No extension today. The shop declares one itself, for today only.
              </p>
            )}
            {extension && hours.dispatchWaits ? <DispatchNotice /> : null}
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <section
            className="rounded-card border border-outline bg-surface flex flex-col gap-3 p-4"
            aria-labelledby="staff-week-heading"
          >
            <div className="flex flex-col gap-1">
              <h3 id="staff-week-heading" className="text-h3 text-text-primary m-0">
                Weekly hours
              </h3>
              {hours.week.length && !week.uneven ? (
                <p className="text-body text-text-secondary m-0">
                  {dayLengthLabel(week.draft.closesMinute - week.draft.opensMinute)} on each open day.
                </p>
              ) : week.uneven ? (
                <p className="text-body text-text-secondary m-0">
                  Saved before every open day had to be the same length. The shop&rsquo;s next save
                  evens them out.
                </p>
              ) : null}
            </div>
            <WeekStrip week={hours.week} todayWeekday={clock.weekday} />
          </section>

          <section
            className="rounded-card border border-outline bg-surface flex flex-col gap-3 p-4"
            aria-labelledby="staff-closures-heading"
          >
            <h3 id="staff-closures-heading" className="text-h3 text-text-primary m-0">
              Closure dates
            </h3>
            <ClosureRows
              closures={hours.closures}
              today={clock.dayKey}
              empty="No closure dates set."
            />
          </section>
        </div>
      </div>

      <TemporaryClosureDialog
        key={closing === null ? "idle" : String(closing)}
        closing={closing}
        shopLabel={shopLabel}
        onCancel={() => setClosing(null)}
        onConfirm={async (reason) => {
          if (closing === null) return null;
          busy.current = true;
          try {
            const next = await setShopTemporarilyClosed(supplierId, {
              expectedVersion: hours.version,
              temporarilyClosed: closing,
              reason,
            });
            setData((previous) => (previous ? { ...previous, hours: next } : previous));
            setNotice(
              closing
                ? `${shopLabel} is closed for now. The shop has been told.`
                : `${shopLabel} is open again on its weekly hours. The shop has been told.`,
            );
            setClosing(null);
            return null;
          } catch (err) {
            if (isApiError(err) && err.code === "supplier_profile_stale") void load();
            return shopHoursErrorMessage(err, "staff", "The change was not saved.");
          } finally {
            busy.current = false;
          }
        }}
      />
    </div>
  );
}

function BackLink({ tree }: { tree: ShopHoursTree }) {
  return (
    <Link
      href={shopHoursHref(tree)}
      className="text-body text-text-secondary inline-flex min-h-11 w-fit items-center gap-1 underline-offset-4 hover:underline"
    >
      <ChevronLeft size={16} aria-hidden />
      All shops
    </Link>
  );
}

function TemporaryClosureDialog({
  closing,
  shopLabel,
  onCancel,
  onConfirm,
}: {
  closing: boolean | null;
  shopLabel: string;
  onCancel: () => void;
  /** Resolves to a refusal, or null once saved. */
  onConfirm: (reason: string) => Promise<string | null>;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = reason.trim().length > 0;

  async function confirm() {
    setBusy(true);
    setError(await onConfirm(reason.trim()));
    setBusy(false);
  }

  return (
    <AlertDialog open={closing !== null} onOpenChange={(open) => !open && !busy && onCancel()}>
      <AlertDialogContent className="data-[size=default]:sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {closing ? `Close ${shopLabel} for now?` : `Reopen ${shopLabel}?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {closing
              ? "Clients still find the shop and its listings, marked closed with no reopening date, and cannot order from it. GRIDGO sends it no new jobs until it reopens. Jobs it already accepted stay its own, on their dates."
              : "The shop opens again on its weekly hours, and clients can order from it. GRIDGO can send it new jobs."}{" "}
            The shop gets a notice that its hours changed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <FieldGroup>
          <Field data-invalid={error ? true : undefined}>
            <FieldLabel htmlFor="temporary-closure-reason">
              {closing ? "Why it is closing" : "Why it is reopening"}
            </FieldLabel>
            <Textarea
              id="temporary-closure-reason"
              rows={3}
              maxLength={STAFF_REASON_MAX}
              value={reason}
              disabled={busy}
              aria-invalid={error ? true : undefined}
              placeholder={
                closing
                  ? "e.g. The shop called: the press is down until a part arrives."
                  : "e.g. The shop confirmed the press is fixed."
              }
              onChange={(event) => setReason(event.target.value)}
            />
            <FieldDescription>Kept in the audit log with your name.</FieldDescription>
          </Field>
        </FieldGroup>
        {error ? (
          <p className="text-body text-error m-0" role="alert">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel variant="secondary" disabled={busy} onClick={onCancel}>
            {closing ? "Keep it open" : "Keep it closed"}
          </AlertDialogCancel>
          <AlertDialogAction
            variant={closing ? "danger" : "secondary"}
            disabled={busy || !ready}
            onClick={() => void confirm()}
          >
            {busy ? "Saving…" : closing ? "Close for now" : "Reopen shop"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
