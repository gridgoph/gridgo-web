"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ApiError, cancelShopJob, requestShopDeadline } from "@/lib/api/client";
import type { Order } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";

const CANCELLABLE = new Set([
  "awaiting_checkout",
  "awaiting_initial_payment",
  "payment_authorized",
  "production",
  "supplier_self_qc",
  "ready_for_dispatch",
  "rider_assigned",
]);

const DEADLINE_STATES = new Set(["production", "supplier_self_qc"]);

function canAskDeadline(order: Order): boolean {
  if (!DEADLINE_STATES.has(order.state) || order.readyAt) return false;
  if (order.rescheduleRequest) return false;
  if (order.shopRecovery && order.shopRecovery.status !== "accepted") return false;
  if (order.refundHold || order.refundDisposition) return false;
  return Boolean(order.readyBy);
}

export function ShopLeaveJob({ order, onChanged }: { order: Order; onChanged: () => void }) {
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [proposed, setProposed] = useState("");
  const [deadlineReason, setDeadlineReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canCancel = CANCELLABLE.has(order.state);
  const canDeadline = canAskDeadline(order);

  if (!canCancel && !canDeadline && !order.rescheduleRequest) return null;

  async function cancel() {
    if (!reason.trim() || !confirmed) {
      setError("Write the reason and confirm what happens next.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await cancelShopJob(order.id, reason.trim());
      setNote("You cancelled this job. GRIDGO is working out the next step. Nothing more is yours to do here.");
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError && (err.status === 404 || err.status === 405)
        ? "Cancelling a job is not open yet."
        : "GRIDGO did not cancel this job.");
    } finally {
      setBusy(false);
    }
  }

  async function askDeadline() {
    if (!deadlineReason.trim() || !proposed) {
      setError("Write why, and choose a later ready-by.");
      return;
    }
    const at = new Date(proposed);
    const current = Date.parse(order.readyBy ?? "");
    if (Number.isNaN(at.getTime()) || at.getTime() <= Date.now() || at.getTime() <= current) {
      setError("Choose a ready-by later than now and later than the current ready-by.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await requestShopDeadline(order.id, {
        reason: deadlineReason.trim(),
        proposedReadyBy: at.toISOString(),
      });
      setNote("Asked. The promise does not change until the client accepts.");
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError && (err.status === 404 || err.status === 405)
        ? "A new deadline is not open yet."
        : "GRIDGO did not take that deadline request.");
    } finally {
      setBusy(false);
    }
  }

  const standing = order.rescheduleRequest;

  return (
    <section className="border-outline-subtle flex flex-col gap-3 rounded-field border p-3" aria-label="Leave or move this job">
      {standing ? (
        <p className="text-body text-text-secondary m-0">
          Deadline request: {standing.status}. Current ready-by stays{" "}
          {formatDateTime(order.readyBy)} until the client accepts.
        </p>
      ) : null}
      {canCancel ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void cancel();
          }}
        >
          <h3 className="text-h3 text-text-primary m-0">Cancel this job</h3>
          <p className="text-body text-text-secondary m-0">
            Only before the rider collects it. Cancelling hands the job back. It does not by itself cancel a job you already finished.
          </p>
          <label className="flex flex-col gap-1">
            <span className="text-caption text-text-muted">Reason</span>
            <textarea
              className="border-input bg-card min-h-20 rounded-[var(--radius-field)] border px-3 py-2"
              value={reason}
              required
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <label className="text-body text-text-primary flex items-start gap-2">
            <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
            I understand GRIDGO will offer the client another shop or a refund, and this job leaves my shop.
          </label>
          <Button type="submit" variant="danger" disabled={busy}>
            Cancel this job
          </Button>
        </form>
      ) : null}
      {canDeadline ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void askDeadline();
          }}
        >
          <h3 className="text-h3 text-text-primary m-0">Ask for a later ready-by</h3>
          <p className="text-caption text-text-muted m-0">
            Current ready-by {formatDateTime(order.readyBy)}. One request for this job. The client promise does not move until they accept.
          </p>
          <label className="flex flex-col gap-1">
            <span className="text-caption text-text-muted">Later ready-by</span>
            <input
              type="datetime-local"
              className="border-input bg-card h-12 rounded-[var(--radius-field)] border px-3"
              value={proposed}
              onChange={(event) => setProposed(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-caption text-text-muted">Reason the client will see</span>
            <textarea
              className="border-input bg-card min-h-20 rounded-[var(--radius-field)] border px-3 py-2"
              value={deadlineReason}
              required
              onChange={(event) => setDeadlineReason(event.target.value)}
            />
          </label>
          <Button type="submit" disabled={busy}>
            Request a new deadline
          </Button>
        </form>
      ) : null}
      {error ? <p className="text-body text-error m-0" role="alert">{error}</p> : null}
      {note ? <p className="text-body text-text-secondary m-0">{note}</p> : null}
    </section>
  );
}
