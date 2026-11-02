"use client";

/**
 * One sampled batch, shared by Operations (`/ops/sample-batches/:id`) and
 * Super Admin (`/admin/sample-batches/:id`). Contract:
 * `gridgo-api/docs/SAMPLE_FIRST_API.md`, "Operations and dashboard".
 *
 * Read-only. Where the sample and the batch stand, how long the price is
 * held, the shop's price list copied when the sample was ordered (every rule
 * the batch is priced from), the client's decision, and links to both orders.
 */

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { opsErrorMessage } from "@/app/ops/_lib/errors";
import { EvidencePlate } from "@/components/orders/EvidencePreview";
import { useAccountNames } from "@/components/sample-batches/useAccountNames";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SkeletonCards } from "@/components/ui/loading";
import { StatusChip } from "@/components/ui/StatusChip";
import { isApiError } from "@/lib/api/client";
import { getSampleBatch } from "@/lib/api/sample-batches";
import type { SampleBatch, SampleBatchPrice, SampleHeldPricing } from "@/lib/api/types";
import { formatDateTime, formatPhp } from "@/lib/format";
import { useLegalInboxReload } from "@/lib/live/useLegalInboxReload";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { useSerializedLoad } from "@/lib/live/useSerializedLoad";
import { presentOrderState } from "@/lib/order-state";
import {
  decisionMethodLabel,
  heldPriceBlockerLine,
  heldUnitLabel,
  holdClock,
  holdDaysWord,
  optionEffect,
  presentSampleBatchStatus,
  priceLine,
  rejectionNextLabel,
  speedTierLine,
} from "@/lib/sample-first";

type Tree = "ops" | "admin";

const medium = { fontFamily: "var(--font-medium)" } as const;
const linkClass = "text-text-primary underline underline-offset-2";

export function SampleBatchDetail({ tree }: { tree: Tree }) {
  const params = useParams<{ id: string }>();
  const id = params?.id ? decodeURIComponent(String(params.id)) : "";

  const [row, setRow] = useState<SampleBatch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState<number | null>(null);
  const [quantityText, setQuantityText] = useState("");

  const load = useSerializedLoad(
    useCallback(async () => {
      if (!id) return;
      setLoading(true);
      try {
        setRow(await getSampleBatch(id, quantity));
        setError(null);
      } catch (err) {
        setError(
          isApiError(err) && err.status === 404
            ? "This sample batch no longer exists."
            : opsErrorMessage(err, "Could not load this sample batch. Retry in a moment."),
        );
      } finally {
        setLoading(false);
      }
    }, [id, quantity]),
  );

  useLegalInboxReload("sample_", load);
  useLiveReload("orders", load);

  useEffect(() => {
    void load();
  }, [load]);

  const names = useAccountNames([row?.clientId, row?.supplierId]);

  if (error && !row) {
    return (
      <ErrorState
        body={error}
        action={
          <Button variant="secondary" onClick={() => void load()}>
            Retry
          </Button>
        }
      />
    );
  }

  if (!row) {
    return <SkeletonCards count={3} lines={3} label="Loading sample batch" className="gap-3" />;
  }

  const status = presentSampleBatchStatus(row.status);
  const clock = holdClock(row);
  const title = row.itemName || "Sampled listing";
  const unit = row.heldPricing
    ? heldUnitLabel(row.heldPricing.pricingUnit, row.heldPricing.packageQty)
    : "each";
  const typed = quantityText.trim();
  const typedQuantity = /^\d+$/.test(typed) && Number(typed) >= 1 ? Number(typed) : null;

  function preview(event: FormEvent) {
    event.preventDefault();
    if (typed === "") setQuantity(null);
    else if (typedQuantity) setQuantity(typedQuantity);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/${tree}/sample-batches`}
            className="text-caption text-text-muted inline-flex min-h-11 items-center gap-1 hover:text-text-secondary"
          >
            <ChevronLeft size={14} strokeWidth={2} aria-hidden />
            Back to sample batches
          </Link>
          <h1 className="text-h2 text-text-primary m-0 break-words">{title}</h1>
          <p className="text-body text-text-secondary m-0 mt-1">
            {[
              (row.clientId && names[row.clientId]) || "Client",
              (row.supplierId && names[row.supplierId]) || "Shop",
              `batch of ${row.batch.quantity.toLocaleString("en-PH")}`,
            ].join(" · ")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip tone={status.tone} label={status.label} icon={status.icon} />
          <Button variant="secondary" disabled={loading} onClick={() => void load()}>
            Refresh
          </Button>
        </div>
      </div>

      {error ? (
        <p className="text-body text-error m-0" role="alert">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-4">
          <Card id="sample-orders" title="Orders">
            <Facts>
              <Fact label="Sample">
                <Link
                  href={`/${tree}/orders/${encodeURIComponent(row.sampleOrderId)}`}
                  className={linkClass}
                  style={medium}
                >
                  Open the sample order
                </Link>
                {row.sampleOrderState ? (
                  <span className="text-text-secondary">
                    {" "}
                    · {presentOrderState(row.sampleOrderState).label}
                  </span>
                ) : null}
              </Fact>
              <Fact label="Batch">
                {row.batchOrderId ? (
                  <Link
                    href={`/${tree}/orders/${encodeURIComponent(row.batchOrderId)}`}
                    className={linkClass}
                    style={medium}
                  >
                    Open the batch order
                  </Link>
                ) : (
                  <span className="text-text-secondary">Not ordered yet</span>
                )}
              </Fact>
              {row.previousDraftId ? (
                <Fact label="Replaces">
                  <Link
                    href={`/${tree}/sample-batches/${encodeURIComponent(row.previousDraftId)}`}
                    className={linkClass}
                  >
                    The earlier sample the client rejected
                  </Link>
                </Fact>
              ) : null}
              {row.replacedByDraftId ? (
                <Fact label="Replaced by">
                  <Link
                    href={`/${tree}/sample-batches/${encodeURIComponent(row.replacedByDraftId)}`}
                    className={linkClass}
                  >
                    The new sample the client ordered
                  </Link>
                </Fact>
              ) : null}
            </Facts>
          </Card>

          <Card id="sample-decision" title="Client's decision">
            <Decision row={row} />
          </Card>

          <Card id="sample-batch" title="Intended batch">
            <Facts>
              <Fact label="Quantity">{row.batch.quantity.toLocaleString("en-PH")}</Fact>
              <Fact label="Instructions">
                {row.batch.specialInstructions?.trim() || (
                  <span className="text-text-secondary">None</span>
                )}
              </Fact>
            </Facts>
            <p className="text-caption text-text-muted m-0 mt-3">
              The batch keeps the sample&rsquo;s specs and artwork. Only quantity, drop-off and
              deadline can change.
            </p>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Card id="sample-hold" title="Price hold">
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip tone={clock.tone} label={clock.label} icon={clock.icon} />
            </div>
            <p className="text-body text-text-secondary m-0 mt-2">{clock.line}</p>
            <Facts className="mt-3">
              <Fact label="Hold length">{holdDaysWord(row.holdDays)}</Fact>
              <Fact label="Delivered">
                {row.sampleDeliveredAt ? formatDateTime(row.sampleDeliveredAt) : "Not yet"}
              </Fact>
              <Fact label="Held until">
                {row.heldUntil ? formatDateTime(row.heldUntil) : "Starts on delivery"}
              </Fact>
            </Facts>
          </Card>

          <Card id="sample-prices" title="Batch price">
            <Facts>
              <PriceFact label="Held price" price={row.heldPrice} unit={unit} />
              <PriceFact label="Today's price" price={row.currentPrice} unit={unit} />
            </Facts>
            <p className="text-caption text-text-muted m-0 mt-2">
              Client prices before GRIDGO&rsquo;s service fee and delivery. The checkout quote
              decides what the client pays.
            </p>
            {heldPriceBlockerLine(row.heldPriceBlocker) && row.status !== "ordered" ? (
              <p className="text-body text-text-secondary m-0 mt-2">
                {heldPriceBlockerLine(row.heldPriceBlocker)}
              </p>
            ) : null}
            <form className="mt-3" onSubmit={preview}>
              <Field data-invalid={(typed !== "" && !typedQuantity) || undefined}>
                <FieldLabel htmlFor="sample-preview-quantity">Try another quantity</FieldLabel>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    id="sample-preview-quantity"
                    inputMode="numeric"
                    className="max-w-40"
                    value={quantityText}
                    placeholder={String(row.batch.quantity)}
                    aria-invalid={(typed !== "" && !typedQuantity) || undefined}
                    aria-describedby="sample-preview-help"
                    onChange={(event) => setQuantityText(event.target.value)}
                  />
                  <Button
                    type="submit"
                    variant="secondary"
                    disabled={loading || (typed !== "" && !typedQuantity)}
                  >
                    Show prices
                  </Button>
                </div>
                <FieldDescription id="sample-preview-help">
                  A whole number. Leave it blank for the batch quantity.
                </FieldDescription>
              </Field>
            </form>
          </Card>

          {row.heldPricing ? <HeldPriceList pricing={row.heldPricing} /> : null}
        </div>
      </div>
    </div>
  );
}

function Card({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="gg-card p-3" aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`} className="text-h3 text-text-primary m-0 mb-3">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Facts({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <dl className={`m-0 grid grid-cols-1 gap-3 sm:grid-cols-2 ${className ?? ""}`}>{children}</dl>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-text-muted">{label}</dt>
      <dd className="text-body text-text-primary m-0 break-words">{children}</dd>
    </div>
  );
}

function PriceFact({
  label,
  price,
  unit,
}: {
  label: string;
  price: SampleBatchPrice | null;
  unit: string;
}) {
  return (
    <Fact label={label}>
      <span className="tabular-nums" style={medium}>
        {priceLine(price)}
      </span>
      {price?.lineSubtotalMinor != null ? (
        <span className="text-caption text-text-muted block">
          Shop&rsquo;s price {formatPhp(price.lineSubtotalMinor)}
          {price.unitRateMinor != null ? ` (${formatPhp(price.unitRateMinor)} ${unit})` : ""}
          {price.volumeTierApplied
            ? `, bulk price from ${price.volumeTierApplied.minQuantity.toLocaleString("en-PH")}`
            : ""}
        </span>
      ) : null}
    </Fact>
  );
}

function Decision({ row }: { row: SampleBatch }) {
  if (row.approval) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip
            tone="success"
            icon="circle-check"
            label={decisionMethodLabel(row.approval.method)}
          />
          <span className="text-caption text-text-muted">{formatDateTime(row.approval.at)}</span>
        </div>
        {row.approval.note?.trim() ? (
          <p className="text-body text-text-primary m-0">
            <span className="text-text-secondary">Client&rsquo;s note: </span>
            {row.approval.note.trim()}
          </p>
        ) : null}
        <EvidencePlate
          fileId={row.approval.samplePhotoFileId}
          label="Client's photo of the sample"
          empty="No photo on file"
        />
        <p className="text-caption text-text-muted m-0">
          This approval is the standard the batch is judged against in a dispute.
        </p>
      </div>
    );
  }
  if (row.rejection) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip
            tone="warning"
            icon="circle-x"
            label={rejectionNextLabel(row.rejection.next)}
          />
          <span className="text-caption text-text-muted">{formatDateTime(row.rejection.at)}</span>
        </div>
        <p className="text-body text-text-primary m-0">
          <span className="text-text-secondary">Reason: </span>
          {row.rejection.reason}
        </p>
      </div>
    );
  }
  if (row.status === "cancelled") {
    return (
      <p className="text-body text-text-secondary m-0">
        The client cancelled this batch before deciding on the sample.
      </p>
    );
  }
  return (
    <p className="text-body text-text-secondary m-0">
      No decision yet. The client approves or rejects the sample in the GRIDGO app once it is
      delivered.
    </p>
  );
}

function HeldPriceList({ pricing }: { pricing: SampleHeldPricing }) {
  const unit = heldUnitLabel(pricing.pricingUnit, pricing.packageQty);
  const minimum = pricing.minimumMeasurement;
  const minimumSize = [
    minimum?.width != null ? `width ${minimum.width / 1000}` : null,
    minimum?.height != null ? `height ${minimum.height / 1000}` : null,
    minimum?.length != null ? `length ${minimum.length / 1000}` : null,
  ].filter(Boolean);
  return (
    <Card id="sample-held-pricing" title="Held price list">
      <p className="text-caption text-text-muted m-0 mb-3">
        The shop&rsquo;s own prices, copied {formatDateTime(pricing.capturedAt)} when the
        sample was ordered. Later listing changes do not touch them. Only GRIDGO staff see this.
      </p>
      <Facts>
        <Fact label="Base price">
          <span className="tabular-nums">
            {formatPhp(pricing.basePriceMinor)} {unit}
          </span>
        </Fact>
        <Fact label="Minimum order">
          {pricing.minimumOrderQuantity
            ? pricing.minimumOrderQuantity.toLocaleString("en-PH")
            : "None"}
        </Fact>
        {minimumSize.length ? (
          <Fact label="Smallest size charged">
            {minimumSize.join(", ")} (in the listing&rsquo;s unit)
          </Fact>
        ) : null}
        <Fact label="Speed">{speedTierLine(pricing.speedTier)}</Fact>
      </Facts>

      <h3 className="text-body text-text-primary m-0 mt-4 mb-2" style={medium}>
        Chosen options
      </h3>
      {pricing.options.length ? (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {pricing.options.map((option) => (
            <li key={option.optionId} className="text-body flex flex-wrap justify-between gap-x-3">
              <span className="text-text-primary">
                {option.groupName ? `${option.groupName}: ` : ""}
                {option.label}
              </span>
              <span className="text-text-secondary tabular-nums">{optionEffect(option)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-body text-text-secondary m-0">No options change the price.</p>
      )}

      <h3 className="text-body text-text-primary m-0 mt-4 mb-2" style={medium}>
        Bulk prices
      </h3>
      {pricing.volumeTiers.length ? (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {pricing.volumeTiers.map((tier) => (
            <li
              key={tier.minQuantity}
              className="text-body flex flex-wrap justify-between gap-x-3"
            >
              <span className="text-text-primary">
                From {tier.minQuantity.toLocaleString("en-PH")}
              </span>
              <span className="text-text-secondary tabular-nums">
                {formatPhp(tier.unitPriceMinor)} {unit}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-body text-text-secondary m-0">No bulk prices.</p>
      )}
    </Card>
  );
}
