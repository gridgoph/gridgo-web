"use client";

import { useLiveReload } from "@/lib/live/useLiveReload";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { addDays, format, isSameDay, parseISO } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";

import {
  buildScheduleEvents,
  filterEventsInRange,
  groupEventsByDay,
  rangeForView,
  SCHEDULE_KIND_LABEL,
  type ScheduleEvent,
  type ScheduleKind,
  type ScheduleViewMode,
} from "@/app/ops/_lib/schedule";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonCards } from "@/components/ui/loading";
import { StatusChip } from "@/components/ui/StatusChip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ApiError, listClaims, listOrders } from "@/lib/api/client";
import type { Claim, Order } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";

const ALL_KINDS = Object.keys(SCHEDULE_KIND_LABEL) as ScheduleKind[];

function kindTone(
  kind: ScheduleKind,
): "success" | "warning" | "error" | "info" | "neutral" {
  switch (kind) {
    case "qa":
    case "proof":
      return "warning";
    case "recovery":
    case "payout_hold":
      return "error";
    case "delivery":
    case "pickup":
      return "info";
    case "payment_confirmation":
      return "warning";
    default:
      return "neutral";
  }
}

export default function OpsSchedulePage() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [mode, setMode] = useState<ScheduleViewMode>("week");
  const [anchor, setAnchor] = useState(() => new Date());
  const [kinds, setKinds] = useState<Set<ScheduleKind>>(() => new Set(ALL_KINDS));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [o, c] = await Promise.all([listOrders(), listClaims()]);
      setOrders(o);
      setClaims(c);
    } catch (err) {
      setOrders(null);
      if (err instanceof ApiError) {
        setError(`Could not load schedule (${err.code}).`);
      } else {
        setError("Network error loading schedule.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useLiveReload(["orders", "claims"], load);

  useEffect(() => {
    void load();
  }, [load]);

  const allEvents = useMemo(
    () => (orders ? buildScheduleEvents(orders, claims) : []),
    [orders, claims],
  );

  const { start, end } = useMemo(() => rangeForView(mode, anchor), [mode, anchor]);

  const visible = useMemo(
    () => filterEventsInRange(allEvents, start, end, kinds),
    [allEvents, start, end, kinds],
  );

  const byDay = useMemo(() => groupEventsByDay(visible), [visible]);

  const rangeLabel = useMemo(() => {
    const fmt = new Intl.DateTimeFormat("en-PH", {
      dateStyle: "medium",
    });
    return `${fmt.format(start)} – ${fmt.format(end)}`;
  }, [start, end]);

  function toggleKind(kind: ScheduleKind) {
    setKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }

  function step(delta: number) {
    setAnchor((d) => addDays(d, mode === "day" ? delta : delta * 7));
  }

  if (error) {
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

  // Range, view mode and event-type filters are all local — the calendar
  // controls stay usable while the events themselves are still arriving.
  const pending = loading && !orders;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-body text-text-secondary m-0 max-w-prose">
          Deadlines Operations works to — QA, proof, acceptance, production, pickup,
          delivery, recovery, cash reconciliation, and payout holds. Selecting an event
          opens the existing workspace; nothing new is created here.
        </p>
        <Button
          variant="secondary"
          disabled={loading}
          onClick={() => void load()}
        >
          Refresh
        </Button>
      </div>

      <div className="gg-card flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            value={[mode]}
            onValueChange={(values) => {
              const next = values[0] as ScheduleViewMode | undefined;
              if (next) setMode(next);
            }}
            variant="outline"
            spacing={0}
            aria-label="Day or week view"
          >
            <ToggleGroupItem value="day">Day</ToggleGroupItem>
            <ToggleGroupItem value="week">Week</ToggleGroupItem>
          </ToggleGroup>

          <Button
            variant="secondary"
            aria-label="Previous period"
            onClick={() => step(-1)}
          >
            <ChevronLeft data-icon="inline-start" aria-hidden />
            Prev
          </Button>
          <Button variant="secondary" onClick={() => setAnchor(new Date())}>
            Today
          </Button>
          <Button variant="secondary" aria-label="Next period" onClick={() => step(1)}>
            Next
            <ChevronRight data-icon="inline-end" aria-hidden />
          </Button>
        </div>

        <p
          className="text-body text-text-primary m-0"
          style={{ fontFamily: "var(--font-medium)" }}
        >
          {rangeLabel}
        </p>

        <fieldset className="m-0 border-0 p-0">
          <legend className="text-caption text-text-muted mb-2">Show event types</legend>
          <div className="flex flex-wrap gap-2">
            {ALL_KINDS.map((kind) => {
              const on = kinds.has(kind);
              return (
                <Button
                  key={kind}
                  variant={on ? "secondary" : "ghost"}
                  aria-pressed={on}
                  onClick={() => toggleKind(kind)}
                >
                  {SCHEDULE_KIND_LABEL[kind]}
                </Button>
              );
            })}
          </div>
        </fieldset>
      </div>

      {pending ? (
        <SkeletonCards count={3} lines={2} chip={false} label="Loading schedule" />
      ) : !visible.length ? (
        <EmptyState
          title="No events in this range"
          body="Try Today, switch day/week, or turn filters back on. Events come from live orders and active payout holds — not a separate calendar store."
          action={
            <Button variant="secondary" onClick={() => setAnchor(new Date())}>
              Jump to today
            </Button>
          }
        />
      ) : (
        <>
          {/* Desktop / tablet: day columns for week; agenda always for day */}
          <div className="hidden md:block">
            {mode === "week" ? (
              <WeekGrid start={start} events={visible} />
            ) : (
              <AgendaList groups={byDay} />
            )}
          </div>
          {/* Mobile: always agenda */}
          <div className="md:hidden">
            <AgendaList groups={byDay} />
          </div>
        </>
      )}
    </div>
  );
}

function WeekGrid({ start, events }: { start: Date; events: ScheduleEvent[] }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));

  return (
    <div className="grid grid-cols-7 gap-2" role="grid" aria-label="Week schedule">
      {days.map((day) => {
        const dayEvents = events.filter((ev) => {
          try {
            return isSameDay(parseISO(ev.at), day);
          } catch {
            return false;
          }
        });
        const isToday = isSameDay(day, new Date());
        return (
          <div
            key={day.toISOString()}
            role="gridcell"
            className="gg-card min-h-[8rem] flex flex-col gap-2 p-2"
          >
            <p
              className="text-caption m-0"
              style={{
                fontFamily: isToday ? "var(--font-bold)" : "var(--font-medium)",
                color: isToday ? "var(--color-text-primary)" : "var(--color-text-muted)",
              }}
            >
              {format(day, "EEE d")}
            </p>
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {dayEvents.map((ev) => (
                <li key={ev.id}>
                  <Link
                    href={ev.href}
                    className="block rounded-[var(--radius-field)] border border-outline-subtle bg-surface-variant p-2 no-underline hover:border-outline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    <span className="text-caption text-text-muted block">
                      {SCHEDULE_KIND_LABEL[ev.kind]}
                    </span>
                    <span
                      className="text-caption text-text-primary block line-clamp-2"
                      style={{ fontFamily: "var(--font-medium)" }}
                    >
                      {ev.orderTitle}
                    </span>
                  </Link>
                </li>
              ))}
              {!dayEvents.length ? (
                <li className="text-caption text-text-muted">—</li>
              ) : null}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function AgendaList({
  groups,
}: {
  groups: { dayKey: string; dayLabel: string; events: ScheduleEvent[] }[];
}) {
  return (
    <div className="flex flex-col gap-3" aria-label="Schedule agenda">
      {groups.map((group) => (
        <section key={group.dayKey} aria-labelledby={`day-${group.dayKey}`}>
          <h2 id={`day-${group.dayKey}`} className="text-h3 text-text-primary m-0 mb-2">
            {group.dayLabel}
          </h2>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {group.events.map((ev) => (
              <li key={ev.id}>
                <Link
                  href={ev.href}
                  className="gg-card flex flex-col gap-2 no-underline text-inherit hover:border-outline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusChip
                        tone={kindTone(ev.kind)}
                        label={SCHEDULE_KIND_LABEL[ev.kind]}
                        icon={
                          ev.kind === "payout_hold" || ev.kind === "recovery"
                            ? "triangle-alert"
                            : "clock"
                        }
                      />
                      <span className="text-caption text-text-muted">
                        {formatDateTime(ev.at)}
                      </span>
                    </div>
                    <p
                      className="text-body text-text-primary m-0"
                      style={{ fontFamily: "var(--font-medium)" }}
                    >
                      {ev.orderTitle}
                    </p>
                    <p className="text-caption text-text-secondary m-0">{ev.detail}</p>
                  </div>
                  <span className="text-body text-text-secondary inline-flex items-center gap-1 shrink-0">
                    Open
                    <ChevronRight size={16} aria-hidden />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
