/**
 * Delivery distance zones on Operational settings: the four fixed zones that
 * give a client their distance word and price every delivery (gridgo-api#121).
 * Nearby, Away and Long Distance each carry one flat fee; Out of Zone carries a
 * base fee plus a fee per kilometre, with a worked example that follows the
 * fields as they are typed.
 *
 * Rows cannot be added, removed or renamed, and their limits are not edited
 * here: the API holds the table fixed. A price still at the API's shipped
 * figure is marked Placeholder until someone sets a real one.
 *
 * Presentational only. `OperationalSettings` owns the draft and saves the full
 * table with the rest of the page through the settings version handshake.
 */

import type { ReactNode } from "react";

import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SkeletonLines } from "@/components/ui/loading";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/StatusChip";
import type { DeliveryFeeBand } from "@/lib/api/types";
import {
  DELIVERY_ZONES,
  type DeliveryZoneBand,
  isPlaceholder,
  isZonedTable,
  OUT_OF_ZONE_EXAMPLE_METERS,
  outOfZoneExample,
  readPrice,
  zonePrice,
  zonePriceProblem,
  zoneRange,
  type ZonePriceDraft,
  type ZonePriceField,
} from "@/lib/delivery-zones";
import { formatPhp } from "@/lib/format";

const medium = { fontFamily: "var(--font-medium)" } as const;

export const DELIVERY_ZONES_COPY = (
  <>
    Measured from the shop to the client&rsquo;s drop-off. The same four zones set the
    delivery fee and the distance word the client sees. Clients see the word only, except on
    Out of Zone listings, which also show the kilometres. The zones and their limits are
    fixed; only the prices change here.
  </>
);

const PRICE_HELP = (
  <>
    Pesos, up to two decimals. Applies to orders placed from now on &mdash; every order
    already placed keeps the delivery fee it was given.
  </>
);

type Props = {
  /** The table the API holds now. */
  stored: DeliveryFeeBand[];
  /** The prices as typed, or null when the API does not hold the four zones. */
  draft: ZonePriceDraft | null;
  onChange: (field: ZonePriceField, value: string) => void;
  disabled?: boolean;
};

export function DeliveryZones({ stored, draft, onChange, disabled }: Props) {
  return (
    <section className="gg-card p-3" aria-labelledby="zones-heading">
      <h2 id="zones-heading" className="text-h3 text-text-primary m-0">
        Delivery distance zones
      </h2>
      <p className="text-body text-text-secondary m-0 mt-1 max-w-prose">{DELIVERY_ZONES_COPY}</p>

      {draft && isZonedTable(stored) ? (
        <ZoneRows stored={stored} draft={draft} onChange={onChange} disabled={disabled} />
      ) : (
        <LegacyBands bands={stored} />
      )}
    </section>
  );
}

function ZoneRows({
  stored,
  draft,
  onChange,
  disabled,
}: {
  stored: DeliveryZoneBand[];
  draft: ZonePriceDraft;
  onChange: (field: ZonePriceField, value: string) => void;
  disabled?: boolean;
}) {
  const anyPlaceholder = stored.some(isPlaceholder);
  return (
    <>
      {anyPlaceholder ? (
        <p className="text-body text-warning m-0 mt-2 max-w-prose" data-testid="zones-placeholder-note">
          Prices marked Placeholder are the starting figures the API shipped with, not prices
          anyone set. Set the real ones before release.
        </p>
      ) : null}
      <p className="text-caption text-text-muted m-0 mt-2 max-w-prose">{PRICE_HELP}</p>

      <ol className="m-0 mt-3 flex list-none flex-col gap-3 p-0">
        {stored.map((band) => (
          <li
            key={band.zone}
            className="rounded-card border border-outline-subtle flex flex-col gap-3 p-3"
            aria-labelledby={`zone-${band.zone}-name`}
            data-testid={`zone-${band.zone}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
              <div className="flex min-w-0 flex-col items-start gap-1">
                <div>
                  <h3
                    id={`zone-${band.zone}-name`}
                    className="text-body text-text-primary m-0"
                    style={medium}
                  >
                    {band.label}
                  </h3>
                  <p className="text-caption text-text-muted m-0 tabular-nums">
                    {zoneRange(band.zone)}
                  </p>
                </div>
                {isPlaceholder(band) ? (
                  <StatusChip tone="warning" icon="circle-dashed" label="Placeholder" />
                ) : null}
              </div>

              <div className="flex flex-wrap gap-3">
                {band.zone === "out_of_zone" ? (
                  <>
                    <PriceField
                      field="outOfZoneBase"
                      zoneLabel={band.label}
                      label="Base fee"
                      value={draft.outOfZoneBase}
                      inForceMinor={band.baseFeeMinor}
                      onChange={onChange}
                      disabled={disabled}
                    />
                    <PriceField
                      field="outOfZonePerKm"
                      zoneLabel={band.label}
                      label="Per kilometre"
                      value={draft.outOfZonePerKm}
                      inForceMinor={band.perKmMinor}
                      onChange={onChange}
                      disabled={disabled}
                    />
                  </>
                ) : (
                  <PriceField
                    field={band.zone}
                    zoneLabel={band.label}
                    label="Flat fee"
                    value={draft[band.zone]}
                    inForceMinor={band.feeMinor}
                    onChange={onChange}
                    disabled={disabled}
                  />
                )}
              </div>
            </div>

            {band.zone === "out_of_zone" ? (
              <OutOfZoneExample
                baseFeeMinor={readPrice(draft.outOfZoneBase) ?? band.baseFeeMinor}
                perKmMinor={readPrice(draft.outOfZonePerKm) ?? band.perKmMinor}
              />
            ) : null}
          </li>
        ))}
      </ol>
    </>
  );
}

function PriceField({
  field,
  zoneLabel,
  label,
  value,
  inForceMinor,
  onChange,
  disabled,
}: {
  field: ZonePriceField;
  zoneLabel: string;
  label: string;
  value: string;
  inForceMinor: number;
  onChange: (field: ZonePriceField, value: string) => void;
  disabled?: boolean;
}) {
  const id = `zone-price-${field}`;
  const problem = value.trim() === "" ? null : zonePriceProblem(field, value);
  const typed = readPrice(value);
  const changed = typed !== null && typed !== inForceMinor;
  let note: ReactNode = null;
  if (problem) note = problem;
  else if (changed) note = <>In force now: {formatPhp(inForceMinor)}</>;
  return (
    <Field className="w-36 max-w-full" data-invalid={problem ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="relative">
        <span
          aria-hidden
          className="text-body text-text-muted pointer-events-none absolute inset-y-0 left-3 flex items-center"
        >
          ₱
        </span>
        <Input
          id={id}
          inputMode="decimal"
          className="pl-7 tabular-nums"
          // The visible label repeats per zone; the name says which zone.
          aria-label={`${zoneLabel} ${label.toLowerCase()}`}
          aria-describedby={note ? `${id}-note` : undefined}
          aria-invalid={problem ? true : undefined}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(field, event.target.value)}
        />
      </div>
      {note ? (
        <FieldDescription id={`${id}-note`} className="tabular-nums">
          {note}
        </FieldDescription>
      ) : null}
    </Field>
  );
}

/** One Out of Zone delivery priced out, so the per-kilometre rule reads as money. */
function OutOfZoneExample({ baseFeeMinor, perKmMinor }: { baseFeeMinor: number; perKmMinor: number }) {
  return (
    <div
      className="rounded-card bg-surface-variant flex min-w-0 flex-col gap-1 p-3"
      aria-label="Worked example"
    >
      <p
        className="text-body text-text-primary m-0 tabular-nums"
        style={medium}
        aria-live="polite"
        data-testid="out-of-zone-example"
      >
        {outOfZoneExample(baseFeeMinor, perKmMinor, OUT_OF_ZONE_EXAMPLE_METERS)}
      </p>
      <p className="text-caption text-text-muted m-0">
        The whole distance is charged, rounded up to the next kilometre, not only the part past
        15 km. Clients are warned that delivery can cost a lot before they pick an Out of Zone
        shop.
      </p>
    </div>
  );
}

function describeLegacyBand(band: DeliveryFeeBand, previous: number | null): string {
  const from = previous === null ? 0 : previous / 1000;
  if (band.maxDistanceMeters === null) return `Over ${from.toLocaleString("en-PH")} km`;
  const to = band.maxDistanceMeters / 1000;
  if (previous === null) return `Up to ${to.toLocaleString("en-PH")} km`;
  return `${from.toLocaleString("en-PH")}–${to.toLocaleString("en-PH")} km`;
}

/**
 * An API from before the zones holds unnamed bands. They are shown as they
 * price delivery today; nothing here would save, so nothing is offered.
 */
function LegacyBands({ bands }: { bands: DeliveryFeeBand[] }) {
  return (
    <>
      <p className="text-body text-text-secondary m-0 mt-3 max-w-prose" data-testid="zones-unavailable">
        The API behind this portal still prices delivery by its older distance bands, so the
        four zones cannot be set here yet. This turns on once the API is updated.
      </p>
      <div className="mt-4 border-t border-outline-subtle pt-4">
        <h3 className="text-caption text-text-muted m-0">In force right now</h3>
        <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
          {bands.map((band, index) => (
            <li
              key={index}
              className="text-body text-text-secondary flex flex-wrap justify-between gap-x-4"
            >
              <span>
                {describeLegacyBand(band, index === 0 ? null : bands[index - 1].maxDistanceMeters)}
              </span>
              <span className="text-text-primary tabular-nums">
                {band.zone === undefined ? formatPhp(band.feeMinor) : zonePrice(band)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

/** The card while settings load: zone names and ranges are fixed, so only prices wait. */
export function DeliveryZonesSkeleton() {
  return (
    <section className="gg-card p-3">
      <h2 className="text-h3 text-text-primary m-0">Delivery distance zones</h2>
      <p className="text-body text-text-secondary m-0 mt-1 max-w-prose">{DELIVERY_ZONES_COPY}</p>
      <ol className="m-0 mt-3 flex list-none flex-col gap-3 p-0" aria-hidden>
        {DELIVERY_ZONES.map((zone) => (
          <li key={zone.zone} className="rounded-card border border-outline-subtle flex flex-col gap-3 p-3">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
              <div>
                <p className="text-body text-text-primary m-0" style={medium}>
                  {zone.label}
                </p>
                <p className="text-caption text-text-muted m-0">{zoneRange(zone.zone)}</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Skeleton className="h-11 w-36 rounded-field" />
                {zone.maxDistanceMeters === null ? <Skeleton className="h-11 w-36 rounded-field" /> : null}
              </div>
            </div>
            {zone.maxDistanceMeters === null ? <SkeletonLines lines={2} /> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
