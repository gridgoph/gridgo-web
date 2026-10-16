"use client";

/**
 * Operations or Super Admin forcing a job out of production on the shop's
 * behalf. Contract "Forced steps and audit" in
 * `gridgo-api/docs/SHOP_HANDOVER_API.md`: for both handover flows the API
 * takes the step only with a reason code
 * (`400 production_override_reason_code_required`) and a note of at most
 * 2,000 characters (`400 production_override_reason_required` /
 * `production_override_reason_too_long`). It records the step on the order
 * with the checks it went past, audits it as `order.production_override`,
 * and every app then shows "Forced by GRIDGO".
 *
 * It never invents evidence: no photo, review, count or signature appears
 * because of it. The dialog names what will be skipped, from the readiness
 * the API sent with the order.
 *
 * An AlertDialog rather than a Dialog: the move offers the job to riders at
 * once and cannot be taken back from here.
 */

import { useEffect, useId, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import {
  FORCED_BY_GRIDGO,
  FORCED_NOTE_MAX,
  forcedReasonHint,
  forcedReasonLabel,
  skippedCheckLabel,
} from "@/lib/shop-handover";

export type ForcedStepInput = { reasonCode: string; reason: string };

export function CorrectProductionDialog({
  open,
  ridersPack,
  photoMissing,
  reasonCodes,
  skippedChecks,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  /** The rider-packs handover: the shop does not pack, so the copy says so. */
  ridersPack: boolean;
  /** The API's word on the gallery; the copy changes with it (older flow). */
  photoMissing: boolean;
  /** The codes this order's API accepts. */
  reasonCodes: readonly string[];
  /** Readiness codes the force would go past, as of this read. */
  skippedChecks: readonly string[];
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (input: ForcedStepInput) => void;
}) {
  const [reasonCode, setReasonCode] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const prefix = useId();
  useEffect(() => {
    if (open) {
      setReasonCode(null);
      setReason("");
    }
  }, [open]);
  const note = reason.trim();
  const ready = reasonCode !== null && note.length > 0 && note.length <= FORCED_NOTE_MAX;
  const left = FORCED_NOTE_MAX - reason.length;

  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && !busy && onCancel()}>
      <AlertDialogContent className="data-[size=default]:sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {ridersPack ? "Force this job to ready for rider pickup?" : "Move this job to ready for dispatch?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {ridersPack
              ? "Riders are offered the job straight away. The rider still checks the unpacked items, packs them in front of the shop and takes the shop's signature."
              : photoMissing
                ? "The shop has not sent a progress photo. Riders are offered the job straight away, and the client's order keeps saying it is waiting for a progress photo."
                : "The shop has sent a progress photo but has not marked the job ready for dispatch. Riders are offered it straight away."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {skippedChecks.length ? (
          <div className="border-outline bg-surface-variant rounded-card flex flex-col gap-1 border p-3">
            <p className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-medium)" }}>
              This skips
            </p>
            <ul className="text-body text-text-secondary m-0 flex list-disc flex-col gap-0.5 pl-5">
              {skippedChecks.map((code) => (
                <li key={code}>{skippedCheckLabel(code)}</li>
              ))}
            </ul>
            <p className="text-caption text-text-muted m-0">
              Nothing is filled in for them. The order shows &ldquo;{FORCED_BY_GRIDGO}&rdquo; in
              every app.
            </p>
          </div>
        ) : (
          <p className="text-caption text-text-muted m-0">
            The order shows &ldquo;{FORCED_BY_GRIDGO}&rdquo; in every app.
          </p>
        )}

        <FieldGroup>
          <FieldSet disabled={busy}>
            <FieldLegend variant="label">Why you are forcing it</FieldLegend>
            <div className="flex flex-col gap-1">
              {reasonCodes.map((code) => {
                const id = `${prefix}-${code}`;
                const hint = forcedReasonHint(code);
                return (
                  <Field key={code} orientation="horizontal">
                    <input
                      id={id}
                      type="radio"
                      name={`${prefix}-reason`}
                      className="mt-1"
                      checked={reasonCode === code}
                      disabled={busy}
                      onChange={() => setReasonCode(code)}
                    />
                    <FieldLabel htmlFor={id} className="min-h-11 flex-col items-start gap-0.5">
                      <span>{forcedReasonLabel(code)}</span>
                      {hint ? (
                        <span className="text-caption text-text-muted font-normal">{hint}</span>
                      ) : null}
                    </FieldLabel>
                  </Field>
                );
              })}
            </div>
          </FieldSet>
          <Field data-invalid={error ? true : undefined}>
            <FieldLabel htmlFor={`${prefix}-note`}>What happened</FieldLabel>
            <Textarea
              id={`${prefix}-note`}
              rows={3}
              maxLength={FORCED_NOTE_MAX}
              value={reason}
              disabled={busy}
              aria-invalid={error ? true : undefined}
              placeholder={
                ridersPack
                  ? "e.g. Checked the finished prints at the counter; the shop's uploads kept failing."
                  : "e.g. Saw the finished job at the counter; the shop's phone cannot upload."
              }
              onChange={(event) => setReason(event.target.value)}
            />
            <FieldDescription>
              {left <= 200
                ? `${left} characters left.`
                : "Kept in the audit log with your name. The shop and rider see it; the client sees only the tag."}
            </FieldDescription>
          </Field>
        </FieldGroup>
        {error ? (
          <p className="text-body text-error m-0" role="alert">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel variant="secondary" disabled={busy} onClick={onCancel}>
            Keep it with the shop
          </AlertDialogCancel>
          <AlertDialogAction
            variant="primary"
            disabled={busy || !ready}
            onClick={() => reasonCode && onConfirm({ reasonCode, reason: note })}
          >
            {busy ? "Forcing…" : ridersPack ? "Force to ready for pickup" : "Move to ready for dispatch"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
