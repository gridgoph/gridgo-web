"use client";

import { useCallback, useEffect, useState } from "react";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonDetail } from "@/components/ui/loading";
import { StatusChip } from "@/components/ui/StatusChip";
import {
  downloadApprovalProof,
  getApprovalProof,
  getFileDownloadUrl,
  isApiError,
} from "@/lib/api/client";
import type {
  ApprovalProofRead,
  ApprovalProofRecord,
  ApprovalSnapshot,
  ApprovalSnapshotItem,
} from "@/lib/api/types";
import {
  APPROVAL_PROOF_FILENAME,
  fileSizeLabel,
  itemSizeLine,
  methodLabel,
  optionsLine,
  phaseLabel,
  recordStatusChip,
  requirementLine,
  shortDigest,
  snapshotSpecLines,
} from "@/lib/approval-proof";
import { acceptanceLine, warningLine, warningTitle } from "@/lib/artwork-guidance";
import { formatDateTime } from "@/lib/format";
import { useLiveReload } from "@/lib/live/useLiveReload";

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function readErrorMessage(err: unknown): string {
  if (isApiError(err) && err.kind === "forbidden") {
    return "This account cannot read this order's approval.";
  }
  return "The approval could not be loaded. Try again.";
}

function linkHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "a design link";
  }
}

/**
 * A private signature or sample photo through a short-lived signed link.
 * Always on white: a signature is dark strokes on a transparent page.
 */
function EvidenceImage({ fileId, label }: { fileId: string; label: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setUrl(null);
    void getFileDownloadUrl(fileId)
      .then((next) => {
        if (!cancelled) setUrl(next);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [fileId, attempt]);

  return (
    <figure className="m-0 flex min-w-0 flex-col gap-1">
      <figcaption className="text-caption text-text-muted">{label}</figcaption>
      {failed ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-caption text-text-secondary m-0">The image could not be opened.</p>
          <Button variant="ghost" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </Button>
        </div>
      ) : url ? (
        <a href={url} target="_blank" rel="noreferrer" className="block w-fit">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={label}
            className="max-h-48 max-w-full rounded-[var(--radius-field)] border border-outline bg-white object-contain"
          />
        </a>
      ) : (
        <p className="text-caption text-text-muted m-0">Loading…</p>
      )}
    </figure>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-caption text-text-muted">{label}</dt>
      <dd className="text-body text-text-primary m-0 break-words">{children}</dd>
    </div>
  );
}

function SnapshotItem({ item }: { item: ApprovalSnapshotItem }) {
  const options = optionsLine(item);
  const size = itemSizeLine(item);
  const warnings = (item.artworkGuidance?.files ?? []).flatMap((file) => file.warnings ?? []);
  const instructions = item.specialInstructions?.trim();
  return (
    <li className="flex flex-col gap-0.5">
      <span className="text-body text-text-primary" style={{ fontFamily: "var(--font-medium)" }}>
        {item.itemNameSnapshot || "Item"}
        {typeof item.quantity === "number" ? ` · Quantity ${item.quantity}` : ""}
      </span>
      {options ? <span className="text-caption text-text-secondary">{options}</span> : null}
      {size ? <span className="text-caption text-text-secondary">Size: {size}</span> : null}
      {instructions ? (
        <span className="text-caption text-text-secondary">Instructions: {instructions}</span>
      ) : null}
      {(item.artworkLinks ?? []).map((link) => (
        <span key={link.url} className="text-caption text-text-secondary break-all">
          Design link{link.label ? ` "${link.label}"` : ""}: {linkHost(link.url)}
        </span>
      ))}
      {item.colorTargets?.length ? (
        <span className="text-caption text-text-secondary">
          Exact colours: {item.colorTargets.length}{" "}
          {item.colorTargets.length === 1 ? "target" : "targets"}
        </span>
      ) : null}
      {item.printLayout ? (
        <span className="text-caption text-text-secondary">Print layout recorded</span>
      ) : null}
      {item.coverSpine ? (
        <span className="text-caption text-text-secondary">Cover and spine recorded</span>
      ) : null}
      {warnings.map((warning, index) => (
        <span key={`${warning.code}-${index}`} className="text-caption text-text-secondary">
          {warningTitle(warning)}: {warningLine(warning)} {acceptanceLine(warning)}.
        </span>
      ))}
    </li>
  );
}

function SnapshotView({ snapshot }: { snapshot: ApprovalSnapshot }) {
  const items = snapshot.items ?? [];
  const quoteLines = snapshot.quoteLines ?? [];
  const spec = snapshotSpecLines(snapshot);
  const artwork = snapshot.artwork ?? [];
  return (
    <div className="flex flex-col gap-2">
      {items.length ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {items.map((item, index) => (
            <SnapshotItem key={item.id ?? index} item={item} />
          ))}
        </ul>
      ) : null}
      {quoteLines.length ? (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {quoteLines.map((line, index) => (
            <li key={index} className="text-caption text-text-secondary">
              {[
                line.label,
                typeof line.quantity === "number" ? `Quantity ${line.quantity}` : null,
                line.size,
                line.material,
                line.finish,
              ]
                .filter(Boolean)
                .join(" · ")}
              {line.specialInstructions ? ` · Instructions: ${line.specialInstructions}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
      {spec.length ? (
        <p className="text-caption text-text-secondary m-0">{spec.join(" · ")}</p>
      ) : null}
      {typeof snapshot.quoteVersion === "number" ? (
        <p className="text-caption text-text-muted m-0">Quote version {snapshot.quoteVersion}</p>
      ) : null}
      {artwork.length ? (
        <div className="flex flex-col gap-0.5">
          <span className="text-caption text-text-muted">Artwork on file at approval</span>
          {artwork.map((file) => (
            <span key={file.fileId} className="text-caption text-text-secondary break-all">
              {[
                file.originalFilename || "File",
                fileSizeLabel(file.size),
                file.contentSha256 ? `fingerprint ${shortDigest(file.contentSha256)}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          ))}
        </div>
      ) : null}
      {!items.length && !quoteLines.length && !spec.length && !artwork.length ? (
        <p className="text-caption text-text-muted m-0">The record holds no specification.</p>
      ) : null}
    </div>
  );
}

function RecordCard({ record }: { record: ApprovalProofRecord }) {
  const chip = recordStatusChip(record);
  const approved = record.status === "approved";
  const account = record.account;
  const device = record.device;
  return (
    <article
      className="flex flex-col gap-3 rounded-[var(--radius-field)] border border-outline-subtle p-3"
      data-testid="approval-record"
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip tone={chip.tone} icon={chip.icon} label={chip.label} />
        <span className="text-caption text-text-secondary">
          {phaseLabel(record.phase)} · {formatDateTime(record.at)}
        </span>
      </div>
      {!approved ? (
        <p className="text-body text-text-secondary m-0">
          No approval was collected. Below is what was ordered, recorded for reference; the
          client did not sign or tap anything for it.
        </p>
      ) : null}
      <dl className="m-0 grid gap-3 sm:grid-cols-2">
        {approved ? <Fact label="How">{methodLabel(record.method)}</Fact> : null}
        {approved && record.statement ? (
          <Fact label="Statement">&ldquo;{record.statement}&rdquo;</Fact>
        ) : null}
        {account ? (
          <Fact label="Account">
            {[account.name, account.email].filter(Boolean).join(" · ") || "Client account"}
          </Fact>
        ) : null}
        {device ? (
          <Fact label="Device">
            {[device.platform, device.appVersion ? `app ${device.appVersion}` : null]
              .filter(Boolean)
              .join(" · ") || "Not recorded"}
            {device.id ? (
              <span className="text-caption text-text-muted block break-all">
                Installation {device.id}
              </span>
            ) : null}
          </Fact>
        ) : null}
      </dl>
      {record.signatureFileId || record.samplePhotoFileId ? (
        <div className="flex flex-wrap gap-4">
          {record.signatureFileId ? (
            <EvidenceImage fileId={record.signatureFileId} label="Signature" />
          ) : null}
          {record.samplePhotoFileId ? (
            <EvidenceImage fileId={record.samplePhotoFileId} label="Photo of the sample received" />
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-col gap-1">
        <h3 className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-medium)" }}>
          {approved ? "What the client approved" : "What was ordered"}
        </h3>
        <SnapshotView snapshot={record.snapshot} />
      </div>
      <p className="text-caption text-text-muted m-0 break-all">
        Record fingerprint {shortDigest(record.snapshotSha256)} · reference {record.id}. The record
        cannot be changed after it is made.
      </p>
    </article>
  );
}

/**
 * The client's approval on the order workspace: what they approved, when,
 * how (one tap or a drawn signature, with a photo of the sample for a sample
 * approval), and the PDF the API renders from the frozen records.
 */
export function ApprovalProofPanel({ orderId }: { orderId: string }) {
  const [read, setRead] = useState<ApprovalProofRead | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRead(await getApprovalProof(orderId));
    } catch (err) {
      setError(readErrorMessage(err));
    }
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Recording an approval invalidates the order; a new record appears here.
  useLiveReload(["orders"], load, { matchId: orderId });

  async function download() {
    setDownloading(true);
    setDownloadError(null);
    try {
      saveBlob(await downloadApprovalProof(orderId), APPROVAL_PROOF_FILENAME(orderId));
    } catch (err) {
      setDownloadError(
        isApiError(err) && err.code === "approval_proof_not_found"
          ? "There is no approval record to download yet."
          : "The proof could not be downloaded. Try again.",
      );
    } finally {
      setDownloading(false);
    }
  }

  if (error && !read) {
    return (
      <ErrorState
        body={error}
        action={
          <Button variant="secondary" onClick={() => void load()}>
            Retry
          </Button>
        }
      />
    );
  }
  if (!read) return <SkeletonDetail label="Loading the approval…" />;

  // Newest first: a later approval (a new quote, a sample round) sits on top.
  const records = [...read.approvalProofs].reverse();
  return (
    <div className="flex flex-col gap-3" data-testid="approval-proof">
      <p className="text-body text-text-secondary m-0">{requirementLine(read.requirement)}</p>
      {records.length ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" disabled={downloading} onClick={() => void download()}>
              <Download aria-hidden />
              {downloading ? "Preparing…" : "Download proof (PDF)"}
            </Button>
            <span className="text-caption text-text-muted">
              The record that defines a correct print if the client and the shop disagree.
            </span>
          </div>
          {downloadError ? (
            <p className="text-body text-error m-0" role="alert">
              {downloadError}
            </p>
          ) : null}
          {records.map((record) => (
            <RecordCard key={record.id} record={record} />
          ))}
        </>
      ) : (
        <p className="text-body text-text-muted m-0">The client has not approved this order yet.</p>
      )}
    </div>
  );
}
