"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/Button";
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
        setError(`Could not load the QA queue (${err.code}). Retry when the API responds.`);
      } else {
        setError("Network error loading orders. Confirm the demo API is running.");
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-body text-text-secondary m-0">
          {showAll
            ? `All orders (${queue.length})`
            : `Awaiting Operations action (${queue.length})`}
          . Queue membership is based on order state.
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
        <>
          <div className="hidden md:block gg-card-flush overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead>
                <tr className="border-b border-outline bg-surface-variant">
                  <th className="text-caption text-text-muted px-4 py-3 font-normal">
                    Order
                  </th>
                  <th className="text-caption text-text-muted px-4 py-3 font-normal">
                    Status
                  </th>
                  <th className="text-caption text-text-muted px-4 py-3 font-normal">
                    Zone
                  </th>
                  <th className="text-caption text-text-muted px-4 py-3 font-normal">
                    Updated
                  </th>
                  <th className="text-caption text-text-muted px-4 py-3 font-normal">
                    Next Operations step
                  </th>
                  <th className="px-4 py-3">
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {queue.map((order) => {
                  const status = presentOrderState(order.state);
                  const next = primaryOpsAction(order.state);
                  return (
                    <tr
                      key={order.id}
                      className="border-b border-outline-subtle last:border-0"
                    >
                      <td className="px-4 py-3 align-top">
                        <p className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-medium)" }}>
                          {order.title}
                        </p>
                        <p className="text-caption text-text-muted m-0 mt-0.5">
                          {order.id}
                        </p>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <StatusChip
                          tone={status.tone}
                          label={status.label}
                          icon={status.icon}
                        />
                      </td>
                      <td className="text-body text-text-secondary px-4 py-3 align-top">
                        {order.zone}
                      </td>
                      <td className="text-body text-text-secondary px-4 py-3 align-top whitespace-nowrap">
                        {formatDateTime(order.updatedAt)}
                      </td>
                      <td className="text-body text-text-secondary px-4 py-3 align-top">
                        {next ? next.label : "No Operations action"}
                      </td>
                      <td className="px-4 py-3 align-top text-right">
                        <Link
                          href={`/ops/qa/${order.id}`}
                          className="gg-btn gg-btn-secondary inline-flex"
                        >
                          Open
                          <ChevronRight size={16} aria-hidden />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <ul className="m-0 flex list-none flex-col gap-3 p-0 md:hidden">
            {queue.map((order) => {
              const status = presentOrderState(order.state);
              const next = primaryOpsAction(order.state);
              return (
                <li key={order.id}>
                  <Link
                    href={`/ops/qa/${order.id}`}
                    className="gg-card flex flex-col gap-3 no-underline hover:bg-overlay-hover"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-medium)" }}>
                          {order.title}
                        </p>
                        <p className="text-caption text-text-muted m-0 mt-0.5">
                          {order.id}
                        </p>
                      </div>
                      <ChevronRight size={18} className="text-text-muted shrink-0" aria-hidden />
                    </div>
                    <StatusChip
                      tone={status.tone}
                      label={status.label}
                      icon={status.icon}
                    />
                    <dl className="m-0 grid grid-cols-2 gap-2">
                      <div>
                        <dt className="text-caption text-text-muted">Zone</dt>
                        <dd className="text-body text-text-primary m-0">
                          {order.zone}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-caption text-text-muted">Updated</dt>
                        <dd className="text-body text-text-primary m-0">
                          {formatDateTime(order.updatedAt)}
                        </dd>
                      </div>
                      <div className="col-span-2">
                        <dt className="text-caption text-text-muted">
                          Next Operations step
                        </dt>
                        <dd className="text-body text-text-secondary m-0">
                          {next ? next.label : "No Operations action"}
                        </dd>
                      </div>
                    </dl>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
