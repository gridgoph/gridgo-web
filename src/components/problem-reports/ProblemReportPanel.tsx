"use client";

/**
 * The client's problem reports on one order, inside the order workspace
 * (gridgo-api docs/REFUNDS_AND_FAULT_API.md, tracker 221 decision B).
 *
 * Each case shows what the client said, the evidence the API gathered when
 * they said it (frozen; "Not recorded" where nothing was), Operations' fault
 * and remedy finding with its history, Super Admin's approval when GRIDGO
 * funds more than ₱1,000, and Resolve. Nothing here moves money, releases a
 * payout hold or pays a refund: the Claims and refund screens still do that.
 *
 * One implementation for Operations and Super Admin. The tree decides who is
 * acting: only `/admin` approves, and the API checks the same.
 */

import { useMemo, useState } from "react";
import Link from "next/link";

import { opsErrorMessage } from "@/app/ops/_lib/errors";
import { presentIssueKind, presentIssueStatus } from "@/app/ops/_lib/present";
import { EvidencePlate } from "@/components/orders/EvidencePreview";
import { DecisionDialog } from "@/components/problem-reports/DecisionDialog";
import { EvidenceFileRow } from "@/components/problem-reports/EvidenceFileRow";
import {
  ApproveDecisionDialog,
  ResolveProblemDialog,
} from "@/components/problem-reports/CaseDialogs";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/StatusChip";
import { approveIssueDecision, recordIssueDecision, resolveIssue } from "@/lib/api/client";
import type { FaultDecision, Issue } from "@/lib/api/types";
import { formatDateTime, formatPhp } from "@/lib/format";
import { evidenceBlocks } from "@/lib/problem-evidence";
import {
  ISSUE_EVIDENCE_GROUPS,
  NOT_RECORDED,
  citationLabel,
  decisionHistory,
  evidenceGroup,
  faultLabel,
  groupFiles,
  isEmptyEvidence,
  isRefundRemedy,
  issueIsOpen,
  issueVersion,
  otherEvidenceFiles,
  presentDecisionStatus,
  problemReportErrorCopy,
  remedyLabel,
  shouldReload,
  type DecisionDraft,
  decisionAmounts,
} from "@/lib/problem-reports";

type Tree = "ops" | "admin";

/** Open cases first, then newest. */
function orderedCases(issues: Issue[]): Issue[] {
  return [...issues].sort(
    (a, b) =>
      Number(issueIsOpen(b)) - Number(issueIsOpen(a)) ||
      b.createdAt.localeCompare(a.createdAt),
  );
}

export function ProblemReportPanel({
  issues,
  tree,
  names,
  onChanged,
}: {
  issues: Issue[] | null;
  tree: Tree;
  names: Record<string, string>;
  /** Re-read the order and its cases after a write or a stale answer. */
  onChanged: () => Promise<void> | void;
}) {
  if (issues === null) {
    return (
      <p className="text-body text-text-secondary m-0">
        The problem reports on this order could not be loaded. Refresh the order to try
        again.
      </p>
    );
  }
  if (!issues.length) {
    return <p className="text-body text-text-secondary m-0">No problem reported.</p>;
  }
  return (
    <div className="flex flex-col gap-6">
      {orderedCases(issues).map((issue) => (
        <ProblemCase
          key={issue.id}
          issue={issue}
          tree={tree}
          names={names}
          onChanged={onChanged}
        />
      ))}
    </div>
  );
}

type Acting = "decide" | "approve" | "resolve" | null;

function ProblemCase({
  issue,
  tree,
  names,
  onChanged,
}: {
  issue: Issue;
  tree: Tree;
  names: Record<string, string>;
  onChanged: () => Promise<void> | void;
}) {
  const [dialog, setDialog] = useState<Acting>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const superAdmin = tree === "admin";
  const open = issueIsOpen(issue);
  const status = presentIssueStatus(issue.status);
  const decision = issue.faultDecision ?? null;
  const pending = decision?.status === "awaiting_approval";

  async function act(kind: Exclude<Acting, null>, write: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await write();
      setDialog(null);
      await onChanged();
    } catch (err) {
      const fallback =
        kind === "decide"
          ? "The finding could not be saved. Try again."
          : kind === "approve"
            ? "The approval could not be saved. Try again."
            : "The problem report could not be resolved. Try again.";
      setError(problemReportErrorCopy(err) ?? opsErrorMessage(err, fallback));
      // A stale or closed case is re-read so the next try starts from it.
      if (shouldReload(err)) await onChanged();
    } finally {
      setBusy(false);
    }
  }

  function saveDecision(draft: DecisionDraft) {
    const { costMinor, gridgoCostMinor } = decisionAmounts(draft);
    if (!draft.fault || !draft.remedy || costMinor === null || gridgoCostMinor === null) return;
    void act("decide", () =>
      recordIssueDecision(issue.id, {
        expectedVersion: issueVersion(issue),
        fault: draft.fault as Exclude<DecisionDraft["fault"], "">,
        remedy: draft.remedy as Exclude<DecisionDraft["remedy"], "">,
        reason: draft.reason.trim(),
        evidenceIds: draft.evidenceIds,
        ...(isRefundRemedy(draft.remedy)
          ? { alternativesReason: draft.alternativesReason.trim() }
          : {}),
        costMinor,
        gridgoCostMinor,
      }),
    );
  }

  return (
    <article className="flex flex-col gap-4" aria-labelledby={`problem-${issue.id}`}>
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 id={`problem-${issue.id}`} className="text-h3 text-text-primary m-0">
              {presentIssueKind(issue.kind)}
            </h3>
            <p className="text-caption text-text-muted m-0 mt-0.5">
              Reported {formatDateTime(issue.createdAt)}
            </p>
          </div>
          <StatusChip tone={status.tone} label={status.label} icon={status.icon} />
        </div>
        <blockquote className="m-0 border-l-2 border-outline pl-3 text-body text-text-primary whitespace-pre-wrap break-words">
          {issue.description}
        </blockquote>
        {issue.claimId && tree === "ops" ? (
          <p className="text-caption text-text-muted m-0">
            The report holds this order&rsquo;s remaining payouts. Release the hold on{" "}
            <Link href="/ops/claims" className="text-text-secondary underline underline-offset-2">
              Claims
            </Link>{" "}
            when it is settled; resolving here does not release it.
          </p>
        ) : issue.claimId ? (
          <p className="text-caption text-text-muted m-0">
            The report holds this order&rsquo;s remaining payouts. Resolving here does not
            release the hold; Operations releases it on Claims.
          </p>
        ) : null}
        {!open && issue.resolution ? (
          <p className="text-body text-text-secondary m-0">
            {issue.status === "dismissed" ? "Dismissed" : "Resolved"}{" "}
            {formatDateTime(issue.resolvedAt)}: {issue.resolution}
          </p>
        ) : null}
      </header>

      <EvidenceBundle issue={issue} />

      <section className="flex flex-col gap-3" aria-label="Finding">
        <h4 className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-medium)" }}>
          Finding
        </h4>
        {decision ? (
          <DecisionCard issue={issue} decision={decision} names={names} />
        ) : (
          <p className="text-body text-text-secondary m-0">
            {open
              ? "No finding yet. Read the evidence, then record who was at fault and the remedy."
              : "No finding was recorded."}
          </p>
        )}
        {pending && !superAdmin ? (
          <p className="text-body text-text-secondary m-0" role="status">
            GRIDGO&rsquo;s share is above ₱1,000.00, so Super Admin approves it before anyone
            carries out the remedy. Nothing else on this case can close until then.
          </p>
        ) : null}
        <DecisionHistory issue={issue} names={names} />
      </section>

      {open ? (
        <div className="flex flex-wrap gap-2">
          {pending && superAdmin ? (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                setError(null);
                setDialog("approve");
              }}
            >
              Approve GRIDGO&rsquo;s share
            </Button>
          ) : null}
          <Button
            variant="outline"
            disabled={busy || !issue.evidenceSnapshot}
            onClick={() => {
              setError(null);
              setDialog("decide");
            }}
          >
            {decision ? "Revise the finding" : "Record a finding"}
          </Button>
          <Button
            variant="outline"
            disabled={busy || pending}
            onClick={() => {
              setError(null);
              setDialog("resolve");
            }}
          >
            Resolve
          </Button>
        </div>
      ) : null}
      {open && !issue.evidenceSnapshot ? (
        <p className="text-caption text-text-muted m-0">
          A finding cites the gathered evidence, and this report has none, so it can only be
          resolved.
        </p>
      ) : null}
      {open && pending ? (
        <p className="text-caption text-text-muted m-0">
          Resolve opens once Super Admin approves GRIDGO&rsquo;s share.
        </p>
      ) : null}
      {error && dialog === null ? (
        <p className="text-body text-error m-0" role="alert">
          {error}
        </p>
      ) : null}

      <DecisionDialog
        open={dialog === "decide"}
        issue={issue}
        superAdmin={superAdmin}
        busy={busy}
        error={dialog === "decide" ? error : null}
        onCancel={() => setDialog(null)}
        onSave={saveDecision}
      />
      {decision ? (
        <ApproveDecisionDialog
          open={dialog === "approve"}
          decision={decision}
          busy={busy}
          error={dialog === "approve" ? error : null}
          onCancel={() => setDialog(null)}
          onApprove={(reason) =>
            void act("approve", () =>
              approveIssueDecision(issue.id, {
                expectedVersion: issueVersion(issue),
                decisionId: decision.id,
                reason,
              }),
            )
          }
        />
      ) : null}
      <ResolveProblemDialog
        open={dialog === "resolve"}
        issue={issue}
        busy={busy}
        error={dialog === "resolve" ? error : null}
        onCancel={() => setDialog(null)}
        onResolve={(resolution) =>
          void act("resolve", () =>
            resolveIssue(issue.id, {
              resolution,
              reason: resolution,
              status: "resolved",
              // Money stays on Claims, with its own reason.
              releasePayout: false,
              expectedVersion: issueVersion(issue),
            }),
          )
        }
      />
    </article>
  );
}

function EvidenceBundle({ issue }: { issue: Issue }) {
  const snapshot = issue.evidenceSnapshot;
  const others = useMemo(() => otherEvidenceFiles(issue), [issue]);
  if (!snapshot) {
    return (
      <section className="flex flex-col gap-1" aria-label="Gathered evidence">
        <h4 className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-medium)" }}>
          Gathered evidence
        </h4>
        <p className="text-body text-text-secondary m-0">
          {NOT_RECORDED}. This report was filed before evidence was gathered automatically;
          read the order&rsquo;s own steps above instead.
        </p>
      </section>
    );
  }
  return (
    <section className="flex flex-col gap-3" aria-label="Gathered evidence">
      <div>
        <h4 className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-medium)" }}>
          Gathered evidence
        </h4>
        <p className="text-caption text-text-muted m-0 mt-0.5">
          Captured {formatDateTime(snapshot.capturedAt)}, when the client reported the problem.
          Later changes to the order do not change it. &ldquo;{NOT_RECORDED}&rdquo; means
          nothing was on file; it never proves consent or intact goods.
        </p>
      </div>
      <ul className="m-0 flex list-none flex-col divide-y divide-outline-subtle rounded-card border border-outline p-0">
        {ISSUE_EVIDENCE_GROUPS.map((definition) => (
          <EvidenceGroupRow key={definition.id} issue={issue} definition={definition} />
        ))}
        {others.length ? (
          <li className="flex flex-col gap-1 px-3 py-3">
            <p className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-medium)" }}>
              Other files on the order
            </p>
            <p className="text-caption text-text-muted m-0">
              Production and handover files already attached to the order.
            </p>
            <ul className="m-0 list-none divide-y divide-outline-subtle p-0">
              {others.map((file) => (
                <EvidenceFileRow key={file.fileId} file={file} />
              ))}
            </ul>
          </li>
        ) : null}
      </ul>
    </section>
  );
}

function EvidenceGroupRow({
  issue,
  definition,
}: {
  issue: Issue;
  definition: (typeof ISSUE_EVIDENCE_GROUPS)[number];
}) {
  const group = evidenceGroup(issue, definition.id);
  const empty = !group || isEmptyEvidence(group.data);
  const blocks = empty ? [] : evidenceBlocks(definition.id, group?.data);
  const files = groupFiles(issue, group);
  return (
    <li className="flex flex-col gap-2 px-3 py-3" data-testid={`evidence-${definition.id}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-medium)" }}>
          {definition.title}
        </p>
        {empty ? <span className="text-caption text-text-muted">{NOT_RECORDED}</span> : null}
      </div>
      {empty ? null : (
        <>
          {definition.id === "client_photos" ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {files.map((file, index) =>
                file.unavailable ? (
                  <EvidenceFileRow key={file.fileId} file={file} />
                ) : (
                  <EvidencePlate
                    key={file.fileId}
                    fileId={file.fileId}
                    label={`Photo ${index + 1}`}
                  />
                ),
              )}
            </div>
          ) : null}
          {blocks.map((block, index) => (
            <div key={`${block.title}-${index}`} className="flex flex-col gap-1">
              <p className="text-caption text-text-secondary m-0">{block.title}</p>
              {block.facts.length ? (
                <dl className="m-0 grid grid-cols-1 gap-x-3 gap-y-0.5 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
                  {block.facts.map((entry, factIndex) => (
                    <div key={`${entry.label}-${factIndex}`} className="contents">
                      <dt className="text-caption text-text-muted">{entry.label}</dt>
                      <dd className="m-0 text-body text-text-primary break-words">{entry.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-caption text-text-muted m-0">{NOT_RECORDED}</p>
              )}
            </div>
          ))}
          {definition.id !== "client_photos" && files.length ? (
            <ul className="m-0 list-none divide-y divide-outline-subtle p-0">
              {files.map((file) => (
                <EvidenceFileRow key={file.fileId} file={file} />
              ))}
            </ul>
          ) : null}
        </>
      )}
    </li>
  );
}

function personName(names: Record<string, string>, id: string | undefined): string {
  if (!id) return "Someone";
  return names[id] || "A staff member";
}

function DecisionFacts({
  issue,
  decision,
  names,
}: {
  issue: Issue;
  decision: FaultDecision;
  names: Record<string, string>;
}) {
  return (
    <dl className="m-0 grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
      <dt className="text-caption text-text-muted">At fault</dt>
      <dd className="m-0 text-body text-text-primary">{faultLabel(decision.fault)}</dd>
      <dt className="text-caption text-text-muted">Remedy</dt>
      <dd className="m-0 text-body text-text-primary">{remedyLabel(decision.remedy)}</dd>
      <dt className="text-caption text-text-muted">Finding</dt>
      <dd className="m-0 text-body text-text-primary whitespace-pre-wrap break-words">
        {decision.reason}
      </dd>
      {decision.alternativesReason ? (
        <>
          <dt className="text-caption text-text-muted">Why not a reprint</dt>
          <dd className="m-0 text-body text-text-primary whitespace-pre-wrap break-words">
            {decision.alternativesReason}
          </dd>
        </>
      ) : null}
      {decision.costMinor !== undefined ? (
        <>
          <dt className="text-caption text-text-muted">Total cost</dt>
          <dd className="m-0 text-body text-text-primary tabular-nums">
            {formatPhp(decision.costMinor)}
          </dd>
        </>
      ) : null}
      {decision.gridgoCostMinor !== undefined ? (
        <>
          <dt className="text-caption text-text-muted">GRIDGO pays</dt>
          <dd className="m-0 text-body text-text-primary tabular-nums">
            {formatPhp(decision.gridgoCostMinor)}
          </dd>
        </>
      ) : null}
      {decision.evidenceIds?.length ? (
        <>
          <dt className="text-caption text-text-muted">Evidence relied on</dt>
          <dd className="m-0 text-body text-text-primary">
            <ul className="m-0 list-disc pl-5">
              {decision.evidenceIds.map((id) => (
                <li key={id}>{citationLabel(issue, id)}</li>
              ))}
            </ul>
          </dd>
        </>
      ) : null}
      <dt className="text-caption text-text-muted">Recorded</dt>
      <dd className="m-0 text-body text-text-secondary">
        {personName(names, decision.recordedBy)}, {formatDateTime(decision.recordedAt)}
      </dd>
      {decision.approvedAt ? (
        <>
          <dt className="text-caption text-text-muted">Approved</dt>
          <dd className="m-0 text-body text-text-secondary">
            {personName(names, decision.approvedBy)}, {formatDateTime(decision.approvedAt)}
            {decision.approvalReason ? `: ${decision.approvalReason}` : ""}
          </dd>
        </>
      ) : null}
    </dl>
  );
}

function DecisionCard({
  issue,
  decision,
  names,
}: {
  issue: Issue;
  decision: FaultDecision;
  names: Record<string, string>;
}) {
  const chip = presentDecisionStatus(decision);
  return (
    <div className="flex flex-col gap-3 rounded-card border border-outline p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-medium)" }}>
          Current finding
        </p>
        <StatusChip tone={chip.tone} label={chip.label} icon={chip.icon} />
      </div>
      <DecisionFacts issue={issue} decision={decision} names={names} />
      <p className="text-caption text-text-muted m-0">
        The client sees who was at fault, the remedy and the finding. A finding pays nobody:
        refunds and payout holds stay on their own screens.
      </p>
    </div>
  );
}

function DecisionHistory({ issue, names }: { issue: Issue; names: Record<string, string> }) {
  const history = decisionHistory(issue);
  // The first entry is the current finding, already shown.
  if (history.length < 2) return null;
  return (
    <details className="rounded-card border border-outline-subtle px-3 py-2">
      <summary className="min-h-11 cursor-pointer py-2.5 text-body text-text-secondary">
        Earlier findings and approvals ({history.length - 1})
      </summary>
      <ol className="m-0 flex list-none flex-col gap-4 p-0 pb-2">
        {history.slice(1).map((entry, index) => {
          const chip = presentDecisionStatus(entry);
          return (
            <li key={`${entry.id}-${index}`} className="flex flex-col gap-2 border-t border-outline-subtle pt-3">
              <StatusChip tone={chip.tone} label={chip.label} icon={chip.icon} />
              <DecisionFacts issue={issue} decision={entry} names={names} />
            </li>
          );
        })}
      </ol>
    </details>
  );
}
