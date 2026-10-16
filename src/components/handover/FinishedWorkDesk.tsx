"use client";

/**
 * Finished work: the shop's photos of finished, unpacked products, waiting
 * for GRIDGO before a rider is called.
 *
 * Contract: `gridgo-api/docs/SHOP_HANDOVER_API.md` (gridgo-api#216). One desk
 * for Operations (`/ops/finished-work`) and Super Admin
 * (`/admin/finished-work`); links stay in the caller's tree. A rider-packs
 * order cannot leave production until someone here approves it, so Waiting
 * leads, oldest submission first, with the wait on the reader's clock. Sent
 * back and Approved are the record. `?order=` opens one order (inbox notices
 * land there).
 *
 * The list reads `GET /orders` (the projection carries `shopHandover`); the
 * open order is read on its own so its photo links are fresh.
 */

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, CircleCheck } from "lucide-react";

import { opsErrorMessage } from "@/app/ops/_lib/errors";
import {
  FinishedReviewPanel,
  JobTicket,
} from "@/components/handover/FinishedReviewPanel";
import { WaitMark } from "@/components/orders/FileCheckQueue";
import { ProgressGallery } from "@/components/orders/ProductionProgress";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/ui/StatusChip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  getOrder,
  listOrders,
  listUsers,
  reviewFinishedProducts,
} from "@/lib/api/client";
import type { Order } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { useSerializedLoad } from "@/lib/live/useSerializedLoad";
import {
  approvedQueue,
  attemptLabel,
  currentSubmission,
  finishedReviewQueue,
  finishedReviewStatus,
  photoCount,
  sentBackAttempts,
  sentBackQueue,
  submissionNumber,
  submissionPhotos,
  submissionWaitSeconds,
} from "@/lib/shop-handover";
import { cn } from "@/lib/utils";

type Tab = "waiting" | "sent_back" | "approved";

const TABS: readonly { value: Tab; label: string }[] = [
  { value: "waiting", label: "Waiting" },
  { value: "sent_back", label: "Sent back" },
  { value: "approved", label: "Approved" },
];

const TICK_MS = 30_000;

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function tabOf(order: Order): Tab | null {
  const status = finishedReviewStatus(order);
  if (status === "pending") return "waiting";
  if (status === "sent_back") return "sent_back";
  if (status === "approved") return "approved";
  return null;
}

export function FinishedWorkDesk({ tree }: { tree: "ops" | "admin" }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const requestedTab = params.get("tab") as Tab | null;
  const requestedOrder = params.get("order");

  const [orders, setOrders] = useState<Order[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [shops, setShops] = useState<Record<string, string>>({});
  const [detail, setDetail] = useState<Order | null>(null);
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const now = useNow(TICK_MS);

  const shopsRead = useRef(false);
  const load = useSerializedLoad(
    useCallback(async () => {
      // Shop names are a nicety, read until they arrive once: a failed read
      // leaves "The shop" and is tried again on the next refresh.
      if (!shopsRead.current) {
        listUsers("supplier").then(
          (users) => {
            shopsRead.current = true;
            setShops(
              Object.fromEntries(
                users.map((user) => [user.id, user.supplierName || user.name]),
              ),
            );
          },
          () => {},
        );
      }
      try {
        setOrders(await listOrders());
        setLoadError(null);
      } catch (err) {
        setLoadError(opsErrorMessage(err, "The orders could not be loaded. Try again."));
      }
    }, []),
  );
  useLiveReload(["orders", "jobs"], load);
  useEffect(() => {
    void load();
  }, [load]);

  const queues = useMemo(
    () => ({
      waiting: finishedReviewQueue(orders ?? []),
      sent_back: sentBackQueue(orders ?? []),
      approved: approvedQueue(orders ?? []),
    }),
    [orders],
  );

  // An order named in the address opens on the tab it belongs to.
  const linked = requestedOrder
    ? orders?.find((order) => order.id === requestedOrder)
    : null;
  const tab: Tab = (linked && tabOf(linked)) || requestedTab || "waiting";
  const rows = queues[tab];
  const selectedId =
    requestedOrder && rows.some((order) => order.id === requestedOrder)
      ? requestedOrder
      : null;
  const selected = rows.find((order) => order.id === selectedId) ?? null;

  const navigate = useCallback(
    (next: { tab?: Tab; order?: string | null }) => {
      const query = new URLSearchParams();
      query.set("tab", next.tab ?? tab);
      const order = next.order === undefined ? selectedId : next.order;
      if (order) query.set("order", order);
      router.replace(`${pathname}?${query.toString()}`, { scroll: false });
    },
    [pathname, router, selectedId, tab],
  );

  // Fresh signed photo links for the open order.
  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    getOrder(selectedId).then(
      (order) => {
        if (!cancelled) setDetail(order);
      },
      () => {
        if (!cancelled) setDetail(null);
      },
    );
    return () => {
      cancelled = true;
    };
    // Re-read when the list moves the open order on (a live update).
  }, [selectedId, selected?.updatedAt]);

  const shopName = (order: Order) =>
    (order.supplierId && shops[order.supplierId]) || null;
  const open = detail && detail.id === selectedId ? detail : selected;

  async function decide(order: Order, decision: "approved" | "rejected", note?: string) {
    setActing(true);
    setActionError(null);
    try {
      await reviewFinishedProducts(
        order.id,
        decision === "approved" ? { decision } : { decision, note: note ?? "" },
      );
      const shop = shopName(order) ?? "The shop";
      setNotice(
        decision === "approved"
          ? `Approved “${order.title || "the order"}”. ${shop} can now call a rider.`
          : `Sent back “${order.title || "the order"}”. ${shop} reads your reason and sends new photos.`,
      );
      // Move on to the next waiting submission, oldest first.
      const next = queues.waiting.find((candidate) => candidate.id !== order.id);
      navigate({ tab: "waiting", order: next?.id ?? null });
      await load();
    } catch (err) {
      setActionError(
        opsErrorMessage(err, "That decision did not go through. Refresh and try again."),
      );
    } finally {
      setActing(false);
    }
  }

  if (loadError && !orders) {
    return (
      <ErrorState
        body={loadError}
        action={
          <Button variant="secondary" onClick={() => void load()}>
            Retry
          </Button>
        }
      />
    );
  }

  const detailOpen = Boolean(selectedId);
  const orderHref = (id: string) => `/${tree}/orders/${encodeURIComponent(id)}`;

  return (
    <div className="flex min-h-[32rem] flex-col gap-3 lg:h-[calc(100dvh-5rem)]">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <p className="text-body text-text-secondary m-0 max-w-prose">
          Shops send photos of finished, unpacked work. No rider is called until you
          approve it.
        </p>
        <Button size="sm" onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      <div aria-live="polite" className="shrink-0 empty:hidden">
        {notice ? (
          <p
            className="text-body text-text-primary m-0 flex items-start gap-2 py-1"
            role="status"
          >
            <CircleCheck aria-hidden className="text-success mt-0.5 size-4 shrink-0" />
            {notice}
          </p>
        ) : null}
      </div>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[22rem_minmax(0,1fr)] lg:gap-4">
        <aside
          aria-label="Finished work queue"
          className={cn(
            "gg-card-flush min-h-0 min-w-0 flex-col",
            detailOpen ? "hidden lg:flex" : "flex",
          )}
        >
          <div className="border-outline flex shrink-0 flex-col gap-2 border-b p-3">
            <ToggleGroup
              value={[tab]}
              onValueChange={(values) => {
                const next = values[0] as Tab | undefined;
                if (next) navigate({ tab: next, order: null });
              }}
              variant="outline"
              spacing={0}
              aria-label="Filter by review state"
              className="flex flex-wrap gap-1"
            >
              {TABS.map((entry) => (
                <ToggleGroupItem key={entry.value} value={entry.value}>
                  {entry.label}
                  {orders ? ` ${queues[entry.value].length}` : ""}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
            {!orders ? (
              <div
                className="flex flex-col gap-2 p-1"
                role="status"
                aria-label="Loading the queue"
              >
                {[0, 1, 2].map((key) => (
                  <Skeleton key={key} className="h-16 w-full" />
                ))}
              </div>
            ) : rows.length ? (
              <ul aria-label="Orders" className="m-0 flex list-none flex-col gap-0.5 p-0">
                {rows.map((order) => (
                  <QueueRow
                    key={order.id}
                    order={order}
                    tab={tab}
                    shop={shopName(order)}
                    now={now}
                    active={order.id === selectedId}
                    onOpen={() => {
                      setActionError(null);
                      navigate({ order: order.id });
                    }}
                  />
                ))}
              </ul>
            ) : (
              <EmptyState
                className="border-0"
                title={
                  tab === "waiting"
                    ? "Nothing waiting for review"
                    : tab === "sent_back"
                      ? "Nothing sent back"
                      : "Nothing approved yet"
                }
                body={
                  tab === "waiting"
                    ? "When a shop finishes a job, its photos of the unpacked work appear here."
                    : tab === "sent_back"
                      ? "Jobs you send back stay here until the shop sends new photos."
                      : "Approved jobs stay here as a record."
                }
              />
            )}
          </div>
          {rows.length ? (
            <p className="text-caption text-text-muted border-outline m-0 shrink-0 border-t px-4 py-2">
              {tab === "waiting" ? "Oldest first" : "Latest first"}
            </p>
          ) : null}
        </aside>

        <section
          aria-label="Order under review"
          className={cn(
            "gg-card-flush min-h-0 min-w-0 flex-col overflow-y-auto",
            detailOpen ? "flex" : "hidden lg:flex",
          )}
        >
          {open ? (
            <div className="flex flex-col gap-4 p-4">
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  className="text-caption text-text-muted inline-flex min-h-11 items-center gap-1 self-start lg:hidden"
                  onClick={() => navigate({ order: null })}
                >
                  <ChevronLeft size={14} strokeWidth={2} aria-hidden />
                  All finished work
                </button>
                <h2 className="text-h3 text-text-primary m-0">
                  {open.title || "Untitled order"}
                </h2>
                <p className="text-body text-text-secondary m-0">
                  {shopName(open) ? `${shopName(open)}. ` : ""}
                  <Link
                    href={orderHref(open.id)}
                    className="text-text-secondary underline underline-offset-2"
                  >
                    Open the order
                  </Link>
                </p>
              </div>
              {tab === "waiting" ? (
                <FinishedReviewPanel
                  key={`${open.id}:${currentSubmission(open)?.at ?? ""}`}
                  order={open}
                  shopName={shopName(open)}
                  busy={acting}
                  error={actionError}
                  now={now}
                  onApprove={() => void decide(open, "approved")}
                  onSendBack={(reason) => void decide(open, "rejected", reason)}
                />
              ) : tab === "sent_back" ? (
                <SentBackRecord order={open} />
              ) : (
                <ApprovedRecord order={open} />
              )}
            </div>
          ) : !orders || (selectedId && !open) ? (
            <div className="flex flex-col gap-3 p-4">
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="aspect-[3/1] w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : (
            <div className="p-4">
              <EmptyState
                className="border-0 p-0"
                title={rows.length ? "Pick one to review" : "Nothing to open"}
                body="The shop's photos open here beside the job ticket, with Approve and Send back."
              />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function QueueRow({
  order,
  tab,
  shop,
  now,
  active,
  onOpen,
}: {
  order: Order;
  tab: Tab;
  shop: string | null;
  now: number;
  active: boolean;
  onOpen: () => void;
}) {
  const submission = currentSubmission(order);
  const lastBack = sentBackAttempts(order).at(-1) ?? null;
  const photos = submissionPhotos(submission ?? lastBack?.finished, order);
  const thumb = photos[0]?.downloadUrl ?? null;
  return (
    <li
      className={cn(
        "relative flex rounded-[var(--radius-field)]",
        active ? "bg-muted" : "hover:bg-overlay-hover",
      )}
    >
      {active ? (
        <span
          aria-hidden
          className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-[var(--color-text-primary)]"
        />
      ) : null}
      <button
        type="button"
        aria-current={active ? "true" : undefined}
        onClick={onOpen}
        className="flex min-h-11 w-full min-w-0 items-start gap-3 rounded-[var(--radius-field)] px-3 py-2 text-left"
      >
        {thumb ? (
          // Signed, short-lived file URLs: next/image would proxy and cache them.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb}
            alt=""
            className="border-outline bg-muted size-12 shrink-0 rounded-md border object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="border-outline bg-muted text-text-muted flex size-12 shrink-0 items-center justify-center rounded-md border text-[0.625rem]"
          >
            Photo
          </span>
        )}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span
            className="text-body text-text-primary truncate"
            style={{ fontFamily: "var(--font-medium)" }}
          >
            {order.title || "Untitled order"}
          </span>
          <span className="text-caption text-text-secondary truncate">
            {shop ?? "The shop"}
            {photos.length ? `, ${photoCount(photos.length)}` : ""}
          </span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-0.5">
            {tab === "waiting" ? (
              <>
                <WaitMark seconds={submissionWaitSeconds(order, now)} />
                {submissionNumber(order) > 1 ? (
                  <span className="text-caption text-text-muted">
                    {attemptLabel(submissionNumber(order))}
                  </span>
                ) : null}
              </>
            ) : tab === "sent_back" && lastBack ? (
              <span className="text-caption text-text-muted">
                Sent back {formatDateTime(lastBack.review.at)}
              </span>
            ) : order.shopHandover?.review ? (
              <span className="text-caption text-text-muted">
                Approved {formatDateTime(order.shopHandover.review.at)}
              </span>
            ) : null}
          </span>
        </span>
      </button>
    </li>
  );
}

/** A send-back, in the words the shop read, with the photos it answered. */
function SentBackRecord({ order }: { order: Order }) {
  const attempts = sentBackAttempts(order);
  const last = attempts.at(-1);
  if (!last) return null;
  return (
    <div className="flex flex-col gap-4">
      <StatusChip tone="info" icon="clock" label="Waiting for the shop's new photos" />
      <div className="flex flex-col gap-1">
        <span className="text-caption text-text-muted">
          {attemptLabel(attempts.length)}, sent back {formatDateTime(last.review.at)}. The
          shop read:
        </span>
        <blockquote className="border-outline text-body text-text-primary m-0 border-l-2 pl-3">
          {last.review.note || "No reason recorded."}
        </blockquote>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <section
          aria-label="The photos that were sent back"
          className="flex min-w-0 flex-col gap-2"
        >
          <h3
            className="text-body text-text-primary m-0"
            style={{ fontFamily: "var(--font-medium)" }}
          >
            The photos you sent back
          </h3>
          <ProgressGallery
            photos={submissionPhotos(last.finished, order)}
            label="Finished photo"
            large
          />
        </section>
        <JobTicket order={order} />
      </div>
    </div>
  );
}

function ApprovedRecord({ order }: { order: Order }) {
  const submission = currentSubmission(order);
  const review = order.shopHandover?.review;
  if (!submission || !review) return null;
  return (
    <div className="flex flex-col gap-4">
      <StatusChip
        tone="success"
        icon="circle-check"
        label={`Approved ${formatDateTime(review.at)}`}
      />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <section aria-label="Approved photos" className="flex min-w-0 flex-col gap-2">
          <ProgressGallery
            photos={submissionPhotos(submission, order)}
            label="Finished photo"
            large
          />
        </section>
        <JobTicket order={order} />
      </div>
    </div>
  );
}
