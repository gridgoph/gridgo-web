"use client";

import { useSerializedLoad } from "@/lib/live/useSerializedLoad";

import { useLiveReload } from "@/lib/live/useLiveReload";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import {
  buildScheduleEntries,
  dayContaining,
  dayKeyFromDate,
  eachDayInRange,
  filterEntriesInRange,
  formatRangeLabel,
  groupEntriesByDay,
  monthContaining,
  shiftRange,
  weekContaining,
  type ScheduleEntry,
  type ScheduleViewMode,
} from "@/app/supplier/_lib/schedule";
import {
  closureBanner,
  dailyCapacity,
  dayFace,
  monthCellLabel,
  selectedDayEmpty,
} from "@/app/supplier/_lib/month-board";
import { Button } from "@/components/ui/button";
import { describeQuantity } from "@/lib/quantity";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonCards } from "@/components/ui/loading";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/StatusChip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ApiError, getMyShopHours, listJobs, listSupplierServices } from "@/lib/api/client";
import type { Order, ShopHours, SupplierService } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import { presentOrderState } from "@/lib/order-state";

function useIsNarrow(breakpoint = 768): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [breakpoint]);
  return narrow;
}

function DayQuiet({
  day,
  hours,
  jobCount,
}: {
  day: Date;
  hours: ShopHours | null;
  jobCount: number;
}) {
  const face = dayFace(day, hours, jobCount);
  const banner = closureBanner(face);
  const empty = selectedDayEmpty(face, jobCount);
  return (
    <div className="flex flex-col gap-1">
      {banner ? <p className="text-caption text-text-secondary m-0">{banner}</p> : null}
      {face === "not-working" ? <p className="text-caption text-text-secondary m-0">Not a working day</p> : null}
      {empty ? <p className="text-caption text-text-muted m-0">{empty}</p> : null}
    </div>
  );
}

function monthCells(anchor: Date): { date: Date; inMonth: boolean }[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const lead = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(1 - lead);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return { date, inMonth: date.getMonth() === first.getMonth() };
  });
}

function MonthBoard({
  anchor,
  hours,
  capacity,
  byDay,
  pending,
  onSelect,
}: {
  anchor: Date;
  hours: ShopHours | null;
  capacity: number | null;
  byDay: Map<string, ScheduleEntry[]>;
  pending: boolean;
  onSelect: (day: Date) => void;
}) {
  const selectedKey = dayKeyFromDate(anchor);
  const selectedEntries = byDay.get(selectedKey) ?? [];
  const selectedFace = dayFace(anchor, hours, selectedEntries.length);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-7 gap-1" role="grid" aria-label="Month schedule">
        {monthCells(anchor).map(({ date, inMonth }) => {
          const key = dayKeyFromDate(date);
          const count = byDay.get(key)?.length ?? 0;
          const face = dayFace(date, hours, count);
          const label = monthCellLabel(face);
          return (
            <button
              key={key}
              type="button"
              role="gridcell"
              aria-pressed={key === selectedKey}
              aria-label={`${date.getDate()}: ${label}`}
              disabled={!inMonth}
              className="flex min-h-11 flex-col items-start rounded-field border border-outline-subtle px-1 py-1 text-left disabled:opacity-40"
              onClick={() => onSelect(date)}
            >
              <span className="text-caption text-text-primary">{date.getDate()}</span>
              {inMonth ? <span className="text-caption text-text-muted">{label}</span> : null}
            </button>
          );
        })}
      </div>
      <section className="flex flex-col gap-2" aria-label="Selected day">
        <h2 className="text-h3 text-text-primary m-0">
          {new Intl.DateTimeFormat("en-PH", { weekday: "long", day: "numeric", month: "short" }).format(anchor)}
        </h2>
        {closureBanner(selectedFace) ? (
          <p className="text-caption text-text-secondary m-0">{closureBanner(selectedFace)}</p>
        ) : null}
        {capacity != null && selectedEntries.length > 0 ? (
          <p className="text-caption text-text-secondary m-0">Daily capacity {capacity} units</p>
        ) : null}
        {pending ? <SkeletonCards count={1} lines={1} label="Loading jobs due" /> : null}
        {!pending && selectedEntries.length === 0 ? <DayQuiet day={anchor} hours={hours} jobCount={0} /> : null}
        {selectedEntries.map((entry) => (
          <JobCard key={entry.job.id} entry={entry} />
        ))}
      </section>
    </div>
  );
}

function JobCard({ entry }: { entry: ScheduleEntry }) {
  const status = presentOrderState(entry.job.state);
  return (
    <Link
      href={`/supplier/jobs/${entry.job.id}`}
      className="gg-panel flex flex-col gap-1 no-underline text-inherit outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
    >
      <p
        className="text-body text-text-primary m-0"
        style={{ fontFamily: "var(--font-medium)" }}
      >
        {entry.job.title}
      </p>
      <p className="text-caption text-text-muted m-0">Order {entry.job.id}</p>
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip tone={status.tone} label={status.label} icon={status.icon} />
        <span className="text-caption text-text-muted">
          Due {formatDateTime(entry.job.deadline || entry.job.promisedDate)}
        </span>
      </div>
      <p className="text-caption text-text-secondary m-0">
        {entry.job.size || "—"} · {entry.job.material || "—"} ·{" "}
        {describeQuantity(entry.job.quantity, entry.job.unit)}
      </p>
    </Link>
  );
}

export default function SupplierSchedulePage() {
  const [jobs, setJobs] = useState<Order[] | null>(null);
  const [hours, setHours] = useState<ShopHours | null>(null);
  const [services, setServices] = useState<SupplierService[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<ScheduleViewMode>("week");
  const [anchor, setAnchor] = useState(() => new Date());
  const isNarrow = useIsNarrow(768);

  const load = useSerializedLoad(
    useCallback(async () => {
      setLoading(true);
      setError(null);
      try {
        const [nextJobs, nextHours, nextServices] = await Promise.all([
          listJobs(),
          getMyShopHours().catch(() => null),
          listSupplierServices().catch(() => []),
        ]);
        setJobs(nextJobs);
        setHours(nextHours);
        setServices(nextServices);
      } catch (err) {
        setJobs(null);
        if (err instanceof ApiError) {
          setError(
            err.status === 403
              ? "Schedule is only available to supplier accounts."
              : `Could not load schedule (${err.code}).`,
          );
        } else {
          setError(
            "Network error loading schedule. Confirm the demo API is running, then retry.",
          );
        }
      } finally {
        setLoading(false);
      }
    }, []),
  );

  useLiveReload(["jobs", "availability"], load);

  useEffect(() => {
    void load();
  }, [load]);

  const range = useMemo(
    () =>
      mode === "day" ? dayContaining(anchor) : mode === "week" ? weekContaining(anchor) : monthContaining(anchor),
    [mode, anchor],
  );

  const entries = useMemo(() => (jobs ? buildScheduleEntries(jobs) : []), [jobs]);

  const visible = useMemo(() => filterEntriesInRange(entries, range), [entries, range]);

  const byDay = useMemo(() => groupEntriesByDay(visible), [visible]);
  const days = useMemo(() => eachDayInRange(range), [range]);
  const todayKey = dayKeyFromDate(new Date());

  const pending = loading && !jobs;

  if (!pending && (error || !jobs)) {
    return (
      <ErrorState
        body={error ?? "Could not load schedule."}
        action={
          <Button variant="secondary" onClick={() => void load()}>
            Retry
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-body text-text-secondary m-0 max-w-prose">
          Accepted jobs by promised date. Open any entry for the existing job workspace —
          this view never creates a parallel record.
        </p>
        <Button variant="secondary" disabled={loading} onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          value={[mode]}
          onValueChange={(values) => {
            const next = values[0] as ScheduleViewMode | undefined;
            if (next) setMode(next);
          }}
          variant="outline"
          spacing={0}
          aria-label="Schedule density"
        >
          <ToggleGroupItem value="day">Day</ToggleGroupItem>
          <ToggleGroupItem value="week">Week</ToggleGroupItem>
          <ToggleGroupItem value="month">Month</ToggleGroupItem>
        </ToggleGroup>

        <Button
          variant="secondary"
          size="icon"
          aria-label={mode === "day" ? "Previous day" : mode === "week" ? "Previous week" : "Previous month"}
          onClick={() =>
            setAnchor((a) => {
              const r = mode === "day" ? dayContaining(a) : mode === "week" ? weekContaining(a) : monthContaining(a);
              return shiftRange(r, mode, -1).start;
            })
          }
        >
          <ChevronLeft aria-hidden />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          aria-label={mode === "day" ? "Next day" : mode === "week" ? "Next week" : "Next month"}
          onClick={() =>
            setAnchor((a) => {
              const r = mode === "day" ? dayContaining(a) : mode === "week" ? weekContaining(a) : monthContaining(a);
              return shiftRange(r, mode, 1).start;
            })
          }
        >
          <ChevronRight aria-hidden />
        </Button>

        {/* On a phone the range reads first, on its own line, so the mode,
            arrows and Today share one row instead of wrapping into three. */}
        <p
          className="text-body text-text-primary order-first m-0 basis-full md:order-none md:min-w-[12rem] md:basis-auto"
          style={{ fontFamily: "var(--font-medium)" }}
          aria-live="polite"
        >
          {formatRangeLabel(range, mode)}
        </p>

        <Button
          variant="secondary"
          onClick={() => {
            setAnchor(new Date());
          }}
        >
          Today
        </Button>
      </div>

      {!pending && !entries.length && mode !== "month" ? (
        <EmptyState
          title="Nothing on the production schedule"
          body="When you accept jobs, their promised dates appear here as a week grid on larger screens, or a chronological agenda on phones."
          action={
            <Button
              variant="secondary"
              nativeButton={false}
              render={<Link href="/supplier/jobs" />}
            >
              Open job inbox
            </Button>
          }
        />
      ) : mode === "month" ? (
        <MonthBoard
          anchor={anchor}
          hours={hours}
          capacity={dailyCapacity(services)}
          byDay={byDay}
          pending={pending}
          onSelect={setAnchor}
        />
      ) : isNarrow || mode === "day" ? (
        // Mobile (<768): chronological agenda is required, not optional.
        // Day mode on wider screens also uses the list for clarity.
        <div className="flex flex-col gap-3">
          {days.map((day) => {
            const key = dayKeyFromDate(day);
            const dayEntries = byDay.get(key) ?? [];
            const label = new Intl.DateTimeFormat("en-PH", {
              weekday: "long",
              day: "numeric",
              month: "short",
            }).format(day);
            return (
              <section
                key={key}
                className="flex flex-col gap-2"
                aria-labelledby={`day-${key}`}
              >
                <h2
                  id={`day-${key}`}
                  className="text-h3 text-text-primary m-0 flex items-center gap-2"
                >
                  {label}
                  {key === todayKey ? (
                    <span className="text-caption text-text-muted">Today</span>
                  ) : null}
                </h2>
                {pending ? (
                  <SkeletonCards count={1} lines={1} label="Loading jobs due" />
                ) : !dayEntries.length ? (
                  <DayQuiet day={day} hours={hours} jobCount={0} />
                ) : (
                  <div className="flex flex-col gap-2">
                    {dayEntries.map((entry) => (
                      <JobCard key={entry.job.id} entry={entry} />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
          {!pending && visible.length === 0 ? (
            <p className="text-body text-text-secondary m-0">
              No accepted jobs fall in this range. Move the week or open the inbox.
            </p>
          ) : null}
        </div>
      ) : (
        <div
          className="grid gap-2"
          style={{
            gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`,
          }}
          role="grid"
          aria-label="Week schedule"
          aria-busy={pending || undefined}
        >
          {days.map((day) => {
            const key = dayKeyFromDate(day);
            const dayEntries = byDay.get(key) ?? [];
            const isToday = key === todayKey;
            const head = new Intl.DateTimeFormat("en-PH", {
              weekday: "short",
              day: "numeric",
            }).format(day);
            return (
              <div
                key={key}
                role="gridcell"
                className={`gg-card flex min-h-[12rem] flex-col gap-2 ${
                  isToday ? "ring-1 ring-outline" : ""
                }`}
              >
                <div className="flex items-baseline justify-between gap-1">
                  <p
                    className="text-caption text-text-primary m-0"
                    style={{ fontFamily: "var(--font-medium)" }}
                  >
                    {head}
                  </p>
                  {isToday ? (
                    <span className="text-caption text-text-muted">Today</span>
                  ) : null}
                </div>
                <div className="flex flex-col gap-2">
                  {pending ? (
                    <Skeleton className="h-16 w-full rounded-field" aria-hidden />
                  ) : (
                    dayEntries.map((entry) => (
                      <JobCard key={entry.job.id} entry={entry} />
                    ))
                  )}
                  {!pending && !dayEntries.length ? <DayQuiet day={day} hours={hours} jobCount={0} /> : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
