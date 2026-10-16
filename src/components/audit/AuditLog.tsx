"use client";

import { useCallback, useEffect, useId, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, PanelRightOpen, RefreshCw, SlidersHorizontal } from "lucide-react";

import { presentAuditDetail } from "@/app/admin/_lib/present";
import { AuditChangeLine } from "@/components/audit/AuditChangeLine";
import { AuditEntrySheet } from "@/components/audit/AuditEntrySheet";
import { useAuditExport } from "@/components/audit/useAuditExport";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DataTable, DataTableRowAction, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listAuditPage } from "@/lib/api/client";
import type { AuditEntry, AuditPage } from "@/lib/api/types";
import {
  AUDIT_ACTION_GROUPS,
  AUDIT_ITEM_TYPES,
  auditActorLine,
  auditErrorMessage,
  auditFiltersAreSet,
  auditFiltersFromSearchParams,
  auditOrderIds,
  auditQuery,
  auditSearchFromFilters,
  formatAuditTime,
  manilaToday,
  presentAuditActor,
  presentAuditAction,
  presentAuditItemType,
  type AuditFilters,
} from "@/lib/audit";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { useSerializedLoad } from "@/lib/live/useSerializedLoad";
import { cn } from "@/lib/utils";

/** Select value for "no filter"; Base UI needs a non-empty item value. */
const ANY = "any";
const PAGE_SIZE = 100;
const ALL_LOADED_ROWS = 100_000;
const HREF = "/admin/audit";

type Loaded = {
  /** The query these rows answer. */
  key: string;
  rows: AuditEntry[];
  nextOffset: number | null;
  legacy: boolean;
};

/** Filters other than search, which stays visible on a phone. */
function narrowingCount(filters: AuditFilters): number {
  return [filters.person, filters.action, filters.orderId, filters.entityType, filters.from, filters.to].filter(
    (value) => value.trim() !== "",
  ).length;
}

function countLine(rows: number, more: boolean, filtered: boolean): string {
  const noun = rows === 1 ? "entry" : "entries";
  const which = filtered ? `${rows.toLocaleString("en-PH")} matching ${noun}` : `${rows.toLocaleString("en-PH")} ${noun}`;
  return more ? `${which} shown, newest first. Older ones follow.` : `${which}, newest first.`;
}

/**
 * Super Admin's permanent audit log (AUDIT_API.md): every important action
 * across GRIDGO, searched and filtered by the API, newest first, a page at a
 * time. Each row says what changed in a line; the sheet shows the whole entry
 * with the old value beside the new. Export downloads the same filters as CSV.
 */
export function AuditLog() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const applied = useMemo(() => auditFiltersFromSearchParams(new URLSearchParams(search)), [search]);
  const filtered = auditFiltersAreSet(applied);
  const narrowed = narrowingCount(applied);
  const [draft, setDraft] = useState<AuditFilters>(applied);
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(narrowed > 0);
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [open, setOpen] = useState<AuditEntry | null>(null);
  const moreFiltersId = useId();
  const exporter = useAuditExport();

  useEffect(() => {
    setDraft(applied);
  }, [applied]);

  const request = useMemo(() => auditQuery(applied), [applied]);
  const requestKey = JSON.stringify(request);

  const load = useSerializedLoad(
    useCallback(async () => {
      if ("error" in request) {
        setData(null);
        setError(request.error);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      setMoreError(null);
      try {
        const page: AuditPage = await listAuditPage({ ...request.query, limit: PAGE_SIZE });
        setData({ key: requestKey, rows: page.audit, nextOffset: page.nextOffset, legacy: page.legacy });
      } catch (err) {
        // A failed refresh keeps the rows already read for the same filters.
        setData((current) => (current?.key === requestKey ? current : null));
        setError(auditErrorMessage(err, "The audit log could not be loaded. Try again."));
      } finally {
        setLoading(false);
      }
    }, [request, requestKey]),
  );

  // New entries land at the top. Re-read the first page only while nobody has
  // paged back, so a live event never folds away older rows someone opened.
  const pagedBack = (data?.rows.length ?? 0) > PAGE_SIZE;
  const liveLoad = useCallback(() => (pagedBack ? undefined : load()), [pagedBack, load]);
  useLiveReload(["orders", "payouts", "identity", "settings"], liveLoad);

  useEffect(() => {
    void load();
  }, [load]);

  async function showMore() {
    if (!data?.nextOffset || "error" in request) return;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const page = await listAuditPage({ ...request.query, limit: PAGE_SIZE, offset: data.nextOffset });
      setData((current) => {
        if (!current) return current;
        const seen = new Set(current.rows.map((row) => row.id));
        return {
          ...current,
          rows: [...current.rows, ...page.audit.filter((row) => !seen.has(row.id))],
          nextOffset: page.nextOffset,
        };
      });
    } catch (err) {
      setMoreError(auditErrorMessage(err, "Older entries could not be loaded. Try again."));
    } finally {
      setLoadingMore(false);
    }
  }

  function apply(event: FormEvent) {
    event.preventDefault();
    const requested = auditQuery(draft);
    if ("error" in requested) {
      setFormError(requested.error);
      setMoreFiltersOpen(true);
      return;
    }
    setFormError(null);
    router.push(`${HREF}${auditSearchFromFilters(draft)}`);
  }

  function clear() {
    setFormError(null);
    router.push(HREF);
  }

  const columns = useMemo<DataTableColumn<AuditEntry>[]>(
    () => [
      {
        id: "at",
        header: "When",
        sortable: false,
        cell: (entry) => (
          <span className="text-body text-text-primary tabular-nums whitespace-nowrap">
            {formatAuditTime(entry.at)}
          </span>
        ),
      },
      {
        id: "who",
        header: "Who",
        sortable: false,
        cell: (entry) => {
          const actor = presentAuditActor(entry);
          return (
            <div className="min-w-0">
              <p className="text-body text-text-primary m-0">{actor.name}</p>
              <p className="text-caption text-text-muted m-0 mt-0.5">{auditActorLine(entry)}</p>
            </div>
          );
        },
      },
      {
        id: "action",
        header: "Action",
        primary: true,
        sortable: false,
        className: "max-w-[22rem] whitespace-normal",
        cell: (entry) => {
          const detail = presentAuditDetail({ ...entry, detail: entry.detail ?? null });
          return (
            <div className="min-w-0">
              <p className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-medium)" }}>
                {presentAuditAction(entry.action)}
              </p>
              {detail ? <p className="text-caption text-text-secondary m-0 mt-0.5">{detail}</p> : null}
              {entry.reason ? (
                <p className="text-caption text-text-muted m-0 mt-0.5 line-clamp-2 break-words">
                  Reason: {entry.reason}
                </p>
              ) : null}
            </div>
          );
        },
      },
      {
        id: "item",
        header: "Item",
        sortable: false,
        className: "min-w-[10rem] max-w-[16rem] whitespace-normal",
        cell: (entry) => {
          const orders = auditOrderIds(entry);
          const showItemId = entry.entityId && !orders.includes(entry.entityId);
          return (
            <div className="min-w-0">
              <p className="text-body text-text-secondary m-0">{presentAuditItemType(entry.entityType)}</p>
              {showItemId ? (
                <p className="text-caption text-text-muted m-0 mt-0.5 break-all">{entry.entityId}</p>
              ) : null}
              {orders.slice(0, 2).map((id) => (
                <Link
                  key={id}
                  href={`/admin/orders/${encodeURIComponent(id)}`}
                  className="text-caption text-text-primary mt-0.5 block break-all underline underline-offset-2"
                >
                  {id}
                </Link>
              ))}
              {orders.length > 2 ? (
                <p className="text-caption text-text-muted m-0 mt-0.5">and {orders.length - 2} more orders</p>
              ) : null}
            </div>
          );
        },
      },
      {
        id: "change",
        header: "What changed",
        sortable: false,
        className: "min-w-[14rem] max-w-[26rem] whitespace-normal",
        cell: (entry) => <AuditChangeLine entry={entry} />,
      },
    ],
    [],
  );

  const rows = data?.rows ?? [];
  const exportQuery = "error" in request ? null : request.query;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-body text-text-secondary m-0 max-w-prose">
        Every important action across GRIDGO: who did it, from which app, what it changed and why.
        Entries are permanent. Nothing here can be edited or deleted.
      </p>

      <form className="gg-card grid gap-3" onSubmit={apply} noValidate aria-label="Search the audit log">
        <Field>
          <FieldLabel htmlFor="audit-q">Search</FieldLabel>
          <div className="flex gap-2">
            <Input
              id="audit-q"
              type="search"
              value={draft.q}
              onChange={(event) => setDraft((current) => ({ ...current, q: event.target.value }))}
              placeholder="Name, action, order or item ID, or reason"
              autoComplete="off"
            />
            <Button
              type="button"
              className="md:hidden"
              aria-expanded={moreFiltersOpen}
              aria-controls={moreFiltersId}
              onClick={() => setMoreFiltersOpen((value) => !value)}
            >
              <SlidersHorizontal aria-hidden />
              {narrowed > 0 ? `Filters (${narrowed})` : "Filters"}
            </Button>
          </div>
        </Field>

        <div
          id={moreFiltersId}
          className={cn("gap-3 md:grid md:grid-cols-2 xl:grid-cols-3", moreFiltersOpen ? "grid" : "hidden")}
        >
          <Field>
            <FieldLabel htmlFor="audit-person">Person</FieldLabel>
            <Input
              id="audit-person"
              value={draft.person}
              onChange={(event) => setDraft((current) => ({ ...current, person: event.target.value }))}
              placeholder="Part of a name or user ID"
              autoComplete="off"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="audit-action">Action</FieldLabel>
            <Select
              value={draft.action || ANY}
              onValueChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  action: !value || value === ANY ? "" : String(value),
                }))
              }
            >
              <SelectTrigger id="audit-action" className="min-h-11 w-full">
                <SelectValue>
                  {(value) => (!value || value === ANY ? "Every action" : presentAuditAction(String(value)))}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Every action</SelectItem>
                {/* An action reached by a link but not in the list still shows. */}
                {draft.action &&
                !AUDIT_ACTION_GROUPS.some((group) => group.actions.includes(draft.action)) ? (
                  <SelectItem value={draft.action}>{presentAuditAction(draft.action)}</SelectItem>
                ) : null}
                {AUDIT_ACTION_GROUPS.map((group) => (
                  <SelectGroup key={group.label}>
                    <SelectLabel>{group.label}</SelectLabel>
                    {group.actions.map((action) => (
                      <SelectItem key={action} value={action}>
                        {presentAuditAction(action)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="audit-order">Order</FieldLabel>
            <Input
              id="audit-order"
              value={draft.orderId}
              onChange={(event) => setDraft((current) => ({ ...current, orderId: event.target.value }))}
              placeholder="Exact order ID"
              autoComplete="off"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="audit-item">Item type</FieldLabel>
            <Select
              value={draft.entityType || ANY}
              onValueChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  entityType: !value || value === ANY ? "" : String(value),
                }))
              }
            >
              <SelectTrigger id="audit-item" className="min-h-11 w-full">
                <SelectValue>
                  {(value) => (!value || value === ANY ? "Every item type" : presentAuditItemType(String(value)))}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Every item type</SelectItem>
                {draft.entityType && !AUDIT_ITEM_TYPES.includes(draft.entityType) ? (
                  <SelectItem value={draft.entityType}>{presentAuditItemType(draft.entityType)}</SelectItem>
                ) : null}
                {AUDIT_ITEM_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {presentAuditItemType(type)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="audit-from">From</FieldLabel>
            <Input
              id="audit-from"
              type="date"
              value={draft.from}
              max={draft.to || manilaToday()}
              onChange={(event) => setDraft((current) => ({ ...current, from: event.target.value }))}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="audit-to">To</FieldLabel>
            <Input
              id="audit-to"
              type="date"
              value={draft.to}
              min={draft.from || undefined}
              onChange={(event) => setDraft((current) => ({ ...current, to: event.target.value }))}
            />
            <FieldDescription>Dates are Manila days; the To day is included.</FieldDescription>
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="primary">
            Apply filters
          </Button>
          {filtered ? (
            <Button type="button" onClick={clear}>
              Clear filters
            </Button>
          ) : null}
          {formError ? (
            <p className="text-body text-destructive m-0" role="alert">
              {formError}
            </p>
          ) : null}
        </div>
      </form>

      {data?.legacy ? (
        <Alert>
          <AlertTitle>This server has the older audit log</AlertTitle>
          <AlertDescription>
            Search, person and dates are not applied yet, and only the newest entries show. They work
            once the API update with the permanent audit log is deployed.
          </AlertDescription>
        </Alert>
      ) : null}

      {error && !loading && !data ? (
        <ErrorState
          body={error}
          action={
            <Button type="button" onClick={() => void load()}>
              Try again
            </Button>
          }
        />
      ) : (
        <>
          <DataTable
            toolbar={
              data ? (
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-body text-text-secondary m-0 tabular-nums" role="status">
                    {countLine(rows.length, data.nextOffset !== null, filtered)}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    disabled={!exportQuery || exporter.exporting || !rows.length}
                    onClick={() => exportQuery && void exporter.exportCsv(exportQuery)}
                  >
                    <Download aria-hidden />
                    {exporter.exporting
                      ? exporter.pages > 0
                        ? `Exporting, ${exporter.pages} ${exporter.pages === 1 ? "page" : "pages"} so far`
                        : "Exporting"
                      : filtered
                        ? "Export these entries (CSV)"
                        : "Export the log (CSV)"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={loading}
                    onClick={() => void load()}
                  >
                    <RefreshCw aria-hidden />
                    Refresh
                  </Button>
                </div>
              ) : null
            }
            caption="Audit log"
            columns={columns}
            data={rows}
            getRowId={(entry) => entry.id}
            loading={loading && !data}
            itemLabel="entries"
            // DataTable reads its page size once; every loaded row shows, and
            // "Show older entries" is the only pager.
            pageSize={ALL_LOADED_ROWS}
            rowActionsDensity="labeled"
            rowActions={(entry) => (
              <DataTableRowAction
                label="View entry"
                icon={PanelRightOpen}
                onClick={() => setOpen(entry)}
              />
            )}
            empty={
              <EmptyState
                title={filtered ? "No entries match" : "No entries yet"}
                body={
                  filtered
                    ? "Widen the dates, clear a filter, or search for part of a name instead."
                    : "Actions land here as people work: settings saved, orders moved on, payouts released."
                }
                action={
                  filtered ? (
                    <Button type="button" onClick={clear}>
                      Clear filters
                    </Button>
                  ) : undefined
                }
              />
            }
          />
          {error && data ? (
            <p className="text-body text-destructive m-0" role="alert">
              {error} The entries below are from the last read.
            </p>
          ) : null}
          {exporter.error ? (
            <p className="text-body text-destructive m-0" role="alert">
              {exporter.error}
            </p>
          ) : null}
          {moreError ? (
            <p className="text-body text-destructive m-0" role="alert">
              {moreError}
            </p>
          ) : null}
          {data?.nextOffset ? (
            <div>
              <Button type="button" onClick={() => void showMore()} disabled={loadingMore}>
                {loadingMore ? "Loading older entries" : "Show older entries"}
              </Button>
            </div>
          ) : null}
        </>
      )}

      <AuditEntrySheet entry={open} tree="admin" onClose={() => setOpen(null)} />
    </div>
  );
}
