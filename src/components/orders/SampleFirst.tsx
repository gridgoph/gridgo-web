"use client";

/**
 * Sample First on an order (contract `gridgo-api/docs/SAMPLE_FIRST_API.md`):
 * the "Sample" / "Batch from sample" chip, the link between the two orders,
 * and the client's decision on the sample — the batch standard in a dispute.
 * Words live in `src/lib/sample-first.ts`.
 */

import Link from "next/link";

import { EvidencePlate } from "@/components/orders/EvidencePreview";
import { StatusChip } from "@/components/ui/StatusChip";
import type { Order } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import {
  BATCH_STANDARD_HELP,
  linkedOrderOf,
  presentDecision,
  SAMPLE_TAG_ICON,
  SAMPLE_TAG_LABEL,
  sampleTagOf,
} from "@/lib/sample-first";

type Tree = "ops" | "admin";

type SampleOrder = Pick<
  Order,
  | "id"
  | "orderTags"
  | "batchOrderId"
  | "sampleOrderId"
  | "sampleBatchDraftId"
  | "sampleBatchPricing"
  | "sampleDecision"
>;

const medium = { fontFamily: "var(--font-medium)" } as const;
const linkClass = "text-text-primary underline underline-offset-2";

/** "Sample" or "Batch from sample"; nothing on any other order. Neutral, like Test. */
export function SampleTagChip({ order }: { order: Pick<Order, "orderTags"> }) {
  const kind = sampleTagOf(order);
  if (!kind) return null;
  return <StatusChip tone="neutral" icon={SAMPLE_TAG_ICON[kind]} label={SAMPLE_TAG_LABEL[kind]} />;
}

/** The workspace row's one-line summary. */
export function sampleRowSummary(order: SampleOrder): string {
  const kind = sampleTagOf(order);
  const decision = presentDecision(order.sampleDecision);
  if (kind === "batch") {
    return decision?.decision === "approved"
      ? "Held to the sample the client approved"
      : "Ordered from a sample";
  }
  if (decision) return decision.headline;
  return order.batchOrderId ? "Batch ordered" : "Waiting for the client's decision";
}

export function sampleRowTone(order: SampleOrder): "approved" | "waiting" | "quiet" {
  const decision = presentDecision(order.sampleDecision);
  if (decision?.decision === "approved") return "approved";
  if (decision) return "quiet";
  return "waiting";
}

function pricingLine(order: SampleOrder): string | null {
  const pricing = order.sampleBatchPricing;
  if (!pricing) return null;
  if (pricing.pricing === "held") {
    return pricing.heldUntil
      ? `Ordered at the held price (held until ${formatDateTime(pricing.heldUntil)}).`
      : "Ordered at the held price.";
  }
  if (pricing.pricing === "current") return "Ordered at today's price, not the held one.";
  return null;
}

/**
 * The workspace's Sample row body, and the batch standard in a dispute view:
 * what the client decided, when, the photo they sent, and the links.
 */
export function SampleDecisionPanel({
  order,
  tree,
  showLinks = true,
}: {
  order: SampleOrder;
  tree: Tree;
  /** False inside a dispute view, where the order is already open. */
  showLinks?: boolean;
}) {
  const kind = sampleTagOf(order);
  const decision = presentDecision(order.sampleDecision);
  const linked = linkedOrderOf(order);
  const pricing = kind === "batch" ? pricingLine(order) : null;

  return (
    <div className="flex flex-col gap-3" data-testid="sample-decision">
      {kind === "batch" && decision?.decision === "approved" ? (
        <p className="text-body text-text-secondary m-0 max-w-prose">{BATCH_STANDARD_HELP}</p>
      ) : null}

      {decision ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip tone={decision.tone} icon={decision.icon} label={decision.headline} />
            <span className="text-caption text-text-muted">{formatDateTime(decision.at)}</span>
          </div>
          {decision.note ? (
            <p className="text-body text-text-primary m-0 max-w-prose">
              <span className="text-text-secondary">
                {decision.decision === "rejected" ? "Reason: " : "Client's note: "}
              </span>
              {decision.note}
            </p>
          ) : null}
          {decision.decision === "approved" ? (
            <EvidencePlate
              fileId={decision.photoFileId}
              label="Client's photo of the sample"
              empty="No photo on file"
            />
          ) : null}
        </div>
      ) : (
        <p className="text-body text-text-secondary m-0 max-w-prose">
          The client approves or rejects the sample in the GRIDGO app once it is delivered.
        </p>
      )}

      {pricing ? <p className="text-body text-text-secondary m-0">{pricing}</p> : null}

      {showLinks && (linked || order.sampleBatchDraftId) ? (
        <p className="text-body m-0 flex flex-wrap gap-x-4 gap-y-1">
          {linked ? (
            <Link
              href={`/${tree}/orders/${encodeURIComponent(linked.orderId)}`}
              className={linkClass}
              style={medium}
            >
              {linked.label}
            </Link>
          ) : null}
          {order.sampleBatchDraftId ? (
            <Link
              href={`/${tree}/sample-batches/${encodeURIComponent(order.sampleBatchDraftId)}`}
              className={linkClass}
            >
              See the held batch price
            </Link>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

/**
 * A dispute view's block: shown only on a batch order the client approved a
 * sample for, so whoever decides the dispute sees what was agreed.
 */
export function BatchStandard({ order, tree }: { order: SampleOrder; tree: Tree }) {
  if (sampleTagOf(order) !== "batch" || !order.sampleDecision) return null;
  return (
    <section
      className="rounded-card border border-outline-subtle p-3"
      aria-labelledby={`batch-standard-${order.id}`}
    >
      <h3
        id={`batch-standard-${order.id}`}
        className="text-body text-text-primary m-0 mb-2"
        style={medium}
      >
        The sample this batch is held to
      </h3>
      <SampleDecisionPanel order={order} tree={tree} showLinks={false} />
      {order.sampleOrderId ? (
        <p className="text-caption text-text-muted m-0 mt-2">
          <Link
            href={`/${tree}/orders/${encodeURIComponent(order.sampleOrderId)}`}
            className={linkClass}
          >
            Open the sample order
          </Link>
        </p>
      ) : null}
    </section>
  );
}
