"use client";

/**
 * The order's record of files deleted before their time: what each was, who
 * deleted it, when, and the reason they wrote. Read from the audit log
 * (`file.early_delete`) and matched to the file ids the order still names,
 * because a deleted file can vanish from the screen that showed it (the
 * progress gallery only lists live photos). Renders nothing when there is
 * nothing to say or the tree may not read the record.
 */

import { useEffect, useState } from "react";

import { DeletionByline, DeletionReason } from "@/components/files/DeletedFile";
import { useFileDeletionAccess } from "@/components/files/FileDeletionAccess";
import { listAudit } from "@/lib/api/client";
import type { AuditEntry, Order } from "@/lib/api/types";
import {
  FILE_EARLY_DELETE_ACTION,
  filePurposeLabel,
  orderFileDeletions,
} from "@/lib/file-retention";

/** The API's largest audit page; early deletions are rare, hand-made acts. */
const AUDIT_PAGE = 500;

export function OrderFileDeletions({ order }: { order: Order }) {
  const { readRecord, version } = useFileDeletionAccess();
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);

  useEffect(() => {
    if (!readRecord) return;
    let cancelled = false;
    listAudit({ action: FILE_EARLY_DELETE_ACTION, limit: AUDIT_PAGE }).then(
      (list) => {
        if (!cancelled) setEntries(list);
      },
      () => {
        // Best effort: each plate still says its own file is gone.
        if (!cancelled) setEntries(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [readRecord, version, order.id]);

  const records = orderFileDeletions(entries, order);
  if (!readRecord || records.length === 0) return null;

  return (
    <section className="gg-card p-3" aria-labelledby="order-file-deletions">
      <h2 id="order-file-deletions" className="text-overline text-text-muted m-0 mb-2">
        Files deleted early
      </h2>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {records.map((record) => (
          <li key={record.fileId} className="min-w-0">
            <p
              className="text-body text-text-primary m-0"
              style={{ fontFamily: "var(--font-medium)" }}
            >
              {filePurposeLabel(record.purpose)}
            </p>
            <p className="text-caption text-text-secondary m-0">
              <DeletionByline record={record} />
            </p>
            <DeletionReason reason={record.reason} />
          </li>
        ))}
      </ul>
    </section>
  );
}
