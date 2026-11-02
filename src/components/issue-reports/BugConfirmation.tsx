"use client";

import { BadgeCheck, Gift } from "lucide-react";

import {
  confirmBugState,
  confirmedLine,
  reporterLine,
  voucherPreview,
  voucherResult,
} from "@/components/issue-reports/bug-confirmation";
import { reportReference } from "@/components/issue-reports/triage";
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
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/StatusChip";
import type { IssueReport } from "@/lib/api/types";

const HEADING_FONT = { fontFamily: "var(--font-medium)" } as const;

/**
 * Who sent the report and the Confirm real bug action, or, once confirmed,
 * what happened to the reporter's voucher and who confirmed it. Shows nothing
 * against an API that predates the bug-report voucher.
 */
export function BugConfirmation({
  report,
  viewerId,
  disabled,
  onConfirm,
}: {
  report: IssueReport;
  /** The signed-in staff member, so their own report is refused before the press. */
  viewerId: string | null | undefined;
  disabled: boolean;
  onConfirm: () => void;
}) {
  const state = confirmBugState(report, viewerId);
  if (state.kind === "unsupported") return null;

  return (
    <section aria-labelledby="bug-confirmation-heading" className="flex flex-col gap-3">
      <h3
        id="bug-confirmation-heading"
        tabIndex={-1}
        className="text-body text-text-primary m-0 outline-offset-4"
        style={HEADING_FONT}
      >
        Real bug
      </h3>
      <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
        <dt className="text-caption text-text-muted">Sent by</dt>
        <dd className="text-caption text-text-primary m-0 break-words">{reporterLine(report.reporter)}</dd>
      </dl>

      {state.kind === "confirmed" ? (
        <ConfirmedResult report={report} />
      ) : (
        <div className="flex flex-col gap-1.5">
          <Button
            className="self-start"
            disabled={disabled || state.kind === "blocked"}
            aria-describedby="confirm-bug-help"
            onClick={onConfirm}
          >
            <BadgeCheck aria-hidden />
            Confirm real bug…
          </Button>
          <p id="confirm-bug-help" className="text-caption text-text-muted m-0">
            {state.kind === "blocked" ? state.reason : voucherPreview(report).text}
          </p>
        </div>
      )}
    </section>
  );
}

function ConfirmedResult({ report }: { report: IssueReport }) {
  const confirmation = report.bugConfirmation;
  if (!confirmation) return null;
  const result = voucherResult(confirmation);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip tone="success" icon="circle-check" label="Confirmed real bug" />
        <StatusChip tone={result.tone} icon={result.icon} label={result.label} />
      </div>
      {result.detail ? <p className="text-caption text-text-secondary m-0">{result.detail}</p> : null}
      <p className="text-caption text-text-muted m-0">{confirmedLine(confirmation)}</p>
    </div>
  );
}

/**
 * The one check before an irreversible confirmation: whether the reporter
 * gets the voucher, and that the report becomes Valid and a Bug.
 */
export function ConfirmBugDialog({
  report,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  report: IssueReport;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const preview = voucherPreview(report);
  return (
    <AlertDialog open onOpenChange={(next) => !next && !busy && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirm report {reportReference(report.id)} is a real bug?</AlertDialogTitle>
          <AlertDialogDescription>
            It is marked Valid and sorted as a Bug. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <p
          className="m-0 flex items-start gap-2 rounded-[var(--radius-field)] border border-outline p-3"
          data-testid="confirm-bug-voucher"
        >
          <Gift
            size={18}
            aria-hidden
            className="mt-0.5 shrink-0"
            style={{ color: preview.rewarded ? "var(--color-success)" : "var(--color-text-secondary)" }}
          />
          <span className="text-body text-text-primary">{preview.text}</span>
        </p>
        {error ? (
          <p role="alert" className="text-caption text-error m-0">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel variant="secondary" disabled={busy} onClick={onCancel}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction variant="primary" disabled={busy} onClick={onConfirm}>
            {busy ? "Confirming…" : "Confirm real bug"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
