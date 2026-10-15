"use client";

/**
 * Every shop's hours at a glance, for the GRIDGO Team (gridgo-api#219,
 * `GET /ops/shops/hours`): open now or not, the weekly hours, today's
 * extension and the closures ahead. Temporarily closed shops come first,
 * because they take no new jobs. One implementation for Operations and
 * Super Admin; links stay in the tree.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";

import { SHOP_STATUS_CHIP } from "@/components/shop-hours/ShopStatusPanel";
import { WeekLetters } from "@/components/shop-hours/WeekStrip";
import { shopHoursHref, type ShopHoursTree } from "@/components/shop-hours/paths";
import { useTicker } from "@/components/shop-hours/useConfirm";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  DataTableRowAction,
  type DataTableColumn,
} from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { StatusChip } from "@/components/ui/StatusChip";
import { listShopHours } from "@/lib/api/client";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { useSerializedLoad } from "@/lib/live/useSerializedLoad";
import { closureLabel } from "@/lib/operating-hours";
import {
  SHOP_STATE_ORDER,
  closedDayCount,
  closureOnDay,
  extensionToday,
  manilaClock,
  shopStatus,
  sortShopRows,
  timeLabel,
  upcomingClosures,
  weekLabel,
  type ShopHoursRow,
  type ShopStatusState,
} from "@/lib/shop-hours";
import { shopHoursErrorMessage, shopHoursRouteMissing } from "@/lib/shop-hours-errors";

export function ShopHoursDesk({ tree }: { tree: ShopHoursTree }) {
  const [rows, setRows] = useState<ShopHoursRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const now = useTicker(60_000);

  const load = useSerializedLoad(
    useCallback(async () => {
      setLoading(true);
      try {
        setRows(await listShopHours());
        setError(null);
        setMissing(false);
      } catch (err) {
        if (shopHoursRouteMissing(err)) setMissing(true);
        else setError(shopHoursErrorMessage(err, "staff", "Shop hours did not load."));
      } finally {
        setLoading(false);
      }
    }, []),
  );

  useEffect(() => {
    void load();
  }, [load]);

  // An hours change sends the GRIDGO Team a notice; its ping is the cue.
  useLiveReload(["catalog", "notifications", "settings"], load);

  const sorted = useMemo(() => (rows ? sortShopRows(rows, now) : []), [rows, now]);
  const today = manilaClock(now);

  const counts = useMemo(() => {
    const tally: Record<ShopStatusState, number> = {
      open: 0,
      closed: 0,
      temporarily_closed: 0,
      unreadable: 0,
    };
    for (const row of sorted) tally[shopStatus(row.hours, now, "staff").state] += 1;
    return tally;
  }, [sorted, now]);

  const columns = useMemo<DataTableColumn<ShopHoursRow>[]>(
    () => [
      {
        id: "shop",
        header: "Shop",
        primary: true,
        alwaysVisible: true,
        sortValue: (row) => row.shopName,
        cell: (row) => (
          <div className="flex min-w-0 flex-col">
            <Link
              href={shopHoursHref(tree, row.supplierId)}
              className="text-body text-text-primary truncate underline-offset-4 hover:underline"
              style={{ fontFamily: "var(--font-medium)" }}
            >
              {row.shopName}
            </Link>
            <span className="text-caption text-text-muted">
              {shopStatus(row.hours, now, "staff").detail}
            </span>
          </div>
        ),
      },
      {
        id: "now",
        header: "Now",
        sortValue: (row) => SHOP_STATE_ORDER[shopStatus(row.hours, now, "staff").state],
        filterValue: (row) => SHOP_STATUS_CHIP[shopStatus(row.hours, now, "staff").state].label,
        cell: (row) => {
          const chip = SHOP_STATUS_CHIP[shopStatus(row.hours, now, "staff").state];
          return <StatusChip tone={chip.tone} icon={chip.icon} label={chip.label} />;
        },
      },
      {
        id: "week",
        header: "Weekly hours",
        sortValue: (row) => row.hours.week.length,
        filterValue: (row) => weekLabel(row.hours.week),
        cell: (row) => (
          <div className="flex min-w-0 flex-col gap-1">
            <WeekLetters
              week={row.hours.week}
              todayWeekday={today.weekday}
              label={`Open ${weekLabel(row.hours.week)}`}
            />
            <span className="text-caption text-text-secondary">{weekLabel(row.hours.week)}</span>
          </div>
        ),
      },
      {
        id: "today",
        header: "Today",
        sortValue: (row) => extensionToday(row.hours, now)?.closesMinute ?? -1,
        cell: (row) => <TodayCell row={row} now={now} />,
      },
      {
        id: "closures",
        header: "Closures ahead",
        sortValue: (row) => upcomingClosures(row.hours.closures, today.dayKey)[0]?.startDay ?? "9999",
        filterValue: (row) =>
          upcomingClosures(row.hours.closures, today.dayKey).map(closureLabel).join(" "),
        cell: (row) => {
          const ahead = upcomingClosures(row.hours.closures, today.dayKey);
          if (!ahead.length) return <span className="text-body text-text-muted">None</span>;
          return (
            <div className="flex flex-col">
              <span className="text-body text-text-primary">{closureLabel(ahead[0])}</span>
              <span className="text-caption text-text-muted tabular-nums">
                {ahead.length === 1
                  ? `${closedDayCount(ahead)} ${closedDayCount(ahead) === 1 ? "date" : "dates"}`
                  : `${ahead.length} closures, ${closedDayCount(ahead)} dates`}
              </span>
            </div>
          );
        },
      },
    ],
    [tree, now, today.weekday, today.dayKey],
  );

  if (missing) {
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

  if (error && !rows) {
    return (
      <ErrorState
        title="Shop hours did not load"
        body={error}
        action={
          <Button variant="secondary" onClick={() => void load()}>
            Try again
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-body text-text-secondary m-0 max-w-prose">
          When each shop works, as GRIDGO counts it: a job&rsquo;s hour to answer, its production
          time and its lateness all run on these hours. Shops set their own hours; the GRIDGO Team
          can close a shop for now from its page. Times are Philippine time.
        </p>
        <Button variant="secondary" disabled={loading} onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      {error ? (
        <p className="text-body text-error m-0" role="alert">
          {error}
        </p>
      ) : null}

      {rows ? (
        <p className="text-caption text-text-muted m-0" data-testid="shop-hours-summary">
          {summaryLine(rows.length, counts)}
        </p>
      ) : null}

      <DataTable
        caption="Shop hours"
        columns={columns}
        data={sorted}
        getRowId={(row) => row.supplierId}
        loading={loading && !rows}
        itemLabel="shops"
        pageSize={25}
        filterPlaceholder="Search shops"
        facets={[
          {
            columnId: "now",
            title: "Now",
            options: (Object.keys(SHOP_STATE_ORDER) as ShopStatusState[])
              .sort((a, b) => SHOP_STATE_ORDER[a] - SHOP_STATE_ORDER[b])
              .map((state) => ({
                value: String(SHOP_STATE_ORDER[state]),
                label: SHOP_STATUS_CHIP[state].label,
              })),
          },
        ]}
        empty={
          <EmptyState
            title="No shops yet"
            body="A shop appears here once it has signed up and set up its shop details."
          />
        }
        rowActions={(row) => (
          <DataTableRowAction
            label={`Open ${row.shopName}'s hours`}
            icon={ChevronRight}
            href={shopHoursHref(tree, row.supplierId)}
          />
        )}
      />
    </div>
  );
}

function TodayCell({ row, now }: { row: ShopHoursRow; now: number }) {
  const clock = manilaClock(now);
  const extension = extensionToday(row.hours, now);
  const usual = row.hours.week.find((window) => window.weekday === clock.weekday) ?? null;
  if (row.hours.temporarilyClosed) {
    return <span className="text-body text-text-muted">Not open today</span>;
  }
  if (closureOnDay(row.hours.closures, clock.dayKey)) {
    return <span className="text-body text-text-secondary">Closure date</span>;
  }
  if (!usual) return <span className="text-body text-text-muted">Not an open day</span>;
  return (
    <div className="flex flex-col">
      <span className="text-body text-text-primary tabular-nums">
        {timeLabel(usual.opensMinute)} to {timeLabel(extension?.closesMinute ?? usual.closesMinute)}
      </span>
      {extension ? (
        <span className="text-caption text-text-secondary">
          Extended from {timeLabel(usual.closesMinute)}
          {row.hours.dispatchWaits ? ", past GRIDGO's hours" : ""}
        </span>
      ) : null}
    </div>
  );
}

function summaryLine(total: number, counts: Record<ShopStatusState, number>): string {
  if (total === 0) return "No shops yet.";
  const parts = [
    `${counts.open} open now`,
    `${counts.closed} closed`,
    counts.temporarily_closed ? `${counts.temporarily_closed} temporarily closed` : null,
    counts.unreadable ? `${counts.unreadable} with hours to set` : null,
  ].filter(Boolean);
  return `${total} ${total === 1 ? "shop" : "shops"}: ${parts.join(", ")}.`;
}
