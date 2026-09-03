"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { STAGES, isCancelled, stepsFor, type Stage, type WorkspaceStep } from "@/app/ops/_lib/pipeline";
import { opsErrorMessage } from "@/app/ops/_lib/errors";
import { EvidenceStrip } from "@/components/orders/EvidencePreview";
import { Timeline } from "@/components/orders/Timeline";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonDetail } from "@/components/ui/loading";
import { StatusChip } from "@/components/ui/StatusChip";
import { Textarea } from "@/components/ui/textarea";
import { artworkEvidence, paymentProofEvidence } from "@/lib/evidence";
import { confirmPayment, getOrder, rejectPayment, transitionOrder } from "@/lib/api/client";
import type { Order } from "@/lib/api/types";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { formatDateTime, formatPhp } from "@/lib/format";
import { presentOrderState } from "@/lib/order-state";
import { paymentOf } from "@/lib/payments";
import { describeQuantity } from "@/lib/quantity";

/**
 * One order, as a sequence of steps with everything about it beside them.
 *
 * The two halves are deliberate. On the left, only the step the order is
 * actually on can be acted on -- so nobody is invited to approve artwork on an
 * order whose payment has not cleared. On the right, the whole specification,
 * always visible and never behind a tab, because the one thing a quality check
 * needs is to read the spec and tick the boxes at the same time.
 */
export default function OpsOrderWorkspacePage() {
  const { id: orderId } = useParams<{ id: string }>();

  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setOrder(await getOrder(orderId));
    } catch (err) {
      setOrder(null);
      setError(opsErrorMessage(err, "That order could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useLiveReload(["orders", "jobs"], load, { matchId: orderId });

  useEffect(() => {
    void load();
  }, [load]);

  const steps = useMemo(() => (order ? stepsFor(order) : []), [order]);

  async function run(label: string, action: () => Promise<Order>) {
    setActing(label);
    setActionError(null);
    try {
      setOrder(await action());
      setNote("");
      setChecked({});
    } catch (err) {
      setActionError(opsErrorMessage(err, "That did not go through. Refresh the order and try again."));
    } finally {
      setActing(null);
    }
  }

  if (loading && !order) return <SkeletonDetail label="Loading this order…" />;
  if (error || !order) {
    return (
      <ErrorState
        body={error ?? "That order could not be found."}
        action={<Button variant="secondary" onClick={() => void load()}>Retry</Button>}
      />
    );
  }

  const status = presentOrderState(order.state);
  const downpayment = paymentOf(order, "downpayment");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link
            href="/ops/orders"
            className="text-caption text-text-muted inline-flex items-center gap-1 hover:text-text-secondary"
          >
            <ChevronLeft size={14} strokeWidth={2} aria-hidden />
            Back to queue
          </Link>
          <h1 className="text-h2 text-text-primary m-0 mt-1 truncate">
            {order.title || "Untitled order"}
          </h1>
        </div>
        <StatusChip tone={status.tone} label={status.label} icon={status.icon} />
      </div>

      {isCancelled(order) ? (
        <div
          className="gg-card p-3"
          style={{ borderColor: "var(--color-error)" }}
          role="status"
        >
          <p className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-medium)" }}>
            Cancelled {formatDateTime(order.cancelledAt)}
          </p>
          <p className="text-body text-text-secondary m-0 mt-1">{order.cancellationReason}</p>
          <p className="text-caption text-text-muted m-0 mt-2">
            Any refund is a manual transfer. This record does not move money.
          </p>
        </div>
      ) : null}

      {/*
        Steps take the width they need and the rail is fixed, because the rail's
        job is to be read at a glance while the left side is being worked. Below
        the breakpoint they stack, spec first -- on a narrow screen you read
        before you act.
      */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-3">
          {steps.map((step) => (
            <StepCard
              key={step.id}
              step={step}
              order={order}
              note={note}
              onNote={setNote}
              checked={checked}
              onCheck={setChecked}
              acting={acting}
              onConfirmPayment={() => run("confirm", () => confirmPayment(order.id, "downpayment"))}
              onRejectPayment={(reason) => run("reject", () => rejectPayment(order.id, "downpayment", { reason }))}
              onApprove={() => run("approve", () => transitionOrder(order.id, "supplier_assigned", { note }))}
              onCorrection={() => run("correction", () => transitionOrder(order.id, "client_correction", { note }))}
              onCancel={() => run("cancel", () => transitionOrder(order.id, "cancelled", { reason: note }))}
            />
          ))}

          {actionError ? (
            <p className="text-body text-error m-0" role="alert">{actionError}</p>
          ) : null}

          <section className="gg-card p-3" aria-labelledby="timeline-heading">
            <h2 id="timeline-heading" className="text-h3 text-text-primary m-0 mb-2">History</h2>
            <Timeline entries={order.timeline} />
          </section>
        </div>

        <SpecRail order={order} downpaymentAmount={downpayment?.amountMinor ?? null} />
      </div>
    </div>
  );
}

type StepCardProps = {
  step: WorkspaceStep;
  order: Order;
  note: string;
  onNote: (value: string) => void;
  checked: Record<string, boolean>;
  onCheck: (next: Record<string, boolean>) => void;
  acting: string | null;
  onConfirmPayment: () => void;
  onRejectPayment: (reason: string) => void;
  onApprove: () => void;
  onCorrection: () => void;
  onCancel: () => void;
};

/**
 * What Operations must have looked at before approving artwork.
 *
 * These are not stored anywhere and are not a record: they are a hand on the
 * arm. Approving sends the job to a shop that will print exactly what is on the
 * screen, and four deliberate ticks is the cheapest way to stop that being one
 * reflexive click.
 */
const QA_CHECKS = [
  { id: "artwork", label: "Artwork opens and is high enough resolution" },
  { id: "spec", label: "Specification matches what the client ordered" },
  { id: "quantity", label: "Quantity looks deliberate" },
  { id: "address", label: "Delivery address is somewhere a rider can go" },
];

function StepCard({
  step, order, note, onNote, checked, onCheck, acting,
  onConfirmPayment, onRejectPayment, onApprove, onCorrection, onCancel,
}: StepCardProps) {
  const definition = STAGES.find((entry) => entry.id === step.id);
  const current = step.status === "current";
  const busy = acting !== null;

  return (
    <section
      className="gg-card p-3"
      style={{
        borderColor: current ? "var(--color-accent)" : "var(--color-outline)",
        opacity: step.status === "locked" ? 0.55 : 1,
      }}
      aria-current={current ? "step" : undefined}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-h3 text-text-primary m-0">{definition?.label}</h2>
        <span className="text-overline text-text-muted">
          {step.status === "done" ? "Done" : current ? "You are here" : "Locked"}
        </span>
      </div>

      {step.id === "payment" ? (
        <PaymentStep
          order={order}
          current={current}
          busy={busy}
          onConfirm={onConfirmPayment}
          onReject={onRejectPayment}
        />
      ) : null}

      {step.id === "qa" ? (
        current ? (
          <div className="mt-3 flex flex-col gap-3">
            <ul className="flex flex-col gap-2 m-0 p-0 list-none">
              {QA_CHECKS.map((check) => (
                <li key={check.id}>
                  <label className="flex items-start gap-2 text-body text-text-secondary cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={Boolean(checked[check.id])}
                      onChange={(event) => onCheck({ ...checked, [check.id]: event.target.checked })}
                    />
                    {check.label}
                  </label>
                </li>
              ))}
            </ul>
            <Textarea
              value={note}
              onChange={(event) => onNote(event.target.value)}
              placeholder="What the client needs to change, or why this is being cancelled"
              rows={2}
              aria-label="Note to the client"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                onClick={onApprove}
                disabled={busy || QA_CHECKS.some((check) => !checked[check.id])}
              >
                {acting === "approve" ? "Sending…" : "Approve and send to the shop"}
              </Button>
              <Button variant="secondary" onClick={onCorrection} disabled={busy || !note.trim()}>
                Send back for changes
              </Button>
              <Button variant="secondary" onClick={onCancel} disabled={busy || !note.trim()}>
                Cancel this order
              </Button>
            </div>
            <p className="text-caption text-text-muted m-0">
              Sending back keeps the client&rsquo;s payment. Both a change request and a
              cancellation need a reason — the client is told what you write.
            </p>
          </div>
        ) : (
          <p className="text-body text-text-secondary m-0 mt-2">{definition?.hint}</p>
        )
      ) : null}

      {step.id === "production" || step.id === "delivery" ? (
        <p className="text-body text-text-secondary m-0 mt-2">{definition?.hint}</p>
      ) : null}
    </section>
  );
}

function PaymentStep({
  order, current, busy, onConfirm, onReject,
}: {
  order: Order;
  current: boolean;
  busy: boolean;
  onConfirm: () => void;
  onReject: (reason: string) => void;
}) {
  const payment = paymentOf(order, "downpayment");
  const proofs = paymentProofEvidence(order);
  const waiting = payment?.status === "pending_confirmation";

  return (
    <div className="mt-2 flex flex-col gap-3">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 m-0">
        <dt className="text-caption text-text-muted">Amount</dt>
        <dd className="text-body text-text-primary m-0 tabular-nums">
          {payment?.amountMinor != null ? formatPhp(payment.amountMinor) : "—"}
        </dd>
        <dt className="text-caption text-text-muted">Reference</dt>
        <dd className="text-body text-text-primary m-0">{payment?.reference || "—"}</dd>
        {payment?.confirmedAt ? (
          <>
            <dt className="text-caption text-text-muted">Confirmed</dt>
            <dd className="text-body text-text-secondary m-0">{formatDateTime(payment.confirmedAt)}</dd>
          </>
        ) : null}
      </dl>

      {proofs.length ? <EvidenceStrip items={proofs} /> : null}

      {current && waiting ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={onConfirm} disabled={busy}>Confirm this payment</Button>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => onReject("The transfer could not be matched to this order.")}
          >
            Reject
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** Everything about the order, always on screen while the left side is worked. */
function SpecRail({ order, downpaymentAmount }: { order: Order; downpaymentAmount: number | null }) {
  const artwork = artworkEvidence(order);
  return (
    <aside className="flex flex-col gap-3 lg:sticky lg:top-4 lg:self-start" aria-label="Order details">
      <section className="gg-card p-3">
        <h2 className="text-overline text-text-muted m-0 mb-2">This order</h2>
        <p className="text-body-lg text-text-primary m-0" style={{ fontFamily: "var(--font-medium)" }}>
          {order.title || "Untitled order"}
        </p>
        <p className="text-body text-text-secondary m-0 mt-1">
          {describeQuantity(order.quantity, order.unit)}
        </p>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 m-0 mt-2">
          {([["Size", order.size], ["Material", order.material], ["Finish", order.finish]] as const)
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-caption text-text-muted">{label}</dt>
                <dd className="text-body text-text-secondary m-0">{value}</dd>
              </div>
            ))}
        </dl>
      </section>

      {artwork.length ? (
        <section className="gg-card p-3">
          <h2 className="text-overline text-text-muted m-0 mb-2">Artwork</h2>
          <EvidenceStrip items={artwork} />
        </section>
      ) : null}

      <section className="gg-card p-3">
        <h2 className="text-overline text-text-muted m-0 mb-2">Money</h2>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 m-0">
          <dt className="text-caption text-text-muted">Total</dt>
          <dd className="text-body text-text-primary m-0 tabular-nums">
            {order.totalMinor != null ? formatPhp(order.totalMinor) : "—"}
          </dd>
          <dt className="text-caption text-text-muted">Paid</dt>
          <dd className="text-body text-text-secondary m-0 tabular-nums">
            {downpaymentAmount != null ? formatPhp(downpaymentAmount) : "—"}
          </dd>
        </dl>
      </section>

      <section className="gg-card p-3">
        <h2 className="text-overline text-text-muted m-0 mb-2">Delivery</h2>
        <p className="text-body text-text-secondary m-0">{order.address || "Not set"}</p>
        {order.readyBy ? (
          <p className="text-caption text-text-muted m-0 mt-2">
            Client was promised {formatDateTime(order.readyBy)}
          </p>
        ) : null}
      </section>
    </aside>
  );
}
