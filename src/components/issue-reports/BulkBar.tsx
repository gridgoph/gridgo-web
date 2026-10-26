"use client";

import { ChevronDown, Sparkles, X } from "lucide-react";
import { useId, useRef, useState } from "react";

import {
  acceptBreakdown,
  actionTitle,
  outcomeSummary,
  planBulk,
  runBulk,
  type BulkAction,
  type BulkFailure,
  type BulkOutcome,
  type BulkStep,
  type BulkWrite,
} from "@/components/issue-reports/bulk";
import { reportReference, resolveReportReference, STATUS_CHOICES, VALIDITY } from "@/components/issue-reports/triage";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import type { IssueReport, IssueReportStatus } from "@/lib/api/types";

/** An action picked from the bar, before any typed input it needs. */
type Draft =
  | { kind: "accept" }
  | { kind: "verdict"; validity: "valid" | "spam" | "unreviewed" }
  | { kind: "duplicate" }
  | { kind: "status"; status: IssueReportStatus };

type Run = { action: BulkAction; total: number; done: number; failed: number };
type Result = { action: BulkAction; outcome: BulkOutcome; skipped: number };

type Props = {
  /** The selected reports, in list order. */
  selected: IssueReport[];
  /** Every report the desk has loaded, for "duplicate of" by reference. */
  reports: readonly IssueReport[];
  disabled: boolean;
  write: (id: string, write: BulkWrite) => Promise<IssueReport>;
  onSaved: (updated: IssueReport) => void;
  onRunningChange: (running: boolean) => void;
  /** After a run: the desk reloads and keeps only the failed reports selected. */
  onFinished: (outcome: BulkOutcome) => void;
  onClear: () => void;
};

function reasonsLine(skipped: { reason: string }[]): string {
  const tally = new Map<string, number>();
  for (const entry of skipped) tally.set(entry.reason, (tally.get(entry.reason) ?? 0) + 1);
  return [...tally.entries()].map(([reason, count]) => `${count} ${reason.toLowerCase()}`).join(", ");
}

/**
 * The bar under the list while reports are selected: accept their
 * suggestions, give them one verdict, or move them to one status. Each
 * action is confirmed first, then saved one report at a time with progress;
 * the result names every report that failed and offers to retry them.
 */
export function BulkBar({ selected, reports, disabled, write, onSaved, onRunningChange, onFinished, onClear }: Props) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [reference, setReference] = useState("");
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const [publishedIn, setPublishedIn] = useState("");
  const [run, setRun] = useState<Run | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [stopping, setStopping] = useState(false);
  // The confirm for finishing the reports a stopped run never reached.
  const [resumeOpen, setResumeOpen] = useState(false);
  const stopRef = useRef(false);
  const id = useId();

  if (!selected.length && !run && !result) return null;

  const busy = disabled || run !== null;

  function open(next: Draft) {
    setResult(null);
    setReference("");
    setReferenceError(null);
    setPublishedIn("");
    setDraft(next);
  }

  // The action the dialog would run, once any input it needs is in.
  let action: BulkAction | null = null;
  let duplicateTarget: string | null = null;
  if (draft?.kind === "duplicate") {
    const check = reference.trim() ? resolveReportReference(reference, reports, "") : null;
    duplicateTarget = check?.ok ? check.id : null;
    if (duplicateTarget) action = { kind: "duplicate", of: duplicateTarget };
  } else if (draft?.kind === "status") {
    action = { kind: "status", status: draft.status, publishedIn: publishedIn.trim() || null };
  } else if (draft) {
    action = draft;
  }
  const plan = action ? planBulk(action, selected) : null;

  function start(next: BulkAction, targets: IssueReport[]) {
    const { steps, skipped } = planBulk(next, targets);
    setDraft(null);
    if (!steps.length) {
      setResult({ action: next, outcome: { saved: [], failed: [], untouched: [] }, skipped: skipped.length });
      return;
    }
    void execute(next, steps, skipped.length);
  }

  /**
   * Saves exactly these writes. A retry passes the failed writes as they
   * were confirmed, never the selection, which may have changed since.
   */
  async function execute(next: BulkAction, steps: BulkStep[], skipped: number) {
    setResult(null);
    setResumeOpen(false);
    stopRef.current = false;
    setStopping(false);
    setRun({ action: next, total: steps.length, done: 0, failed: 0 });
    onRunningChange(true);
    try {
      const outcome = await runBulk(steps, write, {
        stopped: () => stopRef.current,
        onProgress: (done, step) => {
          if (step.updated) onSaved(step.updated);
          setRun((current) =>
            current ? { ...current, done, failed: current.failed + (step.error ? 1 : 0) } : current,
          );
        },
      });
      setResult({ action: next, outcome, skipped });
      onFinished(outcome);
    } finally {
      setRun(null);
      onRunningChange(false);
    }
  }

  function confirm() {
    if (draft?.kind === "duplicate" && !duplicateTarget) {
      const check = resolveReportReference(reference, reports, "");
      setReferenceError(check.ok ? null : check.error);
      return;
    }
    if (action) start(action, selected);
  }

  const count = selected.length;
  const failures: BulkFailure[] = result?.outcome.failed ?? [];
  const untouched: BulkStep[] = result?.outcome.untouched ?? [];

  return (
    <div className="flex shrink-0 flex-col gap-2 border-t border-outline bg-surface p-3">
      {run ? (
        <div role="status" aria-live="polite" className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-caption text-text-primary">
              {actionTitle(run.action, run.total)}: saving {Math.min(run.done + 1, run.total)} of {run.total}
              {run.failed ? `, ${run.failed} failed so far` : ""}…
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={stopping}
              onClick={() => {
                stopRef.current = true;
                setStopping(true);
              }}
            >
              {stopping ? "Stopping…" : "Stop"}
            </Button>
          </div>
          <Progress value={run.total ? Math.round((run.done / run.total) * 100) : 0} aria-label="Saving reports" />
        </div>
      ) : result ? (
        <div
          role={failures.length || result.outcome.untouched.length ? "alert" : "status"}
          className="flex flex-col gap-1.5"
        >
          <div className="flex items-start justify-between gap-2">
            <p className={`text-caption m-0 pt-3 ${failures.length ? "text-error" : "text-text-primary"}`}>
              {actionTitle(result.action, result.outcome.saved.length + failures.length + result.outcome.untouched.length)}
              : {outcomeSummary(result.outcome, result.skipped)}
            </p>
            <Button variant="ghost" size="icon-sm" aria-label="Dismiss result" onClick={() => setResult(null)}>
              <X aria-hidden />
            </Button>
          </div>
          {failures.length ? (
            <ul aria-label="Reports not saved" className="m-0 flex max-h-28 list-none flex-col gap-0.5 overflow-y-auto p-0">
              {failures.map((failure) => (
                <li key={failure.report.id} className="text-caption text-text-secondary">
                  Report {reportReference(failure.report.id)}: {failure.message}
                </li>
              ))}
            </ul>
          ) : null}
          {failures.length || untouched.length ? (
            <div className="flex flex-wrap gap-2">
              {failures.length ? (
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => void execute(result.action, failures.map(({ report, write }) => ({ report, write })), 0)}
                >
                  Retry {failures.length === 1 ? "the failed report" : `the ${failures.length} failed`}
                </Button>
              ) : null}
              {untouched.length ? (
                <Button size="sm" disabled={busy} onClick={() => setResumeOpen(true)}>
                  Finish the {untouched.length === 1 ? "1 not tried" : `${untouched.length} not tried`}…
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {count && !run ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-caption text-text-primary tabular-nums mr-auto" aria-live="polite">
            {count} selected
          </span>
          <Button size="sm" disabled={busy} onClick={() => open({ kind: "accept" })}>
            <Sparkles aria-hidden />
            Accept suggestion
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger disabled={busy} render={<Button size="sm" />}>
              Mark as
              <ChevronDown aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-52">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Verdict for {count === 1 ? "1 report" : `${count} reports`}</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => open({ kind: "verdict", validity: "valid" })}>
                  {VALIDITY.valid.label}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => open({ kind: "verdict", validity: "spam" })}>
                  {VALIDITY.spam.label}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => open({ kind: "duplicate" })}>Duplicate of…</DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => open({ kind: "verdict", validity: "unreviewed" })}>
                Back to Needs review
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger disabled={busy} render={<Button size="sm" />}>
              Set status
              <ChevronDown aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-52">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Status for {count === 1 ? "1 report" : `${count} reports`}</DropdownMenuLabel>
                {STATUS_CHOICES.map((choice) => (
                  <DropdownMenuItem key={choice.value} onClick={() => open({ kind: "status", status: choice.value })}>
                    {choice.value === "published" ? `${choice.label}…` : choice.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="icon-sm" aria-label="Clear selection" disabled={busy} onClick={onClear}>
            <X aria-hidden />
          </Button>
        </div>
      ) : null}

      <AlertDialog open={resumeOpen && untouched.length > 0} onOpenChange={setResumeOpen}>
        <AlertDialogContent className="data-[size=default]:sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>{result ? `${actionTitle(result.action, untouched.length)}?` : ""}</AlertDialogTitle>
            <AlertDialogDescription>
              The run stopped before {untouched.length === 1 ? "this report" : "these reports"}. Each gets the change you
              confirmed then.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul aria-label="Reports not tried" className="m-0 flex max-h-40 list-none flex-col gap-0.5 overflow-y-auto p-0">
            {untouched.map((step) => (
              <li key={step.report.id} className="text-caption text-text-secondary">
                Report {reportReference(step.report.id)}
              </li>
            ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel variant="secondary">Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="primary"
              disabled={busy}
              onClick={() => result && void execute(result.action, untouched, 0)}
            >
              {result ? actionTitle(result.action, untouched.length) : ""}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={draft !== null} onOpenChange={(next) => !next && setDraft(null)}>
        <AlertDialogContent className="data-[size=default]:sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {draft?.kind === "duplicate"
                ? `Mark ${count === 1 ? "1 report" : `${count} reports`} as duplicates`
                : action
                  ? `${actionTitle(action, plan?.steps.length ?? 0)}?`
                  : ""}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {draft?.kind === "accept"
                ? "Each report takes its own suggested verdict, category and labels. You can change any of them afterwards."
                : draft?.kind === "status"
                  ? "Only the status changes. Verdicts, labels and priority stay as they are."
                  : draft?.kind === "duplicate"
                    ? "Type the reference of the earlier report they all repeat."
                    : "Only the verdict changes. Status, labels and priority stay as they are."}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {draft?.kind === "duplicate" ? (
            <Field data-invalid={referenceError ? true : undefined} className="gap-1">
              <FieldLabel htmlFor={`${id}-repeats`}>
                <span className="text-caption text-text-secondary">They repeat report</span>
              </FieldLabel>
              <Input
                id={`${id}-repeats`}
                value={reference}
                onChange={(event) => {
                  setReference(event.target.value);
                  setReferenceError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    confirm();
                  }
                }}
                placeholder="1A2B3C4D"
                maxLength={40}
                autoComplete="off"
                aria-invalid={referenceError ? true : undefined}
                aria-describedby={`${id}-repeats-help`}
              />
              {referenceError ? (
                <FieldError id={`${id}-repeats-help`}>
                  <span className="text-caption text-error">{referenceError}</span>
                </FieldError>
              ) : (
                <FieldDescription id={`${id}-repeats-help`}>
                  <span className="text-caption text-text-muted">
                    The 8-character reference from the list, or the report&apos;s full id.
                  </span>
                </FieldDescription>
              )}
            </Field>
          ) : null}

          {draft?.kind === "status" && draft.status === "published" ? (
            <Field className="gap-1">
              <FieldLabel htmlFor={`${id}-published-in`}>
                <span className="text-caption text-text-secondary">Reports page date (optional)</span>
              </FieldLabel>
              <Input
                id={`${id}-published-in`}
                value={publishedIn}
                onChange={(event) => setPublishedIn(event.target.value)}
                placeholder="For example 09-25-2026"
                maxLength={200}
              />
            </Field>
          ) : null}

          {plan ? (
            <p className="text-caption text-text-secondary m-0">
              {plan.steps.length === 0
                ? "Nothing to change: every selected report is already like that."
                : draft?.kind === "accept"
                  ? `They become ${acceptBreakdown(plan.steps)}.`
                  : `${plan.steps.length === 1 ? "1 report changes" : `${plan.steps.length} reports change`}, one at a time.`}
              {plan.skipped.length ? ` Left as they are: ${reasonsLine(plan.skipped)}.` : ""}
            </p>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel variant="secondary">Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="primary"
              disabled={busy || (draft?.kind !== "duplicate" && !plan?.steps.length) || (draft?.kind === "duplicate" && !!plan && !plan.steps.length)}
              onClick={confirm}
            >
              {action ? actionTitle(action, plan?.steps.length ?? 0) : "Mark as duplicates"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
