"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  presentActor,
  presentActorRole,
  presentAuditAction,
  presentEntityType,
  shortRecordId,
} from "@/app/ops/_lib/present";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiError, listAudit } from "@/lib/api/client";
import type { AuditEntry } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import { formatPhp } from "@/lib/format";

function detailSummary(detail: Record<string, unknown> | null): string {
  if (!detail || !Object.keys(detail).length) return "";
  const parts: string[] = [];
  if (typeof detail.amountMinor === "number") {
    parts.push(`Amount ${formatPhp(detail.amountMinor)}`);
  }
  if (typeof detail.balanceAfterMinor === "number") {
    parts.push(`Balance after ${formatPhp(detail.balanceAfterMinor)}`);
  }
  if (typeof detail.status === "string") {
    parts.push(
      `Status ${String(detail.status)
        .split(/[_-]/)
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join(" ")}`,
    );
  }
  if (typeof detail.kind === "string") {
    parts.push(
      String(detail.kind)
        .split(/[_-]/)
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join(" "),
    );
  }
  if (typeof detail.name === "string") {
    parts.push(detail.name);
  }
  if (typeof detail.categoryCode === "string") {
    parts.push(
      String(detail.categoryCode)
        .split(/[_-]/)
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join(" "),
    );
  }
  if (!parts.length) {
    // Compact key list without dumping raw JSON walls
    const keys = Object.keys(detail).slice(0, 4);
    return keys
      .map((k) => {
        const v = detail[k];
        if (v == null) return null;
        if (typeof v === "object") return null;
        return `${k.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase()).replace(/_/g, " ")}: ${String(v)}`;
      })
      .filter(Boolean)
      .join(" · ");
  }
  return parts.join(" · ");
}

export default function OpsAuditPage() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [entityType, setEntityType] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [orderId, setOrderId] = useState("");
  const [actorId, setActorId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listAudit({
        limit: 100,
        entityType: entityType === "all" ? undefined : entityType,
        action: actionFilter === "all" ? undefined : actionFilter,
        orderId: orderId.trim() || undefined,
        actorId: actorId.trim() || undefined,
      });
      setEntries(data);
    } catch (err) {
      setEntries(null);
      if (err instanceof ApiError) {
        setError(
          err.kind === "forbidden"
            ? "Audit log is not available for this session."
            : `Could not load audit log (${err.code}).`,
        );
      } else {
        setError("Network error loading audit log.");
      }
    } finally {
      setLoading(false);
    }
  }, [entityType, actionFilter, orderId, actorId]);

  useEffect(() => {
    void load();
  }, [load]);

  const actionOptions = useMemo(() => {
    if (!entries) return [] as string[];
    return [...new Set(entries.map((e) => e.action))].sort();
  }, [entries]);

  const entityOptions = useMemo(() => {
    if (!entries) return [] as string[];
    return [
      ...new Set(
        entries
          .map((e) => e.entityType)
          .filter((t): t is string => Boolean(t)),
      ),
    ].sort();
  }, [entries]);

  const columns = useMemo<DataTableColumn<AuditEntry>[]>(
    () => [
      {
        id: "when",
        header: "When",
        sortValue: (e) => e.at,
        cell: (e) => (
          <span className="text-body text-text-secondary whitespace-nowrap">
            {formatDateTime(e.at)}
          </span>
        ),
      },
      {
        id: "who",
        header: "Who",
        primary: true,
        sortValue: (e) => presentActor(e.actorId, e.actorRole),
        filterValue: (e) =>
          `${presentActor(e.actorId, e.actorRole)} ${presentActorRole(e.actorRole)} ${e.actorId ?? ""}`,
        cell: (e) => {
          const who = presentActor(e.actorId, e.actorRole);
          const role = presentActorRole(e.actorRole);
          return (
            <div>
              <p
                className="text-body text-text-primary m-0"
                style={{ fontFamily: "var(--font-medium)" }}
              >
                {who}
              </p>
              {/* Only when the role says something the name did not. */}
              {role !== who ? (
                <p className="text-caption text-text-muted m-0 mt-0.5">{role}</p>
              ) : null}
            </div>
          );
        },
      },
      {
        id: "action",
        header: "Action",
        sortValue: (e) => presentAuditAction(e.action),
        filterValue: (e) => presentAuditAction(e.action),
        cell: (e) => (
          <span className="text-body text-text-primary">
            {presentAuditAction(e.action)}
          </span>
        ),
      },
      {
        id: "record",
        header: "Record",
        sortValue: (e) =>
          `${e.entityType ?? ""} ${e.entityId ?? ""} ${e.orderId ?? ""}`,
        filterValue: (e) =>
          `${presentEntityType(e.entityType)} ${e.entityId ?? ""} ${e.orderId ?? ""}`,
        cell: (e) => (
          <div>
            <p className="text-body text-text-secondary m-0">
              {presentEntityType(e.entityType)}
              {e.entityId ? ` · ${shortRecordId(e.entityId)}` : ""}
            </p>
            {e.orderId ? (
              <p className="text-caption text-text-muted m-0 mt-0.5">
                Order {shortRecordId(e.orderId)}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        id: "reason",
        header: "Reason / detail",
        // Free text: give it a ceiling and let it wrap rather than run off the
        // right edge of the table.
        className: "max-w-[26rem] whitespace-normal",
        sortValue: (e) => e.reason ?? "",
        filterValue: (e) =>
          `${e.reason ?? ""} ${detailSummary(e.detail)}`,
        cell: (e) => {
          const detail = detailSummary(e.detail);
          return (
            <div>
              {e.reason ? (
                <p className="text-body text-text-secondary m-0">{e.reason}</p>
              ) : null}
              {detail ? (
                <p className="text-caption text-text-muted m-0 mt-0.5">
                  {detail}
                </p>
              ) : null}
              {!e.reason && !detail ? (
                <span className="text-body text-text-muted">—</span>
              ) : null}
            </div>
          );
        },
      },
    ],
    [],
  );

  if (loading && !entries) {
    return <LoadingBlock label="Loading audit log…" />;
  }

  if (error && !entries) {
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-body text-text-secondary m-0 max-w-prose">
          Platform accountability: who did what, when, to which record. Filter
          by record type, action, order, or actor. This is the trail the product
          rests on — not a debug dump.
        </p>
        <Button variant="secondary" onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      <form
        className="gg-card"
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
      >
        <FieldGroup className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Field>
            <FieldLabel htmlFor="audit-entity">Record type</FieldLabel>
            <Select
              value={entityType}
              onValueChange={(v) => setEntityType(v ?? "all")}
            >
              <SelectTrigger id="audit-entity" className="min-h-11 w-full">
                <SelectValue>
                  {(v) =>
                    !v || v === "all" ? "All types" : presentEntityType(String(v))
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {entityOptions.map((t) => (
                  <SelectItem key={t} value={t}>
                    {presentEntityType(t)}
                  </SelectItem>
                ))}
                {/* Common types even if empty in current page */}
                {["claim", "issue", "order", "zone", "credits", "supplier_service"].map(
                  (t) =>
                    entityOptions.includes(t) ? null : (
                      <SelectItem key={`opt-${t}`} value={t}>
                        {presentEntityType(t)}
                      </SelectItem>
                    ),
                )}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="audit-action">Action</FieldLabel>
            <Select
              value={actionFilter}
              onValueChange={(v) => setActionFilter(v ?? "all")}
            >
              <SelectTrigger id="audit-action" className="min-h-11 w-full">
                <SelectValue>
                  {(v) =>
                    !v || v === "all"
                      ? "All actions"
                      : presentAuditAction(String(v))
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                {actionOptions.map((a) => (
                  <SelectItem key={a} value={a}>
                    {presentAuditAction(a)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="audit-order">Order id</FieldLabel>
            <Input
              id="audit-order"
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              placeholder="Optional filter"
              className="min-h-11"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="audit-actor">Actor id</FieldLabel>
            <Input
              id="audit-actor"
              value={actorId}
              onChange={(e) => setActorId(e.target.value)}
              placeholder="Optional filter"
              className="min-h-11"
            />
          </Field>
        </FieldGroup>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="submit" variant="secondary">
            Apply filters
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setEntityType("all");
              setActionFilter("all");
              setOrderId("");
              setActorId("");
            }}
          >
            Clear
          </Button>
        </div>
      </form>

      {error ? (
        <p className="text-body text-error m-0" role="alert">
          {error}
        </p>
      ) : null}

      {!entries?.length ? (
        <EmptyState
          title="No audit entries match"
          body="Widen filters or clear them. Platform actions (claims, issues, verification, credits, zones) appear here as they happen."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setEntityType("all");
                setActionFilter("all");
                setOrderId("");
                setActorId("");
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={entries}
          getRowId={(e) => e.id}
          caption="Platform audit log"
          filterPlaceholder="Search who, action, reason…"
          itemLabel="entries"
          defaultSortId="when"
          defaultSortDirection="desc"
        />
      )}
    </div>
  );
}
