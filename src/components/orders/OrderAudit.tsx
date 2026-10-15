"use client";

import { useEffect, useState } from "react";

import { presentAuditAction } from "@/app/admin/_lib/present";
import { listAudit } from "@/lib/api/client";
import type { AuditEntry } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";

function valueText(value: unknown): string | null {
  if (value == null) return null;
  return typeof value === "string" ? value : JSON.stringify(value);
}

export function OrderAudit({ orderId }: { orderId: string }) {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let gone = false;
    setFailed(false);
    setEntries(null);
    listAudit({ orderId, limit: 100 })
      .then((rows) => {
        if (!gone) setEntries(rows);
      })
      .catch(() => {
        if (!gone) setFailed(true);
      });
    return () => {
      gone = true;
    };
  }, [orderId]);

  if (failed) {
    return <p className="text-body text-error m-0">This order&apos;s audit record could not be loaded.</p>;
  }
  if (!entries) {
    return <div className="h-16 animate-pulse rounded-card bg-surface-variant" aria-hidden />;
  }
  if (!entries.length) {
    return <p className="text-body text-text-secondary m-0">No audit entries for this order yet.</p>;
  }
  return (
    <ul className="m-0 flex list-none flex-col gap-3 p-0">
      {entries.map((entry) => {
        const was = valueText(entry.previous);
        const now = valueText(entry.current);
        return (
          <li key={entry.id}>
            <p className="text-body text-text-primary m-0">{presentAuditAction(entry.action)}</p>
            <p className="text-caption text-text-muted m-0 mt-0.5">
              {entry.actorName || entry.actorId || "System"} · {formatDateTime(entry.at)}
            </p>
            {was || now ? (
              <p className="text-caption text-text-secondary m-0 mt-0.5">
                {was ? `Was ${was}. ` : ""}
                {now ? `Now ${now}.` : ""}
              </p>
            ) : null}
            {entry.reason ? (
              <p className="text-caption text-text-secondary m-0 mt-0.5">{entry.reason}</p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
