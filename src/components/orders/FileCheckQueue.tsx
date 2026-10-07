"use client";

/**
 * The file-check queue: the Quality check stage of the Orders queue
 * (gridgo-api#122).
 *
 * No shop hears of an order until Operations has opened its artwork and
 * passed it, so this list is the one place an order can sit unseen. It reads
 * oldest first, the wait keeps counting while the page is open, and a long
 * wait is marked in words and colour together. Pass and Send back work from
 * the row: Pass shows the artwork and the four checks before it sends the job
 * to the shop; Send back asks for the reason the client will read.
 *
 * Orders whose payment is still being checked are already waiting on their
 * file too. They are listed beneath with the same clock, because a backlog
 * that builds overnight should be visible before the payments are cleared.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CircleCheck, Eye, Undo2 } from "lucide-react";

import { opsErrorMessage } from "@/app/ops/_lib/errors";
import { OrderArtwork } from "@/components/orders/DesignLinks";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  DataTableRowAction,
  type DataTableColumn,
} from "@/components/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { StatusChip } from "@/components/ui/StatusChip";
import { Textarea } from "@/components/ui/textarea";
import { transitionOrder } from "@/lib/api/client";
import type { Order } from "@/lib/api/types";
import {
  artworkSource,
  orderDesignLinks,
  providerName,
  safeLinkHref,
} from "@/lib/design-links";
import {
  SEND_BACK_REASON_MAX,
  buildFileCheckQueue,
  fileCheckOf,
  formatWait,
  qaChecksFor,
  qaChecklistPayload,
  sendBackReasonProblem,
  waitLevel,
  type FileCheckRow,
} from "@/lib/file-check";
import { formatDateTime } from "@/lib/format";
import { basketShopCounts, groupPositionLabel, shopModeOf } from "@/lib/baskets";
import { QaChecklistFields } from "./QaChecklist";
import { ShopModeChip } from "@/components/orders/ShopModeChip";
import { describeQuantity } from "@/lib/quantity";

const medium = { fontFamily: "var(--font-medium)" } as const;

/** How often the waits tick while the page is open. */
const TICK_MS = 30_000;

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

type Props = {
  orders: Order[];
  /** Re-read the orders after a decision. */
  onChanged: () => Promise<void> | void;
  /** The workspace link for an order in this tree. */
  orderHref?: (orderId: string) => string;
};

type Decision = { kind: "pass" | "send-back"; order: Order };

export function FileCheckQueue({
  orders,
  onChanged,
  orderHref = (id) => `/ops/orders/${encodeURIComponent(id)}`,
}: Props) {
  const now = useNow(TICK_MS);
  const queue = useMemo(() => buildFileCheckQueue(orders, now), [orders, now]);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // Orders that arrived while the page was open are marked New and announced
  // once; the ones already here when it opened are not news.
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<string[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const readyIds = queue.ready.map((row) => row.order.id).join(",");
  useEffect(() => {
    const ids = readyIds ? readyIds.split(",") : [];
    if (!seen.current) {
      seen.current = new Set(ids);
      return;
    }
    const arrived = ids.filter((id) => !seen.current?.has(id));
    for (const id of ids) seen.current.add(id);
    if (!arrived.length) return;
    setFresh((current) => [...current, ...arrived]);
    const titles = arrived.map(
      (id) => queue.ready.find((row) => row.order.id === id)?.order.title || "An order",
    );
    setAnnouncement(
      arrived.length === 1
        ? `New file to check: ${titles[0]}.`
        : `${arrived.length} new files to check.`,
    );
    // `queue` is read for titles only; the ids are what changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readyIds]);

  const oldest = queue.ready.find((row) => row.waitSeconds !== null)?.waitSeconds ?? null;

  const shopCounts = useMemo(() => basketShopCounts(orders), [orders]);

  const columns = useMemo<DataTableColumn<FileCheckRow>[]>(
    () => [
      {
        id: "order",
        header: "Order",
        primary: true,
        alwaysVisible: true,
        sortValue: (row) => row.order.title ?? "",
        filterValue: (row) => `${row.order.title ?? ""} ${row.order.id}`,
        cell: (row) => (
          <div className="min-w-0">
            <p
              className="text-body text-text-primary m-0 flex items-center gap-2"
              style={medium}
            >
              <span className="truncate">{row.order.title || "Untitled order"}</span>
              {fresh.includes(row.order.id) ? (
                <StatusChip tone="info" icon="circle-dot" label="New" />
              ) : null}
            </p>
            <div className="mt-1">
              <ShopModeChip mode={shopModeOf(row.order, shopCounts)} />
            </div>
            <p className="text-caption text-text-muted m-0 mt-0.5 truncate">
              {groupPositionLabel(row.order, shopCounts)
                ? `${groupPositionLabel(row.order, shopCounts)} · `
                : ""}
              Order {row.order.id}
            </p>
            <p className="text-caption text-text-muted m-0 mt-0.5 truncate">
              {describeQuantity(row.order.quantity, row.order.unit)}
              {row.order.requestFulfillment?.fulfillmentMode === "pickup"
                ? " · Pick-up"
                : ""}
            </p>
          </div>
        ),
      },
      {
        id: "waiting",
        header: "Waiting",
        sortValue: (row) => row.waitSeconds ?? -1,
        cell: (row) => <WaitMark seconds={row.waitSeconds} />,
      },
      {
        id: "artwork",
        header: "Artwork",
        sortValue: (row) => artworkSource(row.order),
        cell: (row) => <ArtworkCell order={row.order} />,
      },
    ],
    [fresh, shopCounts],
  );

  async function decided(message: string) {
    setDecision(null);
    setDone(message);
    await onChanged();
  }

  return (
    <div className="flex flex-col gap-4">
      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-body text-text-secondary m-0 max-w-prose">
          Open each file before the shop sees it. A shop hears of an order only when you
          pass it, and its hour to accept starts then. Oldest first.
        </p>
        {oldest !== null ? (
          <p
            className="text-body text-text-secondary m-0"
            data-testid="file-check-oldest"
          >
            Oldest waiting{" "}
            <span className="text-text-primary tabular-nums" style={medium}>
              {formatWait(oldest).toLowerCase()}
            </span>
          </p>
        ) : null}
      </div>

      {done ? (
        <p className="text-body text-success m-0" role="status">
          {done}
        </p>
      ) : null}

      {queue.ready.length === 0 ? (
        <EmptyState
          title="No files waiting on you"
          body="A paid order lands here straight away, and the desk chimes when it does."
        />
      ) : (
        <DataTable
          columns={columns}
          data={queue.ready}
          getRowId={(row) => row.order.id}
          caption="Files waiting on your check, oldest first"
          filterPlaceholder="Filter by order…"
          itemLabel="files"
          rowActions={(row) => (
            <>
              <DataTableRowAction
                label="Pass"
                icon={CircleCheck}
                onClick={() => {
                  setDone(null);
                  setDecision({ kind: "pass", order: row.order });
                }}
              />
              <DataTableRowAction
                label="Send back"
                icon={Undo2}
                onClick={() => {
                  setDone(null);
                  setDecision({ kind: "send-back", order: row.order });
                }}
              />
              <DataTableRowAction
                label="Open"
                icon={Eye}
                href={orderHref(row.order.id)}
              />
            </>
          )}
        />
      )}

      {queue.awaitingPayment.length ? (
        <section className="gg-card p-3" aria-labelledby="file-check-payment-heading">
          <h2 id="file-check-payment-heading" className="text-h3 text-text-primary m-0">
            Payment first ({queue.awaitingPayment.length})
          </h2>
          <p className="text-body text-text-secondary m-0 mt-1 max-w-prose">
            Their files are already waiting. Confirm the payment, then check the file.
          </p>
          <ul className="m-0 mt-2 flex list-none flex-col p-0">
            {queue.awaitingPayment.map((row) => (
              <li
                key={row.order.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-subtle py-2 last:border-b-0"
              >
                <Link
                  href={orderHref(row.order.id)}
                  className="text-body text-text-primary min-w-0 truncate underline-offset-2 hover:underline"
                >
                  {row.order.title || "Untitled order"}
                </Link>
                <WaitMark seconds={row.waitSeconds} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {queue.sentBack.length ? (
        <section className="gg-card p-3" aria-labelledby="file-check-sent-back-heading">
          <h2 id="file-check-sent-back-heading" className="text-h3 text-text-primary m-0">
            Sent back to the client ({queue.sentBack.length})
          </h2>
          <p className="text-body text-text-secondary m-0 mt-1 max-w-prose">
            Back here with a fresh wait when the client sends new artwork.
          </p>
          <ul className="m-0 mt-2 flex list-none flex-col p-0">
            {queue.sentBack.map((order) => {
              const check = fileCheckOf(order);
              return (
                <li
                  key={order.id}
                  className="flex flex-col gap-0.5 border-b border-outline-subtle py-2 last:border-b-0"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <Link
                      href={orderHref(order.id)}
                      className="text-body text-text-primary min-w-0 truncate underline-offset-2 hover:underline"
                    >
                      {order.title || "Untitled order"}
                    </Link>
                    <span className="text-caption text-text-muted">
                      {check?.reviewedAt
                        ? formatDateTime(check.reviewedAt)
                        : formatDateTime(order.updatedAt)}
                    </span>
                  </div>
                  {check?.reason ? (
                    <p className="text-body text-text-secondary m-0">
                      &ldquo;{check.reason}&rdquo;
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <PassDialog
        order={decision?.kind === "pass" ? decision.order : null}
        onCancel={() => setDecision(null)}
        onPassed={(order) =>
          decided(
            `Passed. The shop can now see "${order.title || "the order"}" and has been told.`,
          )
        }
      />
      <SendBackDialog
        order={decision?.kind === "send-back" ? decision.order : null}
        onCancel={() => setDecision(null)}
        onSent={(order) =>
          decided(
            `Sent back. The client has your note on "${order.title || "the order"}".`,
          )
        }
      />
    </div>
  );
}

/** The wait, in words; a long one also in colour, never colour alone. */
export function WaitMark({ seconds }: { seconds: number | null }) {
  if (seconds === null) {
    return (
      <span className="text-body text-text-muted whitespace-nowrap">Not recorded</span>
    );
  }
  const level = waitLevel(seconds);
  const label = formatWait(seconds);
  if (level === "fresh") {
    return (
      <span className="text-body text-text-secondary tabular-nums whitespace-nowrap">
        {label}
      </span>
    );
  }
  return (
    <span className="tabular-nums whitespace-nowrap" data-wait={level}>
      <StatusChip
        tone={level === "overdue" ? "error" : "warning"}
        icon={level === "overdue" ? "triangle-alert" : "clock"}
        label={level === "overdue" ? `${label}, overdue` : `${label}, waiting long`}
      />
    </span>
  );
}

function ArtworkCell({ order }: { order: Order }) {
  const files = (order.artworkFileIds ?? []).filter(Boolean).length;
  const links = orderDesignLinks(order);
  if (!files && !links.length) {
    return <span className="text-body text-error">No artwork on file</span>;
  }
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      {files ? (
        <span className="text-body text-text-secondary">
          {files === 1 ? "1 file" : `${files} files`}
        </span>
      ) : null}
      {links.map((link) => {
        // HTTPS only, as everywhere a design link is drawn: anything else is
        // shown as words, never as something to click.
        const href = safeLinkHref(link.url);
        const label = `${providerName(link.provider)} link`;
        return href ? (
          <a
            key={link.key}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-body text-text-primary truncate underline underline-offset-2"
          >
            {label}
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        ) : (
          <span key={link.key} className="text-body text-text-muted truncate">
            {label} (not a secure link)
          </span>
        );
      })}
    </div>
  );
}

function PassDialog({
  order,
  onCancel,
  onPassed,
}: {
  order: Order | null;
  onCancel: () => void;
  onPassed: (order: Order) => Promise<void> | void;
}) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = order?.id;
  useEffect(() => {
    setChecked({});
    setError(null);
  }, [id]);
  if (!order) return null;
  const checks = qaChecksFor(order);
  const ready = checks.every((check) => checked[check.id]);

  async function pass() {
    if (!order) return;
    setBusy(true);
    setError(null);
    try {
      await transitionOrder(order.id, "supplier_assigned", {
        qaChecklist: qaChecklistPayload(checked),
      });
      await onPassed(order);
    } catch (err) {
      setError(
        opsErrorMessage(
          err,
          "The file could not be passed. Refresh the queue and try again.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (!open && !busy ? onCancel() : undefined)}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Pass the file for {order.title || "this order"}</DialogTitle>
          <DialogDescription>
            The shop sees the order and is told as soon as you pass it. Its one opening
            hour to accept starts then.
          </DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
          <OrderArtwork order={order} />
          <QaChecklistFields
            order={order}
            checked={checked}
            onCheck={setChecked}
            disabled={busy}
          />
          {error ? (
            <p className="text-body text-error m-0" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="secondary" disabled={busy} onClick={onCancel}>
            Not yet
          </Button>
          <Button variant="primary" disabled={busy || !ready} onClick={() => void pass()}>
            {busy ? "Passing…" : "Pass and send to the shop"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SendBackDialog({
  order,
  onCancel,
  onSent,
}: {
  order: Order | null;
  onCancel: () => void;
  onSent: (order: Order) => Promise<void> | void;
}) {
  const [reason, setReason] = useState("");
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = order?.id;
  useEffect(() => {
    setReason("");
    setChecked({});
    setTouched(false);
    setError(null);
  }, [id]);
  if (!order) return null;
  const problem = sendBackReasonProblem(reason);

  async function send() {
    if (!order) return;
    setTouched(true);
    if (problem) return;
    setBusy(true);
    setError(null);
    try {
      await transitionOrder(order.id, "client_correction", {
        note: reason.trim(),
        qaChecklist: qaChecklistPayload(checked),
      });
      await onSent(order);
    } catch (err) {
      setError(
        opsErrorMessage(
          err,
          "The file could not be sent back. Refresh the queue and try again.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (!open && !busy ? onCancel() : undefined)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Send the file back</DialogTitle>
          <DialogDescription>
            {order.title || "This order"} goes back to the client to fix. Their payment is
            kept, and the shop hears nothing until you pass the new file.
          </DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto">
          <QaChecklistFields
            order={order}
            checked={checked}
            onCheck={setChecked}
            disabled={busy}
          />
          <Field data-invalid={touched && problem ? true : undefined}>
            <FieldLabel htmlFor="send-back-reason">
              What the client needs to fix
            </FieldLabel>
            <Textarea
              id="send-back-reason"
              rows={4}
              maxLength={SEND_BACK_REASON_MAX}
              value={reason}
              aria-invalid={touched && problem ? true : undefined}
              onChange={(event) => setReason(event.target.value)}
              placeholder="For example: the link asks for a sign-in. Share it so anyone with the link can view, or upload the file."
            />
            <FieldDescription>The client reads exactly what you write.</FieldDescription>
          </Field>
        </div>
        {touched && problem ? (
          <p className="text-body text-error m-0" role="alert">
            {problem}
          </p>
        ) : null}
        {error ? (
          <p className="text-body text-error m-0" role="alert">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="secondary" disabled={busy} onClick={onCancel}>
            Keep it here
          </Button>
          <Button variant="primary" disabled={busy} onClick={() => void send()}>
            {busy ? "Sending…" : "Send back to the client"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
