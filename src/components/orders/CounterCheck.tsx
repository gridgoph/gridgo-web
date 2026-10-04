"use client";

import { useEffect, useState } from "react";
import { CircleCheck, CircleMinus, CircleX, TriangleAlert } from "lucide-react";

import { DeletedFilePlate } from "@/components/files/DeletedFile";
import { EarlyDeleteFileButton } from "@/components/files/EarlyDeleteFileDialog";
import { EvidencePlate, EvidenceStrip } from "@/components/orders/EvidencePreview";
import { fileIsGone } from "@/lib/file-retention";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/StatusChip";
import { getFileDownloadUrl } from "@/lib/api/client";
import type {
  Escalation,
  HandoffSignature,
  Order,
  PickupCountItem,
} from "@/lib/api/types";
import {
  checkResults,
  countLines,
  countVerdictLabel,
  failureHeadline,
  formatPieces,
  type CheckResult,
  type CountLine,
} from "@/lib/counter-check";
import { pickupEvidence } from "@/lib/evidence";
import { formatDateTime } from "@/lib/format";
import { presentChecklistStatus, presentEscalationStatus } from "@/lib/order-state";
import { cn } from "@/lib/utils";

type Props = {
  order: Order;
  /** Every failed attempt on this order, newest first (`GET /escalations?orderId=`). */
  escalations: Escalation[];
  /** Set when the attempt history could not be read; the latest attempt still shows. */
  escalationsError: string | null;
  /** Person names by user id, best effort. */
  names: Record<string, string>;
  resolving: boolean;
  onResolve: (escalationId: string) => void;
};

/**
 * The counter check on the order workspace: the rider's count and six checks
 * at the shop, the photos when something failed, the shop's signature when it
 * passed, and every earlier failed attempt.
 *
 * This is a gate on custody, never a payout stage. Nothing here releases or
 * mentions a share of the shop's price.
 */
export function CounterCheck({
  order,
  escalations,
  escalationsError,
  names,
  resolving,
  onResolve,
}: Props) {
  const checklist = order.pickupChecklist;
  const attempted = Boolean(checklist?.completedAt);
  const fallbackName = order.title || "This order";
  const latestEscalationId = checklist?.escalationId ?? null;
  const latestEscalation = escalations.find((e) => e.id === latestEscalationId) ?? null;
  const latestIsFailure =
    checklist?.status === "failed_escalated" ||
    checklist?.status === "escalation_resolved";
  // The latest attempt is shown in full above; its escalation is not repeated.
  const earlier = escalations.filter(
    (e) => !(latestIsFailure && e.id === latestEscalationId),
  );
  const openEscalationId =
    checklist?.status === "failed_escalated"
      ? latestEscalationId
      : (escalations.find((e) => e.status === "open")?.id ?? null);

  if (!attempted) {
    return (
      <div className="flex flex-col gap-4">
        <BeforeCount order={order} />
        <EarlierAttempts
          escalations={earlier}
          order={order}
          names={names}
          error={escalationsError}
        />
      </div>
    );
  }

  const status = presentChecklistStatus(checklist?.status);
  const lines = countLines(checklist?.counts, order.pickupCountItems, fallbackName);
  const rider = checklist?.completedBy ? names[checklist.completedBy] : undefined;
  const photos = pickupEvidence(order);

  return (
    <div className="flex flex-col gap-4">
      {openEscalationId ? (
        <div
          className="flex flex-col gap-3 rounded-card border border-error p-3"
          role="status"
        >
          <p className="text-body text-text-primary m-0 flex items-start gap-2">
            <TriangleAlert
              size={18}
              strokeWidth={2}
              className="mt-0.5 shrink-0 text-error"
              aria-hidden
            />
            <span>
              <span style={{ fontFamily: "var(--font-medium)" }}>
                The rider is waiting at the shop.
              </span>{" "}
              {sentence(failureHeadline(checklist?.checks, lines))}. The package stays
              with the shop until you answer and the rider checks again.
            </span>
          </p>
          <div>
            <Button
              variant="secondary"
              disabled={resolving}
              onClick={() => onResolve(openEscalationId)}
            >
              Give the rider an instruction
            </Button>
          </div>
        </div>
      ) : checklist?.status === "escalation_resolved" ? (
        <div
          className="flex flex-col gap-1 rounded-card border border-outline p-3"
          role="status"
        >
          <p
            className="text-body text-text-primary m-0"
            style={{ fontFamily: "var(--font-medium)" }}
          >
            Instruction sent
            {latestEscalation?.resolvedAt
              ? ` ${formatDateTime(latestEscalation.resolvedAt)}`
              : ""}
          </p>
          {latestEscalation?.resolution ? (
            <p className="text-body text-text-secondary m-0">
              {latestEscalation.resolution}
            </p>
          ) : null}
          <p className="text-caption text-text-muted m-0 mt-1">
            The rider counts again and repeats all six checks, and the shop signs, before
            the package moves. The attempt below is the one that failed.
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-caption text-text-muted m-0">
          {latestIsFailure ? "Failed attempt" : "Checked"}{" "}
          {formatDateTime(checklist?.completedAt)}
          {rider ? ` by ${rider}` : " by the rider"}
        </p>
        <StatusChip tone={status.tone} label={status.label} icon={status.icon} />
      </div>

      <section aria-label="Count at the counter" className="flex flex-col gap-2">
        <h3
          className="text-body text-text-primary m-0"
          style={{ fontFamily: "var(--font-medium)" }}
        >
          Count at the counter
        </h3>
        {lines.length ? (
          <CountLedger lines={lines} />
        ) : (
          <p className="text-body text-text-secondary m-0">
            Not recorded. This check was made before riders counted each line.
          </p>
        )}
      </section>

      <section aria-label="Six checks" className="flex flex-col gap-2">
        <h3
          className="text-body text-text-primary m-0"
          style={{ fontFamily: "var(--font-medium)" }}
        >
          Six checks
        </h3>
        <CheckGrid checks={checkResults(checklist?.checks)} />
      </section>

      {checklist?.failureNote ? (
        <div>
          <p className="text-caption text-text-muted m-0">What the rider saw</p>
          <p className="text-body text-text-primary m-0 mt-1">{checklist.failureNote}</p>
        </div>
      ) : null}

      {photos.length ? <EvidenceStrip items={photos} deletable /> : null}

      {checklist?.status === "passed" ? (
        <Signature signature={checklist.handoffSignature} />
      ) : null}

      <EarlierAttempts
        escalations={earlier}
        order={order}
        names={names}
        error={escalationsError}
      />
    </div>
  );
}

function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Before any attempt: what the rider will count, or why they cannot. */
function BeforeCount({ order }: { order: Order }) {
  if (order.pickupCountItems === null && order.state === "rider_assigned") {
    return (
      <p
        className="text-body text-text-secondary m-0 flex items-start gap-2"
        role="status"
      >
        <TriangleAlert
          size={18}
          strokeWidth={2}
          className="mt-0.5 shrink-0 text-warning"
          aria-hidden
        />
        <span>
          This order has no quantity the rider can count against, so the check cannot
          finish. Review the order&rsquo;s lines before the rider arrives.
        </span>
      </p>
    );
  }
  const items = order.pickupCountItems ?? [];
  if (!items.length) {
    return (
      <p className="text-body text-text-secondary m-0">
        The rider and the shop count every line and go through six checks together before
        the package leaves. Nothing moves until the shop signs.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-body text-text-secondary m-0">
        The rider counts these at the shop and goes through six checks with the shop
        before taking the package.
      </p>
      <ExpectedList items={items} fallbackName={order.title || "This order"} />
    </div>
  );
}

function ExpectedList({
  items,
  fallbackName,
}: {
  items: PickupCountItem[];
  fallbackName: string;
}) {
  return (
    <ul className="m-0 flex list-none flex-col p-0">
      {items.map((item, index) => (
        <li
          key={item.lineItemId ?? `line-${index}`}
          className="flex items-baseline justify-between gap-3 border-b border-outline-subtle py-2 last:border-b-0"
        >
          <span className="text-body text-text-secondary min-w-0">
            {item.itemName || fallbackName}
          </span>
          <span className="text-body text-text-primary shrink-0 tabular-nums">
            {formatPieces(item.expectedQuantity)} pcs
          </span>
        </li>
      ))}
    </ul>
  );
}

const VERDICT_ICON = {
  match: CircleCheck,
  short: CircleX,
  extra: CircleX,
  not_recorded: CircleMinus,
} as const;

/**
 * Counted against expected, one line per order line. The counted figure is
 * the thing Operations came to read, so it is the heaviest type on the row.
 */
export function CountLedger({
  lines,
  compact = false,
}: {
  lines: CountLine[];
  compact?: boolean;
}) {
  return (
    <table className="w-full border-collapse text-left">
      <thead>
        <tr className="border-b border-outline-subtle">
          <th
            scope="col"
            className="text-caption text-text-muted py-1.5 pr-3 [font-weight:inherit]"
          >
            Item
          </th>
          <th
            scope="col"
            className="text-caption text-text-muted py-1.5 pr-3 text-right [font-weight:inherit]"
          >
            Expected
          </th>
          <th
            scope="col"
            className="text-caption text-text-muted py-1.5 pr-3 text-right [font-weight:inherit]"
          >
            Counted
          </th>
          <th scope="col" className="py-1.5 [font-weight:inherit]">
            <span className="sr-only">Result</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {lines.map((line) => {
          const Icon = VERDICT_ICON[line.verdict];
          const off = line.verdict === "short" || line.verdict === "extra";
          return (
            <tr
              key={line.key}
              className="border-b border-outline-subtle last:border-b-0 align-baseline"
            >
              <th
                scope="row"
                className="text-body text-text-secondary py-2 pr-3 [font-weight:inherit]"
              >
                {line.itemName}
              </th>
              <td className="text-body text-text-secondary py-2 pr-3 text-right tabular-nums">
                {line.expected == null ? "—" : formatPieces(line.expected)}
              </td>
              <td
                className={cn(
                  "py-2 pr-3 text-right tabular-nums",
                  compact ? "text-body" : "text-h3",
                  off ? "text-error" : "text-text-primary",
                  line.verdict === "not_recorded" && "text-text-muted",
                )}
                style={{
                  fontFamily:
                    line.verdict === "not_recorded" ? undefined : "var(--font-bold)",
                }}
              >
                {line.counted == null ? "—" : formatPieces(line.counted)}
              </td>
              <td className="py-2 whitespace-nowrap">
                <span
                  className={cn(
                    "text-caption inline-flex items-center gap-1",
                    off && "text-error",
                    line.verdict === "match" && "text-success",
                    line.verdict === "not_recorded" && "text-text-muted",
                  )}
                >
                  <Icon size={14} strokeWidth={2} aria-hidden />
                  {countVerdictLabel(line)}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** The six checks as passed or failed, each with its own glyph and word. */
export function CheckGrid({ checks }: { checks: CheckResult[] }) {
  if (!checks.length) {
    return <p className="text-body text-text-secondary m-0">No checks on record.</p>;
  }
  return (
    <ul className="m-0 grid list-none grid-cols-1 gap-x-4 gap-y-1.5 p-0 sm:grid-cols-2">
      {checks.map((check) => (
        <li key={check.code} className="flex items-center gap-2">
          {check.passed ? (
            <CircleCheck
              size={16}
              strokeWidth={2}
              className="shrink-0 text-success"
              aria-hidden
            />
          ) : (
            <CircleX
              size={16}
              strokeWidth={2}
              className="shrink-0 text-error"
              aria-hidden
            />
          )}
          <span
            className={cn(
              "text-body",
              check.passed ? "text-text-secondary" : "text-text-primary",
            )}
          >
            {check.label}
          </span>
          <span className={cn("text-caption", check.passed ? "sr-only" : "text-error")}>
            {check.passed ? "passed" : "Failed"}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The shop's signature on the rider's phone. Ink is drawn dark on a clear
 * background, so the plate is white in both themes, like a sheet of paper.
 */
function Signature({ signature }: { signature: HandoffSignature | null | undefined }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [gone, setGone] = useState<null | "deleted" | "pending">(null);
  const fileId = signature?.fileId ?? null;

  useEffect(() => {
    if (!fileId) return;
    let cancelled = false;
    setFailed(false);
    setGone(null);
    getFileDownloadUrl(fileId)
      .then((next) => {
        if (!cancelled) setUrl(next);
      })
      .catch((err) => {
        if (cancelled) return;
        if (fileIsGone(err)) setGone("deleted");
        else setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [fileId]);

  if (!signature) {
    return (
      <div>
        <p className="text-caption text-text-muted m-0">Shop signature</p>
        <p className="text-body text-text-secondary m-0 mt-1">
          Not recorded. This pickup was checked before the shop signed on the
          rider&rsquo;s phone.
        </p>
      </div>
    );
  }

  if (gone && fileId) {
    return (
      <DeletedFilePlate
        fileId={fileId}
        label={`Shop signature by ${signature.signerName}, ${formatDateTime(signature.signedAt)}`}
        pendingHold={gone === "pending"}
      />
    );
  }

  return (
    <figure className="m-0 flex flex-col gap-1.5">
      <figcaption className="text-caption text-text-muted">
        Signed for the shop by{" "}
        <span className="text-text-primary">{signature.signerName}</span>,{" "}
        {formatDateTime(signature.signedAt)}
      </figcaption>
      <div className="flex h-28 w-full max-w-sm items-center justify-center overflow-hidden rounded-card border border-outline bg-white p-2">
        {failed ? (
          <p className="text-caption m-0 text-black/70">
            Could not load the signature. Retry the page.
          </p>
        ) : url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={`Signature of ${signature.signerName}`}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <span
            className="h-full w-full animate-pulse rounded-md bg-black/5"
            aria-hidden
          />
        )}
      </div>
      {url && fileId ? (
        <div>
          <EarlyDeleteFileButton
            fileId={fileId}
            label="Shop signature"
            previewUrl={url}
            onDeleted={(result) => setGone(result.state === "delete_pending" ? "pending" : "deleted")}
          />
        </div>
      ) : null}
    </figure>
  );
}

/** Failed attempts before the latest one, newest first, kept after a recheck passes. */
function EarlierAttempts({
  escalations,
  order,
  names,
  error,
}: {
  escalations: Escalation[];
  order: Order;
  names: Record<string, string>;
  error: string | null;
}) {
  if (error) {
    return (
      <p className="text-caption text-text-muted m-0" role="status">
        {error}
      </p>
    );
  }
  if (!escalations.length) return null;
  return (
    <section
      aria-label="Earlier attempts"
      className="flex flex-col gap-2 border-t border-outline-subtle pt-3"
    >
      <h3
        className="text-body text-text-primary m-0"
        style={{ fontFamily: "var(--font-medium)" }}
      >
        {escalations.length === 1
          ? "Earlier failed attempt"
          : `Earlier failed attempts (${escalations.length})`}
      </h3>
      <ol className="m-0 flex list-none flex-col gap-3 p-0">
        {escalations.map((escalation) => (
          <li key={escalation.id}>
            <AttemptRecord escalation={escalation} order={order} names={names} />
          </li>
        ))}
      </ol>
    </section>
  );
}

/** One failed attempt as the escalation kept it. */
export function AttemptRecord({
  escalation,
  order,
  names,
}: {
  escalation: Escalation;
  order: Order | undefined;
  names: Record<string, string>;
}) {
  const status = presentEscalationStatus(escalation.status);
  const lines = countLines(
    escalation.counts,
    escalation.counts ? order?.pickupCountItems : null,
    order?.title || "This order",
  );
  const failed = escalation.checks
    ? checkResults(escalation.checks).filter((check) => !check.passed)
    : escalation.failedCheckCodes.map(
        (code) => checkResults([{ code, passed: false }])[0],
      );
  const rider = escalation.riderId ? names[escalation.riderId] : undefined;
  const resolver = escalation.resolvedBy ? names[escalation.resolvedBy] : undefined;

  return (
    <div className="flex flex-col gap-2 rounded-card border border-outline-subtle p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-caption text-text-muted m-0">
          {formatDateTime(escalation.createdAt)}
          {rider ? `, ${rider}` : ""}
        </p>
        <StatusChip tone={status.tone} label={status.label} icon={status.icon} />
      </div>
      {failed.length ? (
        <ul
          className="m-0 flex list-none flex-wrap gap-2 p-0"
          aria-label="Checks that failed"
        >
          {failed.map((check) => (
            <li key={check.code}>
              <StatusChip tone="error" label={check.label} icon="circle-x" />
            </li>
          ))}
        </ul>
      ) : null}
      {lines.length ? (
        <CountLedger lines={lines} compact />
      ) : (
        <p className="text-caption text-text-muted m-0">Count not recorded.</p>
      )}
      {escalation.failureNote ? (
        <p className="text-body text-text-primary m-0">{escalation.failureNote}</p>
      ) : null}
      {escalation.evidenceFileIds.length ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {escalation.evidenceFileIds.map((fileId, index, all) => (
            <EvidencePlate
              key={fileId}
              fileId={fileId}
              label={all.length > 1 ? `Pickup photo ${index + 1}` : "Pickup photo"}
              deletable
            />
          ))}
        </div>
      ) : null}
      {escalation.resolution ? (
        <div className="border-t border-outline-subtle pt-2">
          <p className="text-caption text-text-muted m-0">
            Instruction {formatDateTime(escalation.resolvedAt)}
            {resolver ? ` by ${resolver}` : ""}
          </p>
          <p className="text-body text-text-primary m-0 mt-1">{escalation.resolution}</p>
        </div>
      ) : null}
    </div>
  );
}
