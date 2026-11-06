"use client";

/**
 * The order queue's first view: the orders Operations can act on, each group
 * labelled and counted, oldest wait first inside the group.
 *
 * Membership is `operationsAction`. A job that is only late is not here.
 * Lateness stays on the late-production desk. The artwork group is the file
 * check, not a second list of the same orders. Finished work opens the
 * existing review.
 *
 * Confirm payment and Assign rider still send the requests the order
 * workspace and the dispatch board send.
 */

import { useMemo, useState } from "react";
import { Bike, Eye, Wallet } from "lucide-react";

import {
  OPERATIONS_ACTION_LABEL,
  OPERATIONS_ACTIONS,
  operationsAction,
  ordersForAction,
  stageOf,
  type OperationsAction,
} from "@/app/ops/_lib/pipeline";
import { AssignRiderDialog } from "@/components/orders/AssignRiderDialog";
import { ConfirmPaymentSheet } from "@/components/orders/ConfirmPaymentSheet";
import { FileCheckQueue } from "@/components/orders/FileCheckQueue";
import {
  QueueOrderCell,
  queueOrderFilterValue,
} from "@/components/orders/QueueOrderCell";
import { ExpressChip } from "@/components/ui/ExpressChip";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  DataTableRowAction,
  type DataTableColumn,
} from "@/components/ui/data-table";
import { isExpressOrder } from "@/lib/express";
import { formatPhp } from "@/lib/format";
import type { OperatingHours, Order } from "@/lib/api/types";
import { basketShopCounts } from "@/lib/baskets";
import { pinDispatchBlocker } from "@/lib/delivery-pin";
import { paymentOf } from "@/lib/payments";

type Props = {
  orders: Order[];
  hours: OperatingHours | null;
  onRefresh: () => void;
};

/** The order's own downpayment, which the sheet can decide. A pin or change payment is not one. */
function ownDownpayment(order: Order): boolean {
  return (
    stageOf(order) === "payment" &&
    paymentOf(order, "downpayment")?.status === "pending_confirmation"
  );
}

export function NeedsActionQueue({ orders, hours, onRefresh }: Props) {
  const [paying, setPaying] = useState<Order | null>(null);
  const [dispatching, setDispatching] = useState<Order | null>(null);
  const shopCounts = useMemo(() => basketShopCounts(orders), [orders]);
  const groups = useMemo(
    () =>
      Object.fromEntries(
        OPERATIONS_ACTIONS.map((action) => [action, ordersForAction(orders, action)]),
      ) as Record<OperationsAction, Order[]>,
    [orders],
  );

  const columns = useMemo<DataTableColumn<Order>[]>(
    () => [
      {
        id: "order",
        header: "Order",
        primary: true,
        filterValue: (order) => queueOrderFilterValue(order, shopCounts),
        cell: (order) => <QueueOrderCell order={order} shopCounts={shopCounts} />,
      },
      {
        id: "waiting",
        header: "Waiting on",
        filterValue: (order) => {
          const action = operationsAction(order);
          return action ? OPERATIONS_ACTION_LABEL[action] : "";
        },
        cell: (order) => {
          const action = operationsAction(order);
          return (
            <span
              className="text-body text-text-primary whitespace-nowrap"
              style={{ fontFamily: "var(--font-medium)" }}
            >
              {action ? OPERATIONS_ACTION_LABEL[action] : "—"}
            </span>
          );
        },
      },
      {
        id: "speed",
        header: "Speed",
        hideOnMobile: true,
        cell: (order) =>
          isExpressOrder(order) ? (
            <ExpressChip />
          ) : (
            <span className="text-body text-text-muted whitespace-nowrap">Standard</span>
          ),
      },
      {
        id: "value",
        header: "Value",
        hideOnMobile: true,
        cell: (order) => (
          <span className="text-body text-text-secondary tabular-nums whitespace-nowrap">
            {order.totalMinor != null ? formatPhp(order.totalMinor) : "—"}
          </span>
        ),
      },
    ],
    [shopCounts],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-body text-text-secondary m-0">
          Oldest first in each group.
        </p>
        <Button variant="secondary" onClick={onRefresh}>
          Refresh
        </Button>
      </div>

      {OPERATIONS_ACTIONS.map((action) => {
        const label = OPERATIONS_ACTION_LABEL[action];
        const rows = groups[action];
        return (
          <section key={action} aria-label={label} className="flex flex-col gap-3">
            <h2 className="text-h3 text-text-primary m-0">
              {label}{" "}
              <span className="tabular-nums">{rows.length}</span>
            </h2>
            {action === "check_artwork" ? (
              rows.length > 0 ? (
                <FileCheckQueue orders={rows} onChanged={onRefresh} hours={hours} />
              ) : null
            ) : rows.length > 0 ? (
              <DataTable
                columns={columns}
                data={rows}
                getRowId={(order) => order.id}
                caption={label}
                filterPlaceholder="Filter orders…"
                itemLabel="orders"
                rowActionsDensity="labeled"
                rowActions={(order) => (
                  <>
                    {action === "confirm_payment" && ownDownpayment(order) ? (
                      <DataTableRowAction
                        label="Confirm payment"
                        icon={Wallet}
                        onClick={() => setPaying(order)}
                      />
                    ) : null}
                    {action === "assign_rider" ? (
                      <DataTableRowAction
                        label="Assign rider"
                        icon={Bike}
                        disabled={pinDispatchBlocker(order) !== null}
                        onClick={() => setDispatching(order)}
                      />
                    ) : null}
                    <DataTableRowAction
                      label={action === "review_finished" ? "Review" : "Open"}
                      icon={Eye}
                      href={
                        action === "review_finished"
                          ? `/ops/finished-work?order=${order.id}`
                          : `/ops/orders/${order.id}`
                      }
                    />
                  </>
                )}
              />
            ) : null}
          </section>
        );
      })}

      <ConfirmPaymentSheet
        order={paying}
        onClose={() => setPaying(null)}
        onDecided={onRefresh}
      />
      <AssignRiderDialog
        order={dispatching}
        onClose={() => setDispatching(null)}
        onAssigned={onRefresh}
      />
    </div>
  );
}
