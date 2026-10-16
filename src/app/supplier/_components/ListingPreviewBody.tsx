"use client";

import { SamplePhoto } from "@/app/supplier/_components/SamplePhoto";
import { LayoutGlyph } from "@/components/orders/PrintLayoutRecord";
import { formatPhp } from "@/lib/format";
import {
  addOns,
  boardContextFor,
  effectiveFormatCodes,
  effectiveMinimumTurnaround,
  effectiveTurnaround,
  fromPriceMinor,
  hasPriceRange,
  pickLine,
  printerCapLine,
  specs,
  subcategoryName,
  unitLine,
  type Listing,
  type PrepStep,
  type ServiceLine,
  type SpecGroup,
} from "@/lib/listings";
import type { Taxonomy } from "@/lib/api/types";
import { readyInLine } from "@/lib/production-time";
import { layoutHint, layoutLabel, type KnownLayout } from "@/lib/print-layout";

type FileFormat = {
  code: string;
  displayName: string;
  inputKind: "file" | "url";
  uploadable?: boolean;
};

/**
 * The listing from the other side of the counter — wide sample, other photos,
 * price, ready-in, printer cap, prep steps, specs, add-ons, artwork.
 * Nothing here can be edited. The editor feeds it the unsaved draft.
 */
export function ListingPreviewBody({
  listing,
  taxonomy,
  services,
  prepSteps,
  formats,
}: {
  listing: Listing;
  taxonomy: Taxonomy | null;
  services: ServiceLine[];
  prepSteps: PrepStep[];
  formats: readonly FileFormat[];
}) {
  const context = boardContextFor(listing, services);
  const readyIn = readyInLine(
    effectiveTurnaround(listing, context.inheritedTurnaround),
    effectiveMinimumTurnaround(listing),
  );
  const codes = effectiveFormatCodes(listing, context.inheritedFormatCodes);
  const known = new Map(formats.map((format) => [format.code, format]));
  const uploads = codes.filter((code) => {
    const format = known.get(code);
    return format?.inputKind === "file" && format.uploadable !== false;
  });
  const links = codes.filter((code) => known.get(code)?.inputKind === "url");
  const unopened = codes.filter((code) => !uploads.includes(code) && !links.includes(code));
  const cap = printerCapLine(listing.printerMaxWidthFeet);
  const name = (formatCode: string) => known.get(formatCode)?.displayName ?? formatCode;

  return (
    <div data-testid="listing-preview" className="flex flex-col gap-4">
      <div data-testid="listing-preview-sample">
        <SamplePhoto
          fileId={listing.photos[0]?.fileId}
          alt={listing.photos[0]?.altText ?? listing.name}
          emptyLabel="No sample photo"
          enlarge={false}
          className="aspect-[4/3] w-full"
        />
      </div>

      {listing.photos.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto" aria-label="Other photos">
          {listing.photos.slice(1).map((photo) => (
            <div key={photo.fileId} className="w-20 shrink-0">
              <SamplePhoto
                fileId={photo.fileId}
                alt={photo.altText ?? listing.name}
                enlarge={false}
              />
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex flex-col gap-1">
        <p
          className="text-body-lg text-text-primary m-0"
          style={{ fontFamily: "var(--font-bold)" }}
        >
          {listing.name || "Untitled listing"}
        </p>
        <p className="text-caption text-text-muted m-0">
          {subcategoryName(taxonomy, listing.subcategoryCode)}
        </p>
        {cap ? <p className="text-caption text-text-muted m-0">{cap}</p> : null}
        <p className="text-text-primary m-0">
          {hasPriceRange(listing) ? (
            <span className="text-caption text-text-muted">From </span>
          ) : null}
          <span className="text-h3" style={{ fontFamily: "var(--font-bold)" }}>
            {formatPhp(fromPriceMinor(listing))}
          </span>{" "}
          <span className="text-body text-text-secondary">{unitLine(listing)}</span>
        </p>
        <p className="text-body text-text-secondary m-0">{readyIn}</p>
      </div>

      {listing.description ? (
        <p className="text-body text-text-secondary m-0">{listing.description}</p>
      ) : null}

      {prepSteps.length ? (
        <div className="flex flex-col gap-2">
          <p className="text-overline text-text-muted m-0 uppercase">Before you order</p>
          <ol className="m-0 flex list-none flex-col gap-2 p-0">
            {prepSteps.map((prep, index) => (
              <li key={prep.id} className="flex flex-col gap-0.5">
                <p className="text-body text-text-primary m-0">
                  {index + 1}. {prep.title}
                </p>
                {prep.body ? (
                  <p className="text-caption text-text-secondary m-0">{prep.body}</p>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {specs(listing).map((group, index) => (
        <OrderGroup key={group.id} group={group} step={index + 1} />
      ))}

      {listing.printLayouts?.length ? (
        <LayoutStep layouts={listing.printLayouts} step={specs(listing).length + 1} />
      ) : null}

      {addOns(listing).length ? (
        <div className="flex flex-col gap-3">
          <p className="text-overline text-text-muted m-0 uppercase">Add anything else</p>
          {addOns(listing).map((group) => (
            <OrderGroup key={group.id} group={group} step={null} />
          ))}
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <p className="text-overline text-text-muted m-0 uppercase">Send your artwork as</p>
        {uploads.length ? (
          <p className="text-body text-text-secondary m-0">
            Upload {uploads.map((code) => name(code)).join(", ")}
          </p>
        ) : null}
        {links.length ? (
          <p className="text-body text-text-secondary m-0">
            Or paste a link from {links.map((code) => name(code)).join(", ")}
          </p>
        ) : null}
        {unopened.length ? (
          <p className="text-body text-text-secondary m-0">
            {unopened.map((code) => name(code)).join(", ")} cannot be uploaded in GRIDGO yet —
            send them as a link.
          </p>
        ) : null}
        {!codes.length ? (
          <p className="text-body text-text-secondary m-0">
            Not set yet, so a client would not know what to send.
          </p>
        ) : null}
      </div>

      <p className="text-caption text-text-muted m-0">
        A client pays GRIDGO, not your counter, and GRIDGO’s own charge sits on top of the
        price you set. What you are paid is your price.
      </p>
    </div>
  );
}

function OrderGroup({ group, step }: { group: SpecGroup; step: number | null }) {
  const options = group.options.filter((option) => option.active);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-overline text-text-muted m-0 uppercase">
          {step != null ? `Step ${step} · ${group.name}` : group.name}
        </p>
        <span className="text-caption text-text-secondary rounded-pill border border-outline px-2 py-0.5">
          {pickLine(group)}
        </span>
      </div>
      {group.helpText ? (
        <p className="text-caption text-text-muted m-0">{group.helpText}</p>
      ) : null}
      <div className="rounded-card border-outline flex flex-col gap-2 border p-3">
        {options.length ? (
          options.map((option) => (
            <div key={option.id} className="flex items-center gap-2">
              <span
                aria-hidden
                className={
                  group.required
                    ? "border-outline size-[18px] shrink-0 rounded-full border"
                    : "border-outline size-[18px] shrink-0 rounded-sm border"
                }
              />
              <span className="text-body text-text-primary min-w-0 flex-1">{option.label}</span>
              <span className="text-body text-text-secondary">{modifierLine(option.priceModifierMinor)}</span>
            </div>
          ))
        ) : (
          <p className="text-body text-text-muted m-0">
            Nothing to pick here yet, so a client cannot order this.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * The Layout step as the client app draws it: one more required pick, with
 * nothing chosen, each row showing its placement on the paper.
 */
function LayoutStep({ layouts, step }: { layouts: KnownLayout[]; step: number }) {
  return (
    <div className="flex flex-col gap-2" data-testid="listing-preview-layout">
      <div className="flex items-center justify-between gap-2">
        <p className="text-overline text-text-muted m-0 uppercase">{`Step ${step} · Layout`}</p>
        <span className="text-caption text-text-secondary rounded-pill border border-outline px-2 py-0.5">
          Pick 1
        </span>
      </div>
      <p className="text-caption text-text-muted m-0">How your file sits on the paper.</p>
      <div className="rounded-card border-outline flex flex-col gap-3 border p-3">
        {layouts.map((code) => (
          <div key={code} className="flex items-center gap-3">
            <span
              aria-hidden
              className="border-outline size-[18px] shrink-0 rounded-full border"
            />
            <LayoutGlyph layout={code} />
            <span className="flex min-w-0 flex-col">
              <span className="text-body text-text-primary">{layoutLabel(code)}</span>
              <span className="text-caption text-text-muted">{layoutHint(code)}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function modifierLine(minor: number): string {
  if (minor === 0) return "Included";
  return minor > 0 ? `+${formatPhp(minor)}` : `−${formatPhp(Math.abs(minor))}`;
}
