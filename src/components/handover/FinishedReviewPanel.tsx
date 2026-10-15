"use client";

/**
 * One submission of finished, unpacked work, and GRIDGO's decision on it.
 *
 * Contract: `gridgo-api/docs/SHOP_HANDOVER_API.md`. Mounted on the Finished
 * work desk and inside the order workspace's Handover row, so the review
 * reads the same wherever it is opened.
 *
 * The photos sit beside a job ticket: the lines, quantities and spec the
 * work was printed to, and the client's artwork, because the review is a
 * comparison of the two. The three checks are a review aid that opens
 * Approve; they are never sent. Send back always carries a reason, which the
 * shop reads word for word.
 */

import { useEffect, useId, useState } from "react";

import { WaitMark } from "@/components/orders/FileCheckQueue";
import { OrderArtwork } from "@/components/orders/DesignLinks";
import { ProgressGallery } from "@/components/orders/ProductionProgress";
import { SendBackDialog } from "@/components/listing-reviews/SendBackDialog";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import type { Order, ProductionItem } from "@/lib/api/types";
import { artworkSource } from "@/lib/design-links";
import { formatDateTime } from "@/lib/format";
import { describeQuantity } from "@/lib/quantity";
import {
  FINISHED_REVIEW_CHECKS,
  FINISHED_SEND_BACK_REASONS,
  attemptLabel,
  currentSubmission,
  photoCount,
  sentBackAttempts,
  submissionNumber,
  submissionPhotos,
  submissionWaitSeconds,
  type FinishedReviewCheckId,
} from "@/lib/shop-handover";

type Props = {
  order: Order;
  /** The shop's trading name, when the caller has it. */
  shopName?: string | null;
  busy: boolean;
  error: string | null;
  onApprove: () => void;
  onSendBack: (reason: string) => void;
  /** The reader's clock, so a desk's rows and its panel tick together. */
  now?: number;
  /** Below the order workspace the spec rail already sits beside the panel. */
  ticket?: boolean;
};

export function FinishedReviewPanel({
  order,
  shopName,
  busy,
  error,
  onApprove,
  onSendBack,
  now,
  ticket = true,
}: Props) {
  const submission = currentSubmission(order);
  const [checked, setChecked] = useState<Partial<Record<FinishedReviewCheckId, boolean>>>(
    {},
  );
  const [sendingBack, setSendingBack] = useState(false);
  const prefix = useId();

  // A new submission is a new review: nothing ticked carries over.
  const submissionKey = submission ? `${order.id}:${submission.at}` : order.id;
  useEffect(() => {
    setChecked({});
    setSendingBack(false);
  }, [submissionKey]);

  // A decided submission leaves this panel (the caller stops rendering it),
  // which also closes the send-back dialog; a refusal keeps both open.

  if (!submission) return null;

  const photos = submissionPhotos(submission, order);
  const backs = sentBackAttempts(order);
  const allChecked = FINISHED_REVIEW_CHECKS.every((check) => checked[check.id]);
  const wait = submissionWaitSeconds(order, now);

  return (
    <div className="flex flex-col gap-4" data-testid="finished-review-panel">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span
          className="text-body text-text-primary"
          style={{ fontFamily: "var(--font-medium)" }}
        >
          {attemptLabel(submissionNumber(order))}
        </span>
        <span className="text-body text-text-secondary">
          {shopName ? `${shopName} sent ` : "Sent "}
          {photoCount(photos.length)} {formatDateTime(submission.at)}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-caption text-text-muted">Waiting</span>
          <WaitMark seconds={wait} />
        </span>
      </div>

      <div
        className={
          ticket
            ? "grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]"
            : "flex flex-col gap-4"
        }
      >
        <section
          aria-label="Finished-product photos"
          className="flex min-w-0 flex-col gap-2"
        >
          <ProgressGallery photos={photos} label="Finished photo" large />
          <p className="text-caption text-text-muted m-0">
            Open a photo to see it full size. The client sees these on their order once
            you approve.
          </p>
        </section>
        {ticket ? <JobTicket order={order} /> : null}
      </div>

      {backs.length ? (
        <section aria-label="Earlier send-backs" className="flex flex-col gap-2">
          <h3
            className="text-body text-text-primary m-0"
            style={{ fontFamily: "var(--font-medium)" }}
          >
            {backs.length === 1
              ? "Sent back once before"
              : `Sent back ${backs.length} times before`}
          </h3>
          <ol className="m-0 flex list-none flex-col gap-2 p-0">
            {backs.map((attempt, index) => (
              <li key={attempt.review.at} className="flex flex-col gap-1">
                <span className="text-caption text-text-muted">
                  {attemptLabel(index + 1)}, sent back {formatDateTime(attempt.review.at)}
                </span>
                <blockquote className="border-outline text-body text-text-secondary m-0 border-l-2 pl-3">
                  {attempt.review.note || "No reason recorded."}
                </blockquote>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <FieldSet disabled={busy}>
        <FieldLegend>Before you approve</FieldLegend>
        <FieldDescription>
          Compare the photos with the job ticket. Your ticks open Approve; they are not
          saved.
        </FieldDescription>
        <FieldGroup className="gap-1">
          {FINISHED_REVIEW_CHECKS.map((check) => (
            <Field key={check.id} orientation="horizontal">
              <input
                id={`${prefix}-${check.id}`}
                type="checkbox"
                className="mt-1"
                checked={Boolean(checked[check.id])}
                disabled={busy}
                onChange={(event) =>
                  setChecked((current) => ({
                    ...current,
                    [check.id]: event.target.checked,
                  }))
                }
              />
              <FieldLabel
                htmlFor={`${prefix}-${check.id}`}
                className="min-h-11 flex-col items-start gap-0.5"
              >
                <span>{check.label}</span>
                <span className="text-caption text-text-muted font-normal">
                  {check.hint}
                </span>
              </FieldLabel>
            </Field>
          ))}
        </FieldGroup>
      </FieldSet>

      {error && !sendingBack ? (
        <p className="text-body text-error m-0" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" disabled={busy || !allChecked} onClick={onApprove}>
          {busy && !sendingBack ? "Approving…" : "Approve finished work"}
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => setSendingBack(true)}>
          Send back to the shop
        </Button>
      </div>
      <p className="text-caption text-text-muted m-0 max-w-prose">
        Approving lets the shop call a rider. The shop gets packing materials ready but
        does not pack: the rider checks the unpacked items first. The shop&rsquo;s
        production clock stays paused until you decide.
      </p>

      <SendBackDialog
        open={sendingBack}
        title={`Send back “${order.title || "this order"}”`}
        audience="The shop reads your reason word for word, reprints or retakes the photos, and sends new ones. The job goes back to production."
        presets={FINISHED_SEND_BACK_REASONS}
        busy={busy}
        error={sendingBack ? error : null}
        onCancel={() => setSendingBack(false)}
        onSend={onSendBack}
      />
    </div>
  );
}

/** One line as the shop printed it: name, how much, and the options picked. */
function lineSummary(item: ProductionItem): string {
  const pages = item.measurement?.pages;
  const amount = pages
    ? `${pages.toLocaleString("en-PH")} ${pages === 1 ? "page" : "pages"}`
    : describeQuantity(item.quantity, item.pricingUnit);
  return amount;
}

/**
 * What the work was printed to. A comparison needs both halves in view, so
 * the ticket stays beside the photos on a wide screen and follows them on a
 * narrow one.
 */
export function JobTicket({ order }: { order: Order }) {
  const lines = order.productionItems ?? [];
  const spec = (
    [
      ["Size", order.size],
      ["Material", order.material],
      ["Finish", order.finish],
    ] as const
  ).filter(([, value]) => value);
  return (
    <aside
      aria-label="Job ticket"
      className="border-outline flex min-w-0 flex-col gap-3 self-start rounded-card border border-dashed p-3"
    >
      <h3 className="text-overline text-text-muted m-0">Job ticket</h3>
      {lines.length ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {lines.map((item) => (
            <li key={item.id} className="flex flex-col gap-0.5">
              <span
                className="text-body text-text-primary"
                style={{ fontFamily: "var(--font-medium)" }}
              >
                {item.itemName}
              </span>
              <span className="text-body text-text-secondary tabular-nums">
                {lineSummary(item)}
              </span>
              {item.options?.length ? (
                <span className="text-caption text-text-muted">
                  {item.options
                    .map((option) => `${option.groupName}: ${option.label}`)
                    .join(", ")}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-body text-text-secondary m-0">
          {order.title || "This order"}, {describeQuantity(order.quantity, order.unit)}
        </p>
      )}
      {spec.length ? (
        <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
          {spec.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-caption text-text-muted">{label}</dt>
              <dd className="text-body text-text-secondary m-0">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <div className="flex flex-col gap-2">
        <span className="text-caption text-text-muted">Client&rsquo;s artwork</span>
        <OrderArtwork order={order} />
        {artworkSource(order) === "none" ? (
          <span className="text-body text-text-secondary">None on file.</span>
        ) : null}
      </div>
    </aside>
  );
}
