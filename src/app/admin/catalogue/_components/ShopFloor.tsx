"use client";

import Link from "next/link";

import { presentServiceState } from "@/app/admin/_lib/present";
import { floorHeadline, type FloorShop } from "@/app/admin/_lib/shop-floor";
import { SamplePhoto } from "@/app/supplier/_components/SamplePhoto";
import { StatusChip } from "@/components/ui/StatusChip";
import { formatPhp } from "@/lib/format";
import { printerCapLine } from "@/lib/listings";

type Props = {
  shops: FloorShop[];
  jobName?: string;
  jobNames?: Record<string, string>;
  loading?: boolean;
};

export function ShopFloor({ shops, jobName, jobNames, loading }: Props) {
  const headline = floorHeadline(shops, jobName);

  return (
    <section aria-labelledby="shop-floor-heading" className="flex min-w-0 flex-col gap-4">
      <header className="flex flex-col gap-1">
        <p className="text-overline text-text-muted m-0 uppercase">Shop floor</p>
        <h2 id="shop-floor-heading" className="text-h3 text-text-primary m-0">
          {loading ? "Checking shops…" : headline.title}
        </h2>
        <p className="text-caption text-text-secondary m-0">
          {loading
            ? "Accredited shops and the listings they have on the board."
            : headline.body}
        </p>
      </header>

      {loading ? (
        <div className="flex flex-col gap-3">
          <div className="bg-surface-variant h-28 rounded-card" />
          <div className="bg-surface-variant h-28 rounded-card" />
        </div>
      ) : shops.length === 0 ? (
        <p className="text-body text-text-secondary m-0 max-w-prose">
          Accreditation happens on the People queue. Once a shop is live on this
          category, its listings of this work show up here.
        </p>
      ) : (
        <ul className="m-0 flex flex-col gap-3 p-0">
          {shops.map((shop) => (
            <li key={shop.supplierId}>
              <ShopTicket shop={shop} jobName={jobName} jobNames={jobNames} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ShopTicket({
  shop,
  jobName,
  jobNames,
}: {
  shop: FloorShop;
  jobName?: string;
  jobNames?: Record<string, string>;
}) {
  const state = presentServiceState(shop.serviceState);
  return (
    <article className="gg-card-flush overflow-hidden">
      <header className="flex items-start justify-between gap-3 border-b border-outline-subtle px-4 py-3">
        <div className="min-w-0">
          <h3
            className="text-body text-text-primary m-0 truncate"
            style={{ fontFamily: "var(--font-medium)" }}
          >
            {shop.shopName}
          </h3>
          <p className="text-caption text-text-muted m-0">
            {shop.listings.length
              ? `${shop.listings.length} on the board`
              : jobName
                ? `Accredited. No ${jobName} listing on the board.`
                : "Accredited. Nothing on the board yet."}
          </p>
        </div>
        <StatusChip tone={state.tone} label={state.label} icon={state.icon} />
      </header>
      {shop.listings.length ? (
        <ul className="m-0 flex flex-col p-0">
          {shop.listings.map((listing) => {
            const cap = printerCapLine(listing.printerMaxWidthFeet);
            return (
            <li
              key={listing.id}
              className="border-b border-outline-subtle last:border-b-0"
            >
              <div className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2">
                <SamplePhoto
                  fileId={listing.photoFileId ?? undefined}
                  alt={listing.name}
                  emptyLabel="No sample"
                  className="size-[4.5rem] shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-body text-text-primary m-0 truncate">{listing.name}</p>
                  {jobName ? null : (
                    <p className="text-caption text-text-muted m-0 truncate">
                      {jobNames?.[listing.subcategoryCode] ??
                        listing.subcategoryCode.replace(/_/g, " ")}
                    </p>
                  )}
                  {cap ? (
                    <p className="text-caption text-text-secondary m-0 truncate">{cap}</p>
                  ) : null}
                </div>
                <p className="text-body text-text-primary m-0 pr-1">
                  {listing.fromPriceMinor != null
                    ? `From ${formatPhp(listing.fromPriceMinor)}`
                    : "—"}
                </p>
              </div>
            </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-caption text-text-secondary m-0 px-4 py-3">
          <Link
            href="/admin/verification"
            className="text-text-secondary underline-offset-4 hover:underline"
          >
            Open accreditation
          </Link>{" "}
          if this shop should be live.
        </p>
      )}
    </article>
  );
}
