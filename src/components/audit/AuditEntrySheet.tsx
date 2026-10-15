"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { AuditEntry } from "@/lib/api/types";
import {
  auditChange,
  auditDetailRows,
  auditFieldLabel,
  auditOrderIds,
  formatAuditTime,
  isAbsent,
  isCreation,
  presentAuditActor,
  presentAuditAction,
  presentAuditApp,
  presentAuditDevice,
  presentAuditItemType,
  presentAuditValue,
  type AuditFieldRow,
  type AuditNames,
} from "@/lib/audit";
import { cn } from "@/lib/utils";

type Props = {
  entry: AuditEntry | null;
  /** Which tree the order links stay inside. */
  tree: "admin" | "ops";
  names?: AuditNames;
  /** Hide the order link when the sheet is already on that order. */
  currentOrderId?: string;
  onClose: () => void;
};

/**
 * One audit entry, whole: the reason, what changed (old value beside new),
 * who did it and from which app, and the recorded values exactly as stored.
 * Read-only; nothing in the log can be edited or deleted.
 */
export function AuditEntrySheet({ entry, tree, names, currentOrderId, onClose }: Props) {
  return (
    <Sheet
      open={entry !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-2xl"
      >
        {entry ? (
          <Body entry={entry} tree={tree} names={names} currentOrderId={currentOrderId} />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

const HEADING = "text-body text-text-primary m-0";
const BOLD = { fontFamily: "var(--font-bold)" } as const;

function Body({
  entry,
  tree,
  names,
  currentOrderId,
}: {
  entry: AuditEntry;
  tree: "admin" | "ops";
  names?: AuditNames;
  currentOrderId?: string;
}) {
  const actor = presentAuditActor(entry);
  const device = presentAuditDevice(entry.device);
  const orders = auditOrderIds(entry);
  const details = auditDetailRows(entry.detail);

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <SheetHeader className="gap-1 p-0 pr-10">
        <SheetTitle>
          <span className="text-h3 text-text-primary">{presentAuditAction(entry.action)}</span>
        </SheetTitle>
        <SheetDescription>
          <span className="text-body text-text-secondary">
            {actor.name}, {formatAuditTime(entry.at)}
          </span>
        </SheetDescription>
      </SheetHeader>

      {entry.reason ? (
        <section className="gg-panel flex flex-col gap-1" aria-labelledby="audit-reason">
          <h3 id="audit-reason" className={HEADING} style={BOLD}>
            Reason given
          </h3>
          <p className="text-body text-text-primary m-0 whitespace-pre-wrap break-words">{entry.reason}</p>
        </section>
      ) : null}

      <ChangeSection entry={entry} names={names} />

      <section className="flex flex-col gap-2" aria-labelledby="audit-who">
        <h3 id="audit-who" className={HEADING} style={BOLD}>
          Who and where
        </h3>
        <dl className="m-0 grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-[9rem_minmax(0,1fr)]">
          <Fact term="Person">
            {actor.name}
            {actor.role !== actor.name ? <span className="text-text-secondary">, {actor.role}</span> : null}
            {entry.actorId ? (
              <span className="text-caption text-text-muted block break-all">{entry.actorId}</span>
            ) : null}
          </Fact>
          <Fact term="App">{presentAuditApp(entry.app)}</Fact>
          <Fact term="Device">
            {device ?? "Not recorded"}
            {entry.device && device !== entry.device ? (
              <span className="text-caption text-text-muted block break-words">{entry.device}</span>
            ) : null}
          </Fact>
          <Fact term="Item">
            {presentAuditItemType(entry.entityType)}
            {entry.entityId ? (
              <span className="text-caption text-text-muted block break-all">{entry.entityId}</span>
            ) : null}
          </Fact>
          {orders.length ? (
            <Fact term={orders.length === 1 ? "Order" : "Orders"}>
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {orders.map((id) => (
                  <li key={id} className="break-all">
                    {id === currentOrderId ? (
                      <span>
                        {id} <span className="text-text-muted">(this order)</span>
                      </span>
                    ) : (
                      <Link
                        href={`/${tree}/orders/${encodeURIComponent(id)}`}
                        className="text-text-primary underline underline-offset-2"
                      >
                        {id}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </Fact>
          ) : null}
          <Fact term="Entry">
            <span className="break-all">{entry.id}</span>
          </Fact>
        </dl>
        <p className="text-caption text-text-muted m-0">
          The app and device are what the request said about itself. They are kept as evidence, not
          checked.
        </p>
      </section>

      {details.length ? (
        <section className="flex flex-col gap-2" aria-labelledby="audit-details">
          <h3 id="audit-details" className={HEADING} style={BOLD}>
            Also recorded
          </h3>
          <dl className="m-0 grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-[9rem_minmax(0,1fr)]">
            {details.map((row) => (
              <Fact key={row.path} term={auditFieldLabel(row)}>
                {presentAuditValue(row.key, row.after, names)}
              </Fact>
            ))}
          </dl>
        </section>
      ) : null}

      <RawValues entry={entry} />
    </div>
  );
}

function Fact({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-caption text-text-muted m-0 sm:pt-0.5">{term}</dt>
      {/* Hashes and IDs have no spaces; let them wrap rather than widen the sheet. */}
      <dd className="text-body text-text-primary m-0 min-w-0 [overflow-wrap:anywhere]">{children}</dd>
    </>
  );
}

function ChangeSection({ entry, names }: { entry: AuditEntry; names?: AuditNames }) {
  const change = auditChange(entry);
  const heading =
    change.kind === "created"
      ? isCreation(entry.action)
        ? "Recorded when created"
        : "Recorded with this entry"
      : change.kind === "removed"
        ? "What was removed"
        : "What changed";

  return (
    <section className="flex flex-col gap-2" aria-labelledby="audit-change">
      <h3 id="audit-change" className={HEADING} style={BOLD}>
        {heading}
      </h3>
      {change.kind === "none" ? (
        <p className="text-body text-text-secondary m-0">
          This entry recorded no before or after values. Older entries and actions that change
          nothing keep none.
        </p>
      ) : change.kind === "created" ? (
        <FieldTable rows={change.fields} names={names} only="after" />
      ) : change.kind === "removed" ? (
        <FieldTable rows={change.fields} names={names} only="before" />
      ) : (
        <>
          {change.changed.length ? (
            <FieldTable rows={change.changed} names={names} />
          ) : (
            <p className="text-body text-text-secondary m-0">
              No values changed. The record before and after the action is the same.
            </p>
          )}
          {change.unchanged.length ? (
            <Collapsible>
              <CollapsibleTrigger className="group text-body text-text-secondary inline-flex min-h-11 items-center gap-1.5 rounded-field hover:text-text-primary">
                <ChevronDown
                  aria-hidden
                  className="size-4 transition-transform group-data-[panel-open]:rotate-180 motion-reduce:transition-none"
                />
                {change.unchanged.length === 1
                  ? "Show 1 field that stayed the same"
                  : `Show ${change.unchanged.length} fields that stayed the same`}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <FieldTable rows={change.unchanged} names={names} only="after" afterHeading="Value" />
              </CollapsibleContent>
            </Collapsible>
          ) : null}
        </>
      )}
    </section>
  );
}

/**
 * Field, before, after. Below 640px each field stacks, with its own Before
 * and After labels, so nothing scrolls sideways.
 */
function FieldTable({
  rows,
  names,
  only,
  afterHeading = "After",
}: {
  rows: AuditFieldRow[];
  names?: AuditNames;
  only?: "before" | "after";
  afterHeading?: string;
}) {
  const showBefore = only !== "after";
  const showAfter = only !== "before";
  const columns =
    showBefore && showAfter
      ? "sm:grid-cols-[minmax(7rem,0.9fr)_minmax(0,1fr)_minmax(0,1fr)]"
      : "sm:grid-cols-[minmax(7rem,0.9fr)_minmax(0,2fr)]";
  return (
    <div className="border-outline overflow-hidden rounded-card border" role="table">
      <div
        role="row"
        className={cn(
          "bg-surface-variant/60 text-caption text-text-muted hidden gap-3 px-3 py-2 sm:grid",
          columns,
        )}
      >
        <span role="columnheader">Field</span>
        {showBefore ? <span role="columnheader">Before</span> : null}
        {showAfter ? <span role="columnheader">{only === "after" ? afterHeading : "After"}</span> : null}
      </div>
      {rows.map((row) => (
        <div
          key={row.path}
          role="row"
          className={cn(
            "border-outline-subtle grid grid-cols-1 gap-x-3 gap-y-1 border-t px-3 py-2 first:border-t-0 sm:first:border-t",
            columns,
          )}
        >
          <span role="rowheader" className="text-body text-text-secondary break-words">
            {auditFieldLabel(row)}
          </span>
          {showBefore ? (
            <span role="cell" className="text-body text-text-muted min-w-0 break-words">
              <span className="text-caption sm:hidden">Before: </span>
              {presentAuditValue(row.key, row.before, names)}
            </span>
          ) : null}
          {showAfter ? (
            <span
              role="cell"
              className={cn(
                "text-body min-w-0 break-words",
                isAbsent(row.after) ? "text-text-muted" : "text-text-primary",
              )}
              style={only ? undefined : { fontFamily: "var(--font-medium)" }}
            >
              {only ? null : <span className="text-caption text-text-muted sm:hidden">After: </span>}
              {presentAuditValue(row.key, row.after, names)}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function RawValues({ entry }: { entry: AuditEntry }) {
  const recorded = {
    before: entry.before ?? null,
    after: entry.after ?? null,
    ...(entry.detail ? { detail: entry.detail } : {}),
  };
  return (
    <Collapsible>
      <CollapsibleTrigger className="group text-body text-text-secondary inline-flex min-h-11 items-center gap-1.5 rounded-field hover:text-text-primary">
        <ChevronDown aria-hidden className="size-4 transition-transform group-data-[panel-open]:rotate-180 motion-reduce:transition-none" />
        Show the values exactly as recorded
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className="bg-surface-variant/60 text-caption text-text-primary m-0 max-h-[28rem] overflow-auto rounded-card p-3 whitespace-pre-wrap break-all">
          {JSON.stringify(recorded, null, 2)}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}
