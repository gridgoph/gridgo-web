"use client";

import type { Order } from "@/lib/api/types";
import { canAddProgressPhoto, progressReached } from "@/lib/production-progress";
import { ridersPack } from "@/lib/shop-handover";
import { ProgressGallery, WaitingForPhoto } from "@/components/orders/ProductionProgress";

/** Packing evidence stays distinct from the production photos and payout proofs. */
export function PackingPhotos({
  order,
}: {
  order: Pick<Order, "state" | "packingProgress"> & Partial<Pick<Order, "handoverFlow">>;
}) {
  const progress = order.packingProgress;
  if (!progress || !Array.isArray(progress.photos)) return null;
  const photos = progress.photos.filter((photo) => photo && photo.fileId);
  if (!photos.length && !progressReached(order)) return null;
  // Rider-packs handover: the rider packs and photographs the job at pickup,
  // after checking it unpacked, so the shop owes no packing photo.
  if (ridersPack(order)) {
    if (!photos.length) return null;
    return (
      <section aria-label="Packing photos" className="flex flex-col gap-2">
        <h3
          className="text-body text-text-primary m-0"
          style={{ fontFamily: "var(--font-medium)" }}
        >
          Packed in front of the rider
        </h3>
        <p className="text-caption text-text-muted m-0">
          Taken by the rider after checking the unpacked items. The client sees these on
          their order.
        </p>
        <ProgressGallery photos={photos} label="Packing photo" />
      </section>
    );
  }
  return (
    <section aria-label="Packing photos" className="flex flex-col gap-2">
      <h3
        className="text-body text-text-primary m-0"
        style={{ fontFamily: "var(--font-medium)" }}
      >
        Packing photos
      </h3>
      {photos.length ? (
        <>
          <p className="text-caption text-text-muted m-0">
            Finished prints packed for pickup. The client sees these on their order.
          </p>
          <ProgressGallery photos={photos} label="Packing photo" />
        </>
      ) : (
        <WaitingForPhoto
          title="No packing photo yet"
          body={
            canAddProgressPhoto(order)
              ? "The shop must send a separate photo of the packed job before marking Ready for dispatch."
              : "No packing photo is on this order. Older jobs or an Operations correction can reach dispatch without one."
          }
        />
      )}
    </section>
  );
}
