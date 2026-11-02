"use client";

/**
 * One quote request, shared by Operations (`/ops/quotes/:id`) and Super Admin
 * (`/admin/quotes/:id`). Contract: `gridgo-api/docs/QUOTE_REQUESTS_API.md`.
 *
 * The client's brief and reference files on the left; on the right, the shop
 * replies Operations recorded, the choice to publish (one to three, one per
 * shop) with a preview of the client's anonymous options A, B and C, and what
 * the client has now. Every write carries the request's version, so a stale
 * screen is refused and re-read instead of overwriting someone's change.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronLeft, TriangleAlert } from "lucide-react";

import { opsErrorMessage } from "@/app/ops/_lib/errors";
import { EvidenceStrip } from "@/components/orders/EvidencePreview";
import { CancelQuoteDialog, PublishQuoteDialog, QuoteValidityDialog } from "@/components/quotes/QuoteDialogs";
import { QuoteReplyDialog } from "@/components/quotes/QuoteReplyDialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonCards } from "@/components/ui/loading";
import { StatusChip } from "@/components/ui/StatusChip";
import { getSettings, isApiError } from "@/lib/api/client";
import {
  addQuoteReply,
  cancelQuoteRequest,
  getQuoteRequest,
  publishQuoteRequest,
  setQuoteValidity,
  updateQuoteReply,
} from "@/lib/api/quote-requests";
import { formatDate, formatDateTime } from "@/lib/format";
import { useLegalInboxReload } from "@/lib/live/useLegalInboxReload";
import { useSerializedLoad } from "@/lib/live/useSerializedLoad";
import {
  canCancel,
  canChangeValidity,
  canPublish,
  eventDateWarningCopy,
  eventFitLabel,
  formatEventDate,
  money,
  placementLabel,
  presentQuoteStatus,
  previewOptions,
  productionTimeLine,
  productTypeLabel,
  publishProblem,
  quoteErrorCopy,
  quoteNextStep,
  rankingLine,
  replyChanges,
  repliesEditable,
  selectBlocker,
  validityDaysInForce,
  type QuoteOption,
  type QuoteReply,
  type QuoteRequest,
  type ReplyBody,
} from "@/lib/quote-requests";
import { cn } from "@/lib/utils";

type Tree = "ops" | "admin";

const medium = { fontFamily: "var(--font-medium)" } as const;
const bold = { fontFamily: "var(--font-bold)" } as const;

/** An API refusal in the desk's words; anything else is the caller's fallback. */
function quoteError(err: unknown, fallback: string): string {
  if (isApiError(err)) {
    const copy = quoteErrorCopy(err.code, err.details);
    if (copy) return copy;
  }
  return opsErrorMessage(err, fallback);
}

const isConflict = (err: unknown) =>
  isApiError(err) &&
  (err.code === "quote_request_version_conflict" || err.code === "quote_reply_version_conflict");

type DialogState =
  | { kind: "reply"; reply: QuoteReply | null }
  | { kind: "validity" }
  | { kind: "cancel" }
  | { kind: "publish" }
  | null;

export function QuoteRequestDetail({ tree }: { tree: Tree }) {
  const params = useParams<{ id: string }>();
  const id = params?.id ? decodeURIComponent(String(params.id)) : "";

  const [request, setRequest] = useState<QuoteRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [validityDays, setValidityDays] = useState<number | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [done, setDone] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);

  const load = useSerializedLoad(
    useCallback(async () => {
      if (!id) return;
      setLoading(true);
      try {
        const [next, settings] = await Promise.all([
          getQuoteRequest(id),
          getSettings().catch(() => null),
        ]);
        setRequest(next);
        setError(null);
        if (settings && settings.quoteValidityDays !== undefined) {
          setValidityDays(validityDaysInForce(settings.quoteValidityDays));
        }
      } catch (err) {
        setError(
          isApiError(err) && err.status === 404
            ? "This quote request no longer exists."
            : opsErrorMessage(err, "Could not load this quote request. Retry in a moment."),
        );
      } finally {
        setLoading(false);
      }
    }, [id]),
  );

  useLegalInboxReload("ops_quote_", load);

  useEffect(() => {
    void load();
  }, [load]);

  // A reply that left the choice (withdrawn, removed) drops out of it.
  useEffect(() => {
    if (!request) return;
    const active = new Set(
      (request.replies ?? []).filter((reply) => reply.status === "active").map((reply) => reply.id),
    );
    setSelected((current) => {
      const kept = current.filter((replyId) => active.has(replyId));
      return kept.length === current.length ? current : kept;
    });
  }, [request]);

  /**
   * Runs one write. On success shows `message`; on a version conflict re-reads
   * and says so; any other refusal is thrown back worded, for the dialog.
   */
  const write = useCallback(
    async (run: () => Promise<QuoteRequest>, message: string, fallback: string) => {
      setDone(null);
      setActionError(null);
      try {
        const next = await run();
        setRequest(next);
        setDialog(null);
        setDone(message);
      } catch (err) {
        if (isConflict(err)) {
          setDialog(null);
          setActionError(quoteError(err, fallback));
          await load();
          return;
        }
        throw new Error(quoteError(err, fallback));
      }
    },
    [load],
  );

  if (!id) return null;

  if (error && !request) {
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

  if (!request) {
    return <SkeletonCards count={3} lines={3} label="Loading quote request" className="gap-3" />;
  }

  const status = presentQuoteStatus(request.status);
  const replies = request.replies ?? [];
  const editable = repliesEditable(request.status);
  const publishable = canPublish(request.status);
  const warning = eventDateWarningCopy(request.eventDateWarning);
  const title = `${productTypeLabel(request)} · ${request.quantity.toLocaleString("en-PH")} × ${request.size}`;

  async function submitReply(reply: QuoteReply | null, body: ReplyBody) {
    if (!request) return;
    if (reply) {
      const changes = replyChanges(reply, body);
      if (!changes) {
        setDialog(null);
        return;
      }
      await write(
        () =>
          updateQuoteReply(request.id, reply.id, {
            ...changes,
            expectedReplyVersion: reply.version,
          }),
        reply.publishedLabel
          ? `Reply saved. Option ${reply.publishedLabel} keeps its old figures until you publish again.`
          : "Reply saved.",
        "Could not save this reply. Try again.",
      );
      return;
    }
    await write(
      () => addQuoteReply(request.id, { ...body, expectedVersion: request.version }),
      "Reply added.",
      "Could not add this reply. Try again.",
    );
  }

  async function toggleWithdrawn(reply: QuoteReply) {
    if (!request) return;
    setWithdrawing(reply.id);
    try {
      await write(
        () =>
          updateQuoteReply(request.id, reply.id, {
            withdrawn: reply.status === "active",
            expectedReplyVersion: reply.version,
          }),
        reply.status === "active" ? "Reply withdrawn." : "Reply restored.",
        "Could not change this reply. Try again.",
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not change this reply.");
    } finally {
      setWithdrawing(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/${tree}/quotes`}
            className="text-caption text-text-muted inline-flex min-h-11 items-center gap-1 hover:text-text-secondary"
          >
            <ChevronLeft size={14} strokeWidth={2} aria-hidden />
            Back to quotes
          </Link>
          <h1 className="text-h2 text-text-primary m-0 break-words">{title}</h1>
          <p className="text-body text-text-secondary m-0 mt-1">{quoteNextStep(request)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip tone={status.tone} label={status.label} icon={status.icon} />
          <Button variant="secondary" disabled={loading} onClick={() => void load()}>
            Refresh
          </Button>
        </div>
      </div>

      {warning && request.status !== "ordered" && request.status !== "cancelled" ? (
        <div
          className="flex items-start gap-2 rounded-card border border-warning px-4 py-3"
          role="note"
          data-testid="quote-event-warning"
        >
          <TriangleAlert
            size={18}
            strokeWidth={1.75}
            aria-hidden
            className="mt-0.5 shrink-0"
            style={{ color: "var(--color-warning)" }}
          />
          <div className="min-w-0">
            <p className="text-body text-text-primary m-0" style={medium}>
              {warning}
            </p>
            <p className="text-body text-text-secondary m-0 mt-1">
              The client gave the date for information only, so nothing is blocked.
            </p>
          </div>
        </div>
      ) : null}

      {done ? (
        <p className="text-body text-success m-0" role="status">
          {done}
        </p>
      ) : null}
      {actionError ? (
        <p className="text-body text-error m-0" role="alert">
          {actionError}
        </p>
      ) : null}
      {error ? (
        <p className="text-body text-error m-0" role="alert">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-4">
          <BriefCard request={request} />
          <section className="gg-card p-3" aria-labelledby="quote-files-heading">
            <h2 id="quote-files-heading" className="text-h3 text-text-primary m-0">
              Reference files
            </h2>
            <p className="text-caption text-text-muted m-0 mt-1 mb-3">
              From the client. They become the order&rsquo;s artwork when the client accepts.
            </p>
            {request.referenceFiles.length ? (
              <EvidenceStrip
                items={request.referenceFiles.map((file, index) => ({
                  fileId: file.fileId,
                  kind: "artwork",
                  label: `Reference ${index + 1}`,
                  caption: file.originalFilename,
                }))}
              />
            ) : (
              <p className="text-body text-text-secondary m-0">None on file.</p>
            )}
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <ClientNowCard
            request={request}
            tree={tree}
            onChangeValidity={() => setDialog({ kind: "validity" })}
          />

          <section className="gg-card p-3" aria-labelledby="quote-replies-heading">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="quote-replies-heading" className="text-h3 text-text-primary m-0">
                Shop replies
                <span className="text-text-muted tabular-nums"> {replies.length}</span>
              </h2>
              {editable ? (
                <Button variant="secondary" onClick={() => setDialog({ kind: "reply", reply: null })}>
                  Add a reply
                </Button>
              ) : null}
            </div>
            <p className="text-caption text-text-muted m-0 mt-1">
              {publishable
                ? "Tick up to three, one per shop, to publish."
                : editable
                  ? "Ask suitable shops for a price, then add each reply here."
                  : "Replies are fixed once the client accepts."}
            </p>
            {replies.length ? (
              <ul className="m-0 mt-3 flex list-none flex-col gap-3 p-0">
                {replies.map((reply) => (
                  <ReplyRow
                    key={reply.id}
                    reply={reply}
                    selectable={publishable}
                    checked={selected.includes(reply.id)}
                    blocker={selectBlocker(replies, selected, reply)}
                    editable={editable}
                    busy={withdrawing === reply.id}
                    onCheck={(checked) =>
                      setSelected((current) =>
                        checked
                          ? [...current, reply.id]
                          : current.filter((replyId) => replyId !== reply.id),
                      )
                    }
                    onEdit={() => setDialog({ kind: "reply", reply })}
                    onWithdraw={() => void toggleWithdrawn(reply)}
                  />
                ))}
              </ul>
            ) : (
              <p className="text-body text-text-secondary m-0 mt-3">No replies yet.</p>
            )}
          </section>

          {publishable && replies.some((reply) => reply.status === "active") ? (
            <PublishPanel
              request={request}
              selected={selected}
              onPublish={() => setDialog({ kind: "publish" })}
            />
          ) : null}

          {canCancel(request.status) ? (
            <div>
              <Button variant="destructive" onClick={() => setDialog({ kind: "cancel" })}>
                Cancel request
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <QuoteReplyDialog
        open={dialog?.kind === "reply"}
        reply={dialog?.kind === "reply" ? dialog.reply : null}
        onCancel={() => setDialog(null)}
        onSubmit={(body) => submitReply(dialog?.kind === "reply" ? dialog.reply : null, body)}
      />
      <QuoteValidityDialog
        open={dialog?.kind === "validity"}
        validUntil={request.validUntil}
        renewing={request.status === "expired"}
        onCancel={() => setDialog(null)}
        onSubmit={(body) =>
          write(
            () => setQuoteValidity(request.id, { ...body, expectedVersion: request.version }),
            request.status === "expired"
              ? "Renewed. The client is told."
              : "Date changed. The client is told.",
            "Could not change the date. Try again.",
          )
        }
      />
      <CancelQuoteDialog
        open={dialog?.kind === "cancel"}
        onCancel={() => setDialog(null)}
        onSubmit={(reason) =>
          write(
            () => cancelQuoteRequest(request.id, { reason, expectedVersion: request.version }),
            "Request cancelled. The client is told.",
            "Could not cancel the request. Try again.",
          )
        }
      />
      <PublishQuoteDialog
        open={dialog?.kind === "publish"}
        count={selected.length}
        republish={request.options.length > 0}
        validityDays={validityDays}
        onCancel={() => setDialog(null)}
        onConfirm={async () => {
          await write(
            () =>
              publishQuoteRequest(request.id, {
                replyIds: selected,
                expectedVersion: request.version,
              }),
            "Published. The client is told.",
            "Could not publish. Try again.",
          );
          setSelected([]);
        }}
      />
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-caption text-text-muted pt-0.5">{label}</dt>
      <dd className="m-0 text-body text-text-primary min-w-0 break-words">{children}</dd>
    </>
  );
}

function BriefCard({ request }: { request: QuoteRequest }) {
  const fulfillment = request.requestFulfillment;
  const delivery =
    fulfillment?.fulfillmentMode === "pickup"
      ? "Hub pick-up"
      : fulfillment?.dropoff?.label
        ? `Delivery to ${fulfillment.dropoff.label}`
        : "Delivery";
  return (
    <section className="gg-card p-3" aria-labelledby="quote-brief-heading">
      <h2 id="quote-brief-heading" className="text-h3 text-text-primary m-0">
        The client&rsquo;s brief
      </h2>
      <dl className="m-0 mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2">
        <Row label="Product">{productTypeLabel(request)}</Row>
        <Row label="Use">{request.use}</Row>
        <Row label="Placement">{placementLabel(request.placement)}</Row>
        <Row label="Size">{request.size}</Row>
        <Row label="Quantity">{request.quantity.toLocaleString("en-PH")}</Row>
        <Row label="Notes">{request.notes || "None"}</Row>
        <Row label="Budget">{request.budgetMinor != null ? money(request.budgetMinor) : "Not given"}</Row>
        <Row label="Event date">
          {request.eventDate ? `${formatEventDate(request.eventDate)} (information only)` : "None"}
        </Row>
        <Row label="Getting it">{delivery}</Row>
        <Row label="Client's priority">{rankingLine(request.ranking)}</Row>
        <Row label="Client">
          {request.client?.name || "Client"}
          {request.client?.email ? (
            <span className="text-text-secondary"> · {request.client.email}</span>
          ) : null}
        </Row>
        <Row label="Asked">{formatDateTime(request.createdAt)}</Row>
      </dl>
    </section>
  );
}

function ReplyRow({
  reply,
  selectable,
  checked,
  blocker,
  editable,
  busy,
  onCheck,
  onEdit,
  onWithdraw,
}: {
  reply: QuoteReply;
  selectable: boolean;
  checked: boolean;
  blocker: string | null;
  editable: boolean;
  busy: boolean;
  onCheck: (checked: boolean) => void;
  onEdit: () => void;
  onWithdraw: () => void;
}) {
  const nameId = `quote-reply-${reply.id}`;
  const withdrawn = reply.status === "withdrawn";
  const fit = eventFitLabel(reply.eventDateFit);
  return (
    <li
      className={cn(
        "flex gap-3 rounded-field border border-outline px-3 py-3",
        withdrawn && "opacity-70",
      )}
    >
      {selectable ? (
        <Checkbox
          className="mt-1"
          checked={checked}
          disabled={!checked && blocker !== null}
          aria-labelledby={nameId}
          aria-describedby={blocker ? `${nameId}-blocker` : undefined}
          onCheckedChange={(value) => onCheck(value === true)}
        />
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p id={nameId} className="text-body text-text-primary m-0 break-words" style={medium}>
            {reply.shopName ?? "Shop"}
          </p>
          {reply.publishedLabel ? (
            <StatusChip tone="info" label={`Option ${reply.publishedLabel}`} icon="circle-check" />
          ) : null}
          {withdrawn ? <StatusChip tone="neutral" label="Withdrawn" icon="ban" /> : null}
        </div>
        <p className="text-body text-text-secondary m-0">
          Shop price <span className="text-text-primary tabular-nums" style={medium}>{money(reply.priceMinor)}</span>
          {" · "}client pays{" "}
          <span className="text-text-primary tabular-nums" style={medium}>{money(reply.clientPriceMinor)}</span>
        </p>
        <p className="text-body text-text-secondary m-0">
          {productionTimeLine(reply.productionTime)}
          {reply.readyBy ? ` · ready by ${formatDateTime(reply.readyBy)}` : " · ready date unknown"}
          {fit ? ` · ${fit}` : ""}
        </p>
        {reply.recommendedOptions ? (
          <p className="text-body text-text-secondary m-0 break-words">
            Recommends: {reply.recommendedOptions}
          </p>
        ) : null}
        {reply.note ? (
          <p className="text-caption text-text-muted m-0 break-words">Note: {reply.note}</p>
        ) : null}
        {selectable && blocker && !checked && !withdrawn ? (
          <p id={`${nameId}-blocker`} className="text-caption text-text-muted m-0">
            {blocker}
          </p>
        ) : null}
        {editable ? (
          <div className="mt-1 flex flex-wrap gap-2">
            <Button variant="ghost" disabled={busy || withdrawn} onClick={onEdit} aria-label={`Change ${reply.shopName ?? "the shop"}'s reply`}>
              Change
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={onWithdraw}
              aria-label={`${withdrawn ? "Restore" : "Withdraw"} ${reply.shopName ?? "the shop"}'s reply`}
            >
              {busy ? "Saving…" : withdrawn ? "Restore" : "Withdraw"}
            </Button>
          </div>
        ) : null}
      </div>
    </li>
  );
}

function OptionCard({
  label,
  clientPriceMinor,
  productionTime,
  readyBy,
  eventDateFit,
  recommendedOptions,
  footer,
}: {
  label: string;
  clientPriceMinor: number | null;
  productionTime: QuoteOption["productionTime"];
  readyBy: string | null;
  eventDateFit: QuoteOption["eventDateFit"];
  recommendedOptions: string;
  footer?: React.ReactNode;
}) {
  const fit = eventFitLabel(eventDateFit);
  return (
    <li className="flex gap-3 rounded-field border border-outline px-3 py-3">
      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-field border border-outline text-body text-text-primary"
        style={bold}
      >
        {label}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-body text-text-primary m-0">
          <span className="sr-only">Option {label}: </span>
          <span className="tabular-nums" style={bold}>
            {money(clientPriceMinor)}
          </span>{" "}
          <span className="text-text-secondary">all in</span>
        </p>
        <p className="text-body text-text-secondary m-0">
          {productionTimeLine(productionTime)}
          {readyBy ? ` · ready by ${formatDate(readyBy)}` : ""}
        </p>
        {fit ? (
          <p className="text-caption m-0" style={{ color: eventDateFit === "after" ? "var(--color-warning)" : undefined }}>
            {fit}
          </p>
        ) : null}
        {recommendedOptions ? (
          <p className="text-caption text-text-muted m-0 break-words">{recommendedOptions}</p>
        ) : null}
        {footer}
      </div>
    </li>
  );
}

function PublishPanel({
  request,
  selected,
  onPublish,
}: {
  request: QuoteRequest;
  selected: string[];
  onPublish: () => void;
}) {
  const replies = useMemo(() => request.replies ?? [], [request.replies]);
  const problem = publishProblem(replies, selected);
  const preview = useMemo(
    () => previewOptions(replies, selected, request.ranking),
    [replies, selected, request.ranking],
  );
  const republish = request.options.length > 0;
  return (
    <section className="gg-card p-3" aria-labelledby="quote-preview-heading">
      <h2 id="quote-preview-heading" className="text-h3 text-text-primary m-0">
        What the client will see
      </h2>
      <p className="text-caption text-text-muted m-0 mt-1">
        No shop names, no shop prices. Each price includes GRIDGO&rsquo;s fee; delivery is added
        at checkout.
      </p>
      {preview.options.length ? (
        <>
          <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0" aria-label="Client preview">
            {preview.options.map((option) => (
              <OptionCard key={option.replyId} {...option} />
            ))}
          </ul>
          <p className="text-caption text-text-muted m-0 mt-2">
            {preview.exact
              ? `Lettered by the client's priority: ${rankingLine(request.ranking)}.`
              : `GRIDGO letters them by the client's priority (${rankingLine(request.ranking)}) when you publish, so the letters may change.`}
          </p>
        </>
      ) : (
        <p className="text-body text-text-secondary m-0 mt-3">
          Tick the replies to send. Up to three, one per shop.
        </p>
      )}
      {selected.length && problem ? (
        <p className="text-body text-error m-0 mt-2" role="alert">
          {problem}
        </p>
      ) : null}
      <div className="mt-3">
        <Button variant="primary" disabled={problem !== null} onClick={onPublish}>
          {republish ? "Publish again" : "Publish to the client"}
        </Button>
      </div>
      {republish ? (
        <p className="text-caption text-text-muted m-0 mt-2">
          Publishing again replaces the client&rsquo;s options and starts the validity again.
        </p>
      ) : null}
    </section>
  );
}

function ClientNowCard({
  request,
  tree,
  onChangeValidity,
}: {
  request: QuoteRequest;
  tree: Tree;
  onChangeValidity: () => void;
}) {
  const options = request.options;
  const validity = canChangeValidity(request);
  if (!options.length && !request.orderId && request.status !== "cancelled") return null;
  return (
    <section className="gg-card p-3" aria-labelledby="quote-client-heading">
      <h2 id="quote-client-heading" className="text-h3 text-text-primary m-0">
        What the client has
      </h2>
      {request.status === "cancelled" ? (
        <p className="text-body text-text-secondary m-0 mt-2">
          Cancelled {formatDateTime(request.cancelledAt)} by{" "}
          {request.cancelledBy === "client" ? "the client" : "Operations"}
          {request.cancelReason ? `: ${request.cancelReason}` : "."}
        </p>
      ) : null}
      {options.length ? (
        <>
          <p className="text-body text-text-secondary m-0 mt-2">
            {request.status === "expired"
              ? `Expired ${formatDateTime(request.expiredAt ?? request.validUntil)}.`
              : request.validUntil
                ? `Open until ${formatDateTime(request.validUntil)}.`
                : null}{" "}
            Published {formatDateTime(request.publishedAt)}
            {request.matchReason?.label ? ` · ${request.matchReason.label}` : ""}.
          </p>
          <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0" aria-label="Published options">
            {options.map((option) => (
              <OptionCard
                key={option.label}
                label={option.label}
                clientPriceMinor={option.clientPriceMinor}
                productionTime={option.productionTime}
                readyBy={option.readyBy}
                eventDateFit={option.eventDateFit}
                recommendedOptions={option.recommendedOptions}
                footer={
                  <p className="text-caption text-text-muted m-0">
                    {option.shopName ?? "Shop"} · shop price {money(option.priceMinor)}
                    {request.acceptedOption === option.label ? " · accepted by the client" : ""}
                  </p>
                }
              />
            ))}
          </ul>
        </>
      ) : null}
      {request.orderId ? (
        <p className="text-body m-0 mt-3">
          <Link
            href={`/${tree}/orders/${encodeURIComponent(request.orderId)}`}
            className="text-text-primary underline underline-offset-2"
          >
            Open the order
          </Link>
        </p>
      ) : null}
      {validity ? (
        <div className="mt-3">
          <Button variant="secondary" onClick={onChangeValidity}>
            {request.status === "expired" ? "Renew the options" : "Change the date"}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
