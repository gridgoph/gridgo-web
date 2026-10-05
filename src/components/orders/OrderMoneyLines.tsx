import { formatRatePercent } from "@/components/settings/service-fee";
import type { Order } from "@/lib/api/types";
import { orderDeliverySplit, platformShareBps } from "@/lib/delivery-split";
import { formatPhp } from "@/lib/format";
import { asDeduction, discountLabel, orderFeeSplit } from "@/lib/organization-discount";

type Props = {
  order: Order;
  /** The last line: what the client paid for this order (or this shop group). */
  totalLabel?: string;
};

/**
 * One order's money, part by part, as `dt`/`dd` pairs inside the caller's
 * `<dl>`. Operations and Super Admin only: the API strips the shop price and
 * the fee from every other role.
 *
 * The same lines, in the same words, on the workspace's Money card and on
 * each shop group of a multi-shop basket, so a figure never changes its name
 * between two places on one screen.
 *
 * On an organization order the fee is shown three ways: the fee at the
 * order's rate, the organization discount taken out of it, and what GRIDGO
 * keeps. The shop price and the delivery split above and below it never
 * move — the discount is GRIDGO's alone.
 */
export function OrderMoneyLines({ order, totalLabel = "Client total" }: Props) {
  const deliverySplit = orderDeliverySplit(order);
  const fee = orderFeeSplit(order);
  const rate =
    order.serviceFeeRateBps != null
      ? ` (${formatRatePercent(order.serviceFeeRateBps)})`
      : "";
  return (
    <>
      {order.supplierSubtotalMinor != null ? (
        <Line label="Shop price" value={formatPhp(order.supplierSubtotalMinor)} />
      ) : null}
      {fee ? (
        <>
          <Line label={`Service fee${rate}`} value={formatPhp(fee.grossMinor)} />
          <Line
            label={discountLabel(fee.discountRateBps)}
            value={asDeduction(formatPhp(fee.discountMinor))}
            indent
            testId="organization-discount"
          />
          <Line label="Fee GRIDGO keeps" value={formatPhp(fee.netMinor)} indent />
        </>
      ) : order.serviceFeeMinor != null ? (
        <Line label={`Service fee${rate}`} value={formatPhp(order.serviceFeeMinor)} />
      ) : null}
      {order.deliveryFeeMinor != null ? (
        <Line label="Delivery" value={formatPhp(order.deliveryFeeMinor)} />
      ) : null}
      {/*
        Who the delivery fee belongs to, at the rate snapshotted on this
        order. An API without the split sends none of it; the gross fee
        above then stands alone.
      */}
      {deliverySplit ? (
        <>
          <Line
            label={`Rider payout${
              deliverySplit.riderCommissionBps != null
                ? ` (${formatRatePercent(deliverySplit.riderCommissionBps)})`
                : ""
            }`}
            value={formatPhp(deliverySplit.riderPayoutMinor)}
            indent
          />
          <Line
            label={`GRIDGO delivery share${
              deliverySplit.riderCommissionBps != null
                ? ` (${formatRatePercent(platformShareBps(deliverySplit.riderCommissionBps))})`
                : ""
            }`}
            value={formatPhp(deliverySplit.platformDeliveryShareMinor)}
            indent
          />
        </>
      ) : null}
      <Line
        label={totalLabel}
        value={order.totalMinor != null ? formatPhp(order.totalMinor) : "—"}
        strong
      />
    </>
  );
}

function Line({
  label,
  value,
  indent = false,
  strong = false,
  testId,
}: {
  label: string;
  value: string;
  indent?: boolean;
  strong?: boolean;
  testId?: string;
}) {
  return (
    <>
      <dt className={`text-caption text-text-muted${indent ? " pl-3" : ""}`}>{label}</dt>
      <dd
        className={`text-body m-0 tabular-nums ${strong ? "text-text-primary" : "text-text-secondary"}`}
        data-testid={testId}
      >
        {value}
      </dd>
    </>
  );
}
