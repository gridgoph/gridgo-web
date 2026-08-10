"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { opsErrorMessage } from "@/app/ops/_lib/errors";
import {
  formatWait,
  ordersAwaitingClientPayment,
  paymentsAwaitingReview,
  type PaymentReviewRow,
} from "@/app/ops/_lib/payments";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { StatusChip } from "@/components/ui/StatusChip";
import { listOrders } from "@/lib/api/client";
import type { Order } from "@/lib/api/types";
import { formatDateTime, formatPhp } from "@/lib/format";
import { presentInstallment, presentOrderState } from "@/lib/order-state";

export default function OpsPaymentsPage() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setOrders(await listOrders());
    } catch (err) {
      setOrders(null);
      setError(
        opsErrorMessage(
          err,
          "Could not load payments. Confirm the demo API is running, then retry.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const queue = useMemo(
    () => (orders ? paymentsAwaitingReview(orders) : []),
    [orders],
  );
  const awaitingClient = useMemo(
    () => (orders ? ordersAwaitingClientPayment(orders) : []),
    [orders],
  );

  const columns = useMemo<DataTableColumn<PaymentReviewRow>[]>(
    () => [
      {
        id: "order",
        header: "Order",
        primary: true,
        sortValue: (row) => row.order.title,
        filterValue: (row) =>
          `${row.order.title} ${row.order.id} ${row.payment.reference ?? ""}`,
        cell: (row) => (
          <div className="min-w-0">
            <p
              className="text-body text-text-primary m-0"
              style={{ fontFamily: "var(--font-medium)" }}
            >
              {row.order.title}
            </p>
            <p className="text-caption text-text-muted m-0 mt-0.5">
              {presentInstallment(row.installment)}
            </p>
          </div>
        ),
      },
      {
        id: "amount",
        header: "Expected",
        sortValue: (row) => row.expectedMinor,
        cell: (row) => (
          <span
            className="text-body text-text-primary tabular-nums whitespace-nowrap"
            style={{ fontFamily: "var(--font-bold)" }}
          >
            {formatPhp(row.expectedMinor)}
          </span>
        ),
      },
      {
        id: "reference",
        header: "Client reference",
        sortValue: (row) => row.payment.reference ?? "",
        filterValue: (row) => row.payment.reference ?? "",
        cell: (row) => (
          <span className="text-body text-text-primary font-mono break-all">
            {row.payment.reference ?? "None given"}
          </span>
        ),
      },
      {
        id: "waiting",
        header: "Waiting",
        sortValue: (row) => -row.waitingMinutes,
        cell: (row) => (
          <div className="min-w-0">
            <span className="text-body text-text-secondary whitespace-nowrap">
              {formatWait(row.waitingMinutes)}
            </span>
            <span className="text-caption text-text-muted block whitespace-nowrap">
              {formatDateTime(row.submittedAt)}
            </span>
          </div>
        ),
      },
      {
        id: "state",
        header: "Order",
        sortValue: (row) => presentOrderState(row.order.state).label,
        cell: (row) => {
          const status = presentOrderState(row.order.state);
          return (
            <StatusChip
              tone={status.tone}
              label={status.label}
              icon={status.icon}
            />
          );
        },
      },
    ],
    [],
  );

  if (loading && !orders) {
    return <LoadingBlock label="Loading payments…" />;
  }
  if (error || !orders) {
    return (
      <ErrorState
        body={error ?? "No data."}
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
          Clients pay by QR transfer, and nothing moves until Operations
          confirms the money arrived. Check the reference against the GRIDGO
          wallet, then confirm it or send it back with a reason.
        </p>
        <Button variant="secondary" onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      {!queue.length ? (
        <EmptyState
          title="No payments waiting"
          body={
            awaitingClient.length
              ? `Nothing to confirm right now. ${awaitingClient.length} order${
                  awaitingClient.length === 1 ? " is" : "s are"
                } waiting on the client to send a transfer — they appear here the moment a reference lands.`
              : "Nothing to confirm right now. Submitted transfers appear here as soon as a client sends a reference."
          }
          action={
            <Button variant="secondary" onClick={() => void load()}>
              Refresh
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={queue}
          getRowId={(row) => `${row.order.id}:${row.installment}`}
          caption="Payments waiting for confirmation"
          filterPlaceholder="Filter by order or reference…"
          itemLabel="payments"
          rowActions={(row) => (
            <Button
              variant="secondary"
              nativeButton={false}
              render={
                <Link
                  href={`/ops/payments/${row.order.id}?installment=${row.installment}`}
                />
              }
            >
              Review
              <ChevronRight data-icon="inline-end" aria-hidden />
            </Button>
          )}
        />
      )}

      {awaitingClient.length ? (
        <section className="gg-card" aria-labelledby="awaiting-client-heading">
          <h2
            id="awaiting-client-heading"
            className="text-h3 text-text-primary m-0"
          >
            Waiting on the client
          </h2>
          <p className="text-body text-text-secondary m-0 mt-1 mb-3 max-w-prose">
            These clients have been told the final price and have not sent a
            transfer yet. There is nothing for Operations to confirm until they
            do.
          </p>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {awaitingClient.map((order) => {
              const status = presentOrderState(order.state);
              return (
                <li
                  key={order.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-outline-subtle px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-body text-text-primary m-0">
                      {order.title}
                    </p>
                    <p className="text-caption text-text-muted m-0 mt-0.5">
                      Told the price {formatDateTime(order.assignmentNotifiedAt)}
                    </p>
                  </div>
                  <StatusChip
                    tone={status.tone}
                    label={status.label}
                    icon={status.icon}
                  />
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
