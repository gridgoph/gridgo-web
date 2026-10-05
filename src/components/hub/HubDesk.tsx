"use client";

/**
 * Hub pick-up desk for Operations and Super Admin (gridgoph/gridgo-api#124 and
 * #125; contract gridgo-api docs/HUB_HANDOVER_API.md). One component, links
 * stay in the tree it is mounted in.
 *
 * Three questions, one tab each:
 *  - Which pick-up orders are still waiting, and which now need Operations
 *    (three missed hub days, or a client asking for paid redelivery)?
 *  - Who handed out what: every staff member's count, and the dated log.
 *  - Where did a QR and its code not match? Those were never handed over.
 *
 * Staff hand orders out in the GRIDGO Admin App. Nothing here hands out an
 * order or changes one; each row opens the order workspace.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";

import { opsErrorMessage } from "@/app/ops/_lib/errors";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  DataTableRowAction,
  type DataTableColumn,
} from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonLines } from "@/components/ui/loading";
import { StatusChip } from "@/components/ui/StatusChip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getHub,
  listHubCodeMismatches,
  listHubHandouts,
  listHubWaiting,
  listOrders,
} from "@/lib/api/client";
import type {
  HubCodeMismatch,
  HubHandout,
  HubHandoutLog,
  HubRecord,
  HubWaitingOrder,
  Order,
} from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import {
  OPERATIONS_AFTER_MISSED_DAYS,
  mergeHandouts,
  missedDaysLabel,
  rankStaffTotals,
  sortWaiting,
  waitingFor,
  waitingStep,
} from "@/lib/hub-desk";
import { scheduleLines } from "@/lib/hub-pickup";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { useSerializedLoad } from "@/lib/live/useSerializedLoad";

type Tree = "ops" | "admin";

const medium = { fontFamily: "var(--font-medium)" } as const;

type Data = {
  hub: HubRecord | null;
  sop: string[];
  waiting: HubWaitingOrder[];
  log: HubHandoutLog;
  mismatches: HubCodeMismatch[];
  orders: Map<string, Order>;
};

export function HubDesk({ tree }: { tree: Tree }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("waiting");
  const [older, setOlder] = useState<{
    handouts: HubHandout[];
    cursor: string | null;
  } | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState<string | null>(null);

  const orderHref = useCallback(
    (orderId: string) => `/${tree}/orders/${encodeURIComponent(orderId)}`,
    [tree],
  );

  const load = useSerializedLoad(
    useCallback(async () => {
      setLoading(true);
      setError(null);
      try {
        const [hub, waiting, log, mismatches, orders] = await Promise.all([
          // The hours are context, not the job: a failed read leaves them out.
          getHub().catch(() => null),
          listHubWaiting(),
          listHubHandouts({ limit: 50 }),
          listHubCodeMismatches(),
          // Titles only; a failed read leaves the order ids showing.
          listOrders().catch(() => [] as Order[]),
        ]);
        setData({
          hub: hub?.hub ?? null,
          sop: hub?.sop ?? [],
          waiting,
          log,
          mismatches,
          orders: new Map(orders.map((order) => [order.id, order])),
        });
        setOlder(null);
      } catch (err) {
        setError(
          opsErrorMessage(
            err,
            "The hub could not be loaded. Retry when the API responds.",
          ),
        );
      } finally {
        setLoading(false);
      }
    }, []),
  );
  useLiveReload(["orders", "escalations"], load);
  useEffect(() => {
    void load();
  }, [load]);

  const waiting = useMemo(() => sortWaiting(data?.waiting ?? []), [data]);
  const forOperations = waiting.filter(
    (order) => waitingStep(order).forOperations,
  ).length;
  const handouts = useMemo(
    () => mergeHandouts(data?.log.handouts ?? [], older?.handouts ?? []),
    [data, older],
  );
  const cursor = older ? older.cursor : (data?.log.nextCursor ?? null);
  const totals = rankStaffTotals(data?.log.staffTotals ?? []);
  const handedOut = totals.reduce((sum, row) => sum + row.count, 0);

  async function loadOlder() {
    if (!cursor) return;
    setLoadingOlder(true);
    setOlderError(null);
    try {
      const page = await listHubHandouts({ before: cursor, limit: 50 });
      setOlder((current) => ({
        handouts: mergeHandouts(current?.handouts ?? [], page.handouts),
        cursor: page.nextCursor,
      }));
    } catch (err) {
      setOlderError(
        opsErrorMessage(err, "Older handovers could not be loaded. Try again."),
      );
    } finally {
      setLoadingOlder(false);
    }
  }

  if (loading && !data) return <SkeletonLines lines={6} />;
  if (!data) {
    return (
      <ErrorState
        body={error ?? "The hub could not be loaded."}
        action={
          <Button variant="secondary" onClick={() => void load()}>
            Retry
          </Button>
        }
      />
    );
  }

  const title = (orderId: string) => data.orders.get(orderId)?.title ?? null;

  const waitingColumns: DataTableColumn<HubWaitingOrder>[] = [
    {
      id: "order",
      header: "Order",
      primary: true,
      alwaysVisible: true,
      sortValue: (row) => title(row.orderId) ?? row.orderId,
      cell: (row) => (
        <OrderCell
          title={title(row.orderId)}
          orderId={row.orderId}
          href={orderHref(row.orderId)}
        />
      ),
    },
    {
      id: "missed",
      header: "Hub days missed",
      sortValue: (row) => row.missedDays,
      cell: (row) => <MissedDays count={row.missedDays} />,
    },
    {
      id: "step",
      header: "Where it stands",
      sortValue: (row) => waitingStep(row).label,
      cell: (row) => {
        const step = waitingStep(row);
        return (
          <div className="flex min-w-0 flex-col items-start gap-1">
            <StatusChip tone={step.tone} label={step.label} icon={step.icon} />
            <span className="text-caption text-text-secondary block max-w-[34ch] whitespace-normal">
              {step.next}
            </span>
          </div>
        );
      },
    },
    {
      id: "ready",
      header: "Ready since",
      sortValue: (row) => row.readyAt ?? "",
      cell: (row) =>
        row.readyAt ? (
          <span className="flex flex-col">
            <span className="text-body text-text-primary">
              {formatDateTime(row.readyAt)}
            </span>
            <span className="text-caption text-text-muted">
              {waitingFor(row.readyAt)}
            </span>
          </span>
        ) : (
          <span className="text-text-muted">Not recorded</span>
        ),
    },
  ];

  const logColumns: DataTableColumn<HubHandout>[] = [
    {
      id: "at",
      header: "Handed out",
      primary: true,
      alwaysVisible: true,
      sortValue: (row) => row.at,
      cell: (row) => <span style={medium}>{formatDateTime(row.at)}</span>,
    },
    {
      id: "staff",
      header: "Staff member",
      sortValue: (row) => row.staffName,
      cell: (row) => row.staffName,
    },
    {
      id: "order",
      header: "Order",
      sortValue: (row) => title(row.orderId) ?? row.orderId,
      cell: (row) => (
        <OrderCell
          title={title(row.orderId)}
          orderId={row.orderId}
          href={orderHref(row.orderId)}
        />
      ),
    },
  ];

  const mismatchColumns: DataTableColumn<HubCodeMismatch>[] = [
    {
      id: "order",
      header: "Order",
      primary: true,
      alwaysVisible: true,
      sortValue: (row) => title(row.orderId) ?? row.orderId,
      cell: (row) => (
        <OrderCell
          title={title(row.orderId)}
          orderId={row.orderId}
          href={orderHref(row.orderId)}
        />
      ),
    },
    {
      id: "reported",
      header: "Reported",
      sortValue: (row) => row.escalation.at,
      cell: (row) => formatDateTime(row.escalation.at),
    },
    {
      id: "reason",
      header: "What they said",
      sortValue: (row) => row.escalation.reason,
      cell: (row) => (
        <span className="whitespace-pre-line break-words">{row.escalation.reason}</span>
      ),
    },
    {
      id: "state",
      header: "Kind",
      sortValue: (row) => (row.readyAt ? "hub" : "delivery"),
      cell: (row) => (row.readyAt ? "Hub pick-up" : "Delivery"),
    },
  ];

  const hours = scheduleLines(data.hub?.schedule);

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-prose">
          <p className="text-body text-text-secondary m-0">
            Pick-up orders wait here until the client shows their QR and matching code to
            hub staff. On the {ordinal(OPERATIONS_AFTER_MISSED_DAYS)} missed hub day an
            order comes to Operations. Nothing is ever forfeited automatically.
          </p>
          {data.hub ? (
            <p className="text-caption text-text-muted m-0 mt-1">
              {data.hub.name}
              {hours.length ? `, open ${hours.join("; ")}` : ", hours not set"}
            </p>
          ) : null}
        </div>
        <Button variant="secondary" disabled={loading} onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="waiting">
            Waiting ({waiting.length}
            {forOperations ? `, ${forOperations} for Operations` : ""})
          </TabsTrigger>
          <TabsTrigger value="handovers">Handovers ({handedOut})</TabsTrigger>
          <TabsTrigger value="mismatches">
            Code mismatches ({data.mismatches.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="waiting" className="mt-4">
          <DataTable
            caption="Pick-up orders waiting at the hub"
            columns={waitingColumns}
            data={waiting}
            getRowId={(row) => row.orderId}
            itemLabel="orders"
            rowActions={(row) => (
              <DataTableRowAction
                label="Open order"
                icon={ExternalLink}
                href={orderHref(row.orderId)}
              />
            )}
            empty={
              <EmptyState
                title="Nothing is waiting at the hub"
                body="Ready pick-up orders show here until the client collects them. Missed hub days and redelivery requests show on each row."
              />
            }
          />
        </TabsContent>

        <TabsContent value="handovers" className="mt-4 flex flex-col gap-3">
          {totals.length ? (
            <section aria-labelledby="staff-totals" className="flex flex-col gap-2">
              <h2
                id="staff-totals"
                className="text-body text-text-primary m-0"
                style={medium}
              >
                Handovers by staff member
              </h2>
              <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2 lg:grid-cols-4">
                {totals.map((row) => (
                  <li
                    key={row.staffId}
                    className="gg-card flex items-baseline justify-between gap-3 p-3"
                  >
                    <span className="text-body text-text-primary min-w-0 truncate">
                      {row.name}
                    </span>
                    <span className="text-h3 text-text-primary tabular-nums">
                      {row.count}
                    </span>
                  </li>
                ))}
              </ul>
              {tree === "admin" ? (
                <p className="text-caption text-text-muted m-0">
                  Invite, reassign or suspend staff on{" "}
                  <Link href="/admin/staff" className="underline underline-offset-2">
                    Staff
                  </Link>
                  .
                </p>
              ) : null}
            </section>
          ) : null}
          <DataTable
            caption="Hub handovers, newest first"
            columns={logColumns}
            data={handouts}
            getRowId={(row) => row.id}
            itemLabel="handovers"
            defaultSortId="at"
            defaultSortDirection="desc"
            pageSize={25}
            empty={
              <EmptyState
                title="No handovers yet"
                body="Each order hub staff hand out after a matching QR and code is logged here under their name."
              />
            }
          />
          {cursor ? (
            <div className="flex flex-col items-start gap-1">
              <Button
                variant="secondary"
                disabled={loadingOlder}
                onClick={() => void loadOlder()}
              >
                {loadingOlder ? "Loading…" : "Load older handovers"}
              </Button>
              {olderError ? (
                <p className="text-body text-error m-0" role="alert">
                  {olderError}
                </p>
              ) : null}
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="mismatches" className="mt-4 flex flex-col gap-3">
          <p className="text-body text-text-secondary m-0 max-w-prose">
            A QR and code that did not match. The order was not handed over; whoever
            reported it is waiting on Operations. Open the order to follow up.
          </p>
          <DataTable
            caption="Handover code mismatches"
            columns={mismatchColumns}
            data={data.mismatches}
            getRowId={(row) => row.orderId}
            itemLabel="reports"
            defaultSortId="reported"
            defaultSortDirection="desc"
            rowActions={(row) => (
              <DataTableRowAction
                label="Open order"
                icon={ExternalLink}
                href={orderHref(row.orderId)}
              />
            )}
            empty={
              <EmptyState
                title="No code mismatches"
                body="When a rider, client or hub staff member reports codes that do not match, it shows here."
              />
            }
          />
        </TabsContent>
      </Tabs>

      {data.sop.length ? (
        <details className="gg-card p-3">
          <summary className="text-body text-text-primary cursor-pointer" style={medium}>
            What hub staff follow
          </summary>
          <ul className="text-body text-text-secondary m-0 mt-2 flex list-disc flex-col gap-1 pl-5">
            {data.sop.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function OrderCell({
  title,
  orderId,
  href,
}: {
  title: string | null;
  orderId: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex min-w-0 flex-col underline-offset-2 hover:underline"
    >
      <span className="text-body text-text-primary truncate" style={medium}>
        {title ?? orderId}
      </span>
      {title ? <span className="text-caption text-text-muted">{orderId}</span> : null}
    </Link>
  );
}

/**
 * Three pips, one per hub day before Operations takes over: filled for each
 * day missed, the third in the error colour. Past three, the count is written.
 */
export function MissedDays({ count }: { count: number }) {
  const pips = Array.from(
    { length: OPERATIONS_AFTER_MISSED_DAYS },
    (_, index) => index < count,
  );
  const over =
    count > OPERATIONS_AFTER_MISSED_DAYS ? count - OPERATIONS_AFTER_MISSED_DAYS : 0;
  return (
    <span className="inline-flex items-center gap-2" aria-label={missedDaysLabel(count)}>
      <span className="inline-flex gap-1" aria-hidden>
        {pips.map((missed, index) => (
          <span
            key={index}
            className={
              missed
                ? index === OPERATIONS_AFTER_MISSED_DAYS - 1
                  ? "size-3 rounded-full bg-error"
                  : "size-3 rounded-full bg-foreground"
                : "size-3 rounded-full border-2 border-outline"
            }
          />
        ))}
      </span>
      <span className="text-caption text-text-secondary tabular-nums" aria-hidden>
        {count}
        {over ? ` (${over} past the limit)` : ""}
      </span>
    </span>
  );
}

function ordinal(n: number): string {
  return n === 1 ? "first" : n === 2 ? "second" : n === 3 ? "third" : `${n}th`;
}
