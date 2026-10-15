"use client";

import { useEffect, useState } from "react";

import { useCommandKeys } from "@/components/refunds/useCommand";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { requestOrderChange, type OrderChangeInput } from "@/lib/api/client";
import type { Order } from "@/lib/api/types";
import { formatPhp } from "@/lib/format";
import {
  CHANGE_REASON_MAX,
  PROPOSED_CHANGE_MAX,
  canRequestChange,
  changeReasonError,
  itemInstructions,
  parseExtra,
  proposedChangeError,
  shopChangeErrorMessage,
} from "@/lib/order-changes";

/** What follows a request, in the order it can happen. */
const WHAT_HAPPENS = [
  "The client approves or declines. Until they approve, make the job as ordered.",
  "With an extra, the client pays for the change after approving. GRIDGO adds its own fee on top for them; it never comes out of your extra.",
  "Start the change only once the job says it is agreed. If the client declines, make the job as ordered.",
  "Your extra is paid with your last payout part.",
] as const;

type Props = {
  job: Order;
  open: boolean;
  onClose: () => void;
  /** After GRIDGO took the request (or refused it because the job moved on). */
  onSent: (message: string) => Promise<void> | void;
};

/**
 * Asking the client to approve a change, when the special instructions cost
 * more than the price on the board (gridgo-api `docs/ORDER_CHANGES_API.md`).
 *
 * The client reads all three things the shop writes: what it will do
 * differently, the extra for its own shop, and why. The extra is the shop's
 * own figure; GRIDGO's fee sits on top for the client and is not shown here.
 * A change of ready time stays on the deadline request, so the shop has one
 * way to ask for more time.
 */
export function RequestChangeDialog({ job, open, onClose, onSent }: Props) {
  const items = job.productionItems ?? [];
  const notes = itemInstructions(job);
  // An order from before line items has none to name; GRIDGO then takes no line.
  const lined = items.length > 0;
  const firstNoted = notes.find((note) => note.text && note.lineItemId)?.lineItemId ?? items[0]?.id ?? null;

  const [lineItemId, setLineItemId] = useState<string | null>(null);
  const [proposed, setProposed] = useState("");
  const [extra, setExtra] = useState("");
  const [reason, setReason] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One key per body: resending the same request replays GRIDGO's first answer.
  const keys = useCommandKeys();

  useEffect(() => {
    if (!open) return;
    setLineItemId(null);
    setProposed("");
    setExtra("");
    setReason("");
    setShowErrors(false);
    setConfirming(false);
    setError(null);
  }, [open]);

  const chosenLine = lineItemId ?? firstNoted;
  const chosenNote = notes.find((note) => note.lineItemId === chosenLine)?.text ?? notes[0]?.text ?? null;
  const money = parseExtra(extra);
  const proposedProblem = proposedChangeError(proposed);
  const reasonProblem = changeReasonError(reason);
  const extraProblem = money.ok ? null : money.error;
  const allowed = canRequestChange(job);
  const extraMinor = money.ok ? money.minor : 0;

  function review() {
    if (proposedProblem || reasonProblem || extraProblem) {
      setShowErrors(true);
      return;
    }
    setError(null);
    setConfirming(true);
  }

  async function send() {
    const body: OrderChangeInput = {
      ...(lined && chosenLine ? { lineItemId: chosenLine } : {}),
      reason: reason.trim(),
      proposedSpec: proposed.trim(),
      extraPrincipalMinor: extraMinor,
    };
    setBusy(true);
    setError(null);
    try {
      await requestOrderChange(job.id, body, keys.keyFor(body));
      keys.reset();
      await onSent(
        extraMinor
          ? `Change request sent for ${formatPhp(extraMinor)} extra. The client approves or declines it.`
          : "Change request sent. The client approves or declines it.",
      );
    } catch (err) {
      setConfirming(false);
      setError(
        shopChangeErrorMessage(err) ?? "Could not send this request. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{confirming ? "Send this change request?" : "Request a change"}</DialogTitle>
          <DialogDescription>
            {confirming
              ? extraMinor
                ? `Ask the client to approve this change for ${formatPhp(extraMinor)} extra? Nothing changes until they approve. Keep making the job as ordered until the job says it is agreed.`
                : "Ask the client to approve this change at no extra cost? Nothing changes until they approve. Keep making the job as ordered until the job says it is agreed."
              : "When the special instructions cost more or need a different spec, ask the client to approve the change. Nothing changes until they do."}
          </DialogDescription>
        </DialogHeader>

        {!allowed ? (
          <div className="flex flex-col gap-1">
            <p className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-medium)" }}>
              This job cannot take a request now
            </p>
            <p className="text-body text-text-secondary m-0">
              A change can be asked for before the job is marked ready, one at a time, and not
              while a deadline request is waiting. Where the job stands is on the job.
            </p>
          </div>
        ) : confirming ? (
          <dl className="bg-surface-variant border-outline m-0 flex flex-col gap-2 rounded-field border p-3">
            <div className="flex flex-col gap-0.5">
              <dt className="text-caption text-text-muted">Your change</dt>
              <dd className="text-body text-text-primary m-0 break-words">{proposed.trim()}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-caption text-text-muted">Extra for your shop</dt>
              <dd className="text-body text-text-primary m-0 tabular-nums">
                {extraMinor ? formatPhp(extraMinor) : "No extra"}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-caption text-text-muted">Why</dt>
              <dd className="text-body text-text-secondary m-0 break-words">{reason.trim()}</dd>
            </div>
          </dl>
        ) : (
          <FieldGroup>
            {lined && items.length > 1 ? (
              <Field>
                <FieldLabel id="change-item-label">Which item?</FieldLabel>
                <RadioGroup
                  aria-labelledby="change-item-label"
                  value={chosenLine ?? ""}
                  onValueChange={(value) => setLineItemId(String(value))}
                  className="gap-1"
                >
                  {items.map((item, index) => {
                    const note = notes.find((entry) => entry.lineItemId === item.id)?.text;
                    const label = `Item ${index + 1} · ${item.itemName}`;
                    return (
                      <label key={item.id} className="flex min-h-11 cursor-pointer items-start gap-3 py-1">
                        <RadioGroupItem value={item.id} className="mt-1" />
                        <span className="min-w-0">
                          <span className="text-body text-text-primary block">{label}</span>
                          <span className="text-caption text-text-muted block break-words">
                            {note || "No special instructions"}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </RadioGroup>
              </Field>
            ) : chosenNote ? (
              <div className="flex gap-3">
                <span className="w-1 shrink-0 rounded-pill bg-warning" aria-hidden />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-caption text-text-muted">The client asked</span>
                  <p className="text-body-lg text-text-primary m-0 break-words">{chosenNote}</p>
                </div>
              </div>
            ) : null}

            <Field data-invalid={showErrors && proposedProblem ? true : undefined}>
              <FieldLabel htmlFor="change-proposed">What will you do differently?</FieldLabel>
              <Textarea
                id="change-proposed"
                rows={3}
                maxLength={PROPOSED_CHANGE_MAX}
                value={proposed}
                aria-invalid={showErrors && proposedProblem ? true : undefined}
                placeholder="Staple on the left with two staples; same paper and print settings."
                onChange={(event) => setProposed(event.target.value)}
              />
              <FieldDescription>
                The client reads this as the change they approve. Say it as you will make it.{" "}
                {[...proposed].length}/{PROPOSED_CHANGE_MAX}
              </FieldDescription>
              {showErrors && proposedProblem ? <FieldError>{proposedProblem}</FieldError> : null}
            </Field>

            <Field data-invalid={showErrors && extraProblem ? true : undefined}>
              <FieldLabel htmlFor="change-extra">Extra for your shop (₱)</FieldLabel>
              <Input
                id="change-extra"
                inputMode="decimal"
                autoComplete="off"
                value={extra}
                aria-invalid={showErrors && extraProblem ? true : undefined}
                placeholder="0.00"
                onChange={(event) => setExtra(event.target.value)}
                className="max-w-48 tabular-nums"
              />
              <FieldDescription>
                Your own price for the extra work. Leave it empty if the change costs nothing more.
              </FieldDescription>
              {showErrors && extraProblem ? <FieldError>{extraProblem}</FieldError> : null}
            </Field>

            <Field data-invalid={showErrors && reasonProblem ? true : undefined}>
              <FieldLabel htmlFor="change-reason">Why does the job need this change?</FieldLabel>
              <Textarea
                id="change-reason"
                rows={3}
                maxLength={CHANGE_REASON_MAX}
                value={reason}
                aria-invalid={showErrors && reasonProblem ? true : undefined}
                placeholder="Stapling on the left needs a second pass through our finisher."
                onChange={(event) => setReason(event.target.value)}
              />
              <FieldDescription>The client reads this when they decide.</FieldDescription>
              {showErrors && reasonProblem ? <FieldError>{reasonProblem}</FieldError> : null}
            </Field>

            <div className="border-outline-subtle flex flex-col gap-1.5 rounded-field border p-3">
              <p className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-medium)" }}>
                What happens next
              </p>
              <ul className="m-0 flex list-disc flex-col gap-1 pl-5">
                {WHAT_HAPPENS.map((line) => (
                  <li key={line} className="text-body text-text-secondary">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          </FieldGroup>
        )}

        {error ? (
          <p className="text-body text-error m-0" role="alert">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          {!allowed ? (
            <Button variant="secondary" onClick={onClose}>
              Back to the job
            </Button>
          ) : confirming ? (
            <>
              <Button variant="secondary" disabled={busy} onClick={() => setConfirming(false)}>
                Not yet
              </Button>
              <Button variant="primary" disabled={busy} onClick={() => void send()}>
                {busy ? "Sending…" : "Send request"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={onClose}>
                Not now
              </Button>
              <Button variant="primary" onClick={review}>
                Review request
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
