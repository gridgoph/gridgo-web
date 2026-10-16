"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Download, PanelRightOpen } from "lucide-react";

import { AuditChangeLine } from "@/components/audit/AuditChangeLine";
import { AuditEntrySheet } from "@/components/audit/AuditEntrySheet";
import { useAuditExport } from "@/components/audit/useAuditExport";
import { Button } from "@/components/ui/button";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { isApiError, listOrderAudit } from "@/lib/api/client";
import type { AuditEntry } from "@/lib/api/types";
import {
  auditErrorMessage,
  formatAuditTime,
  presentAuditActor,
  presentAuditAction,
  type AuditNames,
} from "@/lib/audit";
import { formatRelativeTime } from "@/lib/format";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { useSerializedLoad } from "@/lib/live/useSerializedLoad";

const PAGE_SIZE = 50;

export type OrderAuditState = {
  entries: AuditEntry[] | null;
  nextOffset: number | null;
  error: string | null;
  loading: boolean;
  loadingMore: boolean;
  moreError: string | null;
  reload: () => Promise<void>;
  showMore: () => Promise<void>;
};

/**
 * One order's audit entries (`GET /orders/:id/audit`), read the first time
 * the row opens and again on the order's live events after that. The API
 * scopes Operations to the correction and deletion records itself.
 */
export function useOrderAudit(orderId: string, active: boolean): OrderAuditState {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const started = useRef(false);

  const reload = useSerializedLoad(
    useCallback(async () => {
      setLoading(true);
      setError(null);
      setMoreError(null);
      try {
        const page = await listOrderAudit(orderId, { limit: PAGE_SIZE });
        setEntries(page.audit);
        setNextOffset(page.nextOffset);
      } catch (err) {
        setEntries(null);
        setError(
          isApiError(err) && err.status === 404 && err.code !== "order_not_found"
            ? "This server does not keep an audit list per order yet. It arrives with the next API update."
            : auditErrorMessage(err, "The audit entries could not be loaded. Try again."),
        );
      } finally {
        setLoading(false);
      }
    }, [orderId]),
  );

  useEffect(() => {
    started.current = false;
    setEntries(null);
    setNextOffset(null);
    setError(null);
  }, [orderId]);

  useEffect(() => {
    if (active && !started.current) {
      started.current = true;
      void reload();
    }
  }, [active, reload]);

  const live = useCallback(() => (started.current ? reload() : undefined), [reload]);
  useLiveReload(["orders", "payouts"], live, { matchId: orderId });

  async function showMore() {
    if (nextOffset === null) return;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const page = await listOrderAudit(orderId, { limit: PAGE_SIZE, offset: nextOffset });
      setEntries((current) => {
        const seen = new Set((current ?? []).map((entry) => entry.id));
        return [...(current ?? []), ...page.audit.filter((entry) => !seen.has(entry.id))];
      });
      setNextOffset(page.nextOffset);
    } catch (err) {
      setMoreError(auditErrorMessage(err, "Older entries could not be loaded. Try again."));
    } finally {
      setLoadingMore(false);
    }
  }

  return { entries, nextOffset, error, loading, loadingMore, moreError, reload, showMore };
}

/** The Audit row's one-line summary, before and after it has been read. */
export function orderAuditSummary(state: Pick<OrderAuditState, "entries" | "error">, tree: "admin" | "ops"): string {
  if (state.error) return "The audit entries could not be loaded";
  if (!state.entries) {
    return tree === "admin"
      ? "Every recorded action on this order: who, what changed and why"
      : "Staff corrections and file deletions on this order";
  }
  if (!state.entries.length) {
    return tree === "admin" ? "Nothing recorded yet" : "No corrections or deletions recorded";
  }
  const latest = state.entries[0];
  const count = state.entries.length;
  const total = count === 1 ? "1 entry" : `${count}${count >= PAGE_SIZE ? "+" : ""} entries`;
  return `${total}. Latest: ${presentAuditAction(latest.action)}, ${presentAuditActor(latest).name}, ${formatRelativeTime(latest.at)}`;
}

/**
 * The order's own audit entries, newest first: when, who, what changed in a
 * line, and the reason. "View entry" opens the whole record with the old value
 * beside the new. The CSV holds this order's entries only.
 */
export function OrderAuditPanel({
  orderId,
  tree,
  state,
  names,
}: {
  orderId: string;
  tree: "admin" | "ops";
  state: OrderAuditState;
  names?: AuditNames;
}) {
  const [open, setOpen] = useState<AuditEntry | null>(null);
  const exporter = useAuditExport();
  const { entries, error, loading } = state;

  return (
    <div className="flex flex-col gap-3">
      {tree === "ops" ? (
        <p className="text-caption text-text-muted m-0">
          Operations sees staff corrections, refused step changes and file deletions here. Super Admin
          sees every action on the order.
        </p>
      ) : null}

      {error ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-body text-destructive m-0" role="alert">
            {error}
          </p>
          <Button type="button" size="sm" onClick={() => void state.reload()}>
            Try again
          </Button>
        </div>
      ) : !entries || (loading && !entries.length) ? (
        <LoadingBlock label="Loading the audit entries" className="min-h-24" />
      ) : !entries.length ? (
        <p className="text-body text-text-secondary m-0">
          {tree === "admin"
            ? "No actions are recorded on this order yet."
            : "No staff corrections or file deletions are recorded on this order."}
        </p>
      ) : (
        <ol className="border-outline m-0 flex list-none flex-col rounded-card border p-0" aria-label="Audit entries">
          {entries.map((entry) => {
            const actor = presentAuditActor(entry);
            return (
              <li
                key={entry.id}
                className="border-outline-subtle flex flex-col gap-2 border-t p-3 first:border-t-0 sm:flex-row sm:items-start sm:gap-4"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-medium)" }}>
                    {presentAuditAction(entry.action)}
                  </p>
                  <p className="text-caption text-text-muted m-0">
                    {actor.role === actor.name ? actor.name : `${actor.name} (${actor.role})`},{" "}
                    <span className="tabular-nums">{formatAuditTime(entry.at)}</span>
                  </p>
                  <AuditChangeLine entry={entry} names={names} />
                  {entry.reason ? (
                    <p className="text-caption text-text-secondary m-0 break-words">Reason: {entry.reason}</p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="self-start"
                  aria-label={`View entry: ${presentAuditAction(entry.action)}, ${formatAuditTime(entry.at)}`}
                  onClick={() => setOpen(entry)}
                >
                  <PanelRightOpen aria-hidden />
                  View entry
                </Button>
              </li>
            );
          })}
        </ol>
      )}

      {state.moreError ? (
        <p className="text-body text-destructive m-0" role="alert">
          {state.moreError}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {state.nextOffset !== null ? (
          <Button type="button" size="sm" disabled={state.loadingMore} onClick={() => void state.showMore()}>
            {state.loadingMore ? "Loading older entries" : "Show older entries"}
          </Button>
        ) : null}
        {entries?.length ? (
          <Button
            type="button"
            size="sm"
            disabled={exporter.exporting}
            onClick={() => void exporter.exportCsv({}, orderId)}
          >
            <Download aria-hidden />
            {exporter.exporting ? "Exporting" : "Download these entries (CSV)"}
          </Button>
        ) : null}
        {tree === "admin" ? (
          <Link
            href={`/admin/audit?orderId=${encodeURIComponent(orderId)}`}
            className="text-body text-text-secondary inline-flex min-h-11 items-center underline-offset-2 hover:underline"
          >
            Search them in the audit log
          </Link>
        ) : null}
      </div>
      {exporter.error ? (
        <p className="text-body text-destructive m-0" role="alert">
          {exporter.error}
        </p>
      ) : null}

      <AuditEntrySheet
        entry={open}
        tree={tree}
        names={names}
        currentOrderId={orderId}
        onClose={() => setOpen(null)}
      />
    </div>
  );
}
