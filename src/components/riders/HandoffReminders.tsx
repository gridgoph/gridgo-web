"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { opsErrorMessage } from "@/app/ops/_lib/errors";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { isApiError, listUsers } from "@/lib/api/client";
import {
  formatRate,
  manilaWeekOf,
  ratePercent,
  readAllReminderWeeks,
  readWeekStart,
  reportNotOnApi,
  shiftWeek,
  sumReminderWeeks,
  weekLabel,
  weekShortLabel,
  weeksBetween,
  weeksRange,
  type ReminderTotals,
  type ReminderWeek,
} from "@/lib/api/sharing-reminders";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { useSerializedLoad } from "@/lib/live/useSerializedLoad";
import { cn } from "@/lib/utils";

/** Weeks on the strip. Six fit a 390px phone at the 44px control floor. */
export const STRIP_WEEKS = 6;

/**
 * The strip's six weeks for a selected week: fixed blocks counted back from
 * this week, so picking a week on the strip never slides the strip under the
 * pointer. Returns the Mondays oldest first.
 */
export function stripWeeks(selected: string, current: string): string[] {
  const back = Math.max(0, weeksBetween(selected, current));
  const last = shiftWeek(current, -STRIP_WEEKS * Math.floor(back / STRIP_WEEKS));
  return Array.from({ length: STRIP_WEEKS }, (_, i) =>
    shiftWeek(last, i - (STRIP_WEEKS - 1)),
  );
}

function riderLabel(names: Map<string, string>, riderId: string): string {
  return names.get(riderId) || `Rider ${riderId.slice(-6)}`;
}

/**
 * Rider handoff reminders for Operations and Super Admin
 * (`GET /ops/delivery-reminders`, gridgo-rider#157). Riders tick "I reminded
 * the client" at the door; this shows, per rider and per Manila week, how
 * many door deliveries carried the reminder and how many of those clients
 * then did the survey and tapped Share. Read-only, and nothing here changes
 * rider pay. The week and rider live in the URL (`?week=2026-10-26&rider=`).
 */
export function HandoffReminders({ tree }: { tree: "ops" | "admin" }) {
  const router = useRouter();
  const params = useSearchParams();
  const current = useMemo(() => manilaWeekOf(Date.now()).weekStart, []);
  const asked = readWeekStart(params.get("week"));
  const selected = asked && asked <= current ? asked : current;
  const riderFilter = params.get("rider") ?? "";
  const strip = useMemo(() => stripWeeks(selected, current), [selected, current]);
  const windowKey = `${strip[0]}:${strip[strip.length - 1]}`;

  const [rows, setRows] = useState<ReminderWeek[] | null>(null);
  const [shownWindow, setShownWindow] = useState<string | null>(null);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useSerializedLoad(
    useCallback(async () => {
      setLoading(true);
      setError(null);
      try {
        const [first, last] = windowKey.split(":");
        const [weeks, riders] = await Promise.all([
          readAllReminderWeeks(weeksRange(first, last)),
          // Names only; a rider without one reads by the end of their id.
          listUsers("rider").catch(() => null),
        ]);
        setRows(weeks);
        setShownWindow(windowKey);
        setUnavailable(false);
        if (riders) {
          setNames(new Map(riders.map((rider) => [rider.id, rider.name ?? ""])));
        }
      } catch (err) {
        if (reportNotOnApi(err)) {
          setUnavailable(true);
          setRows(null);
        } else {
          setError(
            isApiError(err)
              ? err.status === 403
                ? "Only Operations and Super Admin can read rider handoff reminders."
                : opsErrorMessage(err, "Could not load the handoff reminders. Retry.")
              : "Could not reach the API. Check the connection, then retry.",
          );
        }
      } finally {
        setLoading(false);
      }
    }, [windowKey]),
  );

  useLiveReload(["orders", "notifications"], load);

  useEffect(() => {
    void load();
  }, [load]);

  const go = useCallback(
    (next: { week?: string; rider?: string }) => {
      const week = next.week ?? selected;
      const rider = next.rider ?? riderFilter;
      const search = new URLSearchParams();
      if (week !== current) search.set("week", week);
      if (rider) search.set("rider", rider);
      const q = search.toString();
      router.replace(`/${tree}/handoff-reminders${q ? `?${q}` : ""}`, { scroll: false });
    },
    [current, riderFilter, router, selected, tree],
  );

  const scoped = useMemo(
    () => (rows ?? []).filter((row) => !riderFilter || row.riderId === riderFilter),
    [riderFilter, rows],
  );
  const weekRows = useMemo(
    () => scoped.filter((row) => row.weekStart === selected),
    [scoped, selected],
  );
  const totalsByWeek = useMemo(
    () =>
      new Map(
        strip.map((week) => [
          week,
          sumReminderWeeks(scoped.filter((row) => row.weekStart === week)),
        ]),
      ),
    [scoped, strip],
  );
  const riderIds = useMemo(() => {
    const ids = new Set((rows ?? []).map((row) => row.riderId));
    if (riderFilter) ids.add(riderFilter);
    return [...ids].sort((a, b) =>
      riderLabel(names, a).localeCompare(riderLabel(names, b)),
    );
  }, [names, riderFilter, rows]);

  const columns = useMemo<DataTableColumn<ReminderWeek>[]>(
    () => [
      {
        id: "rider",
        header: "Rider",
        primary: true,
        sortValue: (row) => riderLabel(names, row.riderId),
        filterValue: (row) => riderLabel(names, row.riderId),
        cell: (row) => (
          <span className="flex min-w-0 flex-col">
            <span
              className="text-body text-text-primary"
              style={{ fontFamily: "var(--font-medium)" }}
            >
              {riderLabel(names, row.riderId)}
            </span>
            {row.legacyDeliveries ? (
              <span className="text-caption text-text-muted whitespace-normal">
                {row.legacyDeliveries} from an older rider app
              </span>
            ) : null}
          </span>
        ),
      },
      {
        id: "deliveries",
        header: "Door deliveries",
        sortValue: (row) => row.deliveries,
        cell: (row) => (
          <span className="text-body text-text-primary tabular-nums">{row.deliveries}</span>
        ),
      },
      {
        id: "reminded",
        header: "Reminded",
        sortValue: (row) => ratePercent(row.remindedDeliveries, row.deliveries) ?? -1,
        cell: (row) => (
          <RateCell
            part={row.remindedDeliveries}
            whole={row.deliveries}
            of="deliveries"
            meter
          />
        ),
      },
      {
        id: "survey",
        header: "Then did the survey",
        sortValue: (row) => row.surveySubmittedDeliveries,
        cell: (row) => (
          <RateCell
            part={row.surveySubmittedDeliveries}
            whole={row.remindedDeliveries}
            of="reminded"
          />
        ),
      },
      {
        id: "share",
        header: "Then tapped Share",
        sortValue: (row) => row.shareTappedDeliveries,
        cell: (row) => (
          <RateCell
            part={row.shareTappedDeliveries}
            whole={row.remindedDeliveries}
            of="reminded"
          />
        ),
      },
      {
        id: "both",
        header: "Both",
        sortValue: (row) => row.surveyAndShareDeliveries,
        hideOnMobile: true,
        cell: (row) => (
          <span className="text-body text-text-primary tabular-nums">
            {row.surveyAndShareDeliveries}
          </span>
        ),
      },
    ],
    [names],
  );

  if (unavailable) {
    return (
      <EmptyState
        title="Not on this API yet"
        body="The API this portal talks to does not report handoff reminders yet. They appear here once it is updated."
        action={
          <Button variant="secondary" onClick={() => void load()}>
            Check again
          </Button>
        }
      />
    );
  }

  const pending = loading && rows === null;
  if (!pending && error && rows === null) {
    return (
      <ErrorState
        body={error}
        action={
          <Button variant="secondary" onClick={() => void load()}>
            Retry
          </Button>
        }
      />
    );
  }

  const stale = loading && shownWindow !== windowKey;
  const totals = totalsByWeek.get(selected) ?? sumReminderWeeks([]);
  const riderName = riderFilter ? riderLabel(names, riderFilter) : null;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-body text-text-secondary m-0 max-w-prose">
        At the door, riders tick &ldquo;I reminded the client&rdquo; after asking them to
        rate GRIDGO in the app and share it with a friend. This counts door deliveries by
        rider and week in Philippine time, and how many of the reminded clients then did
        the survey or tapped Share. Rider pay does not change.
      </p>

      <section className="gg-card flex flex-col gap-4" aria-labelledby="reminder-week">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 id="reminder-week" className="text-h3 text-text-primary m-0">
              {selected === current ? "This week" : `Week of ${weekShortLabel(selected)}`}
            </h2>
            <p className="text-caption text-text-muted m-0 tabular-nums">
              {weekLabel(selected)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={riderFilter || "all"}
              onValueChange={(value) => {
                if (typeof value === "string") go({ rider: value === "all" ? "" : value });
              }}
            >
              <SelectTrigger className="min-w-44" aria-label="Rider">
                <SelectValue>{riderName ?? "Every rider"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">Every rider</SelectItem>
                  {riderIds.map((id) => (
                    <SelectItem key={id} value={id}>
                      {riderLabel(names, id)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Button
              variant="secondary"
              size="icon"
              aria-label="Previous week"
              onClick={() => go({ week: shiftWeek(selected, -1) })}
            >
              <ChevronLeft aria-hidden />
            </Button>
            <Button
              variant="secondary"
              size="icon"
              aria-label="Next week"
              disabled={selected >= current}
              onClick={() => go({ week: shiftWeek(selected, 1) })}
            >
              <ChevronRight aria-hidden />
            </Button>
          </div>
        </div>

        <WeekStrip
          weeks={strip}
          current={current}
          selected={selected}
          totals={totalsByWeek}
          loading={pending || stale}
          onSelect={(week) => go({ week })}
        />

        <FollowThrough totals={totals} loading={pending || stale} />
      </section>

      {error && rows ? (
        <p className="text-body text-error m-0" role="alert">
          {error}
        </p>
      ) : null}

      {!pending && !stale && weekRows.length === 0 ? (
        <EmptyState
          title={
            riderName ? `No door deliveries by ${riderName} this week` : "No door deliveries this week"
          }
          body="A rider appears here once they finish a door delivery in the week. Hub drop-offs do not involve the client, so they are not counted."
          action={
            selected !== current ? (
              <Button variant="secondary" onClick={() => go({ week: current })}>
                Go to this week
              </Button>
            ) : undefined
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={weekRows}
          loading={pending || stale}
          getRowId={(row) => `${row.riderId}:${row.weekStart}`}
          caption={`Handoff reminders by rider, ${weekLabel(selected)}`}
          filterPlaceholder="Find a rider…"
          itemLabel="riders"
          defaultSortId="deliveries"
          defaultSortDirection="desc"
        />
      )}
    </div>
  );
}

/** A count over its base with the rate, and a meter for the reminder rate. */
export function RateCell({
  part,
  whole,
  of,
  meter = false,
}: {
  part: number;
  whole: number;
  of: "deliveries" | "reminded";
  meter?: boolean;
}) {
  const percent = ratePercent(part, whole);
  const words =
    percent === null
      ? of === "reminded"
        ? "No reminded clients"
        : "No deliveries"
      : `${part} of ${whole} ${of === "reminded" ? "reminded clients" : "deliveries"}, ${percent}%`;
  return (
    <span className="inline-flex min-w-0 flex-col gap-1" aria-label={words}>
      <span className="inline-flex items-baseline gap-2" aria-hidden>
        <span className="text-body text-text-primary tabular-nums">
          {formatRate(part, whole)}
        </span>
        <span className="text-caption text-text-muted tabular-nums">
          {whole > 0 ? `${part} of ${whole}` : null}
        </span>
      </span>
      {meter ? (
        <span className="bg-surface-variant block h-1.5 w-24 overflow-hidden rounded-full" aria-hidden>
          <span
            className="bg-text-primary block h-full rounded-full"
            style={{ width: `${percent ?? 0}%` }}
          />
        </span>
      ) : null}
    </span>
  );
}

/**
 * Six weeks side by side, each a column whose fill is that week's reminder
 * rate. A week is a button: it is the week selector, and the rate is printed
 * under the bar so the strip reads in greyscale and without the bars.
 */
function WeekStrip({
  weeks,
  current,
  selected,
  totals,
  loading,
  onSelect,
}: {
  weeks: string[];
  current: string;
  selected: string;
  totals: Map<string, ReminderTotals>;
  loading: boolean;
  onSelect: (week: string) => void;
}) {
  return (
    <div role="group" aria-label="Weeks" className="grid grid-cols-6 gap-1 sm:gap-2">
      {weeks.map((week) => {
        const total = totals.get(week);
        const deliveries = total?.deliveries ?? 0;
        const percent = total ? ratePercent(total.remindedDeliveries, deliveries) : null;
        const future = week > current;
        const isSelected = week === selected;
        const label = `${weekLabel(week)}: ${
          future
            ? "not yet"
            : percent === null
              ? "no door deliveries"
              : `${percent}% reminded, ${total?.remindedDeliveries} of ${deliveries} deliveries`
        }`;
        return (
          <button
            key={week}
            type="button"
            disabled={future}
            aria-pressed={isSelected}
            aria-label={label}
            onClick={() => onSelect(week)}
            className={cn(
              "flex min-h-11 min-w-0 flex-col items-stretch gap-1.5 rounded-field border px-1 py-2 text-center",
              "hover:bg-overlay-hover disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent",
              isSelected ? "border-text-primary bg-surface-variant" : "border-transparent",
            )}
          >
            <span
              className="bg-surface-variant relative mx-auto block h-16 w-full max-w-10 overflow-hidden rounded-md"
              aria-hidden
            >
              {loading ? (
                <Skeleton className="absolute inset-0 rounded-md" />
              ) : (
                <span
                  className="bg-text-primary absolute inset-x-0 bottom-0 block"
                  style={{ height: `${percent ?? 0}%` }}
                />
              )}
            </span>
            <span
              className="text-body text-text-primary tabular-nums"
              style={{ fontFamily: "var(--font-medium)" }}
              aria-hidden
            >
              {loading ? " " : percent === null ? "—" : `${percent}%`}
            </span>
            <span className="text-caption text-text-muted truncate tabular-nums" aria-hidden>
              {weekShortLabel(week)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * The selected week's follow-through as four bars on one scale (door
 * deliveries), so a reader sees the drop from delivered to reminded to what
 * the client did. Survey and Share are each out of the reminded deliveries;
 * they overlap, which "Both" states rather than draws.
 */
function FollowThrough({ totals, loading }: { totals: ReminderTotals; loading: boolean }) {
  const scale = Math.max(totals.deliveries, 1);
  const lines = [
    {
      key: "deliveries",
      label: "Door deliveries",
      value: totals.deliveries,
      note: null as string | null,
    },
    {
      key: "reminded",
      label: "Rider reminded the client",
      value: totals.remindedDeliveries,
      note:
        totals.deliveries > 0
          ? `${formatRate(totals.remindedDeliveries, totals.deliveries)} of deliveries`
          : null,
    },
    {
      key: "survey",
      label: "Then did the survey",
      value: totals.surveySubmittedDeliveries,
      note:
        totals.remindedDeliveries > 0
          ? `${formatRate(totals.surveySubmittedDeliveries, totals.remindedDeliveries)} of reminded`
          : null,
    },
    {
      key: "share",
      label: "Then tapped Share",
      value: totals.shareTappedDeliveries,
      note:
        totals.remindedDeliveries > 0
          ? `${formatRate(totals.shareTappedDeliveries, totals.remindedDeliveries)} of reminded`
          : null,
    },
  ];
  return (
    <div className="flex flex-col gap-3">
      <dl className="m-0 flex flex-col gap-2">
        {lines.map((line, index) => (
          <div
            key={line.key}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 md:grid-cols-[14rem_minmax(0,1fr)_7.5rem]"
          >
            <dt className="text-body text-text-secondary m-0 min-w-0">{line.label}</dt>
            <dd className="col-span-2 row-start-2 m-0 md:col-span-1 md:row-start-auto" aria-hidden>
              <span className="bg-surface-variant block h-2.5 w-full overflow-hidden rounded-full">
                {loading ? null : (
                  <span
                    className={cn(
                      "block h-full rounded-full",
                      index === 0 ? "bg-text-muted" : "bg-text-primary",
                    )}
                    style={{ width: `${(line.value / scale) * 100}%` }}
                  />
                )}
              </span>
            </dd>
            <dd className="m-0 flex items-baseline justify-end gap-2 md:justify-start">
              {loading ? (
                <Skeleton className="h-5 w-16" />
              ) : (
                <>
                  <span
                    className="text-body text-text-primary tabular-nums"
                    style={{ fontFamily: "var(--font-medium)" }}
                  >
                    {line.value.toLocaleString("en-PH")}
                  </span>
                  {line.note ? (
                    <span className="text-caption text-text-muted tabular-nums">{line.note}</span>
                  ) : null}
                </>
              )}
            </dd>
          </div>
        ))}
      </dl>
      {!loading && (totals.surveyAndShareDeliveries > 0 || totals.legacyDeliveries > 0) ? (
        <p className="text-caption text-text-muted m-0">
          {totals.surveyAndShareDeliveries > 0
            ? `${totals.surveyAndShareDeliveries} reminded ${totals.surveyAndShareDeliveries === 1 ? "client" : "clients"} did both. `
            : ""}
          {totals.legacyDeliveries > 0
            ? `${totals.legacyDeliveries} ${totals.legacyDeliveries === 1 ? "delivery was" : "deliveries were"} from an older rider app with no reminder step; ${totals.legacyDeliveries === 1 ? "it counts" : "they count"} as a delivery, never as reminded.`
            : ""}
        </p>
      ) : null}
    </div>
  );
}
