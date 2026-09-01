"use client";

import {
  CalendarCheck,
  CalendarClock,
  Coins,
  Hash,
  Layers,
  Home,
  MapPin,
  Ruler,
  Sparkles,
  Truck,
  type LucideIcon,
} from "lucide-react";

import { EvidencePlate } from "@/components/orders/EvidencePreview";
import { formatDateTime, formatPhp } from "@/lib/format";
import { presentZone } from "@/lib/order-state";
import type { Order } from "@/lib/api/types";
import { describeQuantity } from "@/lib/quantity";

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
  /*
   An icon per field, so the grid can be scanned by shape instead of read
   label by label. They are distinct glyphs on purpose — a repeated icon
   teaches nothing and would be decoration.
  */
  const rows: { label: string; value: string; icon: LucideIcon }[] = [
    { label: "Quantity", value: describeQuantity(order.quantity, order.unit), icon: Hash },
    { label: "Size", value: order.size || "—", icon: Ruler },
    { label: "Material", value: order.material || "—", icon: Layers },
    { label: "Finish", value: order.finish || "—", icon: Sparkles },
    { label: "Zone", value: presentZone(order.zone), icon: MapPin },
    { label: "Deadline", value: formatDateTime(order.deadline), icon: CalendarClock },
    { label: "Promised", value: formatDateTime(order.promisedDate), icon: CalendarCheck },
  ];

  if (showMoney) {
    rows.push({
      label: "Client total",
      value: formatPhp(order.totalMinor),
      icon: Coins,
    });
    rows.push({
      label: "Delivery",
      value: order.deliveryDistanceMeters
        ? `${formatPhp(order.deliveryFeeMinor)} · ${formatDistance(order.deliveryDistanceMeters)}`
        : formatPhp(order.deliveryFeeMinor),
      icon: Truck,
    });
  }

  rows.push({ label: "Address", value: order.address || "—", icon: Home });

  const artworkId = order.artworkFileIds?.[order.artworkFileIds.length - 1] ?? null;
  const mockupId = order.mockupFileIds?.[order.mockupFileIds.length - 1] ?? null;

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {rows.map((row) => {
          const Icon = row.icon;
          const missing = row.value === "—";
          return (
            <div key={row.label} className="flex min-w-0 items-start gap-2.5">
              <span
                className="bg-surface-variant text-text-muted mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-field"
                aria-hidden
              >
                <Icon size={14} strokeWidth={1.75} />
              </span>
              <div className="min-w-0">
                <dt className="text-caption text-text-muted m-0">{row.label}</dt>
                {/*
                  An em dash is the value here, not a blank. Keeping it muted
                  says "the client did not specify this" without it competing
                  with the fields that were.
                */}
                <dd
                  className={
                    missing
                      ? "text-body text-text-muted m-0 mt-0.5"
                      : "text-body text-text-primary m-0 mt-0.5 break-words"
                  }
                >
                  {row.value}
                </dd>
              </div>
            </div>
          );
        })}
      </dl>
      <div className="grid grid-cols-1 gap-3 border-t border-outline-subtle pt-4 sm:grid-cols-2">
        <EvidencePlate
          fileId={artworkId}
          label="Artwork"
          caption={order.artworkName}
          empty="None on file"
        />
        <EvidencePlate fileId={mockupId} label="Mockup" empty="No mockup on file" />
      </div>
    </div>
  );
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}
