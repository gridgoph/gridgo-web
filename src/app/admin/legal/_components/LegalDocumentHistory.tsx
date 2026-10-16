"use client";

import { useCallback, useEffect, useState } from "react";

import { presentAuditAction, presentAuditDetail } from "@/app/admin/_lib/present";
import { useLegalInboxReload } from "@/lib/live/useLegalInboxReload";
import { Button } from "@/components/ui/button";
import { listAudit, listUsers } from "@/lib/api/client";
import type { AuditEntry } from "@/lib/api/types";
import { formatManila } from "@/lib/legal";
import { useSerializedLoad } from "@/lib/live/useSerializedLoad";

/**
 * Who created, edited and published this document, from the audit log
 * (`legal.created|edited|published|deleted`). Super Admin only: the full log
 * is theirs, so this lives in the admin tree.
 */
export function LegalDocumentHistory({ documentId }: { documentId: string }) {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [error, setError] = useState(false);

  const load = useSerializedLoad(
    useCallback(async () => {
      setError(false);
      try {
        const [rows, admins] = await Promise.all([
          listAudit({ entityType: "legal_document", entityId: documentId, limit: 100 }),
          listUsers("super_admin").catch(() => []),
        ]);
        setEntries(
          rows
            .filter((row) => row.action.startsWith("legal."))
            .sort((a, b) => Date.parse(b.at) - Date.parse(a.at)),
        );
        setNames(Object.fromEntries(admins.map((user) => [user.id, user.name || user.email])));
      } catch {
        setError(true);
      }
    }, [documentId]),
  );

  useEffect(() => {
    void load();
  }, [load]);
  useLegalInboxReload("legal.", load);

  return (
    <section className="gg-card flex flex-col gap-3" aria-labelledby="legal-history">
      <h3 id="legal-history" className="text-h3 text-text-primary m-0">
        Edit history
      </h3>
      {error ? (
        <div className="flex flex-wrap items-center gap-2" role="alert">
          <p className="text-body text-text-secondary m-0">The history did not load.</p>
          <Button variant="secondary" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      ) : entries === null ? (
        <p className="text-body text-text-muted m-0">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-body text-text-muted m-0">
          No edits yet. The launch placeholder came with the system, not from a
          person.
        </p>
      ) : (
        <ol className="m-0 flex list-none flex-col gap-3 p-0">
          {entries.map((entry) => {
            const detail = presentAuditDetail(entry);
            return (
              <li key={entry.id} className="flex flex-col gap-0.5">
                <span className="text-body text-text-primary" style={{ fontFamily: "var(--font-medium)" }}>
                  {presentAuditAction(entry.action)}
                </span>
                {detail ? <span className="text-caption text-text-secondary">{detail}</span> : null}
                <span className="text-caption text-text-muted">
                  {(entry.actorId && names[entry.actorId]) || "Super Admin"}, {formatManila(entry.at)}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
