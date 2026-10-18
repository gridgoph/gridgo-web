"use client";

/**
 * The two short confirmations on a problem report: Super Admin approving
 * GRIDGO's share of a pending finding, and resolving the case. Each sends the
 * case's version, so a stale screen is refused and re-read, never applied.
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
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import type { FaultDecision, Issue } from "@/lib/api/types";
import { formatPhp } from "@/lib/format";
import { DECISION_TEXT_MAX, faultLabel, remedyLabel } from "@/lib/problem-reports";

export function ApproveDecisionDialog({
  open,
  decision,
  busy,
  error,
  onCancel,
  onApprove,
}: {
  open: boolean;
  decision: FaultDecision;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onApprove: (reason: string) => void;
}) {
  const id = useId();
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (open) setReason("");
  }, [open]);
  const note = reason.trim();
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && !busy && onCancel()}>
      <AlertDialogContent className="data-[size=default]:sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>
            Approve GRIDGO paying {formatPhp(decision.gridgoCostMinor ?? 0)}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {faultLabel(decision.fault)} at fault, {remedyLabel(decision.remedy).toLowerCase()},
            total cost {formatPhp(decision.costMinor ?? 0)}. Approving lets Operations carry
            out this remedy; it pays nobody by itself. A later revision needs a new approval.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Field data-invalid={error ? true : undefined}>
          <FieldLabel htmlFor={`${id}-reason`}>Why you approve it</FieldLabel>
          <Textarea
            id={`${id}-reason`}
            rows={3}
            maxLength={DECISION_TEXT_MAX}
            value={reason}
            disabled={busy}
            placeholder="e.g. The advance is approved; recover it from the shop's next earned payouts."
            onChange={(event) => setReason(event.target.value)}
          />
          <FieldDescription>Kept on the case and in the audit log with your name.</FieldDescription>
        </Field>
        {error ? (
          <p className="text-body text-error m-0" role="alert">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel variant="secondary" disabled={busy} onClick={onCancel}>
            Not yet
          </AlertDialogCancel>
          <AlertDialogAction
            variant="primary"
            disabled={busy || !note}
            onClick={() => onApprove(note)}
          >
            {busy ? "Approving…" : "Approve"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function ResolveProblemDialog({
  open,
  issue,
  busy,
  error,
  onCancel,
  onResolve,
}: {
  open: boolean;
  issue: Issue;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onResolve: (resolution: string) => void;
}) {
  const id = useId();
  const [resolution, setResolution] = useState("");
  useEffect(() => {
    if (open) setResolution("");
  }, [open]);
  const text = resolution.trim();
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && !busy && onCancel()}>
      <AlertDialogContent className="data-[size=default]:sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Resolve this problem report?</AlertDialogTitle>
          <AlertDialogDescription>
            {issue.faultDecision
              ? "Record what was done. The case closes and its finding stays as recorded."
              : "No finding was recorded. Record what was done; the case closes without one."}{" "}
            This does not release the payout hold or pay a refund.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Field data-invalid={error ? true : undefined}>
          <FieldLabel htmlFor={`${id}-resolution`}>What was done</FieldLabel>
          <Textarea
            id={`${id}-resolution`}
            rows={3}
            maxLength={DECISION_TEXT_MAX}
            value={resolution}
            disabled={busy}
            placeholder="e.g. Reprinted at the shop's cost and delivered."
            onChange={(event) => setResolution(event.target.value)}
          />
        </Field>
        {error ? (
          <p className="text-body text-error m-0" role="alert">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel variant="secondary" disabled={busy} onClick={onCancel}>
            Keep it open
          </AlertDialogCancel>
          <AlertDialogAction
            variant="primary"
            disabled={busy || !text}
            onClick={() => onResolve(text)}
          >
            {busy ? "Resolving…" : "Resolve"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
