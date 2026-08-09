"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { OrderMeta } from "@/components/orders/OrderMeta";
import { Timeline } from "@/components/orders/Timeline";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { StatusChip } from "@/components/ui/StatusChip";
import { ApiError, getOrder, transitionOrder } from "@/lib/api/client";
import type { Order } from "@/lib/api/types";
import { actionsForOps, type OpsAction } from "@/lib/ops-actions";
import { presentOrderState } from "@/lib/order-state";

/** Demo-only known IDs — the API has no supplier/rider directory endpoint. */
const DEMO_SUPPLIER_ID = "user_supplier";
const DEMO_RIDER_ID = "user_rider";

function presentPaymentMethod(method: string | null): string {
  switch (method) {
    case "pilot_credit":
      return "Pilot Credits";
    case "cod":
      return "Cash on delivery";
    case null:
    case undefined:
    case "":
      return "Not set";
    default:
      return method;
  }
}

function presentPaymentStatus(status: string): string {
  switch (status) {
    case "unpaid":
      return "Unpaid";
    case "authorized":
      return "Authorized";
    case "collected":
      return "Collected";
    case "reconciled":
      return "Reconciled";
    default:
      return status;
  }
}

export default function OpsQaWorkspacePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const orderId = params.id;

  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getOrder(orderId);
      setOrder(data);
    } catch (err) {
      setOrder(null);
      if (err instanceof ApiError) {
        setError(
          err.status === 404 ? "Order not found." : `Could not load order (${err.code}).`,
        );
      } else {
        setError("Network error loading this order.");
      }
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runAction(action: OpsAction) {
    if (!order) return;
    setActing(action.targetState);
    setActionError(null);
    try {
      const extra: Record<string, unknown> = { note: action.note || action.label };
      if (action.requires === "supplierId") {
        extra.supplierId = DEMO_SUPPLIER_ID;
      }
      if (action.requires === "riderId") {
        extra.riderId = order.riderId || DEMO_RIDER_ID;
      }
      const updated = await transitionOrder(order.id, action.targetState, extra);
      setOrder(updated);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "transition_not_allowed") {
          setActionError(
            "That transition is not allowed from the current state. Refresh and try the available action.",
          );
        } else {
          setActionError(`Could not apply action (${err.code}).`);
        }
      } else {
        setActionError("Network error while updating. Try again.");
      }
      await load();
    } finally {
      setActing(null);
    }
  }

  if (loading && !order) return <LoadingBlock label="Loading QA workspace…" />;
  if (error || !order) {
    return (
      <ErrorState
        body={error ?? "Order not found."}
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void load()}>
              Retry
            </Button>
            <Button variant="secondary" onClick={() => router.push("/ops/qa")}>
              Back to queue
            </Button>
          </div>
        }
      />
    );
  }

  const status = presentOrderState(order.state);
  const actions = actionsForOps(order.state);
  const primary = actions.find((a) => a.primary);
  const secondary = actions.filter((a) => !a.primary);

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <header className="gg-card flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-h2 text-text-primary m-0">{order.title}</h2>
            <p className="text-caption text-text-muted m-0 mt-1">{order.id}</p>
          </div>
          <StatusChip tone={status.tone} label={status.label} icon={status.icon} />
        </div>

        <div className="border-t border-outline-subtle pt-3 flex flex-col gap-2">
          {primary || secondary.length ? (
            <>
              <div className="flex flex-wrap gap-2">
                {primary ? (
                  <Button
                    variant="primary"
                    disabled={acting !== null}
                    onClick={() => void runAction(primary)}
                  >
                    {acting === primary.targetState ? "Working…" : primary.label}
                  </Button>
                ) : null}
                {secondary.map((action) => (
                  <Button
                    key={action.targetState}
                    variant="secondary"
                    disabled={acting !== null}
                    onClick={() => void runAction(action)}
                  >
                    {acting === action.targetState ? "Working…" : action.label}
                  </Button>
                ))}
              </div>
              {primary?.requires === "supplierId" ? (
                <p className="text-caption text-text-muted m-0">
                  Assigns the demo supplier (PrintRight Davao). A supplier directory
                  endpoint is not available on the API yet.
                </p>
              ) : null}
              {primary?.requires === "riderId" ? (
                <p className="text-caption text-text-muted m-0">
                  Assigns the demo rider when none is set. A rider directory endpoint is
                  not available on the API yet.
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-body text-text-secondary m-0">
              No Operations transition is available in this state. Use the timeline for
              context, or return to the queue for actionable work.
            </p>
          )}
          {actionError ? (
            <p className="text-body text-error m-0" role="alert">
              {actionError}
            </p>
          ) : null}
        </div>
      </header>

      <section className="gg-card" aria-labelledby="spec-heading">
        <h3 id="spec-heading" className="text-h3 text-text-primary m-0 mb-3">
          Spec
        </h3>
        <OrderMeta order={order} />
        <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 border-t border-outline-subtle pt-4">
          <div>
            <dt className="text-caption text-text-muted">Supplier</dt>
            <dd className="text-body text-text-primary m-0">
              {order.supplierId ?? "Unassigned"}
            </dd>
          </div>
          <div>
            <dt className="text-caption text-text-muted">Rider</dt>
            <dd className="text-body text-text-primary m-0">
              {order.riderId ?? "Unassigned"}
            </dd>
          </div>
          <div>
            <dt className="text-caption text-text-muted">Payment</dt>
            <dd className="text-body text-text-primary m-0">
              {presentPaymentMethod(order.paymentMethod)} ·{" "}
              {presentPaymentStatus(order.paymentStatus)}
            </dd>
          </div>
        </dl>
      </section>

      <section className="gg-card" aria-labelledby="timeline-heading">
        <h3 id="timeline-heading" className="text-h3 text-text-primary m-0 mb-3">
          Audit timeline
        </h3>
        <Timeline entries={order.timeline} />
      </section>
    </div>
  );
}
