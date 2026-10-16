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

import { ArtworkAttachments } from "@/components/orders/ArtworkAttachments";
import { ArtworkGuidanceRecord } from "@/components/orders/ArtworkGuidanceRecord";
import { DesignLinkLead, DesignLinkList } from "@/components/orders/DesignLinks";
import { PrintLayoutRecord } from "@/components/orders/PrintLayoutRecord";
import { EvidencePlate } from "@/components/orders/EvidencePreview";
import { ExactColoursRecord } from "@/components/orders/ExactColours";
import { ColourPricingRecord } from "@/components/orders/ColourPricingRecord";
import { showsAttachmentList } from "@/lib/artwork-attachments";
import { orderDesignLinks } from "@/lib/design-links";
import { jobFileEvidence } from "@/lib/evidence";
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
  /**
   * Read Material, Zone and Promised from the API's `jobDetails` (the shop's
   * job, report 6C695C15): filled from the order's own snapshots, with
   * "Not specified" for what it could not fill. The shop's surfaces set this;
   * Operations keeps reading the order's own fields.
   */
  fromJobDetails?: boolean;
};

/** What the API says for a job detail it could not fill from the order. */
export const NOT_SPECIFIED = "Not specified";

/**
 * The specification of an order: what is being made, by when, to where.
 * `totalMinor` already includes delivery in v2 — never add the fee to it.
 */
export function OrderMeta({ order, showMoney = true, fromJobDetails = false }: Props) {
  const details = fromJobDetails ? jobDetailsOf(order) : null;
  /*
   An icon per field, so the grid can be scanned by shape instead of read
   label by label. They are distinct glyphs on purpose — a repeated icon
   teaches nothing and would be decoration.
  */
  const rows: { label: string; value: string; icon: LucideIcon }[] = [
    { label: "Quantity", value: describeQuantity(order.quantity, order.unit), icon: Hash },
    { label: "Size", value: order.size || "—", icon: Ruler },
    {
      label: "Material",
      value: details ? details.material : order.material || "—",
      icon: Layers,
    },
    { label: "Finish", value: order.finish || "—", icon: Sparkles },
    { label: "Zone", value: details ? details.zone : presentZone(order.zone), icon: MapPin },
    { label: "Deadline", value: formatDateTime(order.deadline), icon: CalendarClock },
    {
      label: "Promised",
      value: details
        ? details.promisedDate
          ? formatDateTime(details.promisedDate)
          : NOT_SPECIFIED
        : formatDateTime(order.promisedDate),
      icon: CalendarCheck,
    },
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

  // Only this shop's own lines: on a two-shop order the order-wide ids also
  // carry the other shop's files.
  const { artwork, mockups } = jobFileEvidence(order);
  const designLinks = orderDesignLinks(order);
  const attachmentList = showsAttachmentList(order);

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {rows.map((row) => {
          const Icon = row.icon;
          const missing = row.value === "—" || row.value === NOT_SPECIFIED;
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
      {/*
        How the client asked for the file to sit on the paper: the paper, the
        page, and whether anything is cut off or the drawing scale changes.
        Only on products whose shop offers the choice.
      */}
      <PrintLayoutRecord order={order} />
      {/*
        Each page's strong colour, tier and the shop's own sheet rate, as
        GRIDGO measured it at checkout. Only on colour-priced and one-colour
        lines.
      */}
      <ColourPricingRecord order={order} audience="shop" />
      {/*
        The client's exact colours, beside the colours GRIDGO read from each
        released file. Nothing on a job without colours.
      */}
      <ExactColoursRecord
        order={order}
        audience="shop"
        className="border-t border-outline-subtle pt-4"
      />
      <div className="grid grid-cols-1 gap-3 border-t border-outline-subtle pt-4 sm:grid-cols-2">
        {/*
          A design link is artwork too: the file is behind it. A link-only
          order says so plainly instead of the plate's "None on file".
        */}
        {attachmentList ? (
          // Several files or labelled ones on an item: every file and link,
          // item by item, in the client's order, across the full width.
          <div className="flex min-w-0 flex-col gap-2 sm:col-span-2">
            <p className="text-caption text-text-muted m-0">Artwork</p>
            <ArtworkAttachments order={order} audience="shop" />
          </div>
        ) : artwork.length || designLinks.length === 0 ? (
          <div className="flex min-w-0 flex-col gap-3">
            {/*
              One plate per file. The last id used to be the only one drawn,
              so a second print file never reached the shop.
            */}
            {artwork.length ? (
              artwork.map((item) => (
                <EvidencePlate
                  key={item.fileId}
                  fileId={item.fileId}
                  label={item.label}
                  caption={item.caption}
                  empty="None on file"
                  downloadable
                />
              ))
            ) : (
              <EvidencePlate fileId={null} label="Artwork" empty="None on file" />
            )}
            {designLinks.length ? (
              <div className="flex flex-col gap-2">
                <DesignLinkLead fileToo />
                <DesignLinkList links={designLinks} />
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex min-w-0 flex-col gap-2">
            <p className="text-caption text-text-muted m-0">Artwork</p>
            <DesignLinkLead fileToo={false} />
            <DesignLinkList links={designLinks} />
          </div>
        )}
        <div className="flex min-w-0 flex-col gap-3">
          {mockups.length ? (
            mockups.map((item) => (
              <EvidencePlate
                key={item.fileId}
                fileId={item.fileId}
                label={item.label}
                downloadable
              />
            ))
          ) : (
            <EvidencePlate fileId={null} label="Mockup" empty="No mockup on file" />
          )}
        </div>
        {/*
          What each released file measured against its product type, and
          which warnings the client accepted before checkout. The API sends it
          to the shop once the artwork is released; older orders have none.
        */}
        <ArtworkGuidanceRecord
          order={order}
          audience="shop"
          className="min-w-0 sm:col-span-2"
        />
      </div>
    </div>
  );
}

/**
 * Material, zone and the shop's date as the API filled them, or null from an
 * older API (the order's own fields are read then). A date the API could not
 * fill is null here so it is never formatted.
 */
export function jobDetailsOf(order: Pick<Order, "jobDetails">): {
  material: string;
  zone: string;
  promisedDate: string | null;
} | null {
  const raw = order.jobDetails;
  if (!raw || typeof raw !== "object") return null;
  const text = (value: unknown) =>
    typeof value === "string" && value.trim() ? value.trim() : NOT_SPECIFIED;
  const missing = Array.isArray(raw.missing) ? raw.missing : [];
  const promised = text(raw.promisedDate);
  return {
    material: text(raw.material),
    zone: text(raw.zone),
    promisedDate:
      missing.includes("promisedDate") || promised === NOT_SPECIFIED ? null : promised,
  };
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}
