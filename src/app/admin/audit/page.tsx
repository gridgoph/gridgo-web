"use client";

import { useSerializedLoad } from "@/lib/live/useSerializedLoad";

import { useLiveReload } from "@/lib/live/useLiveReload";

import { useCallback, useEffect, useMemo, useState } from "react";

import { adminErrorMessage } from "@/app/admin/_lib/errors";
import {
  presentActorRole,
  presentAuditAction,
  presentAuditEntityType,
} from "@/app/admin/_lib/present";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listAudit } from "@/lib/api/client";
import type { AuditEntry } from "@/lib/api/types";
import { auditCsv, itemOf, whereOf } from "@/lib/audit-csv";
import { formatDateTime } from "@/lib/format";

const ENTITY_FILTERS = [
  { value: "all", label: "All entity types" },
  { value: "user", label: "User" },
  { value: "credits", label: "Pilot Credits" },
  { value: "zone", label: "Zone" },
  { value: "claim", label: "Claim" },
  { value: "issue", label: "Issue" },
  { value: "order", label: "Order" },
  { value: "supplier_service", label: "Supplier service" },
] as const;

export default function AdminAuditPage() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [entityType, setEntityType] = useState<string>("all");
  const [actionQuery, setActionQuery] = useState("");
  const [actorQuery, setActorQuery] = useState("");
  const [orderQuery, setOrderQuery] = useState("");
  const [fromDay, setFromDay] = useState("");
  const [toDay, setToDay] = useState("");

  const load = useSerializedLoad(
    useCallback(async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await listAudit({
          entityType: entityType === "all" ? undefined : entityType,
          actor: actorQuery.trim() || undefined,
          actionQuery: actionQuery.trim() || undefined,
          orderId: orderQuery.trim() || undefined,
          from: fromDay ? `${fromDay}T00:00:00.000Z` : undefined,
          to: toDay ? `${toDay}T23:59:59.999Z` : undefined,
          limit: 500,
        });
        setEntries(data);
      } catch (err) {
        setEntries(null);
        setError(
          adminErrorMessage(
            err,
            "Could not load the audit log. Confirm the demo API is running.",
          ),
        );
      } finally {
        setLoading(false);
      }
    }, [entityType, actorQuery, actionQuery, orderQuery, fromDay, toDay]),
  );

  useLiveReload(["orders", "claims", "payouts", "identity", "settings"], load);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = entries ?? [];

  function downloadCsv() {
    if (!entries) return;
    const blob = new Blob([auditCsv(entries)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "audit-log.csv";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  const columns = useMemo<DataTableColumn<AuditEntry>[]>(
    () => [
      {
        id: "at",
        header: "When",
        primary: true,
        sortValue: (e) => e.at,
        cell: (e) => (
          <span className="text-body text-text-primary whitespace-nowrap">
            {formatDateTime(e.at)}
          </span>
        ),
      },
      {
        id: "action",
        header: "Action",
        // Reasons are free text: cap the column and wrap instead of overflowing.
        className: "max-w-[26rem] whitespace-normal",
        sortValue: (e) => presentAuditAction(e.action),
        filterValue: (e) =>
          `${presentAuditAction(e.action)} ${e.reason ?? ""} ${e.entityId ?? ""}`,
        cell: (e) => (
          <div>
            <p
              className="text-body text-text-primary m-0"
              style={{ fontFamily: "var(--font-medium)" }}
            >
              {presentAuditAction(e.action)}
            </p>
            {e.reason ? (
              <p className="text-caption text-text-muted m-0 mt-0.5">{e.reason}</p>
            ) : null}
            {whereOf(e) ? (
              <p className="text-caption text-text-muted m-0 mt-0.5">{whereOf(e)}</p>
            ) : null}
            <p className="text-caption text-text-muted m-0 mt-0.5">
              {itemOf(e) || "—"}
              {e.previous != null ? ` · was ${typeof e.previous === "string" ? e.previous : JSON.stringify(e.previous)}` : ""}
              {e.current != null ? ` · now ${typeof e.current === "string" ? e.current : JSON.stringify(e.current)}` : ""}
            </p>
          </div>
        ),
      },
      {
        id: "actor",
        header: "Actor",
        sortValue: (e) => presentActorRole(e.actorRole),
        cell: (e) => {
          const role = presentActorRole(e.actorRole);
          const name = e.actorName || (e.actorId ? e.actorId.replace(/^user_/, "") : "");
          return (
            <div>
              <p className="text-body text-text-primary m-0">{name || role}</p>
              {name && name.toLowerCase() !== role.toLowerCase() ? (
                <p className="text-caption text-text-muted m-0 mt-0.5">{role}</p>
              ) : null}
            </div>
          );
        },
      },
      {
        id: "entity",
        header: "Entity",
        sortValue: (e) => presentAuditEntityType(e.entityType),
        cell: (e) => (
          <div>
            <p className="text-body text-text-secondary m-0">
              {presentAuditEntityType(e.entityType)}
            </p>
            {e.entityId ? (
              <p className="text-caption text-text-muted m-0 mt-0.5">{e.entityId}</p>
            ) : null}
          </div>
        ),
      },
      {
        id: "order",
        header: "Order",
        sortValue: (e) => e.orderId ?? "",
        cell: (e) => (
          <span className="text-body text-text-secondary">{e.orderId ?? "—"}</span>
        ),
      },
    ],
    [],
  );

  const pending = loading && !entries;

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
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-prose">
          <p className="text-body text-text-secondary m-0">
            One record of who did what, when, and from which app. Entries are not
            edited or deleted. An order’s own entries also show on that order.
          </p>
          <p className="text-caption text-text-muted m-0 mt-2">
            Policy configuration is not exposed by the demo API, so this screen is the
            audit log only — no silent policy controls.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={loading || !entries} onClick={downloadCsv}>
            Download CSV
          </Button>
          <Button variant="secondary" disabled={loading} onClick={() => void load()}>
            Refresh
          </Button>
        </div>
      </div>

      <section className="gg-card" aria-labelledby="filters-heading">
        <h2 id="filters-heading" className="text-h3 text-text-primary m-0 mb-3">
          Filters
        </h2>
        <FieldGroup className="grid gap-4 md:grid-cols-3">
          <Field>
            <FieldLabel>Entity type</FieldLabel>
            <Select value={entityType} onValueChange={(v) => setEntityType(v ?? "all")}>
              <SelectTrigger className="min-h-11 w-full">
                <SelectValue>
                  {(v) =>
                    ENTITY_FILTERS.find((f) => f.value === v)?.label ??
                    ENTITY_FILTERS[0]?.label
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {ENTITY_FILTERS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="audit-action">Action contains</FieldLabel>
            <Input
              id="audit-action"
              value={actionQuery}
              onChange={(e) => setActionQuery(e.target.value)}
              placeholder="e.g. grant, role, zone"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="audit-actor">Person</FieldLabel>
            <Input
              id="audit-actor"
              value={actorQuery}
              onChange={(e) => setActorQuery(e.target.value)}
              placeholder="Name or account"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="audit-order">Order</FieldLabel>
            <Input
              id="audit-order"
              value={orderQuery}
              onChange={(e) => setOrderQuery(e.target.value)}
              placeholder="Order id"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="audit-from">From</FieldLabel>
            <Input id="audit-from" type="date" value={fromDay} onChange={(e) => setFromDay(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="audit-to">To</FieldLabel>
            <Input id="audit-to" type="date" value={toDay} onChange={(e) => setToDay(e.target.value)} />
          </Field>
        </FieldGroup>
      </section>

      {!pending && !filtered.length ? (
        <EmptyState
          title="No audit entries match"
          body="Broaden filters or wait for governance actions (role changes, grants, verification) to land on the log."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setEntityType("all");
                setActionQuery("");
                setActorQuery("");
                setOrderQuery("");
                setFromDay("");
                setToDay("");
                void load();
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          loading={pending}
          getRowId={(e) => e.id}
          caption="Platform audit log"
          filterPlaceholder="Search entries…"
          defaultSortId="at"
          defaultSortDirection="desc"
        />
      )}
    </div>
  );
}
