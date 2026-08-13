"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye } from "lucide-react";

import { presentZone } from "@/app/ops/_lib/present";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  DataTableRowAction,
  type DataTableColumn,
} from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { StatusChip } from "@/components/ui/StatusChip";
import { ApiError, listOrders } from "@/lib/api/client";
import type { Order } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import { isOpsQueueState, primaryOpsAction } from "@/lib/ops-actions";
import { presentOrderState } from "@/lib/order-state";

export default function OpsQaQueuePage() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listOrders();
      setOrders(data);
    } catch (err) {
      setOrders(null);
      if (err instanceof ApiError) {
        setError(
          `Could not load the QA queue (${err.code}). Retry when the API responds.`,
        );
      } else {
        setError(
          "Network error loading orders. Confirm the demo API is running.",
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const queue = useMemo(() => {
    if (!orders) return [];
    const filtered = showAll
      ? orders
      : orders.filter((o) => isOpsQueueState(o.state));
    return [...filtered].sort((a, b) => {
      const aAct = primaryOpsAction(a.state) ? 0 : 1;
      const bAct = primaryOpsAction(b.state) ? 0 : 1;
      if (aAct !== bAct) return aAct - bAct;
      return (a.updatedAt || "").localeCompare(b.updatedAt || "");
    });
  }, [orders, showAll]);

  const columns = useMemo<DataTableColumn<Order>[]>(
    () => [
      {
        id: "order",
        header: "Order",
        primary: true,
        sortValue: (order) => order.title,
        filterValue: (order) => `${order.title} ${order.id}`,
        cell: (order) => (
          <div>
            <p
              className="text-body text-text-primary m-0"
              style={{ fontFamily: "var(--font-medium)" }}
            >
              {order.title}
            </p>
            <p className="text-caption text-text-muted m-0 mt-0.5">{order.id}</p>
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        sortValue: (order) => presentOrderState(order.state).label,
        filterValue: (order) => presentOrderState(order.state).label,
        cell: (order) => {
          const status = presentOrderState(order.state);
          return (
            <StatusChip
              tone={status.tone}
              label={status.label}
              icon={status.icon}
            />
          );
        },
      },
      {
        id: "zone",
        header: "Zone",
        sortValue: (order) => presentZone(order.zone),
        filterValue: (order) => `${presentZone(order.zone)} ${order.zone}`,
        cell: (order) => (
          <span className="text-body text-text-secondary">{presentZone(order.zone)}</span>
        ),
      },
      {
        id: "updated",
        header: "Updated",
        sortValue: (order) => order.updatedAt || "",
        cell: (order) => (
          <span className="text-body text-text-secondary whitespace-nowrap">
            {formatDateTime(order.updatedAt)}
          </span>
        ),
      },
      {
        id: "next",
        header: "Next Operations step",
        sortValue: (order) => primaryOpsAction(order.state)?.label ?? "",
        filterValue: (order) => primaryOpsAction(order.state)?.label ?? "",
        cell: (order) => {
          const next = primaryOpsAction(order.state);
          return (
            <span className="text-body text-text-secondary">
              {next ? next.label : "No Operations action"}
            </span>
          );
        },
      },
    ],
    [],
  );

  if (loading && !orders) return <LoadingBlock label="Loading QA queue…" />;
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

  const statusFacet = {
    columnId: "status",
    title: "Status",
    options: [...new Set(queue.map((o) => presentOrderState(o.state).label))]
      .sort((a, b) => a.localeCompare(b))
      .map((label) => ({ value: label, label })),
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-body text-text-secondary m-0">
          {showAll
            ? `All orders (${queue.length})`
            : `Awaiting Operations action (${queue.length})`}
          .{" "}
          {showAll
            ? "Everything on the book, newest activity first."
            : "These are the orders that stop moving until Operations decides."}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            aria-pressed={showAll}
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll ? "Show action queue" : "Show all orders"}
          </Button>
          <Button variant="secondary" onClick={() => void load()}>
            Refresh
          </Button>
        </div>
      </div>

      {!queue.length ? (
        <EmptyState
          title={showAll ? "No orders yet" : "Queue is clear"}
          body={
            showAll
              ? "Orders appear here once clients submit print requests."
              : "No orders currently need Operations. Toggle “Show all orders” to review the full book, or refresh after new submissions."
          }
          action={
            <Button variant="secondary" onClick={() => void load()}>
              Refresh queue
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={queue}
          getRowId={(order) => order.id}
          caption="QA queue"
          filterPlaceholder="Filter orders…"
          facets={statusFacet.options.length > 1 ? [statusFacet] : undefined}
          itemLabel="orders"
          rowActions={(order) => (
            <DataTableRowAction
              label="Open"
              icon={Eye}
              href={`/ops/qa/${order.id}`}
            />
          )}
        />
      )}
    </div>
  );
}
