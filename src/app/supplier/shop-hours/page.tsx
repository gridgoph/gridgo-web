"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ClosureDatesCard } from "@/app/supplier/shop-hours/_components/ClosureDatesCard";
import { ExtendTodayCard } from "@/app/supplier/shop-hours/_components/ExtendTodayCard";
import { WeeklyHoursCard } from "@/app/supplier/shop-hours/_components/WeeklyHoursCard";
import { ShopStatusPanel } from "@/components/shop-hours/ShopStatusPanel";
import { useConfirm, useTicker } from "@/components/shop-hours/useConfirm";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { getMyShopHours, getSettings, isApiError, updateMyShopHours } from "@/lib/api/client";
import type { ScheduleClosure, ShopHours, ShopHoursPatch, WeeklyWindow } from "@/lib/api/types";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { useSerializedLoad } from "@/lib/live/useSerializedLoad";
import { schedulePatch, timeLabel, weekFromDraft } from "@/lib/shop-hours";
import { shopHoursErrorMessage, shopHoursRouteMissing } from "@/lib/shop-hours-errors";

type Load =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "not_open_yet" }
  | { status: "failed"; message: string };

/**
 * When the shop is open, as GRIDGO counts it (gridgo-api `docs/SHOP_HOURS_API.md`).
 *
 * Open now or not, closing for a while, staying open later today, the weekly
 * hours and the closure dates, on one page, because they are one calendar to
 * GRIDGO: a job's hour to answer, its production time and its lateness all run
 * on it. Each section saves on its own; nothing here touches a job the shop
 * has already accepted. Mirrors the shop app's Shop hours screen.
 */
export default function SupplierShopHoursPage() {
  const [hours, setHours] = useState<ShopHours | null>(null);
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [operatingWeek, setOperatingWeek] = useState<WeeklyWindow[] | null>(null);
  const [closedError, setClosedError] = useState<string | null>(null);
  const now = useTicker(30_000);
  const { ask, dialog } = useConfirm();
  // The latest answer, for a save started from a confirmation that outlived a render.
  const hoursRef = useRef<ShopHours | null>(null);
  hoursRef.current = hours;

  const reload = useSerializedLoad(
    useCallback(async () => {
      try {
        const next = await getMyShopHours();
        setHours(next);
        setLoad({ status: "ready" });
      } catch (err) {
        if (shopHoursRouteMissing(err)) {
          setLoad({ status: "not_open_yet" });
          return;
        }
        setLoad({
          status: "failed",
          message: shopHoursErrorMessage(err, "shop", "Your shop hours did not load."),
        });
      }
    }, []),
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    let live = true;
    getSettings()
      .then((settings) => {
        if (live) setOperatingWeek(settings.operatingHours?.schedule.week ?? null);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  // A change from the shop app, or the GRIDGO Team closing the shop, lands here.
  useLiveReload(["catalog", "settings"], () => {
    if (!savingRef.current) return reload();
  });

  /** One write; resolves to a refusal, or null once saved. A stale version reloads. */
  async function send(patch: ShopHoursPatch): Promise<string | null> {
    const current = hoursRef.current;
    if (!current) return "Your shop hours are still loading.";
    if (savingRef.current) return "Another change is still saving. Try again in a moment.";
    savingRef.current = true;
    setSaving(true);
    try {
      setHours(await updateMyShopHours(current.version, patch));
      return null;
    } catch (err) {
      if (isApiError(err) && err.code === "supplier_profile_stale") void reload();
      return shopHoursErrorMessage(err, "shop", "Your change was not saved.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  /**
   * A new base schedule clears today's extension. Send it again when the API
   * would still take it, and ask before a save that has to end it.
   */
  async function saveSchedule(change: {
    week?: WeeklyWindow[];
    closures?: ScheduleClosure[];
  }): Promise<string | null> {
    const current = hoursRef.current;
    if (!current) return "Your shop hours are still loading.";
    const { patch, dropsExtension } = schedulePatch(current, change, Date.now());
    if (dropsExtension && current.todayExtension) {
      const confirmed = await ask({
        title: `Save and end today's extension to ${timeLabel(current.todayExtension.closesMinute)}?`,
        body: "With this change GRIDGO cannot keep today's extra hours, so your shop goes back to its usual close today.",
        confirmLabel: "Save and end it",
        cancelLabel: "Keep the extension",
        destructive: true,
      });
      if (!confirmed) return "Nothing was saved. Today's extension is unchanged.";
    }
    return send(patch);
  }

  async function setTemporarilyClosed(next: boolean) {
    setClosedError(null);
    if (next) {
      const confirmed = await ask({
        title: "Close your shop for now?",
        body: "Clients still find your shop and listings, marked closed with no reopening date, and cannot order from you. GRIDGO sends you no new jobs until you reopen. Jobs you already accepted stay yours, on their dates.",
        confirmLabel: "Close for now",
        cancelLabel: "Stay open",
        destructive: true,
      });
      if (!confirmed) return;
    }
    setClosedError(await send({ temporarilyClosed: next }));
  }

  if (!hours) {
    if (load.status === "not_open_yet") {
      return (
        <EmptyState
          title="Shop hours are not open yet"
          body="GRIDGO has not opened shop hours on this connection. Your jobs keep their usual timing; check again after the next update."
          action={
            <Button variant="secondary" onClick={() => void reload()}>
              Check again
            </Button>
          }
        />
      );
    }
    if (load.status === "failed") {
      return (
        <ErrorState
          title="Shop hours did not load"
          body={load.message}
          action={
            <Button variant="secondary" onClick={() => void reload()}>
              Try again
            </Button>
          }
        />
      );
    }
    return (
      <div className="grid gap-4 lg:grid-cols-2" aria-label="Loading your shop hours" aria-busy>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-52 w-full rounded-card" />
          <Skeleton className="h-24 w-full rounded-card" />
        </div>
        <Skeleton className="h-96 w-full rounded-card" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-body text-text-secondary m-0 max-w-prose">
        GRIDGO times every new job on these hours: the hour you have to answer it, its production
        time and when it counts as late. Changes apply to new jobs. Jobs you already accepted keep
        the dates you agreed to.
      </p>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-4">
          <ShopStatusPanel hours={hours} now={now} reader="shop" />

          <section
            className="rounded-card border border-outline bg-surface flex flex-col gap-2 p-4"
            aria-labelledby="temporarily-closed-label"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <h2 id="temporarily-closed-label" className="text-h3 text-text-primary m-0">
                  <label htmlFor="temporarily-closed">Temporarily closed</label>
                </h2>
                <p className="text-body text-text-secondary m-0 max-w-prose">
                  {hours.temporarilyClosed
                    ? "Clients see your shop as closed with no reopening date, and cannot order. Switch off to reopen on your weekly hours."
                    : "For a closure with no end date yet. Clients see your shop as closed and cannot order; jobs you already accepted stay yours."}
                </p>
              </div>
              <span className="flex min-h-11 min-w-11 shrink-0 items-center justify-center">
                <Switch
                  id="temporarily-closed"
                  checked={hours.temporarilyClosed}
                  disabled={saving}
                  onCheckedChange={(checked) => void setTemporarilyClosed(Boolean(checked))}
                />
              </span>
            </div>
            {closedError ? (
              <p className="text-body text-error m-0" role="alert">
                {closedError}
              </p>
            ) : null}
          </section>

          <ExtendTodayCard
            hours={hours}
            now={now}
            saving={saving}
            operatingWeek={operatingWeek}
            ask={ask}
            onSave={(closesMinute) =>
              send({ extension: closesMinute == null ? null : { closesMinute } })
            }
          />
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <WeeklyHoursCard
            hours={hours}
            now={now}
            saving={saving}
            onSave={(draft) => saveSchedule({ week: weekFromDraft(draft) })}
          />
          <ClosureDatesCard
            closures={hours.closures}
            now={now}
            saving={saving}
            ask={ask}
            onSave={(closures) => saveSchedule({ closures })}
          />
        </div>
      </div>
      {dialog}
    </div>
  );
}
