"use client";

/**
 * Prohibited items at the file check (tracker item 276; contract
 * "Prohibited-item decisions at file check" in gridgo-api ORDER_MATCH_API.md).
 *
 * `ProhibitedItemDialog` is the one decision, opened from the file-check
 * queue and the workspace's Quality check row: hold the order, cancel it with
 * a full refund (the existing cancellation refund; the case carries it from
 * there), or release a hold back to the file check. A test order cancels
 * without money. `ProhibitedItemPanel` is the hold, or the cancellation, as
 * the workspace shows it.
 */

import { useEffect, useRef, useState } from "react";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { StatusChip } from "@/components/ui/StatusChip";
import { Textarea } from "@/components/ui/textarea";
import { fileRefundRequest, newIdempotencyKey, transitionOrder } from "@/lib/api/client";
import type { Order, RefundRequest } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import {
  PROHIBITED_CANCELLED_STATE,
  PROHIBITED_HOLD_STATE,
  PROHIBITED_ITEM,
  PROHIBITED_REASON_MAX,
  prohibitedItemCancelPath,
  prohibitedItemCancelled,
  prohibitedItemHold,
  prohibitedItemRefundId,
  prohibitedReasonProblem,
  type ProhibitedItemAction,
} from "@/lib/prohibited-item";
import { presentRefundStatus, refundIsActive } from "@/lib/refunds";

const medium = { fontFamily: "var(--font-medium)" } as const;

/** `decide` offers hold or cancel; the others open on that one action. */
export type ProhibitedItemMode = "decide" | "cancel" | "release";

type Props = {
  order: Order | null;
  mode: ProhibitedItemMode;
  /**
   * GRIDGO is closed: the API refuses a file-check hold until it opens.
   * Cancelling and releasing stay open.
   */
  holdClosed?: boolean;
  onCancel: () => void;
  onDone: (message: string) => Promise<void> | void;
};

const CHOICES: Record<
  "hold" | "cancel",
  { label: string; detail: (test: boolean) => string }
> = {
  hold: {
    label: "Hold the order",
    detail: () =>
      "The client is told the order is on hold. You can release it to the file check or cancel it later.",
  },
  cancel: {
    label: "Cancel with a full refund",
    detail: (test) =>
      test
        ? "A test order moves no money. It is cancelled straight away."
        : "Opens the client's full refund request. The order is cancelled when the refund is settled, and paid when you record the transfer.",
  },
};

export function ProhibitedItemDialog({
  order,
  mode,
  holdClosed = false,
  onCancel,
  onDone,
}: Props) {
  const [choice, setChoice] = useState<"hold" | "cancel">("hold");
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One key per refund body, reused only to retry that same body.
  const refundKey = useRef<{ signature: string; key: string } | null>(null);
  const id = order?.id;
  useEffect(() => {
    setChoice("hold");
    setReason("");
    setTouched(false);
    setError(null);
    refundKey.current = null;
  }, [id, mode]);
  if (!order) return null;

  const action: ProhibitedItemAction =
    mode === "release" ? "release" : mode === "cancel" ? "cancel" : choice;
  const test = prohibitedItemCancelPath(order) === "test_cancel";
  const problem = prohibitedReasonProblem(action, reason);
  const blocked = action === "hold" && holdClosed;
  const title = order.title || "the order";

  async function submit() {
    if (!order) return;
    setTouched(true);
    if (problem || blocked) return;
    const text = reason.trim();
    setBusy(true);
    setError(null);
    try {
      if (action === "hold") {
        await transitionOrder(order.id, "client_correction", {
          reasonCode: PROHIBITED_ITEM,
          note: text,
        });
        await onDone(`On hold. The client has your reason on "${title}".`);
      } else if (action === "release") {
        await transitionOrder(order.id, "needs_qa", { note: text });
        await onDone(
          `Released. "${title}" is back in the file check and still needs a pass.`,
        );
      } else if (test) {
        await transitionOrder(order.id, "cancelled", {
          reasonCode: PROHIBITED_ITEM,
          reason: text,
        });
        await onDone(`Test order "${title}" cancelled. No money moved.`);
      } else {
        const body = {
          kind: "cancellation" as const,
          reasonCode: PROHIBITED_ITEM,
          reason: text,
        };
        const signature = JSON.stringify(body);
        if (refundKey.current?.signature !== signature) {
          refundKey.current = { signature, key: newIdempotencyKey() };
        }
        await fileRefundRequest(order.id, body, refundKey.current.key);
        refundKey.current = null;
        await onDone(
          `Full refund opened for "${title}". The client adds their receiving QR, then you settle it on the refund case.`,
        );
      }
    } catch (err) {
      setError(
        opsErrorMessage(
          err,
          "That decision did not go through. Refresh the order and try again.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  const heading =
    mode === "release"
      ? "Release the hold"
      : mode === "cancel"
        ? test
          ? "Cancel the test order"
          : "Cancel with a full refund"
        : "Prohibited item";
  const submitLabel = busy
    ? "Sending…"
    : action === "hold"
      ? "Hold the order"
      : action === "release"
        ? "Release to the file check"
        : test
          ? "Cancel the test order"
          : "Open the full refund";

  return (
    <Dialog open onOpenChange={(open) => (!open && !busy ? onCancel() : undefined)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{heading}</DialogTitle>
          <DialogDescription>
            {mode === "release"
              ? `"${title}" goes back to the file check. It still needs a normal pass before any shop sees it.`
              : `"${title}" goes against the Prohibited Items policy. No shop sees it while it is held.`}
          </DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto">
          {mode === "decide" ? (
            <RadioGroup
              aria-label="What happens to the order"
              value={choice}
              onValueChange={(next) => setChoice(next as "hold" | "cancel")}
              disabled={busy}
              className="gap-2"
            >
              {(["hold", "cancel"] as const).map((key) => (
                <label
                  key={key}
                  className="flex min-h-11 cursor-pointer items-start gap-3 rounded-field border border-outline bg-surface px-3 py-2 has-[[data-checked]]:border-accent"
                >
                  <RadioGroupItem
                    value={key}
                    className="mt-1"
                    aria-labelledby={`prohibited-${key}`}
                    aria-describedby={`prohibited-${key}-detail`}
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      id={`prohibited-${key}`}
                      className="block text-body text-text-primary"
                    >
                      {key === "cancel" && test
                        ? "Cancel the test order"
                        : CHOICES[key].label}
                    </span>
                    <span
                      id={`prohibited-${key}-detail`}
                      className="block text-caption text-text-muted"
                    >
                      {CHOICES[key].detail(test)}
                    </span>
                  </span>
                </label>
              ))}
            </RadioGroup>
          ) : mode === "cancel" ? (
            <p className="text-body text-text-secondary m-0">
              {CHOICES.cancel.detail(test)}
            </p>
          ) : null}
          {blocked ? (
            <p
              className="text-body text-text-primary m-0 rounded-card border border-outline bg-surface-variant p-3"
              role="note"
            >
              GRIDGO is closed, so the order cannot be put on hold until it opens. You can
              still cancel it.
            </p>
          ) : null}
          <Field data-invalid={touched && problem ? true : undefined}>
            <FieldLabel htmlFor="prohibited-reason">
              {action === "release"
                ? "Why the hold is lifted"
                : "Why it cannot be printed"}
            </FieldLabel>
            <Textarea
              id="prohibited-reason"
              rows={4}
              maxLength={PROHIBITED_REASON_MAX}
              value={reason}
              aria-invalid={touched && problem ? true : undefined}
              onChange={(event) => setReason(event.target.value)}
            />
            <FieldDescription>
              The client reads exactly what you write. Leave out private complaint
              details.
            </FieldDescription>
          </Field>
        </div>
        {touched && problem ? (
          <p className="text-body text-error m-0" role="alert">
            {problem}
          </p>
        ) : null}
        {error ? (
          <p className="text-body text-error m-0" role="alert">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="secondary" disabled={busy} onClick={onCancel}>
            Keep it as it is
          </Button>
          <Button
            variant="primary"
            disabled={busy || blocked}
            onClick={() => void submit()}
          >
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The hold or the cancellation on the workspace's Quality check row. */
export function ProhibitedItemPanel({
  order,
  refunds,
  names,
  tree,
  busy,
  onRelease,
  onCancelOrder,
}: {
  order: Order;
  refunds: RefundRequest[] | null;
  names: Record<string, string>;
  tree: "ops" | "admin";
  busy: boolean;
  onRelease: () => void;
  onCancelOrder: () => void;
}) {
  const held = prohibitedItemHold(order);
  if (!held && !prohibitedItemCancelled(order)) return null;
  const check = order.fileCheck;
  const state = held ? PROHIBITED_HOLD_STATE : PROHIBITED_CANCELLED_STATE;
  const refundId = prohibitedItemRefundId(order);
  const refund = refundId ? (refunds?.find((row) => row.id === refundId) ?? null) : null;
  // Any open refund (this one or another) must be settled, rejected or
  // withdrawn on its case before the hold can be released.
  const refundOpen = Boolean(order.refundHold || refunds?.some(refundIsActive));
  const reviewer = check?.reviewedBy ? names[check.reviewedBy] : null;
  const test = prohibitedItemCancelPath(order) === "test_cancel";
  return (
    <div
      className="flex flex-col gap-2 rounded-card border border-outline p-3"
      data-testid="prohibited-item-panel"
    >
      <div>
        <StatusChip tone={state.tone} label={state.label} icon={state.icon} />
      </div>
      {check?.reason ? (
        <p className="text-body text-text-primary m-0">&ldquo;{check.reason}&rdquo;</p>
      ) : null}
      {check?.reviewedAt ? (
        <p className="text-caption text-text-muted m-0">
          {held ? "Held" : "Decided"} {formatDateTime(check.reviewedAt)}
          {reviewer ? ` by ${reviewer}` : ""}. The client was told the reason.
        </p>
      ) : null}
      {refundId ? (
        <p className="text-body text-text-secondary m-0 flex flex-wrap items-center gap-2">
          <span style={medium}>Full refund:</span>
          {refund ? (
            <StatusChip {...presentRefundStatus(refund.status)} />
          ) : (
            <span>opened</span>
          )}
          <Link
            href={`/${tree}/refunds/${encodeURIComponent(refundId)}`}
            className="text-body text-text-primary inline-flex min-h-11 items-center underline-offset-2 hover:underline"
          >
            Open the refund case
          </Link>
        </p>
      ) : null}
      {held ? (
        refundOpen ? (
          <p className="text-caption text-text-muted m-0">
            The order is cancelled when the refund is settled. To release the hold
            instead, reject or withdraw the refund on its case first.
          </p>
        ) : (
          <>
            <p className="text-caption text-text-muted m-0">
              No shop sees the order and the client cannot resubmit it while it is held.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" disabled={busy} onClick={onRelease}>
                Release to the file check
              </Button>
              <Button variant="secondary" disabled={busy} onClick={onCancelOrder}>
                {test ? "Cancel the test order" : "Cancel with a full refund"}
              </Button>
            </div>
          </>
        )
      ) : null}
    </div>
  );
}
