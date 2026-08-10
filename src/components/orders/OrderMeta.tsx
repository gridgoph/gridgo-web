import { formatDateTime, formatPhp } from "@/lib/format";
import type { Order } from "@/lib/api/types";

type Props = {
  order: Order;
  /**
   * Money is shown in full on the surfaces that own it — the Operations money
   * breakdown, the supplier's payouts. Set false where those cover it already.
   */
  showMoney?: boolean;
};

/**
 * The specification of an order: what is being made, by when, to where.
 * `totalMinor` already includes delivery in v2 — never add the fee to it.
 */
export function OrderMeta({ order, showMoney = true }: Props) {
  const rows: { label: string; value: string }[] = [
    { label: "Quantity", value: String(order.quantity) },
    { label: "Size", value: order.size || "—" },
    { label: "Material", value: order.material || "—" },
    { label: "Zone", value: order.zone || "—" },
    { label: "Deadline", value: formatDateTime(order.deadline) },
    { label: "Promised", value: formatDateTime(order.promisedDate) },
  ];

  if (showMoney) {
    rows.push({
      label: "Client total",
      value: formatPhp(order.totalMinor),
    });
    rows.push({
      label: "Delivery",
      value: order.deliveryDistanceMeters
        ? `${formatPhp(order.deliveryFeeMinor)} · ${formatDistance(order.deliveryDistanceMeters)}`
        : formatPhp(order.deliveryFeeMinor),
    });
  }

  rows.push({ label: "Artwork", value: order.artworkName || "None on file" });
  rows.push({ label: "Address", value: order.address || "—" });

  return (
    <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {rows.map((row) => (
        <div key={row.label} className="min-w-0">
          <dt className="text-caption text-text-muted m-0">{row.label}</dt>
          <dd className="text-body text-text-primary m-0 mt-0.5 break-words">
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}
