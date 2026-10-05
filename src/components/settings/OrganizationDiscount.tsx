/**
 * The organization discount on Operational settings (gridgo-client#166).
 *
 * An approved organization gets this rate off the shop price of every order,
 * funded entirely out of GRIDGO's service fee: the shop's price, the delivery
 * fee and the rider's share never move. So the discount can never be more
 * than the fee — the API refuses it both ways (`400
 * organization_discount_exceeds_service_fee`), and this card says so before
 * anyone presses Save.
 *
 * Presentational only. `OperationalSettings` owns the draft and saves it with
 * the rest of the page through the settings version handshake.
 */

import { formatRatePercent } from "@/components/settings/service-fee";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { formatPhp } from "@/lib/format";
import { asDeduction, organizationExample } from "@/lib/organization-discount";

export const ORGANIZATION_DISCOUNT_COPY = (
  <>
    Approved organizations get this off the shop price of every order. It comes out of
    GRIDGO&rsquo;s service fee and nothing else: the shop, the delivery fee and the
    rider&rsquo;s share stay exactly as they are. The organization sees the discount in
    pesos at checkout, never the fee.
  </>
);

export const ORGANIZATION_DISCOUNT_HELP = (
  <>
    0 to 100, up to two decimals, and never more than the service fee. Applies to orders
    placed from now on &mdash; every order already placed keeps the discount it was given.
  </>
);

export const ORGANIZATION_DISCOUNT_INVALID =
  "The discount is a percentage from 0 to 100 with up to two decimals, like 5 or 2.5.";

const medium = { fontFamily: "var(--font-medium)" } as const;

type Props = {
  value: string;
  onChange: (value: string) => void;
  /** Stored rate, or undefined when the API does not hold one. */
  inForceBps: number | undefined;
  /** The draft as basis points, or the stored rate while the draft is unreadable. */
  draftBps: number;
  /** The service fee as it will be saved, which the discount must fit inside. */
  feeBps: number;
  invalid: boolean;
  /** Why this discount and fee cannot be saved together; null when they can. */
  problem: string | null;
};

export function OrganizationDiscount({
  value,
  onChange,
  inForceBps,
  draftBps,
  feeBps,
  invalid,
  problem,
}: Props) {
  return (
    <section className="gg-card p-3" aria-labelledby="organization-discount-heading">
      <h2 id="organization-discount-heading" className="text-h3 text-text-primary m-0">
        Organization discount
      </h2>
      <p className="text-body text-text-secondary m-0 mt-1 max-w-prose">
        {ORGANIZATION_DISCOUNT_COPY}
      </p>

      {inForceBps === undefined ? (
        <p
          className="text-body text-text-secondary m-0 mt-3 max-w-prose"
          data-testid="organization-discount-unavailable"
        >
          The API behind this portal does not hold an organization discount yet. This
          control turns on once the API is updated.
        </p>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
          <FieldGroup>
            <Field data-invalid={invalid || problem ? true : undefined}>
              <FieldLabel htmlFor="organization-discount-rate">
                Discount on the shop price
              </FieldLabel>
              <div className="relative max-w-40">
                <Input
                  id="organization-discount-rate"
                  inputMode="decimal"
                  className="pr-9"
                  value={value}
                  aria-invalid={invalid || problem ? true : undefined}
                  aria-describedby="organization-discount-help"
                  onChange={(event) => onChange(event.target.value)}
                />
                <span
                  aria-hidden
                  className="text-body text-text-muted pointer-events-none absolute inset-y-0 right-3 flex items-center"
                >
                  %
                </span>
              </div>
              <FieldDescription id="organization-discount-help">
                {invalid ? ORGANIZATION_DISCOUNT_INVALID : ORGANIZATION_DISCOUNT_HELP}
              </FieldDescription>
            </Field>
            {problem ? (
              <p
                className="text-body text-error m-0"
                role="alert"
                data-testid="organization-discount-problem"
              >
                {problem}
              </p>
            ) : null}
            <p
              className="text-body text-text-secondary m-0"
              data-testid="organization-discount-in-force"
            >
              In force right now:{" "}
              <span className="text-text-primary tabular-nums" style={medium}>
                {formatRatePercent(inForceBps)}
              </span>
              {draftBps !== inForceBps ? (
                <>
                  {" "}
                  &middot; after saving:{" "}
                  <span className="text-text-primary tabular-nums" style={medium}>
                    {formatRatePercent(draftBps)}
                  </span>
                </>
              ) : null}
            </p>
          </FieldGroup>

          <DiscountExample feeBps={feeBps} discountBps={draftBps} />
        </div>
      )}
    </section>
  );
}

/**
 * The service fee as a bar, with the discount carved out of it. The bar is
 * the whole fee, so the discount visibly lives inside it; a discount larger
 * than the fee spills past the end and the card says why it cannot be saved.
 */
function DiscountExample({
  feeBps,
  discountBps,
}: {
  feeBps: number;
  discountBps: number;
}) {
  const example = organizationExample(feeBps, discountBps);
  const fits = discountBps <= feeBps;
  const discountWidth =
    feeBps > 0 ? `${Math.min(100, (discountBps / feeBps) * 100)}%` : "100%";
  return (
    <div
      className="rounded-card bg-surface-variant flex min-w-0 flex-col gap-3 p-3"
      aria-label="Worked example"
    >
      <p className="text-caption text-text-muted m-0">
        A {formatPhp(example.shopPriceMinor)} job with{" "}
        {formatPhp(example.deliveryFeeMinor)} delivery, at a {formatRatePercent(feeBps)}{" "}
        fee and a {formatRatePercent(discountBps)} discount
      </p>
      <div
        className="border-outline flex h-3 w-full overflow-hidden rounded-pill border"
        aria-hidden
        data-testid="organization-discount-bar"
      >
        <div
          className="h-full"
          style={{
            width: discountWidth,
            background: fits ? "var(--color-chart-3)" : "var(--color-error)",
          }}
        />
        <div className="bg-chart-2 h-full flex-1" />
      </div>
      <dl className="m-0 flex flex-col gap-1" data-testid="organization-discount-example">
        <Line label="Shop is paid" value={formatPhp(example.shopPriceMinor)} />
        <Line
          label={`Service fee (${formatRatePercent(feeBps)})`}
          value={formatPhp(example.grossFeeMinor)}
        />
        <Line
          label={`Organization discount (${formatRatePercent(discountBps)})`}
          value={asDeduction(formatPhp(example.discountMinor))}
          swatch={fits ? "var(--color-chart-3)" : "var(--color-error)"}
        />
        <Line
          label="GRIDGO keeps"
          value={fits ? formatPhp(example.netFeeMinor) : "Below zero"}
          swatch="var(--color-chart-2)"
          strong
        />
      </dl>
      <p
        className="border-outline text-body text-text-primary m-0 border-t pt-2"
        style={medium}
      >
        What the organization sees
      </p>
      <dl
        className="m-0 flex flex-col gap-1"
        data-testid="organization-discount-checkout"
      >
        <Line label="Printing" value={formatPhp(example.printingMinor)} />
        <Line
          label="Organization discount"
          value={asDeduction(formatPhp(example.discountMinor))}
        />
        <Line label="Delivery" value={formatPhp(example.deliveryFeeMinor)} />
        <Line label="Total" value={formatPhp(example.totalMinor)} strong />
      </dl>
      <p className="text-caption text-text-muted m-0">
        The fee stays inside Printing, so the organization never sees it. Each shop group
        of a multi-shop order is discounted on its own shop price.
      </p>
    </div>
  );
}

function Line({
  label,
  value,
  swatch,
  strong = false,
}: {
  label: string;
  value: string;
  swatch?: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-x-3">
      <dt
        className={`text-body m-0 flex min-w-0 items-center gap-2 ${strong ? "text-text-primary" : "text-text-secondary"}`}
        style={strong ? medium : undefined}
      >
        {swatch ? (
          <span
            aria-hidden
            className="inline-block size-2.5 shrink-0 rounded-full"
            style={{ background: swatch }}
          />
        ) : null}
        {label}
      </dt>
      <dd
        className="text-body text-text-primary m-0 tabular-nums whitespace-nowrap"
        style={strong ? { fontFamily: "var(--font-bold)" } : medium}
      >
        {value}
      </dd>
    </div>
  );
}
