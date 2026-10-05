"use client";

/**
 * The order workspace's two rows for when a shop cannot take, keep, or meet
 * an order: "Shop acceptance" (the one-opening-hour window, every timeout,
 * decline and cancellation with its stage and reason, and the recovery that
 * followed) and "Deadline request" (the shop's one request for a later date
 * and how it ended). Rules and words live in `src/lib/shop-changes.ts`.
 */

import { useEffect, useState } from "react";
import Link from "next/link";

import { opsErrorMessage } from "@/app/ops/_lib/errors";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { StatusChip } from "@/components/ui/StatusChip";
import { Textarea } from "@/components/ui/textarea";
import { resolveRescheduleRequest } from "@/lib/api/client";
import type { Order, RescheduleRequest, ShopFailureEvent } from "@/lib/api/types";
import { formatDateTime, formatPhp } from "@/lib/format";
import {
  RECOVERY_OPERATIONS_REASON,
  RESOLUTION_REASON_MAX,
  acceptanceView,
  canResolveReschedule,
  presentFailureKind,
  presentFailureStage,
  presentRecoveryStatus,
  presentRescheduleStatus,
  recoveryHoldsWork,
  recoveryNeedsOperations,
  rescheduleNeedsOperations,
  rescheduleOperationsReason,
} from "@/lib/shop-changes";

const medium = { fontFamily: "var(--font-medium)" } as const;

type Tree = "ops" | "admin";

/** The shop by name, or "the shop" ("The shop" to start a sentence) until it loads. */
function shopName(
  names: Record<string, string>,
  id: string | null | undefined,
  sentenceStart = false,
): string {
  const name = id ? names[id] : "";
  return name || (sentenceStart ? "The shop" : "the shop");
}

// ---------------------------------------------------------------------------
// Shop acceptance
// ---------------------------------------------------------------------------

export function shopRowVisible(order: Order): boolean {
  return Boolean(order.shopAcceptance || order.shopRecovery);
}

/** The closed row's one line. */
export function shopRowSummary(order: Order, nowMs: number = Date.now()): string {
  const recovery = order.shopRecovery;
  if (recovery && recovery.status !== "accepted") {
    switch (recovery.status) {
      case "ops_review":
        return "Needs Operations: the shop dropped out after a share was paid.";
      case "awaiting_client":
        return recovery.proposal
          ? "The shop could not fulfil it. The client is choosing a replacement or a refund."
          : "The shop could not fulfil it and no replacement was found. The client may ask for a refund.";
      case "refund_requested":
        return "The shop could not fulfil it. The client asked for a full refund.";
      case "refunded":
        return "The shop could not fulfil it. The client was refunded.";
      default:
        break;
    }
  }
  if (order.shopAcceptance) {
    const view = acceptanceView(order.shopAcceptance, formatDateTime, nowMs);
    return recovery?.status === "accepted"
      ? `Moved to a replacement shop. ${view.summary}`
      : view.summary;
  }
  return "Shop acceptance recorded.";
}

export type ShopRowTone = "attention" | "open" | "done" | "quiet";

export function shopRowTone(order: Order, nowMs: number = Date.now()): ShopRowTone {
  if (recoveryNeedsOperations(order.shopRecovery)) return "attention";
  if (recoveryHoldsWork(order.shopRecovery)) return "open";
  const acceptance = order.shopAcceptance;
  if (acceptance?.status === "pending" && acceptanceView(acceptance, formatDateTime, nowMs).open) {
    return "open";
  }
  if (acceptance?.status === "accepted") return "done";
  return "quiet";
}

/** Who the paused work is waiting on. */
function recoveryPauseLine(status: string): string {
  switch (status) {
    case "ops_review":
      return "Work and every shop payout on this order stay paused until Operations settles it.";
    case "refund_requested":
    case "refunded":
      return "Work and every shop payout on this order stay paused while the refund is handled.";
    default:
      return "Work and every shop payout on this order are paused until the client accepts a replacement.";
  }
}

export function ShopAcceptancePanel({
  order,
  failures,
  failuresError,
  names,
  tree,
}: {
  order: Order;
  /** This order's failures, oldest first; null while they could not be read. */
  failures: ShopFailureEvent[] | null;
  failuresError: string | null;
  names: Record<string, string>;
  tree: Tree;
}) {
  const acceptance = order.shopAcceptance;
  const recovery = order.shopRecovery;
  const status = recovery ? presentRecoveryStatus(recovery) : null;
  return (
    <div className="flex flex-col gap-3">
      {acceptance ? (
        <div className="flex flex-col gap-1" data-testid="shop-acceptance">
          <p className="text-body text-text-primary m-0">
            {acceptanceView(acceptance, formatDateTime).summary}
          </p>
          <p className="text-caption text-text-muted m-0">
            Offered to {shopName(names, acceptance.supplierId)}{" "}
            {formatDateTime(acceptance.assignedAt)}. The shop has one hour of its own opening
            time to accept, so the deadline can fall on its next open day.
          </p>
        </div>
      ) : null}

      {recovery && status ? (
        <div
          className="flex flex-col gap-2 rounded-card border p-3"
          style={{
            borderColor:
              recovery.status === "ops_review" ? "var(--color-warning)" : "var(--color-outline)",
          }}
          data-testid="shop-recovery"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-body text-text-primary" style={medium}>
              Recovery
            </span>
            <StatusChip tone={status.tone} icon={status.icon} label={status.label} />
          </div>
          {recovery.status === "ops_review" ? (
            <p className="text-body text-text-secondary m-0 max-w-prose">
              {RECOVERY_OPERATIONS_REASON}
            </p>
          ) : null}
          <dl className="m-0 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-[max-content_minmax(0,1fr)]">
            {recovery.originalSupplierId ? (
              <Fact term="Original shop">
                {shopName(names, recovery.originalSupplierId, true)}
                {recovery.stage ? ` (${presentFailureStage(recovery.stage).toLowerCase()})` : ""}
              </Fact>
            ) : null}
            {recovery.originalSnapshot?.promiseBy ? (
              <Fact term="Original promise">
                {formatDateTime(recovery.originalSnapshot.promiseBy)}
              </Fact>
            ) : null}
            {recovery.proposal ? (
              <>
                <Fact term="Replacement">
                  {shopName(names, recovery.proposal.supplierId, true)}, ready by{" "}
                  {formatDateTime(recovery.proposal.readyBy)}
                </Fact>
                <Fact term="Revised promise">{formatDateTime(recovery.proposal.promiseBy)}</Fact>
                {recovery.status === "awaiting_client" ? (
                  <Fact term="Offer holds until">{formatDateTime(recovery.proposal.expiresAt)}</Fact>
                ) : null}
              </>
            ) : recovery.status === "awaiting_client" ? (
              <Fact term="Replacement">None with the same product and specs</Fact>
            ) : null}
            {recovery.acceptedAt ? (
              <Fact term="Client accepted">{formatDateTime(recovery.acceptedAt)}</Fact>
            ) : null}
          </dl>
          {recovery.refundRequestId ? (
            <p className="text-body m-0">
              <Link
                href={`/${tree}/refunds?order=${encodeURIComponent(order.id)}`}
                className="text-text-primary underline underline-offset-2"
              >
                Open the client&rsquo;s refund request
              </Link>
            </p>
          ) : null}
          {recoveryHoldsWork(recovery) ? (
            <p className="text-caption text-text-muted m-0">{recoveryPauseLine(recovery.status)}</p>
          ) : null}
        </div>
      ) : null}

      {failures?.length ? (
        <div className="flex flex-col gap-1">
          <span className="text-body text-text-primary" style={medium}>
            Shop dropouts on this order
          </span>
          <ol className="m-0 flex list-none flex-col p-0" aria-label="Shop dropouts on this order">
            {failures.map((event) => (
              <li
                key={event.id}
                className="flex flex-col gap-0.5 border-b border-outline-subtle py-2 last:border-b-0"
              >
                <span className="text-body text-text-primary">
                  {presentFailureKind(event.kind)} ({presentFailureStage(event.stage).toLowerCase()})
                </span>
                <span className="text-caption text-text-muted">
                  {shopName(names, event.supplierId, true)} · {formatDateTime(event.at)}
                </span>
                {event.reason ? (
                  <span className="text-body text-text-secondary">&ldquo;{event.reason}&rdquo;</span>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      {failuresError ? (
        <p className="text-caption text-text-muted m-0">{failuresError}</p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Deadline request
// ---------------------------------------------------------------------------

export function deadlineRowSummary(request: RescheduleRequest): string {
  if (rescheduleNeedsOperations(request)) {
    return "Needs Operations: the new date cannot be applied on its own.";
  }
  const proposed = request.proposedReadyBy ? formatDateTime(request.proposedReadyBy) : null;
  switch (request.status) {
    case "pending":
      return proposed
        ? `The shop asked to be ready by ${proposed}. The client has until ${formatDateTime(request.expiresAt)} to answer.`
        : `The shop asked for a later date. The client has until ${formatDateTime(request.expiresAt)} to answer.`;
    case "accepted":
      return proposed ? `New date accepted: ready by ${proposed}.` : "New date accepted.";
    case "expired":
      return "The client did not answer in 24 hours. The original date stands.";
    default:
      return `${presentRescheduleStatus(request).label}.`;
  }
}

export function DeadlinePanel({
  order,
  request,
  names,
  tree,
  onResolved,
}: {
  order: Order;
  request: RescheduleRequest;
  names: Record<string, string>;
  tree: Tree;
  onResolved: () => Promise<void> | void;
}) {
  const [resolving, setResolving] = useState(false);
  const status = presentRescheduleStatus(request);
  const needsOps = rescheduleNeedsOperations(request);
  return (
    <div className="flex flex-col gap-3" data-testid="deadline-request">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-body text-text-primary" style={medium}>
          {shopName(names, request.supplierId, true)} asked {formatDateTime(request.requestedAt)}
        </span>
        <StatusChip tone={status.tone} icon={status.icon} label={status.label} />
      </div>
      {needsOps ? (
        <p className="text-body text-text-secondary m-0 max-w-prose">
          {rescheduleOperationsReason(request, formatPhp)}
        </p>
      ) : null}
      <p className="text-body text-text-secondary m-0">&ldquo;{request.reason}&rdquo;</p>
      <dl className="m-0 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-[max-content_minmax(0,1fr)]">
        <Fact term="Shop ready-by">
          <DateMove from={request.originalReadyBy} to={request.proposedReadyBy} />
        </Fact>
        <Fact term="Client promise">
          <DateMove from={request.originalPromiseBy} to={request.proposedPromiseBy} />
        </Fact>
        {request.status === "pending" ? (
          <Fact term="Client answers by">{formatDateTime(request.expiresAt)}</Fact>
        ) : request.answeredAt ? (
          <Fact term="Client answered">{formatDateTime(request.answeredAt)}</Fact>
        ) : null}
        {request.rematch ? (
          <Fact term="Replacement offered">
            Promise {formatDateTime(request.rematch.promiseBy)}, holds until{" "}
            {formatDateTime(request.rematch.expiresAt)}
          </Fact>
        ) : null}
        {request.appliedDeductionMinor ? (
          <Fact term="Deduction already taken">{formatPhp(request.appliedDeductionMinor)}</Fact>
        ) : null}
        {request.resolutionReason ? (
          <Fact term="Resolved">
            {request.resolvedAt ? `${formatDateTime(request.resolvedAt)}: ` : ""}
            {request.resolutionReason}
          </Fact>
        ) : null}
      </dl>
      {request.refundRequestId ? (
        <p className="text-body m-0">
          <Link
            href={`/${tree}/refunds?order=${encodeURIComponent(order.id)}`}
            className="text-text-primary underline underline-offset-2"
          >
            Open the client&rsquo;s refund request
          </Link>
        </p>
      ) : null}
      {request.workHeld ? (
        <p className="text-caption text-text-muted m-0">
          Work and every shop payout on this order are paused until this request is settled.
        </p>
      ) : null}
      {canResolveReschedule(request) ? (
        <div>
          <Button variant="secondary" onClick={() => setResolving(true)}>
            Record a resolution
          </Button>
        </div>
      ) : null}
      <ResolveDeadlineDialog
        open={resolving}
        orderId={order.id}
        request={request}
        onCancel={() => setResolving(false)}
        onResolved={async () => {
          setResolving(false);
          await onResolved();
        }}
      />
    </div>
  );
}

export function ResolveDeadlineDialog({
  open,
  orderId,
  request,
  onCancel,
  onResolved,
}: {
  open: boolean;
  orderId: string;
  request: Pick<RescheduleRequest, "id">;
  onCancel: () => void;
  onResolved: () => Promise<void> | void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setReason("");
      setError(null);
    }
  }, [open]);
  const text = reason.trim();

  async function resolve() {
    if (!text) {
      setError("Write what was agreed. It is kept in the audit log.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await resolveRescheduleRequest(orderId, { requestId: request.id, reason: text });
      await onResolved();
    } catch (err) {
      setError(opsErrorMessage(err, "The resolution could not be recorded. Refresh and try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (!next && !busy ? onCancel() : undefined)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Record a resolution</DialogTitle>
          <DialogDescription>
            Use this when the client and the shop agreed to continue under the current terms.
            It lifts this request&rsquo;s pause only: dates, money, and any claim or refund stay
            as they are.
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="deadline-resolution">What was agreed</FieldLabel>
          <Textarea
            id="deadline-resolution"
            rows={3}
            maxLength={RESOLUTION_REASON_MAX}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="For example: client and shop agreed to continue under the original deadline."
          />
          <FieldDescription>Kept in the audit log.</FieldDescription>
        </Field>
        {error ? (
          <p className="text-body text-error m-0" role="alert">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="secondary" disabled={busy} onClick={onCancel}>
            Not now
          </Button>
          <Button variant="primary" disabled={busy} onClick={() => void resolve()}>
            {busy ? "Recording…" : "Record resolution"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DateMove({ from, to }: { from?: string | null; to?: string | null }) {
  if (!from && !to) return <>Not recorded</>;
  if (!to) return <>{formatDateTime(from)}</>;
  return (
    <>
      {from ? formatDateTime(from) : "Not recorded"} <span className="text-text-muted">to</span>{" "}
      <span className="text-text-primary" style={medium}>
        {formatDateTime(to)}
      </span>
    </>
  );
}

function Fact({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-caption text-text-muted m-0 sm:pt-0.5">{term}</dt>
      <dd className="text-body text-text-secondary m-0">{children}</dd>
    </>
  );
}
