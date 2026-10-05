"use client";

/**
 * What stands where a deleted file used to be.
 *
 * A deleted file's own metadata answers 404, so who deleted it and why comes
 * from the audit log (`file.early_delete` / `file.retention_delete`). Staff
 * trees read it (`FileDeletionAccess.readRecord`); anyone else, or a log that
 * says nothing, still gets an honest "no longer available" instead of a
 * retry prompt that can never succeed.
 */

import { useEffect, useState } from "react";
import { FileX2 } from "lucide-react";

import { useFileDeletionAccess } from "@/components/files/FileDeletionAccess";
import { getUser, listAudit } from "@/lib/api/client";
import { fileDeletionRecord, type FileDeletionRecord } from "@/lib/file-retention";
import { formatDateTime } from "@/lib/format";
import { presentActorRole } from "@/app/ops/_lib/present";

/** A person's name for the record; their role when the name cannot be read. */
export function useActorName(actorId: string | null, actorRole: string | null): string {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    setName(null);
    if (!actorId) return;
    let cancelled = false;
    getUser(actorId).then(
      (user) => {
        if (!cancelled) setName(user.name?.trim() || null);
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [actorId]);
  return name ?? presentActorRole(actorRole);
}

/** "Deleted early by Ana Cruz, Super Admin, on 4 Oct 2026" or the schedule's line. */
export function DeletionByline({ record }: { record: FileDeletionRecord }) {
  const who = useActorName(record.actorId, record.actorRole);
  if (record.kind === "retention") {
    return <>Deleted on schedule when its retention period ended, {formatDateTime(record.at)}</>;
  }
  const role = presentActorRole(record.actorRole);
  return (
    <>
      Deleted early by {who}
      {who !== role ? `, ${role},` : ""} on {formatDateTime(record.at)}
    </>
  );
}

export function DeletionReason({ reason }: { reason: string | null }) {
  if (!reason) return null;
  return (
    <blockquote className="border-outline text-body text-text-primary m-0 mt-1.5 border-l-2 pl-3 break-words whitespace-pre-line">
      {reason}
    </blockquote>
  );
}

/** The plate after deletion: same footprint as a file plate, dashed and empty. */
export function DeletedFilePlate({
  fileId,
  label,
  pendingHold = false,
}: {
  fileId: string;
  label: string;
  /** The API kept `delete_pending`: a case opened before the bytes went. */
  pendingHold?: boolean;
}) {
  const { readRecord, version } = useFileDeletionAccess();
  const [record, setRecord] = useState<FileDeletionRecord | null>(null);
  const [checked, setChecked] = useState(!readRecord);

  useEffect(() => {
    if (!readRecord) return;
    let cancelled = false;
    setChecked(false);
    listAudit({ entityType: "file", entityId: fileId, limit: 20 })
      .then((entries) => {
        if (!cancelled) setRecord(fileDeletionRecord(entries, fileId));
      })
      .catch(() => {
        if (!cancelled) setRecord(null);
      })
      .finally(() => {
        if (!cancelled) setChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [fileId, readRecord, version]);

  return (
    // In a two-up strip the record takes the whole row: a reason needs width.
    <div className="min-w-0 sm:col-span-2">
      <p className="text-caption text-text-muted m-0">{label}</p>
      <div className="border-outline mt-1.5 flex w-full max-w-sm flex-col gap-1 rounded-card border border-dashed p-3">
        <p className="text-body text-text-primary m-0 flex items-center gap-2">
          <FileX2 size={18} strokeWidth={1.75} aria-hidden className="text-text-muted shrink-0" />
          <span style={{ fontFamily: "var(--font-medium)" }}>
            {pendingHold ? "Deletion waiting on an open case" : "File deleted"}
          </span>
        </p>
        {!checked ? (
          <div className="bg-surface-variant h-4 w-3/4 animate-pulse rounded" aria-hidden />
        ) : record ? (
          <>
            <p className="text-caption text-text-secondary m-0">
              <DeletionByline record={record} />
            </p>
            <DeletionReason reason={record.reason} />
          </>
        ) : (
          <p className="text-caption text-text-secondary m-0">
            This file is no longer available.
          </p>
        )}
        {pendingHold ? (
          <p className="text-caption text-text-secondary m-0">
            The file is already hidden. Its storage copy is removed once the case closes.
          </p>
        ) : null}
      </div>
    </div>
  );
}
