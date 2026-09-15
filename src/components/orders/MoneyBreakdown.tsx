/**
 * The full money breakdown on an order — supplier price, GRIDGO's service
 * fee, and what the client pays, on one line of sight.
 *
 * OPERATIONS AND SUPER ADMIN ONLY. The fee is an authorization rule, not a
 * layout preference: the client never learns it exists and the supplier never
 * sees it either. Do not import this into a supplier route or any client-facing
 * view — `src/components/orders/__tests__/money-visibility.test.ts` enforces it.
 *
 * The server already strips the fields it will not show a caller, so anything
 * missing here is rendered as unavailable rather than guessed at.
 */

import { formatRatePercent } from "@/components/settings/service-fee";
import type { Order } from "@/lib/api/types";
import { formatPhp } from "@/lib/format";

type Props = {
  order: Order;
  /** Heading id for the surrounding section, when one is needed. */
  headingId?: string;
};

function formatDistance(meters: number | undefined): string | null {
  if (meters === undefined || !Number.isFinite(meters)) return null;
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

type Row = {
  label: string;
  value: string;
  /** What this figure means, when the label alone would not carry it. */
  hint?: string;
  emphasis?: boolean;
};

export function MoneyBreakdown({ order, headingId }: Props) {
  const distance = formatDistance(order.deliveryDistanceMeters);

  const supplierRows: Row[] = [];
  if (order.supplierPriceMinor !== undefined) {
    supplierRows.push({
      label: "Supplier price",
      value: formatPhp(order.supplierPriceMinor),
      hint: "What the supplier asked for and keeps in full",
    });
  }
  if (order.serviceFeeMinor !== undefined) {
    supplierRows.push({
      label: `GRIDGO service fee${
        order.serviceFeeRateBps != null ? ` (${formatRatePercent(order.serviceFeeRateBps)})` : ""
      }`,
      value: formatPhp(order.serviceFeeMinor),
      hint: "Added on top of the supplier price. Never shown to the client.",
    });
  }

  const clientRows: Row[] = [];
  if (order.subtotalMinor !== undefined) {
    clientRows.push({
      label: "Subtotal",
      value: formatPhp(order.subtotalMinor),
      hint: "What the client sees as the price of the work",
    });
  }
  clientRows.push({
    label: "Delivery",
    value: formatPhp(order.deliveryFeeMinor),
    hint: distance
      ? `${distance} from the supplier to the delivery address`
      : "Set by the distance band in Operational settings",
  });
  clientRows.push({
    label: "Client total",
    value: formatPhp(order.totalMinor),
    emphasis: true,
  });

  const hasSupplierLedger = supplierRows.length > 0;

  return (
    <div className="flex flex-col gap-4" aria-labelledby={headingId}>
      {hasSupplierLedger ? (
        <MoneyRows rows={supplierRows} />
      ) : (
        <p className="text-body text-text-secondary m-0">
          The supplier price and service fee appear once a supplier has accepted
          this order and named its price.
        </p>
      )}

      {hasSupplierLedger ? (
        <div className="border-t border-outline-subtle pt-4">
          <MoneyRows rows={clientRows} />
        </div>
      ) : (
        <MoneyRows rows={clientRows} />
      )}

      {order.downpaymentMinor !== undefined &&
      order.balanceMinor !== undefined ? (
        <div className="border-t border-outline-subtle pt-4">
          <MoneyRows
            rows={[
              {
                label: "Downpayment (75%)",
                value: formatPhp(order.downpaymentMinor),
              },
              {
                label: "Balance (25%)",
                value: formatPhp(order.balanceMinor),
              },
            ]}
          />
        </div>
      ) : null}
    </div>
  );
}

function MoneyRows({ rows }: { rows: Row[] }) {
  return (
    <dl className="m-0 flex flex-col gap-3">
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5"
        >
          <dt className="min-w-0">
            <span
              className={
                row.emphasis
                  ? "text-body text-text-primary"
                  : "text-body text-text-secondary"
              }
              style={
                row.emphasis ? { fontFamily: "var(--font-medium)" } : undefined
              }
            >
              {row.label}
            </span>
            {row.hint ? (
              <span className="text-caption text-text-muted block">
                {row.hint}
              </span>
            ) : null}
          </dt>
          <dd
            className="text-body text-text-primary m-0 tabular-nums whitespace-nowrap"
            style={{
              fontFamily: row.emphasis ? "var(--font-bold)" : "var(--font-medium)",
            }}
          >
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
