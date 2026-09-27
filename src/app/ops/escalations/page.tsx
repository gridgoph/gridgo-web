"use client";

import { useSerializedLoad } from "@/lib/live/useSerializedLoad";

import { useCallback, useEffect, useMemo, useState } from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { opsErrorMessage } from "@/app/ops/_lib/errors";
import { AttemptRecord } from "@/components/orders/CounterCheck";
import { ResolveEscalationDialog } from "@/components/orders/ResolveEscalationDialog";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonCards } from "@/components/ui/loading";
import { StatusChip } from "@/components/ui/StatusChip";
import {
  getUser,
  listEscalations,
  listOrders,
  resolveEscalation,
} from "@/lib/api/client";
import type { Escalation, Order } from "@/lib/api/types";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { presentOrderState } from "@/lib/order-state";

type Loaded = {
  escalations: Escalation[];
  orders: Record<string, Order>;
  /** Rider and operator names by user id, best effort. */
  names: Record<string, string>;
};

export default function OpsEscalationsPage() {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionOk, setActionOk] = useState<string | null>(null);
  const [resolving, setResolving] = useState<Escalation | null>(null);
  // Super Admin mounts this page too; its orders open in its own tree.
  const ordersHref = usePathname()?.startsWith("/admin")
    ? "/admin/orders"
    : "/ops/orders";

  const load = useSerializedLoad(
    useCallback(async () => {
      setLoading(true);
      setError(null);
      try {
        const [escalations, orderList] = await Promise.all([
          listEscalations(),
          listOrders(),
        ]);
        const orders: Record<string, Order> = {};
        for (const order of orderList) orders[order.id] = order;

        // Names are a best-effort read: a person who cannot be looked up
        // must not take the whole queue down, so each lookup fails on its own.
        const ids = [
          ...new Set(
            escalations
              .flatMap((e) => [e.riderId, e.resolvedBy])
              .filter(Boolean) as string[],
          ),
        ];
        const found = await Promise.all(
          ids.map((id) =>
            getUser(id).then(
              (user) => [id, user.name] as const,
              () => [id, ""] as const,
            ),
          ),
        );

        setData({ escalations, orders, names: Object.fromEntries(found) });
      } catch (err) {
        setData(null);
        setError(
          opsErrorMessage(
            err,
            "Could not load escalations. Confirm the demo API is running, then retry.",
          ),
        );
      } finally {
        setLoading(false);
      }
    }, []),
  );

  useLiveReload(["escalations", "orders"], load);

  useEffect(() => {
    void load();
  }, [load]);

  const { open, resolved } = useMemo(() => {
    const all = [...(data?.escalations ?? [])].sort((a, b) =>
      (a.createdAt || "").localeCompare(b.createdAt || ""),
    );
    return {
      open: all.filter((e) => e.status === "open"),
      resolved: all.filter((e) => e.status !== "open").reverse(),
    };
  }, [data]);

  async function apply(instruction: string) {
    if (!resolving) return;
    setBusy(true);
    setActionError(null);
    setActionOk(null);
    try {
      await resolveEscalation(resolving.id, { resolution: instruction });
      setActionOk(
        "Instruction sent. The rider counts again and repeats all six checks before the package moves.",
      );
      setResolving(null);
      await load();
    } catch (err) {
      setActionError(opsErrorMessage(err, "Could not send that instruction. Try again."));
    } finally {
      setBusy(false);
    }
  }

  if (error) {
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

  const pending = loading && !data;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-body text-text-secondary m-0 max-w-prose">
          A rider whose count at the counter comes up short, or who fails any of the six
          pickup checks, must not take the order. They photograph the problem and wait
          here for instruction. A defect that leaves the supplier unlogged becomes
          GRIDGO&rsquo;s liability rather than the supplier&rsquo;s, which is what the
          Zero-Risk Reprint Guarantee rests on.
        </p>
        <Button variant="secondary" disabled={loading} onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      {actionOk ? (
        <p className="text-body text-success m-0" role="status">
          {actionOk}
        </p>
      ) : null}
      {actionError && !resolving ? (
        <p className="text-body text-error m-0" role="alert">
          {actionError}
        </p>
      ) : null}

      <section aria-labelledby="open-heading" className="flex flex-col gap-3">
        <h2 id="open-heading" className="text-h3 text-text-primary m-0">
          Riders waiting{pending ? "" : ` (${open.length})`}
        </h2>
        {pending ? (
          <SkeletonCards count={2} lines={3} label="Loading escalations" />
        ) : !open.length ? (
          <EmptyState
            title="No rider is blocked"
            body="Every pickup has either passed its count and six checks or already had an instruction. A failed check or a wrong count appears here straight away, and the rider cannot move without an answer."
            action={
              <Button variant="secondary" onClick={() => void load()}>
                Check again
              </Button>
            }
          />
        ) : (
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {open.map((escalation) => (
              <EscalationCard
                key={escalation.id}
                escalation={escalation}
                order={data?.orders[escalation.orderId]}
                names={data?.names ?? {}}
                ordersHref={ordersHref}
                onResolve={() => {
                  setActionError(null);
                  setResolving(escalation);
                }}
              />
            ))}
          </ul>
        )}
      </section>

      {resolved.length ? (
        <section aria-labelledby="resolved-heading" className="flex flex-col gap-3">
          <h2 id="resolved-heading" className="text-h3 text-text-primary m-0">
            Already instructed ({resolved.length})
          </h2>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {resolved.map((escalation) => (
              <EscalationCard
                key={escalation.id}
                escalation={escalation}
                order={data?.orders[escalation.orderId]}
                names={data?.names ?? {}}
                ordersHref={ordersHref}
              />
            ))}
          </ul>
        </section>
      ) : null}

      <ResolveEscalationDialog
        escalationId={resolving?.id ?? null}
        busy={busy}
        error={resolving ? actionError : null}
        onCancel={() => {
          setResolving(null);
          setActionError(null);
        }}
        onSend={(instruction) => void apply(instruction)}
      />
    </div>
  );
}

function EscalationCard({
  escalation,
  order,
  names,
  ordersHref,
  onResolve,
}: {
  escalation: Escalation;
  order: Order | undefined;
  names: Record<string, string>;
  ordersHref: string;
  onResolve?: () => void;
}) {
  const orderStatus = order ? presentOrderState(order.state, order) : null;

  return (
    <li className="gg-card flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`${ordersHref}/${escalation.orderId}`}
            className="text-body text-text-primary underline-offset-2 hover:underline"
            style={{ fontFamily: "var(--font-medium)" }}
          >
            {order?.title ?? "Order no longer visible"}
          </Link>
          <p className="text-caption text-text-muted m-0 mt-0.5">
            Order {escalation.orderId}
          </p>
        </div>
        {orderStatus ? (
          <StatusChip
            tone={orderStatus.tone}
            label={orderStatus.label}
            icon={orderStatus.icon}
          />
        ) : null}
      </div>

      <AttemptRecord escalation={escalation} order={order} names={names} />

      {onResolve ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={onResolve}>
            Give an instruction
          </Button>
        </div>
      ) : null}
    </li>
  );
}
