import { formatRatePercent } from "@/components/settings/service-fee";
import type { Order } from "@/lib/api/types";
import { orderDeliverySplit, platformShareBps } from "@/lib/delivery-split";
import {
  chargedRows,
  orderFeeBasis,
  scheduleSummary,
  workingTerm,
  type OrderFeeBasis,
} from "@/lib/service-fee-brackets";
import { formatPhp } from "@/lib/format";
import { asDeduction, discountLabel, orderFeeSplit } from "@/lib/organization-discount";
import { orderVoucher, VOUCHER_LINE_LABEL } from "@/lib/vouchers";
import { appliedPinChange, signedPhp } from "@/lib/delivery-pin";

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
 * The fee shows how it was priced (gridgo-api#220): on a bracket order, the
 * working under it ("₱2,000.00 × 45%", "₱3,000.00 × 25%", the rows adding up
 * to the fee before any discount) and the table it was frozen under; on an
 * older order, the one flat rate it was priced at, named as such.
 *
 * A GRIDGO-funded voucher (gridgo-api#204) sits last, just above the total it
 * was taken off, with where it came from: GRIDGO's fee first, then delivery.
 * The shop price, the rider payout and the delivery split stay at their gross
 * figures above it, because the voucher never moves them.
 *
 * A saved delivery-pin change (DELIVERY_PIN_API.md) leaves the checkout fee
 * and total as they were and adds its signed difference beside them: delivery
 * at checkout, the pin change, delivery now. The rider and GRIDGO lines are
 * the API's, which already carry the change, so they add up to delivery now.
 */
export function OrderMoneyLines({ order, totalLabel = "Client total" }: Props) {
  const deliverySplit = orderDeliverySplit(order);
  const fee = orderFeeSplit(order);
  const voucher = orderVoucher(order);
  const basis = orderFeeBasis(order);
  // A pin change that moved money: the API's effective figures sit beside the checkout ones.
  const pinChange = appliedPinChange(order);
  const pinMoved =
    pinChange !== null &&
    pinChange.feeDifferenceMinor !== 0 &&
    typeof order.effectiveDeliveryFeeMinor === "number";
  // A bracket order has no single rate; a flat one names its rate.
  const rate = basis.kind === "flat" ? ` (${formatRatePercent(basis.rateBps)})` : "";
  return (
    <>
      {order.supplierSubtotalMinor != null ? (
        <Line label="Shop price" value={formatPhp(order.supplierSubtotalMinor)} />
      ) : null}
      {fee ? (
        <>
          <Line label={`Service fee${rate}`} value={formatPhp(fee.grossMinor)} />
          <FeeWorking basis={basis} />
          <Line
            label={discountLabel(fee.discountRateBps)}
            value={asDeduction(formatPhp(fee.discountMinor))}
            indent
            testId="organization-discount"
          />
          <Line label="Fee GRIDGO keeps" value={formatPhp(fee.netMinor)} indent />
        </>
      ) : order.serviceFeeMinor != null ? (
        <>
          <Line label={`Service fee${rate}`} value={formatPhp(order.serviceFeeMinor)} />
          <FeeWorking basis={basis} />
        </>
      ) : null}
      {pinMoved ? (
        <>
          <Line label="Delivery at checkout" value={formatPhp(order.deliveryFeeMinor)} />
          <Line
            label="Pin change"
            value={signedPhp(pinChange.feeDifferenceMinor)}
            indent
            testId="pin-change-difference"
          />
          <Line
            label="Delivery now"
            value={formatPhp(order.effectiveDeliveryFeeMinor!)}
            testId="delivery-now"
          />
        </>
      ) : order.deliveryFeeMinor != null ? (
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
        label={pinMoved ? `${totalLabel} at checkout` : totalLabel}
        value={order.totalMinor != null ? formatPhp(order.totalMinor) : "—"}
        strong
      />
      {pinMoved && typeof order.effectiveTotalMinor === "number" ? (
        <Line
          label={`${totalLabel} now`}
          value={formatPhp(order.effectiveTotalMinor)}
          strong
          testId="total-now"
        />
      ) : null}
    </>
  );
}

/**
 * How the fee above was priced. Brackets the price never reached are left
 * out; the table line names the whole table the order was frozen under.
 */
function FeeWorking({ basis }: { basis: OrderFeeBasis }) {
  if (basis.kind === "brackets") {
    return (
      <>
        {chargedRows(basis.working).map((row) => (
          <Line
            key={row.fromMinor}
            label={workingTerm(row)}
            value={formatPhp(row.amountMinor)}
            indent
            testId="service-fee-working"
          />
        ))}
        <Line
          label="Fee table"
          value={scheduleSummary(basis.schedule)}
          indent
          muted
          testId="service-fee-table"
        />
      </>
    );
  }
  if (basis.kind === "flat") {
    return (
      <Line
        label="Fee table"
        value="One flat rate on the whole shop price, from before brackets"
        indent
        muted
        testId="service-fee-table"
      />
    );
  }
  return null;
}

function Line({
  label,
  value,
  indent = false,
  strong = false,
  muted = false,
  testId,
}: {
  label: string;
  value: string;
  indent?: boolean;
  strong?: boolean;
  /** An explanation rather than an amount. */
  muted?: boolean;
  testId?: string;
}) {
  return (
    <>
      <dt className={`text-caption text-text-muted${indent ? " pl-3" : ""}`}>{label}</dt>
      <dd
        className={`m-0 tabular-nums ${muted ? "text-caption text-text-muted" : "text-body"} ${strong ? "text-text-primary" : muted ? "" : "text-text-secondary"}`}
        data-testid={testId}
      >
        {value}
      </dd>
    </>
  );
}
