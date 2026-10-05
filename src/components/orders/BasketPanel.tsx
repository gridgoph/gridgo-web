"use client";

import { useState } from "react";
import Link from "next/link";
import { CircleCheck, TriangleAlert } from "lucide-react";

import { OrderMoneyLines } from "@/components/orders/OrderMoneyLines";
import { Button, buttonVariants } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/StatusChip";
import { getBasketInvoice } from "@/lib/api/client";
import type { Basket, BasketGroup, BasketInvoice } from "@/lib/api/types";
import { groupAwaitsDispatch, groupRefundState, reconcileBasket } from "@/lib/baskets";
import { formatDateTime, formatPhp } from "@/lib/format";
import { asDeduction } from "@/lib/organization-discount";
import { presentOrderState, presentPaymentStatus } from "@/lib/order-state";
import { payoutProgress } from "@/lib/payouts";
import { cn } from "@/lib/utils";

type Props = {
  basket: Basket;
  /** The group this workspace is open on. */
  orderId: string;
  /** Which tree the links stay inside. */
  tree: "ops" | "admin";
  /** Rider and shop names already looked up by the workspace. */
  names: Record<string, string>;
};

const medium = { fontFamily: "var(--font-medium)" } as const;

/**
 * A multi-shop order, whole: the one payment at the top, then every shop
 * group side by side with its own job, rider, money, payout and refund, then
 * the sum that proves the groups are the payment.
 *
 * Each group is its own order. Operations acts on a group from that group's
 * workspace (file check, payout release, a refund for that shop alone) or
 * from Dispatch; the payment is the one thing confirmed for every group at
 * once, in the Payment step.
 */
export function BasketPanel({ basket, orderId, tree, names }: Props) {
  const payment = presentPaymentStatus(basket.payment?.status);
  const reconciliation = reconcileBasket(basket);
  const receiptGroup = basket.groups.find(
    (group) => group.orderId === basket.receiptOrderId,
  );
  return (
    <section className="gg-card flex flex-col gap-3" aria-labelledby="basket-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id="basket-heading" className="text-h3 text-text-primary m-0">
            One payment, {basket.groups.length} shops
          </h2>
          <p className="text-body text-text-secondary m-0 max-w-prose">
            The client paid once for every shop below. Each shop is its own order with its
            own job, rider, payout and refund.
          </p>
        </div>
      </div>

      <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-4 gap-y-1">
        <dt className="text-caption text-text-muted">One payment</dt>
        <dd className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span
            className="text-h2 text-text-primary tabular-nums"
            data-testid="basket-total"
          >
            {formatPhp(reconciliation.paidMinor)}
          </span>
          <StatusChip tone={payment.tone} label={payment.label} icon={payment.icon} />
        </dd>
        {basket.deadline ? (
          <>
            <dt className="text-caption text-text-muted">Needed by</dt>
            <dd className="text-body text-text-secondary m-0">
              {formatDateTime(basket.deadline)}
            </dd>
          </>
        ) : null}
        <dt className="text-caption text-text-muted">Receipt</dt>
        <dd className="text-body text-text-secondary m-0">
          One combined receipt
          {receiptGroup ? `, held on ${receiptGroup.label}` : ""}
        </dd>
      </dl>

      <ol
        className="m-0 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-2 xl:grid-cols-3"
        aria-label="Shop groups"
      >
        {basket.groups.map((group) => (
          <GroupBlock
            key={group.orderId}
            group={group}
            current={group.orderId === orderId}
            tree={tree}
            names={names}
            fulfillmentMode={basket.fulfillmentMode}
          />
        ))}
      </ol>

      <Reconciliation basket={basket} />

      <CombinedReceipt basketId={basket.id} />
    </section>
  );
}

function GroupBlock({
  group,
  current,
  tree,
  names,
  fulfillmentMode,
}: {
  group: BasketGroup;
  current: boolean;
  tree: "ops" | "admin";
  names: Record<string, string>;
  fulfillmentMode: string;
}) {
  const order = group.order;
  const state = presentOrderState(order.state ?? group.state, order);
  const payout = payoutProgress(order);
  const refund = groupRefundState(order);
  const rider = order.riderId
    ? names[order.riderId] || "Assigned rider"
    : fulfillmentMode === "pickup"
      ? "None, hub pick-up"
      : "No rider yet";
  const href = `/${tree}/orders/${encodeURIComponent(group.orderId)}`;
  return (
    <li
      className={cn(
        "rounded-card flex min-w-0 flex-col gap-3 border p-3",
        current ? "border-text-primary bg-surface" : "border-outline bg-surface-variant",
      )}
      aria-current={current ? "page" : undefined}
      data-testid={`group-${group.label}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-body-lg text-text-primary m-0" style={medium}>
          {group.label}
        </h3>
        {current ? (
          <span className="text-caption text-text-secondary">This order</span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <StatusChip tone={state.tone} label={state.label} icon={state.icon} />
      </div>

      <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
        <dt className="text-caption text-text-muted">Job</dt>
        <dd className="text-body text-text-secondary m-0 min-w-0 truncate">
          {order.title || "Untitled order"}
        </dd>
        <dt className="text-caption text-text-muted">Rider</dt>
        <dd className="text-body text-text-secondary m-0">{rider}</dd>
      </dl>

      <dl className="border-outline m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 border-t pt-3">
        <OrderMoneyLines order={order} totalLabel={`${group.label} total`} />
      </dl>

      <dl className="border-outline m-0 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 border-t pt-3">
        <dt className="text-caption text-text-muted">Paid to the shop</dt>
        <dd className="text-body text-text-secondary m-0 tabular-nums">
          {payout.count === 0
            ? "No stages yet"
            : payout.releasedMinor !== null && payout.totalMinor !== null
              ? `${formatPhp(payout.releasedMinor)} of ${formatPhp(payout.totalMinor)}`
              : `${payout.releasedCount} of ${payout.count} shares`}
        </dd>
        <dt className="text-caption text-text-muted">Refund</dt>
        <dd className="m-0">
          <StatusChip tone={refund.tone} label={refund.label} icon={refund.icon} />
        </dd>
      </dl>

      {current ? null : (
        <div className="mt-auto flex flex-wrap gap-2">
          <Link
            href={href}
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            Open {group.label}
          </Link>
          {tree === "ops" && groupAwaitsDispatch(order) ? (
            <Link
              href={`/ops/dispatch?order=${encodeURIComponent(group.orderId)}`}
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              Send a rider
            </Link>
          ) : null}
        </div>
      )}
    </li>
  );
}

/**
 * The groups, added up in front of the reader, against the one payment. The
 * API refuses a basket that does not balance; if one ever reaches this screen
 * it says so in words, not just colour.
 */
function Reconciliation({ basket }: { basket: Basket }) {
  const { parts, groupsMinor, paidMinor, balanced } = reconcileBasket(basket);
  const Icon = balanced ? CircleCheck : TriangleAlert;
  return (
    <p
      className="text-body text-text-secondary m-0 flex items-start gap-2"
      data-testid="basket-reconciliation"
    >
      <Icon
        size={18}
        strokeWidth={2}
        aria-hidden
        className="mt-0.5 shrink-0"
        style={{ color: balanced ? "var(--color-success)" : "var(--color-error)" }}
      />
      <span className="tabular-nums">
        {parts.map((part, index) => (
          <span key={part.label}>
            {index > 0 ? " + " : ""}
            {part.label} {formatPhp(part.totalMinor)}
          </span>
        ))}{" "}
        ={" "}
        <span className="text-text-primary" style={medium}>
          {formatPhp(groupsMinor)}
        </span>
        {balanced
          ? ", the client's one payment."
          : `. That is not the ${formatPhp(paidMinor)} the client was asked for. Refresh the order; if it stays, tell engineering before confirming anything.`}
      </span>
    </p>
  );
}

/**
 * The receipt the client holds, read on demand: one invoice number for the
 * whole basket, a section per shop group. It prints what the client was
 * charged per line (the shop price and fee folded together), which is why
 * the per-group breakdown above, not this, is where the fee is read.
 */
function CombinedReceipt({ basketId }: { basketId: string }) {
  const [open, setOpen] = useState(false);
  const [invoice, setInvoice] = useState<BasketInvoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (!next || invoice || loading) return;
    setLoading(true);
    setError(null);
    try {
      setInvoice(await getBasketInvoice(basketId));
    } catch {
      setError("The combined receipt could not be loaded. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button
          variant="secondary"
          aria-expanded={open}
          aria-controls="basket-receipt"
          onClick={() => void toggle()}
        >
          {open ? "Hide the combined receipt" : "Show the combined receipt"}
        </Button>
      </div>
      {open ? (
        <div id="basket-receipt" className="gg-panel flex w-full max-w-xl flex-col gap-3">
          {loading ? (
            <p className="text-body text-text-secondary m-0" role="status">
              Loading the receipt…
            </p>
          ) : error ? (
            <p className="text-body text-error m-0" role="alert">
              {error}
            </p>
          ) : invoice ? (
            <ReceiptBody invoice={invoice} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ReceiptBody({ invoice }: { invoice: BasketInvoice }) {
  const discount = invoice.organizationDiscountMinor ?? 0;
  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-body text-text-primary m-0" style={medium}>
          Receipt {invoice.invoiceNumber}
        </p>
        <p className="text-caption text-text-muted m-0">
          Issued {formatDateTime(invoice.issuedAt)}
        </p>
      </div>
      <p className="text-caption text-text-muted m-0">
        As the client&rsquo;s receipt prints it: each line already includes GRIDGO&rsquo;s
        fee, and shops are named only by letter.
      </p>
      {(invoice.groups ?? []).map((group) => (
        <section key={group.orderId} aria-label={`${group.label} on the receipt`}>
          <h4 className="text-body text-text-primary m-0 mb-1" style={medium}>
            {group.label}
          </h4>
          <dl className="m-0 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1">
            {group.lines.map((line) => (
              <div key={line.id} className="contents">
                <dt className="text-body text-text-secondary min-w-0">
                  {line.itemName} &times; {line.quantity}
                </dt>
                <dd className="text-body text-text-secondary m-0 tabular-nums text-right">
                  {formatPhp(line.clientAmountMinor ?? line.amountMinor ?? 0)}
                </dd>
              </div>
            ))}
            {(group.organizationDiscountMinor ?? 0) > 0 ? (
              <>
                <dt className="text-body text-text-secondary">Organization discount</dt>
                <dd className="text-body text-text-secondary m-0 tabular-nums text-right">
                  {asDeduction(formatPhp(group.organizationDiscountMinor ?? 0))}
                </dd>
              </>
            ) : null}
            <dt className="text-body text-text-secondary">Delivery</dt>
            <dd className="text-body text-text-secondary m-0 tabular-nums text-right">
              {formatPhp(group.deliveryFeeMinor)}
            </dd>
            <dt className="text-body text-text-primary" style={medium}>
              {group.label} total
            </dt>
            <dd
              className="text-body text-text-primary m-0 tabular-nums text-right"
              style={medium}
            >
              {formatPhp(group.totalMinor)}
            </dd>
          </dl>
        </section>
      ))}
      <dl className="border-outline m-0 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 border-t pt-2">
        {discount > 0 ? (
          <>
            <dt className="text-body text-text-secondary">
              Organization discount, all shops
            </dt>
            <dd className="text-body text-text-secondary m-0 tabular-nums text-right">
              {asDeduction(formatPhp(discount))}
            </dd>
          </>
        ) : null}
        <dt
          className="text-body text-text-primary"
          style={{ fontFamily: "var(--font-bold)" }}
        >
          Receipt total
        </dt>
        <dd
          className="text-body text-text-primary m-0 tabular-nums text-right"
          style={{ fontFamily: "var(--font-bold)" }}
        >
          {formatPhp(invoice.totalMinor)}
        </dd>
      </dl>
    </>
  );
}
