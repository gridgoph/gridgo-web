"use client";

/**
 * Dropouts & delays: every time a shop could not take, keep, or meet an
 * order, for Operations and Super Admin (one component, links stay in the
 * tree it is mounted in).
 *
 * The top of the page is the only part that asks anything of the reader: the
 * cases that wait on Operations, oldest first. A recovery is there when the
 * shop had already been paid a share, so GRIDGO did not offer a replacement on
 * its own; a deadline request is there when a deduction or a paid share means
 * the client's answer cannot be applied by itself. Below it, the two records
 * the shop's history is read from: dropouts (no answer in time, declined,
 * cancelled, each with its stage and reason) and deadline requests.
 *
 * Contracts: gridgo-api SHOP_RECOVERY_API.md and ORDER_RESCHEDULE_API.md.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, NotebookPen } from "lucide-react";

import { opsErrorMessage } from "@/app/ops/_lib/errors";
import { ResolveDeadlineDialog } from "@/components/orders/ShopChanges";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  DataTableRowAction,
  type DataTableColumn,
  type DataTableFacet,
} from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonLines } from "@/components/ui/loading";
import { StatusChip } from "@/components/ui/StatusChip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getUser,
  isApiError,
  listOrders,
  listRescheduleRequests,
  listShopFailures,
} from "@/lib/api/client";
import type { Order, RescheduleRequest, ShopFailureEvent } from "@/lib/api/types";
import { formatDateTime, formatPhp } from "@/lib/format";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { useSerializedLoad } from "@/lib/live/useSerializedLoad";
import {
  RECOVERY_OPERATIONS_SHORT,
  buildNeedsOperations,
  canResolveReschedule,
  presentFailureKind,
  presentFailureStage,
  presentRecoveryStatus,
  presentRescheduleStatus,
  rescheduleOperationsReason,
  type NeedsOperationsItem,
} from "@/lib/shop-changes";

type Tree = "ops" | "admin";

const medium = { fontFamily: "var(--font-medium)" } as const;

type Data = {
  events: ShopFailureEvent[];
  /** `null` when the API does not offer deadline requests yet. */
  requests: RescheduleRequest[] | null;
  orders: Map<string, Order>;
};

export function ShopChangesDesk({ tree }: { tree: Tree }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [names, setNames] = useState<Record<string, string>>({});
  const [resolving, setResolving] = useState<RescheduleRequest | null>(null);
  const [tab, setTab] = useState("dropouts");

  const orderHref = useCallback(
    (orderId: string) => `/${tree}/orders/${encodeURIComponent(orderId)}`,
    [tree],
  );

  const load = useSerializedLoad(
    useCallback(async () => {
      setLoading(true);
      setError(null);
      try {
        const [events, requests, orders] = await Promise.all([
          listShopFailures(),
          listRescheduleRequests().then(
            (queue) => queue.requests,
            (err) => {
              // An API without deadline requests answers 404; say so on the tab.
              if (isApiError(err) && err.status === 404) return null;
              throw err;
            },
          ),
          // Titles only; a failed read leaves the order ids showing.
          listOrders().catch(() => [] as Order[]),
        ]);
        setData({ events, requests, orders: new Map(orders.map((o) => [o.id, o])) });
      } catch (err) {
        setError(opsErrorMessage(err, "Shop dropouts and deadline requests could not be loaded."));
      } finally {
        setLoading(false);
      }
    }, []),
  );

  useLiveReload(["orders", "jobs"], load);
  useEffect(() => {
    void load();
  }, [load]);

  // Shop names, read once per shop. A missing name reads "Shop", never an id.
  const shopIds = useMemo(() => {
    const ids = new Set<string>();
    for (const event of data?.events ?? []) if (event.supplierId) ids.add(event.supplierId);
    for (const request of data?.requests ?? []) if (request.supplierId) ids.add(request.supplierId);
    return [...ids].sort().join(",");
  }, [data]);
  useEffect(() => {
    const missing = shopIds.split(",").filter((id) => id && !(id in names));
    if (!missing.length) return;
    let cancelled = false;
    void Promise.all(
      missing.map((id) =>
        getUser(id).then(
          (user) => [id, user.supplierName || user.name] as const,
          () => [id, ""] as const,
        ),
      ),
    ).then((found) => {
      if (!cancelled) setNames((current) => ({ ...current, ...Object.fromEntries(found) }));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopIds]);

  const shop = useCallback((id: string | null | undefined) => (id && names[id]) || "Shop", [names]);
  const title = useCallback(
    (orderId: string) => data?.orders.get(orderId)?.title || `Order ${orderId}`,
    [data],
  );

  const needs = useMemo(
    () => (data ? buildNeedsOperations(data.events, data.requests ?? []) : []),
    [data],
  );
  const events = useMemo(
    () => [...(data?.events ?? [])].sort((a, b) => (b.at || "").localeCompare(a.at || "")),
    [data],
  );

  const needsColumns = useMemo<DataTableColumn<NeedsOperationsItem>[]>(
    () => [
      {
        id: "order",
        header: "Order",
        primary: true,
        alwaysVisible: true,
        sortValue: (item) => title(item.orderId),
        cell: (item) => (
          <div className="min-w-0">
            <p className="text-body text-text-primary m-0 truncate" style={medium}>
              {title(item.orderId)}
            </p>
            <p className="text-caption text-text-muted m-0 mt-0.5 truncate">
              {shop(item.supplierId)}
            </p>
          </div>
        ),
      },
      {
        id: "what",
        header: "What happened",
        sortValue: (item) => (item.kind === "recovery" ? "Shop dropped out" : "Deadline request"),
        cell: (item) =>
          item.kind === "recovery" ? (
            <div className="flex flex-col gap-0.5">
              <span className="text-body text-text-primary">
                {presentFailureKind(item.event.kind)} ({presentFailureStage(item.event.stage).toLowerCase()})
              </span>
              <span className="text-caption text-text-muted block min-w-64 max-w-md whitespace-normal">
                {RECOVERY_OPERATIONS_SHORT}
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              <span className="text-body text-text-primary">
                Deadline request {item.request.status === "declined" ? "declined" : "accepted"} by
                the client
              </span>
              <span className="text-caption text-text-muted block min-w-64 max-w-md whitespace-normal">
                {rescheduleOperationsReason(item.request, formatPhp)}
              </span>
            </div>
          ),
      },
      {
        id: "since",
        header: "Waiting since",
        sortValue: (item) => item.since,
        cell: (item) => (
          <span className="text-body text-text-secondary whitespace-nowrap">
            {formatDateTime(item.since)}
          </span>
        ),
      },
    ],
    [shop, title],
  );

  const eventColumns = useMemo<DataTableColumn<ShopFailureEvent>[]>(
    () => [
      {
        id: "order",
        header: "Order",
        primary: true,
        alwaysVisible: true,
        sortValue: (event) => title(event.orderId),
        filterValue: (event) =>
          `${title(event.orderId)} ${event.orderId} ${shop(event.supplierId)} ${event.reason}`,
        cell: (event) => (
          <div className="min-w-0">
            <p className="text-body text-text-primary m-0 truncate" style={medium}>
              {title(event.orderId)}
            </p>
            <p className="text-caption text-text-muted m-0 mt-0.5 truncate">Order {event.orderId}</p>
          </div>
        ),
      },
      {
        id: "shop",
        header: "Shop",
        sortValue: (event) => shop(event.supplierId),
        cell: (event) => (
          <span className="text-body text-text-secondary">{shop(event.supplierId)}</span>
        ),
      },
      {
        id: "kind",
        header: "What happened",
        sortValue: (event) => presentFailureKind(event.kind),
        cell: (event) => (
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-body text-text-primary">{presentFailureKind(event.kind)}</span>
            {event.reason ? (
              <span className="text-caption text-text-muted line-clamp-2 block min-w-48 max-w-xs whitespace-normal">
                &ldquo;{event.reason}&rdquo;
              </span>
            ) : null}
          </div>
        ),
      },
      {
        id: "stage",
        header: "At",
        sortValue: (event) => presentFailureStage(event.stage),
        cell: (event) => (
          <span className="text-body text-text-secondary">{presentFailureStage(event.stage)}</span>
        ),
      },
      {
        id: "outcome",
        header: "Now",
        sortValue: (event) => (event.recovery ? presentRecoveryStatus(event.recovery).label : "—"),
        cell: (event) => {
          if (!event.recovery) return <span className="text-body text-text-muted">—</span>;
          const status = presentRecoveryStatus(event.recovery);
          return <StatusChip tone={status.tone} icon={status.icon} label={status.label} />;
        },
      },
      {
        id: "at",
        header: "When",
        sortValue: (event) => event.at,
        cell: (event) => (
          <span className="text-body text-text-secondary whitespace-nowrap">
            {formatDateTime(event.at)}
          </span>
        ),
      },
    ],
    [shop, title],
  );

  const requestColumns = useMemo<DataTableColumn<RescheduleRequest>[]>(
    () => [
      {
        id: "order",
        header: "Order",
        primary: true,
        alwaysVisible: true,
        sortValue: (request) => title(request.orderId),
        filterValue: (request) =>
          `${title(request.orderId)} ${request.orderId} ${shop(request.supplierId)} ${request.reason}`,
        cell: (request) => (
          <div className="min-w-0">
            <p className="text-body text-text-primary m-0 truncate" style={medium}>
              {title(request.orderId)}
            </p>
            <p className="text-caption text-text-muted m-0 mt-0.5 line-clamp-2 min-w-48 max-w-xs whitespace-normal">
              &ldquo;{request.reason}&rdquo;
            </p>
          </div>
        ),
      },
      {
        id: "shop",
        header: "Shop",
        sortValue: (request) => shop(request.supplierId),
        cell: (request) => (
          <span className="text-body text-text-secondary">{shop(request.supplierId)}</span>
        ),
      },
      {
        id: "dates",
        header: "Ready-by",
        sortValue: (request) => request.proposedReadyBy ?? "",
        cell: (request) => (
          <span className="text-body text-text-secondary">
            {formatDateTime(request.originalReadyBy)}{" "}
            <span className="text-text-muted">to</span>{" "}
            <span className="text-text-primary">{formatDateTime(request.proposedReadyBy)}</span>
          </span>
        ),
      },
      {
        id: "outcome",
        header: "Outcome",
        sortValue: (request) => presentRescheduleStatus(request).label,
        cell: (request) => {
          const status = presentRescheduleStatus(request);
          return <StatusChip tone={status.tone} icon={status.icon} label={status.label} />;
        },
      },
      {
        id: "requested",
        header: "Asked",
        sortValue: (request) => request.requestedAt,
        cell: (request) => (
          <span className="text-body text-text-secondary whitespace-nowrap">
            {formatDateTime(request.requestedAt)}
          </span>
        ),
      },
    ],
    [shop, title],
  );

  const eventFacets = useMemo<DataTableFacet[]>(() => {
    const kinds = [...new Set(events.map((event) => presentFailureKind(event.kind)))];
    const shops = [...new Set(events.map((event) => shop(event.supplierId)))].sort();
    return [
      { columnId: "kind", title: "What happened", options: kinds.map((v) => ({ value: v, label: v })) },
      { columnId: "shop", title: "Shop", options: shops.map((v) => ({ value: v, label: v })) },
    ];
  }, [events, shop]);

  const requestFacets = useMemo<DataTableFacet[]>(() => {
    const outcomes = [
      ...new Set((data?.requests ?? []).map((request) => presentRescheduleStatus(request).label)),
    ];
    const shops = [...new Set((data?.requests ?? []).map((request) => shop(request.supplierId)))].sort();
    return [
      { columnId: "outcome", title: "Outcome", options: outcomes.map((v) => ({ value: v, label: v })) },
      { columnId: "shop", title: "Shop", options: shops.map((v) => ({ value: v, label: v })) },
    ];
  }, [data, shop]);

  if (loading && !data) return <SkeletonLines lines={6} />;
  if (error && !data) {
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-body text-text-secondary m-0 max-w-prose">
          Every time a shop did not answer within its hour, declined, cancelled before pickup,
          or asked for a later date. GRIDGO offers the client a replacement or a refund on its
          own. Needs Operations holds the cases it cannot settle without you.
        </p>
        <Button variant="secondary" disabled={loading} onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      <section aria-labelledby="needs-operations-heading" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="needs-operations-heading" className="text-h3 text-text-primary m-0">
            Needs Operations
          </h2>
          {needs.length ? (
            <StatusChip tone="warning" icon="triangle-alert" label={`${needs.length} waiting on you`} />
          ) : null}
        </div>
        {needs.length === 0 ? (
          <p className="gg-card p-3 text-body text-text-secondary m-0" data-testid="needs-operations-empty">
            Nothing is waiting on you. A case lands here when a shop that was already paid a share
            drops out, or a deadline request cannot be applied on its own.
          </p>
        ) : (
          <DataTable
            columns={needsColumns}
            data={needs}
            getRowId={(item) => item.key}
            caption="Cases that need Operations, oldest first"
            itemLabel="cases"
            rowActions={(item) => (
              <>
                {item.kind === "reschedule" && canResolveReschedule(item.request) ? (
                  <DataTableRowAction
                    label="Record a resolution"
                    icon={NotebookPen}
                    onClick={() => setResolving(item.request)}
                  />
                ) : null}
                <DataTableRowAction label="Open order" icon={Eye} href={orderHref(item.orderId)} />
              </>
            )}
          />
        )}
      </section>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="dropouts">Shop dropouts ({events.length})</TabsTrigger>
          <TabsTrigger value="deadlines">
            Deadline requests{data?.requests ? ` (${data.requests.length})` : ""}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dropouts" className="mt-4">
          {events.length === 0 ? (
            <EmptyState
              title="No shop has dropped out"
              body="A timeout, decline or cancellation shows here with the stage it happened at and the shop's reason."
            />
          ) : (
            <DataTable
              columns={eventColumns}
              data={events}
              getRowId={(event) => event.id}
              caption="Shop dropouts, newest first"
              filterPlaceholder="Search orders, shops or reasons"
              facets={eventFacets}
              itemLabel="dropouts"
              pageSize={20}
              rowActions={(event) => (
                <DataTableRowAction label="Open order" icon={Eye} href={orderHref(event.orderId)} />
              )}
            />
          )}
        </TabsContent>

        <TabsContent value="deadlines" className="mt-4">
          {data?.requests === null ? (
            <p className="gg-card p-3 text-body text-text-secondary m-0" data-testid="deadlines-unavailable">
              The API behind this portal does not take deadline requests from shops yet. They
              show here once it does.
            </p>
          ) : !data?.requests?.length ? (
            <EmptyState
              title="No deadline requests"
              body="A shop can ask once per order for a later ready-by date. The request and the client's answer show here."
            />
          ) : (
            <DataTable
              columns={requestColumns}
              data={data.requests}
              getRowId={(request) => request.id}
              caption="Deadline requests, newest first"
              filterPlaceholder="Search orders, shops or reasons"
              facets={requestFacets}
              itemLabel="requests"
              pageSize={20}
              rowActions={(request) => (
                <DataTableRowAction
                  label="Open order"
                  icon={Eye}
                  href={orderHref(request.orderId)}
                />
              )}
            />
          )}
        </TabsContent>
      </Tabs>

      <ResolveDeadlineDialog
        open={resolving !== null}
        orderId={resolving?.orderId ?? ""}
        request={resolving ?? { id: "" }}
        onCancel={() => setResolving(null)}
        onResolved={async () => {
          setResolving(null);
          await load();
        }}
      />
    </div>
  );
}
