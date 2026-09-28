"use client";

/**
 * The refund inbox, shared by Operations (`/ops/refunds`) and Super Admin
 * (`/admin/refunds`).
 *
 * A queue, not a ledger: each request is one line under the question it is
 * waiting on, most urgent first. An unconfirmed transfer leads, because money
 * may already have moved. Shop settlement payouts still to record get their
 * own group: they are what the shop is owed after a refund, paid separately.
 *
 * `?order=<id>` (where an inbox notice lands, since it names only the order)
 * opens that order's open request, or its latest one.
 */

import { useSerializedLoad } from "@/lib/live/useSerializedLoad";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, Handshake } from "lucide-react";

import { opsErrorMessage } from "@/app/ops/_lib/errors";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonCards } from "@/components/ui/loading";
import { StatusChip } from "@/components/ui/StatusChip";
import { listOrders, listRefunds } from "@/lib/api/client";
import type { Order, RefundRequest } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/AuthProvider";
import { formatDate, formatPhp } from "@/lib/format";
import { useLiveReload } from "@/lib/live/useLiveReload";
import {
  REFUND_INBOX_GROUPS,
  pendingShopSettlements,
  presentRefundState,
  refundInboxGroup,
  refundIsActive,
  refundKindLabel,
  refundNextStep,
  type RefundInboxGroup,
  type RefundViewer,
} from "@/lib/refunds";
import { cn } from "@/lib/utils";

type Tree = "ops" | "admin";

type Loaded = { refunds: RefundRequest[]; titles: Record<string, string> };

/** The request a notice about this order should open. */
export function refundForOrder(
  refunds: readonly RefundRequest[],
  orderId: string,
): RefundRequest | null {
  const mine = refunds
    .filter((refund) => refund.orderId === orderId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return mine.find(refundIsActive) ?? mine[0] ?? null;
}

export function RefundInbox({ tree }: { tree: Tree }) {
  const router = useRouter();
  const params = useSearchParams();
  const orderParam = params.get("order");
  const { user } = useAuth();
  const viewer: RefundViewer = useMemo(
    () => ({
      role: tree === "admin" ? "super_admin" : "ops_admin",
      userId: user?.id ?? null,
    }),
    [tree, user?.id],
  );

  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showClosed, setShowClosed] = useState(false);

  const load = useSerializedLoad(
    useCallback(async () => {
      setLoading(true);
      setError(null);
      try {
        const [refunds, orders] = await Promise.all([
          listRefunds(),
          listOrders().catch(() => [] as Order[]),
        ]);
        setData({
          refunds,
          titles: Object.fromEntries(orders.map((order) => [order.id, order.title])),
        });
      } catch (err) {
        setData(null);
        setError(opsErrorMessage(err, "Could not load refunds. Retry in a moment."));
      } finally {
        setLoading(false);
      }
    }, []),
  );

  useLiveReload(["orders", "payouts", "claims"], load);

  useEffect(() => {
    void load();
  }, [load]);

  const target = data && orderParam ? refundForOrder(data.refunds, orderParam) : null;
  useEffect(() => {
    if (target) router.replace(`/${tree}/refunds/${target.id}`);
  }, [router, target, tree]);

  const grouped = useMemo(() => {
    const byGroup = new Map<RefundInboxGroup, RefundRequest[]>();
    for (const group of REFUND_INBOX_GROUPS) byGroup.set(group.id, []);
    for (const refund of data?.refunds ?? []) {
      byGroup.get(refundInboxGroup(refund, viewer.role))?.push(refund);
    }
    for (const [id, rows] of byGroup) {
      // Oldest first while waiting, so nobody's refund sits at the bottom;
      // newest first once closed.
      rows.sort((a, b) =>
        id === "closed"
          ? b.updatedAt.localeCompare(a.updatedAt)
          : a.createdAt.localeCompare(b.createdAt),
      );
    }
    return byGroup;
  }, [data, viewer.role]);

  const shopPayouts = useMemo(() => pendingShopSettlements(data?.refunds ?? []), [data]);

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

  const titleOfOrder = (orderId: string) => data?.titles[orderId] || "Untitled order";
  const shopSection = (
    <section aria-labelledby="refund-group-shop" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="refund-group-shop" className="text-h3 text-text-primary m-0">
          Shop settlement payouts to record
          <span className="text-text-muted tabular-nums"> {shopPayouts.length}</span>
        </h2>
        <p className="text-caption text-text-muted m-0">
          What a shop is still owed after a refund. Pay its current QR, then record it.
        </p>
      </div>
      <ul className="gg-card-flush m-0 flex list-none flex-col p-0">
        {shopPayouts.map(({ refund, payout }) => (
          <li key={payout.id} className="border-b border-outline-subtle last:border-b-0">
            <Link
              href={`/${tree}/refunds/${refund.id}`}
              className={rowLink}
              aria-label={`Record the shop settlement payout on ${titleOfOrder(refund.orderId)}`}
            >
              <Handshake
                size={18}
                strokeWidth={1.75}
                className="text-text-secondary shrink-0"
                aria-hidden
              />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p
                  className="text-body text-text-primary m-0 truncate"
                  style={{ fontFamily: "var(--font-medium)" }}
                >
                  {titleOfOrder(refund.orderId)}
                </p>
                <p className="text-body text-text-secondary m-0">{payout.label}</p>
              </div>
              <span
                className="text-body text-text-primary shrink-0 tabular-nums"
                style={{ fontFamily: "var(--font-bold)" }}
              >
                {formatPhp(payout.amountMinor)}
              </span>
              <ChevronRight
                size={16}
                strokeWidth={2}
                aria-hidden
                className="shrink-0 text-text-muted"
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );

  const pending = loading && !data;
  const openCount = (data?.refunds ?? []).filter(refundIsActive).length;
  const titleOf = (orderId: string) => data?.titles[orderId] || "Untitled order";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-body text-text-secondary m-0 max-w-prose">
          A client asks for money back; you review it, agree what the shop keeps, and send
          what GRIDGO still holds to the client&rsquo;s own receiving QR. Approving sends
          nothing. A refund is paid only once someone records the wallet transfer. Money
          already paid to a shop or earned by a rider is never taken back.
        </p>
        <Button variant="secondary" disabled={loading} onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      {orderParam && data && !target ? (
        <p className="text-body text-text-secondary m-0" role="status">
          That order has no refund request.
        </p>
      ) : null}

      {pending ? (
        <SkeletonCards count={3} lines={2} label="Loading refunds" className="gap-3" />
      ) : !data?.refunds.length ? (
        <EmptyState
          title="No refund requests"
          body="Clients ask from their order in the GRIDGO app. You can also file one for a client from the order workspace."
          action={
            <Button variant="secondary" onClick={() => void load()}>
              Refresh
            </Button>
          }
        />
      ) : (
        <>
          {openCount === 0 ? (
            <p className="text-body text-text-secondary m-0 rounded-card border border-dashed border-outline px-4 py-3">
              Nothing open. Every request is paid, rejected or withdrawn.
            </p>
          ) : null}

          {REFUND_INBOX_GROUPS.map((definition) => {
            const members = grouped.get(definition.id) ?? [];
            const closed = definition.id === "closed";
            // What a shop is owed after a settlement sits above the record.
            const shop = closed && shopPayouts.length ? shopSection : null;
            if (!members.length)
              return shop ? <Fragment key="shop">{shop}</Fragment> : null;
            const shown = closed && !showClosed ? [] : members;
            return (
              <Fragment key={definition.id}>
                {shop}
                <section
                  aria-labelledby={`refund-group-${definition.id}`}
                  className="flex flex-col gap-2"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <h2
                      id={`refund-group-${definition.id}`}
                      className="text-h3 text-text-primary m-0"
                    >
                      {definition.label}
                      <span className="text-text-muted tabular-nums">
                        {" "}
                        {members.length}
                      </span>
                    </h2>
                    <p className="text-caption text-text-muted m-0">{definition.hint}</p>
                  </div>
                  {closed ? (
                    <div>
                      <Button
                        variant="ghost"
                        onClick={() => setShowClosed((value) => !value)}
                      >
                        {showClosed ? "Hide closed requests" : "Show closed requests"}
                      </Button>
                    </div>
                  ) : null}
                  {shown.length ? (
                    <ul className="gg-card-flush m-0 flex list-none flex-col p-0">
                      {shown.map((refund) => (
                        <RefundRow
                          key={refund.id}
                          refund={refund}
                          title={titleOf(refund.orderId)}
                          tree={tree}
                          viewer={viewer}
                        />
                      ))}
                    </ul>
                  ) : null}
                </section>
              </Fragment>
            );
          })}
        </>
      )}
    </div>
  );
}

const rowLink = cn(
  "group flex min-h-11 items-center gap-3 px-4 py-3 text-text-primary",
  "hover:bg-overlay-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-action-yellow",
);

function RefundRow({
  refund,
  title,
  tree,
  viewer,
}: {
  refund: RefundRequest;
  title: string;
  tree: Tree;
  viewer: RefundViewer;
}) {
  const status = presentRefundState(refund);
  const amount = refund.payment?.amountMinor ?? refund.settlement?.totalMinor ?? null;
  return (
    <li className="border-b border-outline-subtle last:border-b-0">
      <Link
        href={`/${tree}/refunds/${refund.id}`}
        className={rowLink}
        aria-label={`Open the refund on ${title}`}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p
              className="text-body text-text-primary m-0 truncate"
              style={{ fontFamily: "var(--font-medium)" }}
            >
              {title}
            </p>
            <StatusChip tone={status.tone} label={status.label} icon={status.icon} />
            {refund.late ? (
              <StatusChip tone="warning" label="Filed late" icon="triangle-alert" />
            ) : null}
          </div>
          <p className="text-body text-text-secondary m-0">
            {refundNextStep(refund, viewer)}
          </p>
          <p className="text-caption text-text-muted m-0">
            {refundKindLabel(refund.kind)} filed {formatDate(refund.createdAt)}
            {refund.beforeProduction ? ", before production" : ""}
          </p>
        </div>
        {amount !== null ? (
          <span
            className="text-body text-text-primary shrink-0 tabular-nums"
            style={{ fontFamily: "var(--font-bold)" }}
          >
            {formatPhp(amount)}
          </span>
        ) : null}
        <ChevronRight
          size={16}
          strokeWidth={2}
          aria-hidden
          className="shrink-0 text-text-muted transition-transform duration-150 motion-reduce:transition-none group-hover:translate-x-0.5"
        />
      </Link>
    </li>
  );
}
