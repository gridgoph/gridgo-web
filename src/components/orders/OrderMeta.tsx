import { formatDateTime, formatPhp } from "@/lib/format";
import type { Order } from "@/lib/api/types";

type Props = {
  order: Order;
};

export function OrderMeta({ order }: Props) {
  const rows: { label: string; value: string }[] = [
    { label: "Quantity", value: String(order.quantity) },
    { label: "Size", value: order.size || "—" },
    { label: "Material", value: order.material || "—" },
    { label: "Zone", value: order.zone || "—" },
    { label: "Deadline", value: formatDateTime(order.deadline) },
    { label: "Promised", value: formatDateTime(order.promisedDate) },
    {
      label: "Total",
      value: formatPhp(order.totalMinor + order.deliveryFeeMinor),
    },
    {
      label: "Delivery fee",
      value: formatPhp(order.deliveryFeeMinor),
    },
    { label: "Artwork", value: order.artworkName || "None on file" },
    { label: "Address", value: order.address || "—" },
  ];

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
