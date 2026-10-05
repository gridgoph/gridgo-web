/**
 * Delivery distance zones on Operational settings: the four fixed zones that
 * give a client their distance word and price every delivery (gridgo-api#121,
 * editable limits gridgo-api#140). Nearby, Away and Long Distance each carry an
 * upper limit in kilometres and one flat fee; Out of Zone starts above the Long
 * Distance limit and carries a base fee plus a fee per kilometre, with a worked
 * example that follows the fields as they are typed.
 *
 * Rows cannot be added, removed or renamed: the API holds the four zones fixed.
 * Limits are checked here as the API checks them (more than 0, at most 100 km,
 * each beyond the one before) and a preview shows the zones the draft would
 * save. A price still at the API's first shipped figure is marked Placeholder.
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
import type { DeliveryFeeBand, DeliveryZoneKey } from "@/lib/api/types";
import {
  DELIVERY_ZONES,
  type DeliveryZoneBand,
  isPlaceholder,
  isZonedTable,
  km,
  LIMIT_FIELD,
  outOfZoneExample,
  outOfZoneExampleMeters,
  previewBands,
  readKm,
  readPrice,
  type ZoneDraft,
  type ZoneField,
  type ZoneLimitField,
  type ZoneLimits,
  zoneLimitProblem,
  zoneLimitsOf,
  zonePrice,
  type ZonePriceField,
  zonePriceProblem,
  zoneRange,
  zoneSummary,
} from "@/lib/delivery-zones";
import { formatPhp } from "@/lib/format";
import { cn } from "@/lib/utils";

const medium = { fontFamily: "var(--font-medium)" } as const;

export const DELIVERY_ZONES_COPY = (
  <>
    Measured from the shop to the client&rsquo;s drop-off. The same four zones set the
    delivery fee and the distance word the client sees. Clients see the word only, except on
    Out of Zone listings, which also show the kilometres. The four zones are fixed; their
    limits and prices change here.
  </>
);

const HELP = (
  <>
    Limits in kilometres, up to {km(100_000)} km, each zone ending beyond the one before;
    a distance exactly on a limit stays in that zone. Prices in pesos, up to two decimals.
    Applies to orders placed from now on &mdash; every order already placed keeps the
    delivery fee it was given.
  </>
);

type Props = {
  /** The table the API holds now. */
  stored: DeliveryFeeBand[];
  /** The limits and prices as typed, or null when the API does not hold the four zones. */
  draft: ZoneDraft | null;
  onChange: (field: ZoneField, value: string) => void;
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
  draft: ZoneDraft;
  onChange: (field: ZoneField, value: string) => void;
  disabled?: boolean;
}) {
  const anyPlaceholder = stored.some(isPlaceholder);
  const inForceLimits = zoneLimitsOf(stored);
  const preview = previewBands(stored, draft);
  // Ranges follow the typed limits while they can be saved, else the ones in force.
  const limits: ZoneLimits = preview ? zoneLimitsOf(preview) : inForceLimits;
  return (
    <>
      {anyPlaceholder ? (
        <p className="text-body text-warning m-0 mt-2 max-w-prose" data-testid="zones-placeholder-note">
          Prices marked Placeholder are the starting figures the API shipped with, not prices
          anyone set. Set the real ones before release.
        </p>
      ) : null}
      <p className="text-caption text-text-muted m-0 mt-2 max-w-prose">{HELP}</p>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
        <ol className="m-0 flex list-none flex-col gap-3 p-0">
          {stored.map((band) => (
            <li
              key={band.zone}
              className="rounded-card border border-outline-subtle flex flex-col gap-3 p-3"
              aria-labelledby={`zone-${band.zone}-name`}
              data-testid={`zone-${band.zone}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
                <div className="flex min-w-0 flex-col items-start gap-1">
                  <div className="flex items-center gap-2">
                    <ZoneSwatch zone={band.zone} />
                    <h3
                      id={`zone-${band.zone}-name`}
                      className="text-body text-text-primary m-0"
                      style={medium}
                    >
                      {band.label}
                    </h3>
                  </div>
                  <p
                    className="text-caption text-text-muted m-0 tabular-nums"
                    data-testid={`zone-${band.zone}-range`}
                  >
                    {zoneRange(band.zone, limits)}
                  </p>
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
                    <>
                      <LimitField
                        field={LIMIT_FIELD[band.zone]}
                        zoneLabel={band.label}
                        draft={draft}
                        inForceMeters={band.maxDistanceMeters}
                        onChange={onChange}
                        disabled={disabled}
                      />
                      <PriceField
                        field={band.zone}
                        zoneLabel={band.label}
                        label="Flat fee"
                        value={draft[band.zone]}
                        inForceMinor={band.feeMinor}
                        onChange={onChange}
                        disabled={disabled}
                      />
                    </>
                  )}
                </div>
              </div>

              {band.zone === "out_of_zone" ? (
                <OutOfZoneExample
                  baseFeeMinor={readPrice(draft.outOfZoneBase) ?? band.baseFeeMinor}
                  perKmMinor={readPrice(draft.outOfZonePerKm) ?? band.perKmMinor}
                  longDistanceLimit={limits[2]}
                />
              ) : null}
            </li>
          ))}
        </ol>

        <ZonePreview stored={stored} preview={preview} />
      </div>
    </>
  );
}

/**
 * The zones the draft would save, as a ruler and as words. The ruler is
 * decoration over the list, which carries every figure; it never shows a
 * table the API would refuse.
 */
function ZonePreview({
  stored,
  preview,
}: {
  stored: DeliveryZoneBand[];
  preview: DeliveryZoneBand[] | null;
}) {
  const changed =
    preview !== null && JSON.stringify(preview) !== JSON.stringify(stored);
  const shown = preview ?? stored;
  return (
    <section
      className="rounded-card bg-surface-variant flex min-w-0 flex-col gap-3 p-3"
      aria-labelledby="zones-preview-heading"
      data-testid="zones-preview"
    >
      <div className="flex flex-col gap-0.5">
        <h3 id="zones-preview-heading" className="text-body text-text-primary m-0" style={medium}>
          {changed ? "Zones after saving" : "Zones in force now"}
        </h3>
        <p className="text-caption text-text-muted m-0" aria-live="polite">
          {preview === null
            ? "Showing the zones in force until every limit can be saved."
            : changed
              ? "What clients are charged on orders placed after you save."
              : "What clients are charged today."}
        </p>
      </div>

      <DistanceRuler limits={zoneLimitsOf(shown)} />

      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {zoneSummary(shown).map((line) => (
          <li
            key={line.zone}
            className="flex items-baseline justify-between gap-x-3"
            data-testid={`zones-preview-${line.zone}`}
          >
            <span className="flex min-w-0 items-baseline gap-2">
              <ZoneSwatch zone={line.zone} className="self-center" />
              <span className="text-body text-text-primary" style={medium}>
                {line.label}
              </span>
              <span className="text-caption text-text-secondary tabular-nums">{line.range}</span>
            </span>
            <span className="text-body text-text-primary tabular-nums text-right" style={medium}>
              {line.price}
            </span>
          </li>
        ))}
      </ul>

      <p className="text-caption text-text-muted m-0 border-t border-outline pt-2">
        Orders already placed keep the delivery fee they were given.
      </p>
    </section>
  );
}

/**
 * Each zone's fill on the ruler and in its swatch: a grey that deepens with
 * distance, and Out of Zone hatched because it has no end.
 */
const ZONE_FILL: Record<DeliveryZoneKey, string> = {
  nearby: "bg-text-primary/15",
  away: "bg-text-primary/35",
  long_distance: "bg-text-primary/60",
  out_of_zone: "",
};
const HATCH = {
  backgroundImage:
    "repeating-linear-gradient(135deg, var(--color-text-primary) 0 1.5px, transparent 1.5px 6px)",
  opacity: 0.45,
} as const;

function ZoneSwatch({ zone, className }: { zone: DeliveryZoneKey; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-3 shrink-0 rounded-[3px]", ZONE_FILL[zone], className)}
      style={zone === "out_of_zone" ? HATCH : undefined}
    />
  );
}

/** Out of Zone's fixed share of the ruler; it is open-ended, so it has no length. */
const OPEN_SHARE = 0.18;
/** The least share a bounded zone takes, so its tick label never collides. */
const MIN_SHARE = 0.12;

/** Each bounded zone's share of the ruler: by length, with a floor, summing to 1 − OPEN_SHARE. */
export function rulerShares(limits: ZoneLimits): [number, number, number] {
  const lengths = [limits[0], limits[1] - limits[0], limits[2] - limits[1]];
  const total = limits[2];
  const raw = lengths.map((length) => length / total);
  const floored = raw.map((share) => Math.max(share, MIN_SHARE));
  const sum = floored.reduce((a, b) => a + b, 0);
  const room = 1 - OPEN_SHARE;
  return floored.map((share) => (share / sum) * room) as [number, number, number];
}

function DistanceRuler({ limits }: { limits: ZoneLimits }) {
  const shares = rulerShares(limits);
  const zones: DeliveryZoneKey[] = ["nearby", "away", "long_distance", "out_of_zone"];
  const widths = [...shares, OPEN_SHARE];
  const ticks = [0, shares[0], shares[0] + shares[1], shares[0] + shares[1] + shares[2]];
  const tickLabels = ["0", km(limits[0]), km(limits[1]), `${km(limits[2])} km`];
  return (
    <div aria-hidden className="flex flex-col gap-1 pr-6" data-testid="zones-ruler">
      <div className="flex h-4 w-full overflow-hidden rounded-[4px] border border-outline bg-surface">
        {zones.map((zone, index) => (
          <span
            key={zone}
            className={cn(
              "h-full motion-safe:transition-[width] motion-safe:duration-300",
              index > 0 && "border-l border-surface",
              ZONE_FILL[zone],
            )}
            style={{
              width: `${widths[index] * 100}%`,
              ...(zone === "out_of_zone"
                ? {
                    ...HATCH,
                    opacity: undefined,
                    maskImage: "linear-gradient(to right, black 40%, transparent)",
                    WebkitMaskImage: "linear-gradient(to right, black 40%, transparent)",
                  }
                : {}),
            }}
          />
        ))}
      </div>
      <div className="relative h-4">
        {ticks.map((at, index) => (
          <span
            key={index}
            className={cn(
              "text-caption text-text-muted absolute top-0 tabular-nums whitespace-nowrap",
              index === 0 ? "" : "-translate-x-1/2",
            )}
            style={{ left: `${at * 100}%` }}
          >
            {tickLabels[index]}
          </span>
        ))}
      </div>
    </div>
  );
}

function LimitField({
  field,
  zoneLabel,
  draft,
  inForceMeters,
  onChange,
  disabled,
}: {
  field: ZoneLimitField;
  zoneLabel: string;
  draft: ZoneDraft;
  inForceMeters: number;
  onChange: (field: ZoneField, value: string) => void;
  disabled?: boolean;
}) {
  const id = `zone-limit-${field}`;
  const value = draft[field];
  const problem = value.trim() === "" ? null : zoneLimitProblem(field, draft);
  const typed = readKm(value);
  const changed = !problem && typed !== null && typed !== inForceMeters;
  let note: ReactNode = null;
  if (problem) note = problem;
  else if (changed) note = <>In force now: {km(inForceMeters)} km</>;
  return (
    <Field className="w-36 max-w-full" data-invalid={problem ? true : undefined}>
      <FieldLabel htmlFor={id}>Up to</FieldLabel>
      <div className="relative">
        <Input
          id={id}
          inputMode="decimal"
          className="pr-10 tabular-nums"
          // The visible label repeats per zone; the name says which zone.
          aria-label={`${zoneLabel} up to (km)`}
          aria-describedby={note ? `${id}-note` : undefined}
          aria-invalid={problem ? true : undefined}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(field, event.target.value)}
        />
        <span
          aria-hidden
          className="text-body text-text-muted pointer-events-none absolute inset-y-0 right-3 flex items-center"
        >
          km
        </span>
      </div>
      {note ? (
        <FieldDescription id={`${id}-note`} className="tabular-nums">
          {note}
        </FieldDescription>
      ) : null}
    </Field>
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
  onChange: (field: ZoneField, value: string) => void;
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
function OutOfZoneExample({
  baseFeeMinor,
  perKmMinor,
  longDistanceLimit,
}: {
  baseFeeMinor: number;
  perKmMinor: number;
  longDistanceLimit: number;
}) {
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
        {outOfZoneExample(baseFeeMinor, perKmMinor, outOfZoneExampleMeters(longDistanceLimit))}
      </p>
      <p className="text-caption text-text-muted m-0">
        The whole distance is charged, rounded up to the next kilometre, not only the part past{" "}
        {km(longDistanceLimit)} km. Clients are warned that delivery can cost a lot before they
        pick an Out of Zone shop.
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

/** The card while settings load: zone names are fixed, so only limits and prices wait. */
export function DeliveryZonesSkeleton() {
  return (
    <section className="gg-card p-3">
      <h2 className="text-h3 text-text-primary m-0">Delivery distance zones</h2>
      <p className="text-body text-text-secondary m-0 mt-1 max-w-prose">{DELIVERY_ZONES_COPY}</p>
      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start" aria-hidden>
        <ol className="m-0 flex list-none flex-col gap-3 p-0">
          {DELIVERY_ZONES.map((zone) => (
            <li key={zone.zone} className="rounded-card border border-outline-subtle flex flex-col gap-3 p-3">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
                <div className="flex flex-col gap-1">
                  <p className="text-body text-text-primary m-0" style={medium}>
                    {zone.label}
                  </p>
                  <Skeleton className="h-4 w-16" />
                </div>
                <div className="flex flex-wrap gap-3">
                  <Skeleton className="h-11 w-36 rounded-field" />
                  <Skeleton className="h-11 w-36 rounded-field" />
                </div>
              </div>
              {zone.defaultMaxDistanceMeters === null ? <SkeletonLines lines={2} /> : null}
            </li>
          ))}
        </ol>
        <Skeleton className="h-56 w-full rounded-card" />
      </div>
    </section>
  );
}
