"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { opsErrorMessage } from "@/app/ops/_lib/errors";
import { MilestoneList } from "@/components/orders/MilestoneList";
import { MoneyBreakdown } from "@/components/orders/MoneyBreakdown";
import { OrderMeta } from "@/components/orders/OrderMeta";
import { PaymentSummary } from "@/components/orders/PaymentSummary";
import { Timeline } from "@/components/orders/Timeline";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { StatusChip } from "@/components/ui/StatusChip";
import { getOrder, listUsers, transitionOrder } from "@/lib/api/client";
import type { Order, User } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import {
  actionsForOps,
  opsHandoffForState,
  type OpsAction,
} from "@/lib/ops-actions";
import {
  presentChecklistStatus,
  presentOrderState,
  presentPickupCheck,
  presentTimelineActor,
} from "@/lib/order-state";

/** Demo-only known IDs — the API has no supplier/rider directory endpoint. */
const DEMO_SUPPLIER_ID = "user_supplier";
const DEMO_RIDER_ID = "user_rider";

export default function OpsQaWorkspacePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const orderId = params.id;

  const [order, setOrder] = useState<Order | null>(null);
  /** id → display name, so no raw account identifier reaches the screen. */
  const [people, setPeople] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [next, directory] = await Promise.all([
        getOrder(orderId),
        // Best effort — the order still reads without the directory.
        listUsers().catch(() => [] as User[]),
      ]);
      setOrder(next);
      setPeople(
        Object.fromEntries(
          directory.map((u) => [u.id, u.supplierName || u.name]),
        ),
      );
    } catch (err) {
      setOrder(null);
      setError(opsErrorMessage(err, "Could not load this order."));
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
      const extra: Record<string, unknown> = {
        note: action.note || action.label,
      };
      if (action.requires === "supplierId") {
        extra.supplierId = DEMO_SUPPLIER_ID;
      }
      if (action.requires === "riderId") {
        extra.riderId = order.riderId || DEMO_RIDER_ID;
      }
      setOrder(await transitionOrder(order.id, action.targetState, extra));
    } catch (err) {
      setActionError(opsErrorMessage(err, "Could not apply that step."));
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
  const handoff = opsHandoffForState(order.state);
  const checklist = order.pickupChecklist;

  return (
    <div className="flex w-full flex-col gap-3">
      <header className="gg-card flex flex-col gap-3 p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-h2 text-text-primary m-0">{order.title}</h2>
            {order.assignmentNotifiedAt ? (
              <p className="text-caption text-text-muted m-0 mt-1">
                Client told the final price{" "}
                {formatDateTime(order.assignmentNotifiedAt)}
              </p>
            ) : null}
          </div>
          <StatusChip tone={status.tone} label={status.label} icon={status.icon} />
        </div>

        <div className="flex flex-col gap-2 border-t border-outline-subtle pt-3">
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
                  Assigns the demo supplier. Use Matching to choose from
                  eligible, approved suppliers with a reason.
                </p>
              ) : null}
              {primary?.requires === "riderId" ? (
                <p className="text-caption text-text-muted m-0">
                  Assigns the demo rider when none is set. Riders normally
                  accept an offer themselves from the rider app.
                </p>
              ) : null}
            </>
          ) : handoff ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-body text-text-secondary m-0">
                Nothing to change here — this order&rsquo;s next step lives on
                another surface.
              </p>
              <Button
                variant="secondary"
                nativeButton={false}
                render={<Link href={handoff.href} />}
              >
                {handoff.label}
              </Button>
            </div>
          ) : (
            <p className="text-body text-text-secondary m-0">
              Nothing for Operations to change from here. The timeline below
              shows who moved this order last, and when.
            </p>
          )}
          {actionError ? (
            <p className="text-body text-error m-0" role="alert">
              {actionError}
            </p>
          ) : null}
        </div>
      </header>

      <div className="grid w-full gap-3 lg:grid-cols-2 lg:items-start">
      <section className="gg-card p-3" aria-labelledby="spec-heading">
        <h3 id="spec-heading" className="text-h3 text-text-primary m-0 mb-3">
          Spec
        </h3>
        <OrderMeta order={order} showMoney={false} />
        <dl className="mt-4 grid grid-cols-1 gap-3 border-t border-outline-subtle pt-4 sm:grid-cols-2">
          <div>
            <dt className="text-caption text-text-muted">Supplier</dt>
            <dd className="text-body text-text-primary m-0">
              {order.supplierId
                ? (people[order.supplierId] ??
                  presentTimelineActor(order.supplierId))
                : "Not assigned"}
            </dd>
          </div>
          <div>
            <dt className="text-caption text-text-muted">Rider</dt>
            <dd className="text-body text-text-primary m-0">
              {order.riderId
                ? (people[order.riderId] ?? presentTimelineActor(order.riderId))
                : "Not assigned"}
            </dd>
          </div>
        </dl>
      </section>

      <section className="gg-card p-3" aria-labelledby="money-heading">
        <h3 id="money-heading" className="text-h3 text-text-primary m-0">
          Money
        </h3>
        <p className="text-body text-text-secondary m-0 mt-1 mb-3 max-w-prose">
          Operations and Super Admin only. The client is never shown the
          supplier price or the commission.
        </p>
        <MoneyBreakdown order={order} />
      </section>

      <section className="gg-card p-3" aria-labelledby="payments-heading">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 id="payments-heading" className="text-h3 text-text-primary m-0">
            Payments
          </h3>
          <Button
            variant="secondary"
            nativeButton={false}
            render={<Link href={`/ops/payments/${order.id}`} />}
          >
            Review payments
          </Button>
        </div>
        <PaymentSummary order={order} />
      </section>

      <section className="gg-card p-3" aria-labelledby="milestones-heading">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 id="milestones-heading" className="text-h3 text-text-primary m-0">
            Supplier payout
          </h3>
          <Button
            variant="secondary"
            nativeButton={false}
            render={<Link href="/ops/payouts" />}
          >
            Open payouts
          </Button>
        </div>
        <MilestoneList order={order} />
      </section>

      {checklist && checklist.status !== "not_started" ? (
        <section className="gg-card p-3" aria-labelledby="pickup-heading">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 id="pickup-heading" className="text-h3 text-text-primary m-0">
              Rider pickup checks
            </h3>
            <StatusChip {...presentChecklistStatus(checklist.status)} />
          </div>
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {checklist.checks.map((check) => (
              <li key={check.code}>
                <StatusChip
                  tone={check.passed ? "success" : "error"}
                  label={presentPickupCheck(check.code)}
                  icon={check.passed ? "circle-check" : "circle-x"}
                />
              </li>
            ))}
          </ul>
          {checklist.failureNote ? (
            <p className="text-body text-text-primary m-0 mt-3">
              {checklist.failureNote}
            </p>
          ) : null}
          {checklist.escalationId ? (
            <div className="mt-3">
              <Button
                variant="secondary"
                nativeButton={false}
                render={<Link href="/ops/escalations" />}
              >
                Open the escalation
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="gg-card p-3" aria-labelledby="timeline-heading">
        <h3 id="timeline-heading" className="text-h3 text-text-primary m-0 mb-3">
          Audit timeline
        </h3>
        <Timeline entries={order.timeline} />
      </section>
      </div>
    </div>
  );
}
