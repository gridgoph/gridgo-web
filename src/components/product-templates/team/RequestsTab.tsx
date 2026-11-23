"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useState } from "react";
import { FileAudio, FileText, ImageIcon, PanelRightOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DataTable, DataTableRowAction, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StatusChip } from "@/components/ui/StatusChip";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { opsErrorMessage } from "@/app/ops/_lib/errors";
import { getFile, getFileDownloadUrl } from "@/lib/api/client";
import { decideProductSetupRequest } from "@/lib/api/product-templates";
import type { StoredFile } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import {
  setupRequestTone,
  type ProductTemplate,
  type SetupRequest,
} from "@/lib/product-templates";

import { shopHref, shopNameOf, type ShopRef, type Tree } from "./team-data";
import {
  DECISION_REASON_MAX,
  NEEDS_MORE_SUGGESTIONS,
  completeReasonSuggestion,
  decisionBlocker,
  orderRequests,
  requestKindLabel,
  staffRequestStatus,
} from "./team-logic";

type Props = {
  tree: Tree;
  requests: SetupRequest[] | null;
  shops: ShopRef[] | null;
  templates: ProductTemplate[] | null;
  onDecided: (message: string) => Promise<void> | void;
};

/**
 * Shops waiting on the GRIDGO team: a template they cannot find, or a price
 * list for the team to turn into products. Waiting ones first, oldest first.
 */
export function RequestsTab({ tree, requests, shops, templates, onDecided }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const rows = useMemo(() => (requests ? orderRequests(requests) : []), [requests]);
  const open = rows.find((r) => r.id === openId) ?? null;

  const columns: DataTableColumn<SetupRequest>[] = [
    {
      id: "request",
      header: "Request",
      primary: true,
      alwaysVisible: true,
      filterValue: (r) => `${r.requestedName ?? ""} ${r.message ?? ""} ${shopNameOf(shops, r.supplierId)}`,
      cell: (r) => (
        <button
          type="button"
          onClick={() => setOpenId(r.id)}
          className="flex min-w-0 max-w-[22rem] flex-col text-left"
        >
          <span
            className="text-body text-text-primary truncate underline-offset-4 hover:underline"
            style={{ fontFamily: "var(--font-medium)" }}
          >
            {r.kind === "template" ? (r.requestedName ?? "A template") : "Set up products"}
          </span>
          <span className="text-caption text-text-muted truncate">
            {r.message ?? (r.fileIds.length ? `${r.fileIds.length} file${r.fileIds.length === 1 ? "" : "s"}` : "")}
          </span>
        </button>
      ),
    },
    {
      id: "shop",
      header: "Shop",
      sortValue: (r) => shopNameOf(shops, r.supplierId),
      cell: (r) => <span className="text-body text-text-primary">{shopNameOf(shops, r.supplierId)}</span>,
    },
    {
      id: "kind",
      header: "Asks for",
      sortValue: (r) => r.kind,
      hideOnMobile: true,
      cell: (r) => <span className="text-body text-text-secondary">{requestKindLabel(r)}</span>,
    },
    {
      id: "sent",
      header: "Sent",
      sortValue: (r) => r.createdAt ?? "",
      cell: (r) => (
        <span className="text-body text-text-secondary tabular-nums">
          {r.createdAt ? formatDateTime(r.createdAt) : "—"}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      sortValue: (r) => r.status,
      cell: (r) => <StatusChip {...setupRequestTone(r.status)} label={staffRequestStatus(r)} />,
    },
  ];

  if (requests && !requests.length) {
    return (
      <EmptyState
        title="No requests yet"
        body="When a shop asks for a template or sends a price list for the GRIDGO team to set up, it waits here."
      />
    );
  }

  return (
    <>
      <DataTable
        caption="Template and setup requests"
        columns={columns}
        data={rows}
        loading={!requests}
        getRowId={(r) => r.id}
        itemLabel="requests"
        filterPlaceholder="Search requests or shops"
        facets={[
          {
            columnId: "status",
            title: "Status",
            options: [
              { value: "pending", label: "Waiting" },
              { value: "needs_revision", label: "Asked the shop for more" },
              { value: "completed", label: "Done" },
            ],
          },
        ]}
        rowActions={(r) => (
          <DataTableRowAction label="Open request" icon={PanelRightOpen} onClick={() => setOpenId(r.id)} />
        )}
        pageSize={25}
      />
      <Sheet open={open != null} onOpenChange={(next) => (next ? null : setOpenId(null))}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {open ? (
            <RequestDetail
              key={`${open.id}:${open.version ?? ""}`}
              tree={tree}
              request={open}
              shopName={shopNameOf(shops, open.supplierId)}
              templates={templates ?? []}
              onDecided={async (message) => {
                setOpenId(null);
                await onDecided(message);
              }}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}

function RequestDetail({
  tree,
  request,
  shopName,
  templates,
  onDecided,
}: {
  tree: Tree;
  request: SetupRequest;
  shopName: string;
  templates: ProductTemplate[];
  onDecided: (message: string) => Promise<void> | void;
}) {
  const id = useId();
  const waiting = request.status === "pending";
  const active = templates.filter((t) => t.active);
  const guess =
    request.kind === "template" && request.requestedName
      ? (active.find((t) => t.name.toLowerCase() === request.requestedName!.toLowerCase())?.id ?? null)
      : null;
  const [status, setStatus] = useState<"completed" | "needs_revision">("completed");
  const [templateId, setTemplateId] = useState<string | null>(guess);
  const templateName = active.find((t) => t.id === templateId)?.name ?? null;
  const [reason, setReason] = useState(() => completeReasonSuggestion(request, templateName));
  const [edited, setEdited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const blocker = decisionBlocker({ request, status, reason, templateId });

  function choose(next: "completed" | "needs_revision", nextTemplate = templateId) {
    setStatus(next);
    if (!edited) {
      const name = active.find((t) => t.id === nextTemplate)?.name ?? null;
      setReason(next === "completed" ? completeReasonSuggestion(request, name) : NEEDS_MORE_SUGGESTIONS[0]);
    }
  }

  async function send() {
    if (blocker || request.version == null) return;
    setBusy(true);
    setError(null);
    try {
      await decideProductSetupRequest(request.id, request.version, {
        status,
        reason: reason.trim(),
        ...(status === "completed" && request.kind === "template" && templateId ? { templateId } : {}),
      });
      await onDecided(
        status === "completed"
          ? `Marked done. ${shopName} has your note.`
          : `Asked ${shopName} for more. They have your note.`,
      );
    } catch (err) {
      setError(
        opsErrorMessage(err, "Could not save the decision. Try again.") ,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5 p-4">
      <SheetHeader className="p-0">
        <SheetTitle>
          {request.kind === "template" ? (request.requestedName ?? "A template") : "Set up products"}
        </SheetTitle>
        <SheetDescription>
          {shopName} · {requestKindLabel(request)}
          {request.createdAt ? ` · sent ${formatDateTime(request.createdAt)}` : ""}
        </SheetDescription>
      </SheetHeader>

      <StatusChip {...setupRequestTone(request.status)} label={staffRequestStatus(request)} />

      {request.message ? (
        <section className="flex flex-col gap-1" aria-labelledby={`${id}-msg`}>
          <h3 id={`${id}-msg`} className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-medium)" }}>
            The shop wrote
          </h3>
          <p className="text-body text-text-secondary m-0 whitespace-pre-line break-words">{request.message}</p>
        </section>
      ) : null}

      {request.fileIds.length ? (
        <section className="flex flex-col gap-2" aria-labelledby={`${id}-files`}>
          <h3 id={`${id}-files`} className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-medium)" }}>
            Price list files
          </h3>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {request.fileIds.map((fileId, index) => (
              <li key={fileId}>
                <SetupFile fileId={fileId} index={index} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {request.kind === "setup" && request.supplierId ? (
        <div className="rounded-[var(--radius-field)] border border-outline flex flex-col gap-2 p-3">
          <p className="text-body text-text-secondary m-0">
            Prepare each product from the price list. They stay hidden until {shopName} confirms the prices.
          </p>
          <Button
            className="self-start"
            nativeButton={false}
            render={<Link href={shopHref(tree, request.supplierId, request.id)} />}
          >
            Prepare products for this shop
          </Button>
        </div>
      ) : null}

      {request.reason && !waiting ? (
        <section className="flex flex-col gap-1">
          <h3 className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-medium)" }}>
            The shop read
          </h3>
          <p className="text-body text-text-secondary m-0 whitespace-pre-line">{request.reason}</p>
        </section>
      ) : null}

      {waiting ? (
        <section className="flex flex-col gap-4 border-t border-outline pt-4" aria-labelledby={`${id}-decide`}>
          <h3 id={`${id}-decide`} className="text-h3 text-text-primary m-0">
            Answer the shop
          </h3>
          <ToggleGroup
            value={[status]}
            onValueChange={(values) => {
              const next = values[0] as "completed" | "needs_revision" | undefined;
              if (next) choose(next);
            }}
            variant="outline"
            spacing={0}
            aria-label="Answer"
            className="flex-wrap"
          >
            <ToggleGroupItem value="completed">Done</ToggleGroupItem>
            <ToggleGroupItem value="needs_revision">Ask for more</ToggleGroupItem>
          </ToggleGroup>

          {status === "completed" && request.kind === "template" ? (
            <Field>
              <FieldLabel htmlFor={`${id}-tpl`}>Template that answers it</FieldLabel>
              <Select
                value={templateId ?? ""}
                onValueChange={(value) => {
                  const next = typeof value === "string" && value ? value : null;
                  setTemplateId(next);
                  choose("completed", next);
                }}
              >
                <SelectTrigger id={`${id}-tpl`} className="min-h-11 w-full">
                  <SelectValue>
                    {(value) => active.find((t) => t.id === value)?.name ?? "Choose a template"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {active.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>
                Not in the list yet? Add it on the Templates tab first. Saving a template with this exact name also
                closes the request.
              </FieldDescription>
            </Field>
          ) : null}

          <Field data-invalid={blocker && reason.trim() === "" ? true : undefined}>
            <FieldLabel htmlFor={`${id}-reason`}>{shopName} reads</FieldLabel>
            <Textarea
              id={`${id}-reason`}
              value={reason}
              maxLength={DECISION_REASON_MAX}
              rows={4}
              onChange={(event) => {
                setEdited(true);
                setReason(event.target.value);
              }}
            />
            <FieldDescription>Word for word, in their inbox.</FieldDescription>
          </Field>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" disabled={busy || blocker != null} onClick={() => void send()}>
              {busy ? "Saving" : status === "completed" ? "Mark done and tell the shop" : "Ask the shop for more"}
            </Button>
            {blocker ? <p className="text-caption text-text-muted m-0">{blocker}</p> : null}
          </div>
          {error ? (
            <p role="alert" className="text-body text-destructive m-0">
              {error}
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

/** A price-list photo, PDF or voice note. Audio plays here; the rest open in a new tab. */
function SetupFile({ fileId, index }: { fileId: string; index: number }) {
  const [meta, setMeta] = useState<StoredFile | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let gone = false;
    void getFile(fileId)
      .then((file) => !gone && setMeta(file))
      .catch(() => !gone && setFailed(true));
    void getFileDownloadUrl(fileId)
      .then((link) => !gone && setUrl(link))
      .catch(() => !gone && setFailed(true));
    return () => {
      gone = true;
    };
  }, [fileId]);

  const type = meta?.detectedContentType ?? meta?.declaredContentType ?? "";
  const name = meta?.originalFilename ?? `File ${index + 1}`;
  const Icon = type.startsWith("audio/") ? FileAudio : type.startsWith("image/") ? ImageIcon : FileText;

  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-field)] border border-outline p-3">
      <div className="flex items-center gap-2">
        <Icon aria-hidden className="size-4 shrink-0 text-text-muted" />
        <span className="text-body text-text-primary min-w-0 flex-1 truncate">{name}</span>
        {url && !type.startsWith("audio/") ? (
          <a href={url} target="_blank" rel="noopener noreferrer" className="text-body text-text-primary underline">
            Open
          </a>
        ) : null}
      </div>
      {type.startsWith("image/") && url ? (
        // Signed, short-lived link: next/image would cache it.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={`Price list ${index + 1}`} className="max-h-64 w-full rounded-md object-contain bg-muted" />
      ) : null}
      {type.startsWith("audio/") && url ? (
        <audio controls preload="none" src={url} className="w-full">
          <a href={url}>Download the voice note</a>
        </audio>
      ) : null}
      {failed ? (
        <p className="text-caption text-text-muted m-0">Could not open this file. Refresh for a new link.</p>
      ) : null}
    </div>
  );
}
