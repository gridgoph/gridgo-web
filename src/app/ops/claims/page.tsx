"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, CirclePause, Eye, Unlock } from "lucide-react";

import {
  presentClaimAction,
  presentClaimStatus,
  presentZone,
} from "@/app/ops/_lib/present";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DataTable,
  DataTableRowAction,
  type DataTableColumn,
} from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusChip } from "@/components/ui/StatusChip";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  ApiError,
  createClaim,
  holdClaim,
  listClaims,
  listOrders,
  releaseClaim,
} from "@/lib/api/client";
import { PLATFORM_CONSTRAINT_COPY } from "@/lib/api/constraints";
import type { Claim, Order } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import { presentTimelineActor } from "@/lib/order-state";

type DialogMode =
  { type: "raise" } | { type: "hold"; claim: Claim } | { type: "release"; claim: Claim };

/** Filter values are API-shaped; only these labels reach the screen. */
const CLAIM_FILTER_LABELS: Record<string, string> = {
  all: "All claims",
  open: "Open",
  payout_held: "Payout held",
  released: "Released",
};

export default function OpsClaimsPage() {
  const [claims, setClaims] = useState<Claim[] | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const [dialog, setDialog] = useState<DialogMode | null>(null);
  const [reason, setReason] = useState("");
  const [raiseOrderId, setRaiseOrderId] = useState("");
  const [raiseHold, setRaiseHold] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [c, o] = await Promise.all([listClaims(), listOrders()]);
      setClaims(c);
      setOrders(o);
    } catch (err) {
      setClaims(null);
      if (err instanceof ApiError) {
        setError(`Could not load claims (${err.code}).`);
      } else {
        setError("Network error loading claims.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const orderTitle = useCallback(
    (orderId: string) => orders.find((o) => o.id === orderId)?.title ?? orderId,
    [orders],
  );

  const filtered = useMemo(() => {
    if (!claims) return [];
    const list =
      statusFilter === "all" ? claims : claims.filter((c) => c.status === statusFilter);
    return [...list].sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  }, [claims, statusFilter]);

  const detail = useMemo(
    () => claims?.find((c) => c.id === detailId) ?? null,
    [claims, detailId],
  );

  function openDialog(mode: DialogMode) {
    setDialog(mode);
    setReason("");
    setActionError(null);
    if (mode.type === "raise") {
      setRaiseOrderId(orders[0]?.id ?? "");
      setRaiseHold(true);
    }
  }

  async function submitDialog() {
    if (!dialog) return;
    const text = reason.trim();
    if (!text) {
      setActionError("A reason is required — every money action is contested.");
      return;
    }
    setSubmitting(true);
    setActionError(null);
    try {
      if (dialog.type === "raise") {
        if (!raiseOrderId) {
          setActionError("Choose the order this claim belongs to.");
          setSubmitting(false);
          return;
        }
        const created = await createClaim({
          orderId: raiseOrderId,
          reason: text,
          hold: raiseHold,
        });
        setDetailId(created.id);
      } else if (dialog.type === "hold") {
        await holdClaim(dialog.claim.id, { reason: text });
        setDetailId(dialog.claim.id);
      } else {
        await releaseClaim(dialog.claim.id, { reason: text });
        setDetailId(dialog.claim.id);
      }
      setDialog(null);
      setReason("");
      await load();
    } catch (err) {
      if (err instanceof ApiError) {
        setActionError(`Could not complete action (${err.code}).`);
      } else {
        setActionError("Network error. Try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const columns = useMemo<DataTableColumn<Claim>[]>(
    () => [
      {
        id: "order",
        header: "Order",
        primary: true,
        sortValue: (c) => orderTitle(c.orderId),
        filterValue: (c) =>
          `${orderTitle(c.orderId)} ${c.orderId} ${c.reason} ${c.status}`,
        cell: (c) => (
          <div>
            <p
              className="text-body text-text-primary m-0"
              style={{ fontFamily: "var(--font-medium)" }}
            >
              {orderTitle(c.orderId)}
            </p>
            <p className="text-caption text-text-muted m-0 mt-0.5">
              Raised by {presentTimelineActor(c.raisedBy)}
            </p>
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        sortValue: (c) => presentClaimStatus(c.status).label,
        cell: (c) => {
          const s = presentClaimStatus(c.status);
          return <StatusChip tone={s.tone} label={s.label} icon={s.icon} />;
        },
      },
      {
        id: "reason",
        header: "Reason",
        sortValue: (c) => c.reason,
        cell: (c) => (
          <span className="text-body text-text-secondary line-clamp-2">{c.reason}</span>
        ),
      },
      {
        id: "hold",
        header: "Hold detail",
        sortValue: (c) => c.holdReason ?? "",
        cell: (c) => (
          <span className="text-body text-text-secondary">
            {c.holdReason
              ? `${c.holdReason}${c.heldAt ? ` · ${formatDateTime(c.heldAt)}` : ""}`
              : "—"}
          </span>
        ),
      },
      {
        id: "updated",
        header: "Updated",
        sortValue: (c) => c.updatedAt,
        cell: (c) => (
          <span className="text-body text-text-secondary whitespace-nowrap">
            {formatDateTime(c.updatedAt)}
          </span>
        ),
      },
    ],
    [orderTitle],
  );

  if (loading && !claims) {
    return <LoadingBlock label="Loading claims…" />;
  }

  if (error || !claims) {
    return (
      <ErrorState
        body={error ?? "No data."}
        action={
          <Button variant="secondary" onClick={() => void load()}>
            Retry
          </Button>
        }
      />
    );
  }

  const payoutCopy = PLATFORM_CONSTRAINT_COPY.payout_held;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-body text-text-secondary m-0 max-w-prose">
          {payoutCopy.guidance} Every raise, hold, and release needs a reason that is
          visible, attributable, and timestamped.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void load()}>
            Refresh
          </Button>
          {/* Sole page-surface yellow CTA. Dialog footer submit is a separate panel. */}
          <Button variant="primary" onClick={() => openDialog({ type: "raise" })}>
            Raise claim
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="claim-status-filter" className="text-caption text-text-muted">
          Status
        </label>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? "all")}>
          <SelectTrigger id="claim-status-filter" className="min-h-11">
            <SelectValue>
              {(v) => CLAIM_FILTER_LABELS[String(v ?? "all")] ?? "All claims"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All claims</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="payout_held">Payout held</SelectItem>
            <SelectItem value="released">Released</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {!filtered.length ? (
        <EmptyState
          title={statusFilter === "all" ? "No claims yet" : "No claims in this status"}
          body={
            statusFilter === "all"
              ? "Raise a claim when quality, delivery, or money is contested. Active holds block supplier payout release."
              : "Try another status filter, or raise a new claim."
          }
          action={
            <Button variant="secondary" onClick={() => openDialog({ type: "raise" })}>
              Raise claim
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          getRowId={(c) => c.id}
          caption="Claims and payout holds"
          filterPlaceholder="Filter claims…"
          rowActions={(c) => (
            <>
              <DataTableRowAction
                label="Details"
                icon={Eye}
                onClick={() => setDetailId(c.id)}
              />
              {c.status === "open" ? (
                <DataTableRowAction
                  label="Hold payout"
                  icon={CirclePause}
                  onClick={() => openDialog({ type: "hold", claim: c })}
                />
              ) : null}
              {c.status === "open" || c.status === "payout_held" ? (
                <DataTableRowAction
                  label="Release"
                  icon={Unlock}
                  onClick={() => openDialog({ type: "release", claim: c })}
                />
              ) : null}
              <DataTableRowAction
                label="Order"
                icon={ChevronRight}
                href={`/ops/qa/${c.orderId}`}
              />
            </>
          )}
        />
      )}

      {detail ? (
        <section
          className="gg-card flex flex-col gap-3"
          aria-labelledby="claim-detail-heading"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 id="claim-detail-heading" className="text-h3 text-text-primary m-0">
                {orderTitle(detail.orderId)}
              </h2>
              <p className="text-caption text-text-muted m-0 mt-1">
                Claim record · {formatDateTime(detail.createdAt)}
              </p>
            </div>
            <StatusChip
              tone={presentClaimStatus(detail.status).tone}
              label={presentClaimStatus(detail.status).label}
              icon={presentClaimStatus(detail.status).icon}
            />
          </div>

          <dl className="m-0 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-caption text-text-muted">Raised by</dt>
              <dd className="text-body text-text-primary m-0">
                {presentTimelineActor(detail.raisedBy)}
              </dd>
            </div>
            <div>
              <dt className="text-caption text-text-muted">Reason</dt>
              <dd className="text-body text-text-primary m-0">{detail.reason}</dd>
            </div>
            <div>
              <dt className="text-caption text-text-muted">Hold reason</dt>
              <dd className="text-body text-text-primary m-0">
                {detail.holdReason ?? "—"}
                {detail.heldBy ? ` · ${presentTimelineActor(detail.heldBy)}` : ""}
                {detail.heldAt ? ` · ${formatDateTime(detail.heldAt)}` : ""}
              </dd>
            </div>
            <div>
              <dt className="text-caption text-text-muted">Release reason</dt>
              <dd className="text-body text-text-primary m-0">
                {detail.releaseReason ?? "—"}
                {detail.releasedBy ? ` · ${presentTimelineActor(detail.releasedBy)}` : ""}
                {detail.releasedAt ? ` · ${formatDateTime(detail.releasedAt)}` : ""}
              </dd>
            </div>
            <div>
              <dt className="text-caption text-text-muted">Zone</dt>
              <dd className="text-body text-text-primary m-0">
                {presentZone(orders.find((o) => o.id === detail.orderId)?.zone ?? "") ||
                  "—"}
              </dd>
            </div>
          </dl>

          <div>
            <h3
              className="text-body text-text-primary m-0 mb-2"
              style={{ fontFamily: "var(--font-medium)" }}
            >
              Claim timeline
            </h3>
            {detail.timeline?.length ? (
              <ol className="m-0 flex list-none flex-col gap-2 p-0">
                {[...detail.timeline]
                  .sort((a, b) => a.at.localeCompare(b.at))
                  .map((entry, i) => (
                    <li
                      key={`${entry.at}-${entry.action}-${i}`}
                      className="border-l-2 border-outline pl-3"
                    >
                      <p className="text-body text-text-primary m-0">
                        {presentClaimAction(entry.action)}
                      </p>
                      <p className="text-caption text-text-muted m-0 mt-0.5">
                        {formatDateTime(entry.at)} · {presentTimelineActor(entry.by)}
                      </p>
                      {entry.note ? (
                        <p className="text-caption text-text-secondary m-0 mt-1">
                          {entry.note}
                        </p>
                      ) : null}
                    </li>
                  ))}
              </ol>
            ) : (
              <p className="text-body text-text-muted m-0">No timeline yet.</p>
            )}
          </div>
        </section>
      ) : null}

      <Dialog
        open={dialog?.type === "raise"}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Raise claim</DialogTitle>
            <DialogDescription>
              State why this claim exists. Holding payout blocks supplier payout release
              until released.
            </DialogDescription>
          </DialogHeader>

          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="claim-order">Order</FieldLabel>
              <Select
                value={raiseOrderId}
                onValueChange={(v) => setRaiseOrderId(v ?? "")}
              >
                <SelectTrigger id="claim-order" className="min-h-11 w-full">
                  <SelectValue placeholder="Choose an order">
                    {(v) =>
                      orders.find((o) => o.id === v)?.title ?? "Choose an order"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {orders
                    .filter((o) => o.state !== "draft")
                    .map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.title}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Hold payout now</FieldLabel>
              <ToggleGroup
                value={[raiseHold ? "hold" : "open"]}
                onValueChange={(values) => {
                  const next = values[0];
                  if (next) setRaiseHold(next === "hold");
                }}
                variant="outline"
                spacing={0}
                aria-label="Payout hold choice"
              >
                <ToggleGroupItem value="hold">Hold payout</ToggleGroupItem>
                <ToggleGroupItem value="open">Raise without hold</ToggleGroupItem>
              </ToggleGroup>
              <p className="text-caption text-text-muted m-0">
                Holding blocks supplier payout release until Operations releases the hold
                with a reason.
              </p>
            </Field>

            <Field>
              <FieldLabel htmlFor="claim-reason">Reason</FieldLabel>
              <Textarea
                id="claim-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                required
                placeholder="What happened and why this action is required"
              />
            </Field>

            {actionError ? (
              <p className="text-body text-error m-0" role="alert">
                {actionError}
              </p>
            ) : null}
          </FieldGroup>

          <DialogFooter>
            <Button
              variant="secondary"
              disabled={submitting}
              onClick={() => setDialog(null)}
            >
              Cancel
            </Button>
            {/* Yellow allowed here: bounded dialog panel CTA, not a page-surface row. */}
            <Button
              variant="primary"
              disabled={submitting}
              onClick={() => void submitDialog()}
            >
              {submitting ? "Saving…" : "Raise claim"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={dialog?.type === "hold" || dialog?.type === "release"}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {dialog?.type === "hold"
                ? "Hold this payout?"
                : "Release this payout hold?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {dialog?.type === "hold"
                ? "The supplier cannot receive this payout until Operations releases the hold. Record the reason for the claim and audit trail."
                : "This removes the claim’s payment block. Payout can proceed when the order is complete, and the release is recorded on the audit trail."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="payout-action-reason">Reason</FieldLabel>
              <Textarea
                id="payout-action-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
                required
                placeholder="What happened and why this action is required"
              />
            </Field>
          </FieldGroup>
          {actionError ? (
            <p className="text-body text-error m-0" role="alert">
              {actionError}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel variant="secondary" disabled={submitting}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant={dialog?.type === "hold" ? "danger" : "primary"}
              disabled={submitting}
              onClick={() => void submitDialog()}
            >
              {submitting
                ? "Saving…"
                : dialog?.type === "hold"
                  ? "Hold payout"
                  : "Release hold"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
