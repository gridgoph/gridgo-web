"use client";

import { useSerializedLoad } from "@/lib/live/useSerializedLoad";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye } from "lucide-react";

import {
  STAGES,
  actionableCount,
  ordersInStage,
  stageCounts,
  stageNeedsOperations,
  type Stage,
} from "@/app/ops/_lib/pipeline";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  DataTableRowAction,
  type DataTableColumn,
} from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { StatusChip } from "@/components/ui/StatusChip";
import { SkeletonLines } from "@/components/ui/loading";
import { ApiError, listOrders } from "@/lib/api/client";
import type { Order } from "@/lib/api/types";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { formatDateTime, formatPhp } from "@/lib/format";
import { presentOrderState } from "@/lib/order-state";
import { describeQuantity } from "@/lib/quantity";

/**
 * Every order, in one place, filtered by where it has got to.
 *
 * This replaces three destinations that were the same order at different
 * moments: a payments queue, a QA queue, and a matching screen. Matching is
 * gone -- GRIDGO chooses the press -- and the other two are one job.
 *
 * The stage rail carries two numbers per stage and they mean different things:
 * how many orders are sitting there, and how many are waiting on Operations.
 * Only the second one is worth walking across the room for, so only the second
 * one is emphasised.
 */
export default function OpsOrdersPage() {
  const router = useRouter();
  const params = useSearchParams();
  const requested = params.get("stage") as Stage | null;

  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [stage, setStage] = useState<Stage>(requested ?? "payment");

  const load = useSerializedLoad(
    useCallback(async () => {
      setLoading(true);
      setError(null);
      try {
        setOrders(await listOrders());
      } catch (err) {
        setOrders(null);
        setError(
          err instanceof ApiError
            ? `Could not load orders (${err.code}).`
            : "Could not reach the API. Check it is running, then retry.",
        );
      } finally {
        setLoading(false);
      }
    }, []),
  );

  useLiveReload("orders", load);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => stageCounts(orders ?? []), [orders]);
  const waiting = useMemo(
    () =>
      Object.fromEntries(
        STAGES.map((entry) => [entry.id, actionableCount(orders ?? [], entry.id)]),
      ) as Record<Stage, number>,
    [orders],
  );
  const rows = useMemo(() => {
    const inStage = ordersInStage(orders ?? [], stage);
    // Longest wait first: the order that has been sitting there most is the one
    // somebody is wondering about.
    return [...inStage].sort((a, b) =>
      (a.updatedAt || "").localeCompare(b.updatedAt || ""),
    );
  }, [orders, stage]);

  const columns = useMemo<DataTableColumn<Order>[]>(
    () => [
      {
        id: "order",
        header: "Order",
        primary: true,
        sortValue: (order) => order.title ?? "",
        filterValue: (order) =>
          `${order.title ?? ""} ${order.id} ${order.material ?? ""}`,
        cell: (order) => (
          <div className="min-w-0">
            <p
              className="text-body text-text-primary m-0 truncate"
              style={{ fontFamily: "var(--font-medium)" }}
            >
              {order.title || "Untitled order"}
            </p>
            <p className="text-caption text-text-muted m-0 mt-0.5 truncate">
              Order {order.id}
            </p>
            <p className="text-caption text-text-muted m-0 mt-0.5 truncate">
              {describeQuantity(order.quantity, order.unit)}
              {order.material ? ` · ${order.material}` : ""}
            </p>
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        sortValue: (order) => presentOrderState(order.state, order).label,
        filterValue: (order) => presentOrderState(order.state, order).label,
        cell: (order) => {
          const status = presentOrderState(order.state, order);
          return (
            <StatusChip tone={status.tone} label={status.label} icon={status.icon} />
          );
        },
      },
      {
        id: "waiting",
        header: "Waiting on",
        sortValue: (order) => (stageNeedsOperations(order) ? 0 : 1),
        cell: (order) => (
          <span
            className="text-body whitespace-nowrap"
            style={{
              color: stageNeedsOperations(order)
                ? "var(--color-text-primary)"
                : "var(--color-text-muted)",
              fontFamily: stageNeedsOperations(order) ? "var(--font-medium)" : undefined,
            }}
          >
            {stageNeedsOperations(order) ? "You" : waitingOn(order.state)}
          </span>
        ),
      },
      {
        id: "value",
        header: "Value",
        sortValue: (order) => order.totalMinor ?? -1,
        cell: (order) => (
          <span className="text-body text-text-secondary tabular-nums whitespace-nowrap">
            {order.totalMinor != null ? formatPhp(order.totalMinor) : "—"}
          </span>
        ),
      },
      {
        id: "since",
        header: "Last moved",
        sortValue: (order) => order.updatedAt ?? "",
        cell: (order) => (
          <span className="text-body text-text-secondary whitespace-nowrap">
            {formatDateTime(order.updatedAt)}
          </span>
        ),
      },
    ],
    [],
  );

  if (loading && !orders) return <SkeletonLines lines={6} />;
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

  const active = STAGES.find((entry) => entry.id === stage);

  return (
    <div className="flex flex-col gap-4">
      {/*
        The stage rail. Horizontal because the stages are a sequence and reading
        them left to right is reading the order's own journey; a vertical list
        would say these are alternatives, which they are not.
      */}
      <nav aria-label="Order stages" className="flex flex-wrap gap-2">
        {STAGES.map((entry) => {
          const selected = entry.id === stage;
          const needsYou = waiting[entry.id];
          return (
            <button
              key={entry.id}
              type="button"
              aria-pressed={selected}
              onClick={() => {
                setStage(entry.id);
                router.replace(`/ops/orders?stage=${entry.id}`, { scroll: false });
              }}
              className="gg-chip min-h-11 flex items-center gap-2 px-3"
              style={{
                background: selected ? "var(--color-accent)" : "var(--color-surface)",
                color: selected
                  ? "var(--color-accent-on)"
                  : "var(--color-text-secondary)",
                borderColor: selected ? "var(--color-accent)" : "var(--color-outline)",
              }}
            >
              <span className="text-body">{entry.label}</span>
              <span
                className="text-caption tabular-nums"
                style={{ opacity: selected ? 0.75 : 0.6 }}
              >
                {counts[entry.id]}
              </span>
              {needsYou > 0 ? (
                <span
                  className="text-caption tabular-nums rounded-pill px-1.5"
                  style={{
                    background: "var(--color-action-yellow)",
                    color: "var(--color-action-yellow-on)",
                    fontFamily: "var(--font-bold)",
                  }}
                >
                  {needsYou}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-body text-text-secondary m-0">{active?.hint}</p>
        <Button variant="secondary" onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={`Nothing at ${active?.label.toLowerCase()}`}
          body="Orders arrive here as they reach this step. Try another step, or refresh."
          action={
            <Button variant="secondary" onClick={() => void load()}>
              Refresh
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          getRowId={(order) => order.id}
          caption={`Orders at ${active?.label}`}
          filterPlaceholder="Filter orders…"
          rowActions={(order) => (
            <DataTableRowAction
              label="Open"
              icon={Eye}
              href={`/ops/orders/${order.id}`}
            />
          )}
        />
      )}
    </div>
  );
}

/** Whose move it is, when it is not Operations'. */
function waitingOn(state: string): string {
  switch (state) {
    case "client_correction":
    case "awaiting_initial_payment":
    case "awaiting_downpayment":
      return "Client";
    case "supplier_assigned":
    case "payment_authorized":
    case "production":
    case "supplier_self_qc":
      return "Shop";
    case "ready_for_dispatch":
    case "rider_assigned":
    case "picked_up":
    case "out_for_delivery":
      return "Rider";
    case "issue_window_open":
      return "The clock";
    case "approved_for_matching":
      return "No shop yet";
    default:
      return "—";
  }
}
