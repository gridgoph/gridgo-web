import { formatRatePercent } from "@/components/settings/service-fee";
import type { Order } from "@/lib/api/types";
import { orderDeliverySplit, platformShareBps } from "@/lib/delivery-split";
import { formatPhp } from "@/lib/format";
import { asDeduction, discountLabel, orderFeeSplit } from "@/lib/organization-discount";
import { orderVoucher, VOUCHER_LINE_LABEL } from "@/lib/vouchers";

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
 *
 * A GRIDGO-funded voucher (gridgo-api#204) sits last, just above the total it
 * was taken off, with where it came from: GRIDGO's fee first, then delivery.
 * The shop price, the rider payout and the delivery split stay at their gross
 * figures above it, because the voucher never moves them.
 */
export function OrderMoneyLines({ order, totalLabel = "Client total" }: Props) {
  const deliverySplit = orderDeliverySplit(order);
  const fee = orderFeeSplit(order);
  const voucher = orderVoucher(order);
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
      {voucher ? (
        <>
          <Line
            label={VOUCHER_LINE_LABEL}
            value={asDeduction(formatPhp(voucher.amountMinor))}
            testId="voucher-discount"
          />
          {voucher.serviceFeeMinor > 0 ? (
            <Line
              label="Off GRIDGO's service fee"
              value={formatPhp(voucher.serviceFeeMinor)}
              indent
            />
          ) : null}
          {voucher.deliveryMinor > 0 ? (
            <Line
              label="Off delivery, paid by GRIDGO"
              value={formatPhp(voucher.deliveryMinor)}
              indent
            />
          ) : null}
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
