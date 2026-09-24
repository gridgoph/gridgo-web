/**
 * The rider delivery share on Operational settings: what part of every
 * delivery fee the rider keeps, with GRIDGO's side and a worked ₱25 delivery
 * moving as the field is typed.
 *
 * Presentational only. `OperationalSettings` owns the draft and saves it with
 * the rest of the page through the settings version handshake; this renders
 * the field, the live split, and the honest unavailable state for an API that
 * predates the split.
 */

import { bpsToPercentInput, formatRatePercent } from "@/components/settings/service-fee";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  platformShareBps,
  RIDER_SHARE_EXAMPLE_FEE_MINOR,
  RIDER_SHARE_INVALID,
  riderShareSummary,
  splitDeliveryFee,
} from "@/lib/delivery-split";
import { formatPhp } from "@/lib/format";

export const RIDER_SHARE_COPY = (
  <>
    The part of every delivery fee the rider keeps. GRIDGO keeps the rest. The client pays
    the same delivery fee either way and never sees the split.
  </>
);

export const RIDER_SHARE_HELP = (
  <>
    0 to 100, up to two decimals. Applies to orders placed from now on &mdash; every order
    already placed keeps the split it was priced at.
  </>
);

const medium = { fontFamily: "var(--font-medium)" } as const;

type Props = {
  /** The field as typed. */
  value: string;
  onChange: (value: string) => void;
  /** Stored rate, or undefined when the API does not hold one. */
  inForceBps: number | undefined;
  /** The draft as basis points, or the stored rate while the draft is unreadable. */
  draftBps: number;
  invalid: boolean;
};

export function RiderDeliveryShare({
  value,
  onChange,
  inForceBps,
  draftBps,
  invalid,
}: Props) {
  return (
    <section className="gg-card p-3" aria-labelledby="rider-share-heading">
      <h2 id="rider-share-heading" className="text-h3 text-text-primary m-0">
        Rider delivery share
      </h2>
      <p className="text-body text-text-secondary m-0 mt-1 max-w-prose">
        {RIDER_SHARE_COPY}
      </p>

      {inForceBps === undefined ? (
        <p
          className="text-body text-text-secondary m-0 mt-3 max-w-prose"
          data-testid="rider-share-unavailable"
        >
          The API behind this portal does not hold a rider share yet, so every delivery
          fee goes to the rider in full. This control turns on once the API is updated.
        </p>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
          <FieldGroup>
            <Field data-invalid={invalid || undefined}>
              <FieldLabel htmlFor="rider-share-rate">Rider keeps</FieldLabel>
              <div className="relative max-w-40">
                <Input
                  id="rider-share-rate"
                  inputMode="decimal"
                  className="pr-9"
                  value={value}
                  aria-invalid={invalid || undefined}
                  aria-describedby="rider-share-help"
                  onChange={(e) => onChange(e.target.value)}
                />
                <span
                  aria-hidden
                  className="text-body text-text-muted pointer-events-none absolute inset-y-0 right-3 flex items-center"
                >
                  %
                </span>
              </div>
              <FieldDescription id="rider-share-help">
                {invalid ? RIDER_SHARE_INVALID : RIDER_SHARE_HELP}
              </FieldDescription>
            </Field>
            <p
              className="text-body text-text-secondary m-0"
              data-testid="rider-share-in-force"
            >
              In force right now:{" "}
              <span className="text-text-primary tabular-nums" style={medium}>
                {riderShareSummary(inForceBps)}
              </span>
              {draftBps !== inForceBps ? (
                <>
                  {" "}
                  &middot; after saving:{" "}
                  <span className="text-text-primary tabular-nums" style={medium}>
                    rider {formatRatePercent(draftBps)}
                  </span>
                </>
              ) : null}
            </p>
          </FieldGroup>

          <SplitExample rateBps={draftBps} />
        </div>
      )}
    </section>
  );
}

/**
 * One ₱25 delivery as a bar cut at the rider's share, then the same cut in
 * pesos. The bar is the whole fee, so both sides always add back to what the
 * client paid.
 */
function SplitExample({ rateBps }: { rateBps: number }) {
  const split = splitDeliveryFee(RIDER_SHARE_EXAMPLE_FEE_MINOR, rateBps);
  const riderWidth = `${rateBps / 100}%`;
  return (
    <div
      className="rounded-card bg-surface-variant flex min-w-0 flex-col gap-3 p-3"
      aria-label="Worked example"
    >
      <p
        className="text-body text-text-primary m-0 tabular-nums"
        style={medium}
        aria-live="polite"
        data-testid="rider-share-split"
      >
        {riderShareSummary(rateBps)}
      </p>
      <div
        className="border-outline flex h-3 w-full overflow-hidden rounded-pill border"
        aria-hidden
      >
        <div className="bg-chart-1 h-full" style={{ width: riderWidth }} />
        <div className="bg-chart-3 h-full flex-1" />
      </div>
      <dl className="m-0 flex flex-col gap-1" data-testid="rider-share-example">
        <ExampleLine
          label={`Rider gets (${formatRatePercent(rateBps)})`}
          swatch="bg-chart-1"
          value={formatPhp(split.riderPayoutMinor)}
        />
        <ExampleLine
          label={`GRIDGO keeps (${formatRatePercent(platformShareBps(rateBps))})`}
          swatch="bg-chart-3"
          value={formatPhp(split.platformDeliveryShareMinor)}
        />
        <div className="border-outline mt-1 flex items-baseline justify-between gap-x-3 border-t pt-2">
          <dt className="text-body text-text-primary m-0" style={medium}>
            Client pays for delivery
          </dt>
          <dd
            className="text-body text-text-primary m-0 tabular-nums whitespace-nowrap"
            style={{ fontFamily: "var(--font-bold)" }}
          >
            {formatPhp(split.deliveryFeeMinor)}
          </dd>
        </div>
      </dl>
      <p className="text-caption text-text-muted m-0">
        A {formatPhp(RIDER_SHARE_EXAMPLE_FEE_MINOR)} delivery. The rider&rsquo;s amount
        rounds to the nearest centavo; GRIDGO keeps the exact remainder.
      </p>
    </div>
  );
}

function ExampleLine({
  label,
  swatch,
  value,
}: {
  label: string;
  swatch: string;
  value: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-x-3">
      <dt className="text-body text-text-secondary m-0 flex min-w-0 items-center gap-2">
        <span
          aria-hidden
          className={`${swatch} inline-block size-2.5 shrink-0 rounded-full`}
        />
        {label}
      </dt>
      <dd
        className="text-body text-text-primary m-0 tabular-nums whitespace-nowrap"
        style={medium}
      >
        {value}
      </dd>
    </div>
  );
}

/** The section while settings load: copy and label in place, figures reserved. */
export function RiderDeliveryShareSkeleton() {
  return (
    <section className="gg-card p-3">
      <h2 className="text-h3 text-text-primary m-0">Rider delivery share</h2>
      <p className="text-body text-text-secondary m-0 mt-1 max-w-prose">
        {RIDER_SHARE_COPY}
      </p>
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
        <div>
          <p className="text-caption text-text-secondary m-0 mb-1">Rider keeps</p>
          <Skeleton className="h-11 max-w-40 rounded-field" aria-hidden />
          <p className="text-caption text-text-muted m-0 mt-2 max-w-prose">
            {RIDER_SHARE_HELP}
          </p>
        </div>
        <Skeleton className="h-36 w-full rounded-card" aria-hidden />
      </div>
    </section>
  );
}

/** The field's text for a stored rate: 8,500 → "85". */
export function riderShareInput(bps: number | undefined): string {
  return bps === undefined ? "" : bpsToPercentInput(bps);
}
