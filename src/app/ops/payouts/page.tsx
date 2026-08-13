"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { opsErrorMessage } from "@/app/ops/_lib/errors";
import { MilestoneList } from "@/components/orders/MilestoneList";
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
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { StatusChip } from "@/components/ui/StatusChip";
import { Textarea } from "@/components/ui/textarea";
import { listClaims, listOrders, releaseMilestone } from "@/lib/api/client";
import { claimBlocksPayout } from "@/lib/api/constraints";
import type { Claim, Order, PayoutMilestone } from "@/lib/api/types";
import { formatPhp } from "@/lib/format";
import { presentMilestone, presentOrderState } from "@/lib/order-state";

type Loaded = {
  orders: Order[];
  claims: Claim[];
};

/** Orders far enough along that a payout milestone can be in play. */
const PAYOUT_STATES = new Set([
  "payment_authorized",
  "production",
  "supplier_self_qc",
  "ready_for_dispatch",
  "rider_assigned",
  "picked_up",
  "out_for_delivery",
  "delivered",
  "issue_window_open",
  "completed",
  "payout_released",
]);

export default function OpsPayoutsPage() {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [releasing, setReleasing] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionOk, setActionOk] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{
    order: Order;
    milestone: PayoutMilestone;
  } | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [orders, claims] = await Promise.all([listOrders(), listClaims()]);
      setData({ orders, claims });
    } catch (err) {
      setData(null);
      setError(
        opsErrorMessage(
          err,
          "Could not load payouts. Confirm the demo API is running, then retry.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    if (!data) return [];
    return data.orders
      .filter(
        (order) =>
          PAYOUT_STATES.has(order.state) && order.payoutMilestones?.length,
      )
      .map((order) => ({
        order,
        holds: data.claims.filter(
          (claim) =>
            claim.orderId === order.id && claimBlocksPayout(claim.status),
        ),
      }))
      .sort((a, b) => {
        const aOutstanding = outstandingCount(a.order);
        const bOutstanding = outstandingCount(b.order);
        if (aOutstanding !== bOutstanding) return bOutstanding - aOutstanding;
        return (a.order.updatedAt || "").localeCompare(b.order.updatedAt || "");
      });
  }, [data]);

  async function apply() {
    if (!confirm) return;
    setBusy(true);
    setReleasing(confirm.milestone.code);
    setActionError(null);
    setActionOk(null);
    try {
      await releaseMilestone(confirm.order.id, confirm.milestone.code, {
        note: note.trim() || "Proof of Fulfilment reviewed",
      });
      setActionOk(
        `${presentMilestone(confirm.milestone.code)} released to the supplier${
          confirm.milestone.amountMinor !== undefined
            ? ` — ${formatPhp(confirm.milestone.amountMinor)}`
            : ""
        }.`,
      );
      setConfirm(null);
      setNote("");
      await load();
    } catch (err) {
      setActionError(
        opsErrorMessage(err, "Could not release that milestone. Try again."),
      );
    } finally {
      setBusy(false);
      setReleasing(null);
    }
  }

  if (loading && !data) return <LoadingBlock label="Loading payouts…" />;
  if (error || !data) {
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

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-body text-text-secondary m-0 max-w-prose">
          A supplier is paid in four parts, and each one releases only against a
          Proof of Fulfilment. The shares are of what the supplier earns — the
          commission and the delivery fee sit outside them.
        </p>
        <Button variant="secondary" onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      {actionOk ? (
        <p className="text-body text-success m-0" role="status">
          {actionOk}
        </p>
      ) : null}
      {actionError && !confirm ? (
        <p className="text-body text-error m-0" role="alert">
          {actionError}
        </p>
      ) : null}

      {!rows.length ? (
        <EmptyState
          title="No payouts in play"
          body="Milestones appear once a supplier has accepted an order and production begins. Nothing has reached that point yet."
          action={
            <Button variant="secondary" onClick={() => void load()}>
              Refresh
            </Button>
          }
        />
      ) : (
        <ul className="m-0 flex list-none flex-col gap-4 p-0">
          {rows.map(({ order, holds }) => {
            const status = presentOrderState(order.state);
            return (
              <li key={order.id} className="gg-card flex flex-col gap-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p
                      className="text-body text-text-primary m-0"
                      style={{ fontFamily: "var(--font-medium)" }}
                    >
                      {order.title}
                    </p>
                    {order.supplierPriceMinor !== undefined ? (
                      <p className="text-caption text-text-muted m-0 mt-0.5">
                        Supplier earns {formatPhp(order.supplierPriceMinor)} on
                        this order
                      </p>
                    ) : null}
                  </div>
                  <StatusChip
                    tone={status.tone}
                    label={status.label}
                    icon={status.icon}
                  />
                </div>

                {holds.length ? (
                  <div
                    className="rounded-card border border-error px-4 py-3"
                    role="status"
                  >
                    <p
                      className="text-body text-text-primary m-0"
                      style={{ fontFamily: "var(--font-medium)" }}
                    >
                      {holds.length === 1
                        ? "A claim is holding this payout"
                        : `${holds.length} claims are holding this payout`}
                    </p>
                    <ul className="m-0 mt-1 flex list-none flex-col gap-1 p-0">
                      {holds.map((claim) => (
                        <li
                          key={claim.id}
                          className="text-body text-text-secondary"
                        >
                          {claim.holdReason || claim.reason}
                        </li>
                      ))}
                    </ul>
                    <p className="text-caption text-text-muted m-0 mt-2">
                      Nothing releases until the hold is lifted on Claims and
                      payout holds.
                    </p>
                  </div>
                ) : null}

                <MilestoneList
                  order={order}
                  releasing={releasing}
                  onRelease={(milestone) => {
                    setActionError(null);
                    setNote("");
                    setConfirm({ order, milestone });
                  }}
                />
              </li>
            );
          })}
        </ul>
      )}

      <AlertDialog
        open={!!confirm}
        onOpenChange={(open) => {
          if (!open) {
            setConfirm(null);
            setNote("");
            setActionError(null);
          }
        }}
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Release{" "}
              {confirm?.milestone.amountMinor !== undefined
                ? formatPhp(confirm.milestone.amountMinor)
                : "this milestone"}{" "}
              to the supplier?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm
                ? `${presentMilestone(confirm.milestone.code)} on ${confirm.order.title}. Releasing pays the supplier and cannot be undone from the portal — check the Proof of Fulfilment first.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="release-note">
                Note for the record (optional)
              </FieldLabel>
              <Textarea
                id="release-note"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Proof shows the full run boxed and labelled"
              />
              <FieldDescription>
                Stored on the audit trail with your name and the time.
              </FieldDescription>
            </Field>
          </FieldGroup>
          {actionError ? (
            <p className="text-body text-error m-0" role="alert">
              {actionError}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel
              variant="secondary"
              disabled={busy}
              onClick={() => setConfirm(null)}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="primary"
              disabled={busy}
              onClick={() => void apply()}
            >
              {busy ? "Releasing…" : "Release payout"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function outstandingCount(order: Order): number {
  return (order.payoutMilestones ?? []).filter((m) => m.status !== "released")
    .length;
}
