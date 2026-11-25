"use client";

import { useCallback, useEffect, useState } from "react";

import { AuditChangeLine } from "@/components/audit/AuditChangeLine";
import { Button } from "@/components/ui/button";
import { SkeletonLines } from "@/components/ui/loading";
import { listAuditPage } from "@/lib/api/client";
import type { AuditEntry } from "@/lib/api/types";
import {
  auditActorLine,
  formatAuditTime,
  presentAuditAction,
  presentAuditActor,
} from "@/lib/audit";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { useSerializedLoad } from "@/lib/live/useSerializedLoad";
import { partnerErrorText } from "@/lib/organization-partners";

const PAGE = 10;

/** The byline already says who; a first setting shows its values, from None. */
function readable(entry: AuditEntry): Pick<AuditEntry, "action" | "before" | "after"> {
  const values = (side: unknown) => {
    if (typeof side !== "object" || side === null) return null;
    return Object.fromEntries(
      Object.entries(side).filter(
        ([key]) => !["updatedBy", "updatedAt", "version"].includes(key),
      ),
    );
  };
  const after = values(entry.after);
  return {
    action: entry.action,
    before: values(entry.before) ?? (after ? {} : null),
    after,
  };
}

/**
 * Who changed the perk or the partnership, what it was before and why, from
 * the audit log. Super Admin only: the API refuses this read to Operations,
 * so it lives in the Super Admin tree. `userId` is null for the standard perk.
 */
export function PartnerChanges({ userId }: { userId: string | null }) {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useSerializedLoad(
    useCallback(async () => {
      try {
        const pages = await Promise.all([
          listAuditPage({
            entityType: "member_perk",
            entityId: userId ?? "standard",
            limit: PAGE,
          }),
          ...(userId
            ? [
                listAuditPage({
                  action: "organization_partner.set",
                  entityType: "organization",
                  entityId: userId,
                  limit: PAGE,
                }),
              ]
            : []),
        ]);
        setEntries(
          pages
            .flatMap((page) => page.audit)
            .sort((a, b) => b.at.localeCompare(a.at))
            .slice(0, PAGE),
        );
        setError(null);
      } catch (err) {
        setError(partnerErrorText(err, "load"));
      }
    }, [userId]),
  );
  useEffect(() => {
    void load();
  }, [load]);
  useLiveReload(["identity"], load);

  return (
    <section
      aria-labelledby="changes-heading"
      className="gg-card flex flex-col gap-3 p-3"
    >
      <div>
        <h3 id="changes-heading" className="text-h3 text-text-primary m-0">
          {userId ? "Changes" : "Standard perk changes"}
        </h3>
        <p className="text-caption text-text-muted m-0 mt-0.5">
          The latest {PAGE}, newest first. Everything stays in the audit log.
        </p>
      </div>
      {error ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-body text-error m-0" role="alert">
            {error}
          </p>
          <Button variant="secondary" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      ) : null}
      {!entries ? (
        error ? null : (
          <div role="status" aria-busy="true">
            <span className="sr-only">Loading changes</span>
            <SkeletonLines />
          </div>
        )
      ) : entries.length ? (
        <ul
          className="m-0 flex list-none flex-col gap-3 p-0"
          aria-label="Changes, newest first"
        >
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="border-outline-subtle flex flex-col gap-1 border-t pt-3 first:border-t-0 first:pt-0"
            >
              <span
                className="text-body text-text-primary"
                style={{ fontFamily: "var(--font-medium)" }}
              >
                {presentAuditAction(entry.action)}
              </span>
              <span className="text-caption text-text-muted">
                {presentAuditActor(entry).name} ({auditActorLine(entry)}) ·{" "}
                {formatAuditTime(entry.at)}
              </span>
              <AuditChangeLine entry={readable(entry)} max={6} />
              {entry.reason ? (
                <span className="text-body text-text-secondary whitespace-pre-line break-words">
                  Why: {entry.reason}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-body text-text-secondary m-0">
          {userId ? "No changes yet." : "The standard perk has never been set."}
        </p>
      )}
    </section>
  );
}
