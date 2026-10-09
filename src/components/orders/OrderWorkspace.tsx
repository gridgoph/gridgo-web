"use client";

import { PackingPhotos } from "@/components/orders/PackingPhotos";
import { useSerializedLoad } from "@/lib/live/useSerializedLoad";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  BellRing,
  ChevronDown,
  ChevronLeft,
  CircleCheck,
  CircleDot,
  Lock,
  ShieldAlert,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

import {
  STAGES,
  isCancelled,
  stageSummary,
  stepsFor,
  type StepStatus,
  type WorkspaceStep,
} from "@/app/ops/_lib/pipeline";
import { opsErrorMessage } from "@/app/ops/_lib/errors";
import { CorrectProductionDialog } from "@/components/orders/CorrectProductionDialog";
import { CounterCheck } from "@/components/orders/CounterCheck";
import {
  DeadlinePanel,
  ShopAcceptancePanel,
  deadlineRowSummary,
  shopRowSummary,
  shopRowTone,
  shopRowVisible,
} from "@/components/orders/ShopChanges";
import { useFileDeletionAccess } from "@/components/files/FileDeletionAccess";
import { OrderFileDeletions } from "@/components/files/OrderFileDeletions";
import { EvidencePlate, EvidenceStrip } from "@/components/orders/EvidencePreview";
import {
  DesignLinkLead,
  DesignLinkList,
  OrderArtwork,
} from "@/components/orders/DesignLinks";
import { BasketPanel } from "@/components/orders/BasketPanel";
import { BasketPayment } from "@/components/orders/BasketPayment";
import { OrderMoneyLines } from "@/components/orders/OrderMoneyLines";
import { PaymentSummary } from "@/components/orders/PaymentSummary";
import { ShopModeChip } from "@/components/orders/ShopModeChip";
import { ProgressGallery, WaitingForPhoto } from "@/components/orders/ProductionProgress";
import { ResolveEscalationDialog } from "@/components/orders/ResolveEscalationDialog";
import { PayoutMilestones } from "@/components/orders/PayoutMilestones";
import {
  ReleaseMilestoneDialog,
  type ReleaseDecision,
  type ReleaseTarget,
} from "@/components/orders/ReleaseMilestoneDialog";
import { Timeline } from "@/components/orders/Timeline";
import { FileRefundDialog, type FiledRequest } from "@/components/refunds/dialogs";
import {
  Accordion,
  AccordionContent,
  AccordionHeader,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonDetail } from "@/components/ui/loading";
import { StatusChip } from "@/components/ui/StatusChip";
import { Textarea } from "@/components/ui/textarea";
import { installmentsAwaitingConfirmation } from "@/lib/api/constraints";
import { counterRow, counterStep } from "@/lib/counter-check";
import { deliveryEvidenceItems } from "@/lib/evidence";
import { artworkSource, orderDesignLinks } from "@/lib/design-links";
import { QaChecklistRecord, QaChecklistFields } from "./QaChecklist";
import {
  fileCheckOf,
  fileCheckWaitLine,
  qaChecksFor,
  qaChecklistPayload,
  canDecideFileCheck,
} from "@/lib/file-check";
import {
  confirmBasketPayment,
  confirmPayment,
  fileRefundRequest,
  getBasket,
  getOrder,
  getUser,
  listAudit,
  listEscalations,
  listOrderRefunds,
  listShopFailures,
  newIdempotencyKey,
  promisePhysicalInvoice,
  rejectBasketPayment,
  rejectPayment,
  releaseMilestoneWithReceipt,
  resolveEscalation,
  transitionOrder,
  uploadRefundEvidence,
} from "@/lib/api/client";
import type {
  Basket,
  Escalation,
  Order,
  PaymentInstallment,
  PayoutMilestone,
  RefundRequest,
  ShopFailureEvent,
} from "@/lib/api/types";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { formatDateTime, formatPhp } from "@/lib/format";
import {
  DESK_WINDOW_LABEL,
  deskInstant,
  deskTimes,
  isGridgoDeskInstant,
  upcomingDeskDates,
} from "@/lib/physicalInvoiceDesk";
import { milestoneName, presentOrderState } from "@/lib/order-state";
import { shopProofStages } from "@/lib/payout-plan";
import { paymentOf, paymentPlanLabel, paymentProgress } from "@/lib/payments";
import {
  milestoneProofs,
  payoutProgress,
  payoutSummary,
  releasableMilestones,
} from "@/lib/payouts";
import {
  PRODUCTION_OVERRIDE_ACTION,
  PRODUCTION_PHOTO_COPY,
  canCorrectProduction,
  canAddProgressPhoto,
  productionCorrections,
  productionPhotoMissing,
  productionProgressOf,
  progressPhotos,
  progressReached,
  type ProductionCorrection,
} from "@/lib/production-progress";
import { describeQuantity } from "@/lib/quantity";
import { presentRefundStatus, refundIsActive, refundKindLabel } from "@/lib/refunds";
import {
  failuresForOrder,
  recoveryHoldsWork,
  recoveryNeedsOperations,
  rescheduleNeedsOperations,
} from "@/lib/shop-changes";
import { cn } from "@/lib/utils";

type Props = {
  /** Parent queue the back link returns to. Super Admin has no orders rail. */
  queueHref: string;
  queueLabel?: string;
  /** Where the payout desk lives for this account, when it has one. */
  payoutsHref?: string;
};

/** The workspace's sections, in the order the work happens. */
type SectionId =
  | "payment"
  | "qa"
  | "production"
  | "shop"
  | "deadline"
  | "counter"
  | "delivery"
  | "payout"
  | "refund"
  | "physical-invoice"
  | "history";

/**
 * One order, as a sequence of steps with everything about it beside them.
 *
 * Every step is a row of one accordion. A closed row still says what happened
 * there — "Paid in full", "Delivered Sep 15, photo on file" — so the page is
 * read top to bottom as a record, and opened only where the evidence or the
 * decision lives. The rows that need Operations open themselves.
 *
 * After the four production steps comes the supplier's payout: the shares of
 * the shop's price its payout plan has, in the API's order. The pictures that
 * justify those shares live on Production and Delivery; the payout row keeps
 * the wallet receipt and the release.
 *
 * On the right, the whole specification, always visible and never behind a
 * tab, because the one thing a quality check needs is to read the spec and
 * tick the boxes at the same time. Below that desktop width the same
 * specification is the order file: collapsed, and above Payment, so a phone
 * opens on the steps.
 *
 * Operations and Super Admin mount the same workspace so an inbox slip opens
 * a screen that account is allowed to use.
 */
export function OrderWorkspace({
  queueHref,
  queueLabel = "Back to queue",
  payoutsHref,
}: Props) {
  const { id: orderId } = useParams<{ id: string }>();

  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState<SectionId[]>([]);
  const needed = useRef<SectionId[]>([]);
  const [release, setRelease] = useState<ReleaseTarget | null>(null);
  const [releaseError, setReleaseError] = useState<string | null>(null);
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [escalationsError, setEscalationsError] = useState<string | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [resolveId, setResolveId] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [refunds, setRefunds] = useState<RefundRequest[] | null>(null);
  /** The multi-shop basket this order is one group of; null for a single-shop order. */
  const [basket, setBasket] = useState<Basket | null>(null);
  const [basketError, setBasketError] = useState<string | null>(null);
  const [failures, setFailures] = useState<ShopFailureEvent[] | null>(null);
  const [failuresError, setFailuresError] = useState<string | null>(null);
  const [corrections, setCorrections] = useState<ProductionCorrection[]>([]);
  const [correcting, setCorrecting] = useState(false);
  const [correctError, setCorrectError] = useState<string | null>(null);
  const [filing, setFiling] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileKey = useRef<{ signature: string; key: string } | null>(null);
  // The mount point says which tree this is; links stay inside it.
  const tree = queueHref.startsWith("/admin") ? "admin" : "ops";
  // Below the two-column breakpoint the order file stacks above the steps.
  const phone = usePhoneLayout();

  const load = useSerializedLoad(
    useCallback(async () => {
      setLoading(true);
      setError(null);
      try {
        // The attempt history is its own read: if it fails, the order and its
        // latest counter check still show, with a line saying so.
        const [next, history, orderRefunds, overrides] = await Promise.all([
          getOrder(orderId),
          listEscalations({ orderId }).then(
            (list) => ({ list, error: null }),
            () => ({
              list: null,
              error:
                "Earlier counter attempts could not be loaded. Refresh the order to try again.",
            }),
          ),
          // Best effort: the refund row says so when it could not be read.
          listOrderRefunds(orderId).catch(() => null),
          // Best effort: staff corrections of the production step, from the
          // audit log that records them. Without it the step still shows.
          listAudit({ orderId, action: PRODUCTION_OVERRIDE_ACTION }).catch(() => null),
        ]);
        // A shop's timeouts, declines and cancellations are their own read,
        // made only when the order has been through a recovery. Best effort:
        // the row says so when they could not be read.
        if (next.shopRecovery) {
          try {
            setFailures(failuresForOrder(await listShopFailures(), orderId));
            setFailuresError(null);
          } catch {
            setFailuresError(
              "The shop dropouts on this order could not be loaded. Refresh the order to try again.",
            );
          }
        } else {
          setFailures(null);
          setFailuresError(null);
        }
        // One group of a multi-shop basket: its payment, siblings and combined
        // receipt live on the basket. Best effort; the payment step says so
        // and offers no action when it could not be read.
        if (next.basketId) {
          try {
            setBasket(await getBasket(next.basketId));
            setBasketError(null);
          } catch {
            setBasketError(
              "That payment could not be loaded, so it cannot be confirmed from here. Refresh the order to try again.",
            );
          }
        } else {
          setBasket(null);
          setBasketError(null);
        }
        setRefunds(orderRefunds);
        setCorrections(productionCorrections(overrides, orderId));
        setOrder(next);
        if (history.list) setEscalations(history.list);
        setEscalationsError(history.error);
      } catch (err) {
        setOrder(null);
        setError(opsErrorMessage(err, "That order could not be loaded."));
      } finally {
        setLoading(false);
      }
    }, [orderId]),
  );

  useLiveReload(["orders", "jobs", "payouts"], load, { matchId: orderId });

  // A file deleted early from any row: re-read the order, so a progress photo
  // leaves the gallery and every row reflects what the API now holds.
  const { version: fileDeletions } = useFileDeletionAccess();
  useEffect(() => {
    if (fileDeletions > 0) void load();
  }, [fileDeletions, load]);

  useEffect(() => {
    void load();
  }, [load]);

  // Open a row the moment it needs a decision -- on first load, and again when
  // a live refresh moves the order on to its next step -- and never close one:
  // a refresh must not shut what someone is reading, and a row they closed
  // themselves stays closed until it has something new to say.
  useEffect(() => {
    if (!order) return;
    const next = defaultOpenSections(order);
    const fresh = next.filter((id) => !needed.current.includes(id));
    needed.current = next;
    if (fresh.length > 0) {
      setOpen((current) => [...current, ...fresh.filter((id) => !current.includes(id))]);
    }
  }, [order]);

  const steps = useMemo(() => (order ? stepsFor(order) : []), [order]);

  // Who counted and who answered, by name. Best effort: a missing person
  // reads "the rider", never a raw id.
  const people = useMemo(() => {
    const ids = new Set<string>();
    if (order?.fileCheck?.reviewedBy) ids.add(order.fileCheck.reviewedBy);
    if (order?.pickupChecklist?.completedBy) ids.add(order.pickupChecklist.completedBy);
    for (const escalation of escalations) {
      if (escalation.riderId) ids.add(escalation.riderId);
      if (escalation.resolvedBy) ids.add(escalation.resolvedBy);
    }
    for (const correction of corrections) {
      if (correction.actorId) ids.add(correction.actorId);
    }
    // Shops named in the acceptance, recovery and deadline rows.
    if (order?.shopAcceptance?.supplierId) ids.add(order.shopAcceptance.supplierId);
    if (order?.shopRecovery?.originalSupplierId)
      ids.add(order.shopRecovery.originalSupplierId);
    if (order?.shopRecovery?.proposal?.supplierId)
      ids.add(order.shopRecovery.proposal.supplierId);
    if (order?.rescheduleRequest?.supplierId) ids.add(order.rescheduleRequest.supplierId);
    for (const event of failures ?? []) if (event.supplierId) ids.add(event.supplierId);
    // Each shop group's rider, for the basket panel.
    for (const group of basket?.groups ?? []) {
      if (group.order.riderId) ids.add(group.order.riderId);
    }
    return [...ids].sort().join(",");
  }, [order, escalations, corrections, failures, basket]);

  useEffect(() => {
    const missing = people.split(",").filter((id) => id && !(id in names));
    if (!missing.length) return;
    let cancelled = false;
    void Promise.all(
      missing.map((id) =>
        getUser(id).then(
          // A shop reads by its shop name; everyone else by their own.
          (user) => [id, user.supplierName || user.name] as const,
          () => [id, ""] as const,
        ),
      ),
    ).then((found) => {
      if (cancelled) return;
      setNames((current) => ({ ...current, ...Object.fromEntries(found) }));
    });
    return () => {
      cancelled = true;
    };
    // `names` is read, not watched: a lookup is made once per id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people]);

  async function run(label: string, action: () => Promise<Order>) {
    setActing(label);
    setActionError(null);
    try {
      setOrder(await action());
      setNote("");
      setChecked({});
    } catch (err) {
      setActionError(
        opsErrorMessage(err, "That did not go through. Refresh the order and try again."),
      );
    } finally {
      setActing(null);
    }
  }

  /** Confirm or reject the one transfer of a multi-shop basket, for every group. */
  async function decideBasketPayment(
    label: string,
    action: (basketId: string) => Promise<Basket>,
  ) {
    if (!order?.basketId) return;
    const basketId = order.basketId;
    setActing(label);
    setActionError(null);
    try {
      setBasket(await action(basketId));
      setNote("");
      await load();
    } catch (err) {
      setActionError(
        opsErrorMessage(err, "That did not go through. Refresh the order and try again."),
      );
    } finally {
      setActing(null);
    }
  }

  async function correctProduction(reason: string) {
    if (!order) return;
    setActing("correct-production");
    setCorrectError(null);
    try {
      // The reason is the audit record; the note carries it into the history
      // Operations and the shop read. The client's history never shows it.
      await transitionOrder(order.id, "ready_for_dispatch", { reason, note: reason });
      setCorrecting(false);
      await load();
    } catch (err) {
      setCorrectError(
        opsErrorMessage(
          err,
          "The job could not be moved on. Refresh the order and try again.",
        ),
      );
    } finally {
      setActing(null);
    }
  }

  async function sendInstruction(instruction: string) {
    if (!resolveId) return;
    setActing("resolve-escalation");
    setResolveError(null);
    try {
      await resolveEscalation(resolveId, { resolution: instruction });
      setResolveId(null);
      await load();
    } catch (err) {
      setResolveError(
        opsErrorMessage(err, "Could not send that instruction. Try again."),
      );
    } finally {
      setActing(null);
    }
  }

  async function confirmRelease(decision: ReleaseDecision) {
    if (!release || !order) return;
    const code = release.milestone.code;
    setActing(`release-${code}`);
    setReleaseError(null);
    try {
      const result = await releaseMilestoneWithReceipt(order.id, code, decision);
      setOrder(result.order);
      setRelease(null);
    } catch (err) {
      setReleaseError(opsErrorMessage(err, "Could not release that share. Try again."));
    } finally {
      setActing(null);
    }
  }

  async function fileRefund(request: FiledRequest) {
    if (!order) return;
    setActing("file-refund");
    setFileError(null);
    try {
      const evidenceFileIds = request.evidence
        ? [(await uploadRefundEvidence(request.evidence)).fileId]
        : [];
      const body = { kind: request.kind, reason: request.reason, evidenceFileIds };
      const signature = JSON.stringify(body);
      if (fileKey.current?.signature !== signature) {
        fileKey.current = { signature, key: newIdempotencyKey() };
      }
      await fileRefundRequest(order.id, body, fileKey.current.key);
      fileKey.current = null;
      setFiling(false);
      await load();
    } catch (err) {
      setFileError(
        opsErrorMessage(err, "The refund request could not be filed. Try again."),
      );
    } finally {
      setActing(null);
    }
  }

  if (loading && !order) return <SkeletonDetail label="Loading this order…" />;
  if (error || !order) {
    return (
      <ErrorState
        body={error ?? "That order could not be found."}
        action={
          <Button variant="secondary" onClick={() => void load()}>
            Retry
          </Button>
        }
      />
    );
  }

  const status = presentOrderState(order.state, order);
  const busy = acting !== null;
  const hasPayout = Boolean(order.payoutMilestones?.length);
  const releasing = acting?.startsWith("release-")
    ? acting.slice("release-".length)
    : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={queueHref}
            className="text-caption text-text-muted inline-flex items-center gap-1 hover:text-text-secondary"
          >
            <ChevronLeft size={14} strokeWidth={2} aria-hidden />
            {queueLabel}
          </Link>
          <h1 className="text-h2 text-text-primary m-0 mt-1 truncate">
            {order.title || "Untitled order"}
          </h1>
          {order.basketId ? (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <ShopModeChip
                mode={{ kind: "multi", shops: Math.max(2, basket?.groups.length ?? 2) }}
              />
              {order.groupLabel ? (
                <span className="text-caption text-text-secondary">
                  This is {order.groupLabel}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        <StatusChip tone={status.tone} label={status.label} icon={status.icon} />
      </div>

      {isCancelled(order) ? (
        <div
          className="gg-card p-3"
          style={{ borderColor: "var(--color-error)" }}
          role="status"
        >
          <p
            className="text-body text-text-primary m-0"
            style={{ fontFamily: "var(--font-medium)" }}
          >
            Cancelled {formatDateTime(order.cancelledAt)}
          </p>
          <p className="text-body text-text-secondary m-0 mt-1">
            {order.cancellationReason}
          </p>
          <p className="text-caption text-text-muted m-0 mt-2">
            Any refund is a manual transfer. This record does not move money.
          </p>
        </div>
      ) : null}

      {order.refundHold ? <RefundHoldBanner refunds={refunds} tree={tree} /> : null}

      {basket ? (
        <BasketPanel basket={basket} orderId={order.id} tree={tree} names={names} />
      ) : null}

      {/*
        Steps take the width they need and the rail is fixed, because the rail's
        job is to be read at a glance while the left side is being worked.
        On a phone the same rail is one collapsed order file above Payment.
      */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        {phone ? (
          <OrderFile order={order} basket={basket} payoutsHref={payoutsHref} />
        ) : null}
        <div className="flex flex-col gap-3">
          <Accordion
            multiple
            value={open}
            onValueChange={(value) => setOpen(value as SectionId[])}
            className="gg-card-flush"
          >
            {steps.map((step) => (
              <Fragment key={step.id}>
                <StepRow
                  step={step}
                  order={order}
                  note={note}
                  onNote={setNote}
                  checked={checked}
                  onCheck={setChecked}
                  acting={acting}
                  onConfirmPayment={(installment) =>
                    run(`confirm-${installment}`, () =>
                      confirmPayment(order.id, installment),
                    )
                  }
                  onRejectPayment={(installment, reason) =>
                    run(`reject-${installment}`, () =>
                      rejectPayment(order.id, installment, { reason }),
                    )
                  }
                  basket={basket}
                  basketError={basketError}
                  tree={tree}
                  onConfirmBasket={() =>
                    void decideBasketPayment("confirm-basket", confirmBasketPayment)
                  }
                  onRejectBasket={(reason) =>
                    void decideBasketPayment("reject-basket", (id) =>
                      rejectBasketPayment(id, { reason }),
                    )
                  }
                  onApprove={() =>
                    run("approve", () =>
                      transitionOrder(order.id, "supplier_assigned", {
                        note,
                        qaChecklist: qaChecklistPayload(checked),
                      }),
                    )
                  }
                  onCorrection={() =>
                    run("correction", () =>
                      transitionOrder(order.id, "client_correction", {
                        note,
                        qaChecklist: qaChecklistPayload(checked),
                      }),
                    )
                  }
                  onCancel={() =>
                    run("cancel", () =>
                      transitionOrder(order.id, "cancelled", { reason: note }),
                    )
                  }
                  corrections={corrections}
                  names={names}
                  onCorrectProduction={() => {
                    setCorrectError(null);
                    setCorrecting(true);
                  }}
                />
                {/*
                Between the shop and the road: the rider's count and six
                checks at the counter. A gate on custody, not a payout stage.
              */}
                {/*
                  When a shop could not take, keep or meet the order: its
                  acceptance window and dropouts, then its deadline request.
                */}
                {step.id === "production" && shopRowVisible(order) ? (
                  <SectionRow
                    id="shop"
                    heading="Shop acceptance"
                    summary={shopRowSummary(order)}
                    marker={SHOP_MARKER[shopRowTone(order)]}
                    trailing={
                      recoveryNeedsOperations(order.shopRecovery)
                        ? "Your call"
                        : undefined
                    }
                  >
                    <ShopAcceptancePanel
                      order={order}
                      failures={failures}
                      failuresError={failuresError}
                      names={names}
                      tree={tree}
                    />
                  </SectionRow>
                ) : null}
                {step.id === "production" && order.rescheduleRequest ? (
                  <SectionRow
                    id="deadline"
                    heading="Deadline request"
                    summary={deadlineRowSummary(order.rescheduleRequest)}
                    marker={
                      rescheduleNeedsOperations(order.rescheduleRequest)
                        ? SHOP_MARKER.attention
                        : order.rescheduleRequest.workHeld ||
                            order.rescheduleRequest.status === "pending"
                          ? SHOP_MARKER.open
                          : SHOP_MARKER.quiet
                    }
                    trailing={
                      rescheduleNeedsOperations(order.rescheduleRequest)
                        ? "Your call"
                        : undefined
                    }
                  >
                    <DeadlinePanel
                      order={order}
                      request={order.rescheduleRequest}
                      names={names}
                      tree={tree}
                      onResolved={load}
                    />
                  </SectionRow>
                ) : null}
                {step.id === "production" ? (
                  <CounterRow
                    order={order}
                    escalations={escalations}
                    escalationsError={escalationsError}
                    names={names}
                    resolving={busy}
                    onResolve={(id) => {
                      setResolveError(null);
                      setResolveId(id);
                    }}
                  />
                ) : null}
              </Fragment>
            ))}

            {hasPayout ? (
              <SectionRow
                id="payout"
                heading="Supplier payout"
                summary={payoutSummary(order)}
                marker={payoutMarker(order)}
                trailing={payoutTrailing(order)}
              >
                <PayoutMilestones
                  order={order}
                  releasing={releasing}
                  onRelease={(milestone) => {
                    setReleaseError(null);
                    setRelease({ order, milestone });
                  }}
                />
                {payoutsHref ? (
                  <p className="text-caption text-text-muted m-0 mt-3">
                    Every order&rsquo;s payout, in one queue:{" "}
                    <Link
                      href={`${payoutsHref}/${order.id}`}
                      className="text-text-secondary underline-offset-2 hover:underline"
                    >
                      open the payout review
                    </Link>
                    .
                  </p>
                ) : null}
              </SectionRow>
            ) : null}

            {refunds?.length || order.refundHold || canFileRefund(order, refunds) ? (
              <SectionRow
                id="refund"
                heading="Client refund"
                summary={refundRowSummary(order, refunds)}
                marker={refundMarker(order, refunds)}
              >
                <RefundRowPanel
                  order={order}
                  refunds={refunds}
                  tree={tree}
                  busy={busy}
                  onFile={() => {
                    setFileError(null);
                    setFiling(true);
                  }}
                />
              </SectionRow>
            ) : null}

            {order.physicalInvoiceRequest ? (
              <SectionRow
                id="physical-invoice"
                heading="Physical invoice"
                summary={physicalInvoiceSummary(order)}
                marker={physicalInvoiceMarker(order)}
                trailing={
                  order.physicalInvoiceRequest.promisedDeliveryAt
                    ? "Promised"
                    : "Your call"
                }
              >
                <PhysicalInvoicePanel
                  order={order}
                  busy={busy}
                  onPromise={(instant) =>
                    run("physical-invoice", () =>
                      promisePhysicalInvoice(order.id, instant),
                    )
                  }
                />
              </SectionRow>
            ) : null}

            <SectionRow
              id="history"
              heading="History"
              summary={historySummary(order)}
              marker={{ icon: CircleDot, tone: "muted" }}
            >
              <Timeline entries={order.timeline} order={order} />
            </SectionRow>
          </Accordion>

          {actionError ? (
            <p className="text-body text-error m-0" role="alert">
              {actionError}
            </p>
          ) : null}
        </div>

        {phone ? null : (
          <SpecRail order={order} basket={basket} payoutsHref={payoutsHref} />
        )}
      </div>

      <ResolveEscalationDialog
        escalationId={resolveId}
        busy={acting === "resolve-escalation"}
        error={resolveError}
        onCancel={() => {
          setResolveId(null);
          setResolveError(null);
        }}
        onSend={(instruction) => void sendInstruction(instruction)}
      />

      <CorrectProductionDialog
        open={correcting}
        photoMissing={productionPhotoMissing(order)}
        busy={acting === "correct-production"}
        error={correctError}
        onCancel={() => {
          setCorrecting(false);
          setCorrectError(null);
        }}
        onConfirm={(reason) => void correctProduction(reason)}
      />

      <FileRefundDialog
        open={filing}
        late={refundFilingLate(order)}
        busy={acting === "file-refund"}
        error={fileError}
        onCancel={() => setFiling(false)}
        onFile={(request) => void fileRefund(request)}
      />

      {release ? (
        <ReleaseMilestoneDialog
          target={release}
          destination={order.supplierPayoutAccount ?? null}
          busy={busy}
          error={releaseError}
          onCancel={() => {
            setRelease(null);
            setReleaseError(null);
          }}
          onConfirm={(decision) => void confirmRelease(decision)}
        />
      ) : null}
    </div>
  );
}

/**
 * Rows that open on first load: the step the order is at, plus any row with
 * a decision waiting for Operations, wherever it sits. A cancelled order opens
 * its history, because the reason is the whole story.
 */
export function defaultOpenSections(order: Order): SectionId[] {
  const ids = new Set<SectionId>();
  const current = stepsFor(order).find((step) => step.status === "current");
  if (current) ids.add(current.id as SectionId);
  if (order.refundHold) ids.add("refund");
  if (counterStep(order) === "current") ids.add("counter");
  if (installmentsAwaitingConfirmation(order).length > 0) ids.add("payment");
  if (order.physicalInvoiceRequest && !order.physicalInvoiceRequest.promisedDeliveryAt) {
    ids.add("physical-invoice");
  }
  if (releasableMilestones(order).length > 0) ids.add("payout");
  if (recoveryNeedsOperations(order.shopRecovery)) ids.add("shop");
  if (rescheduleNeedsOperations(order.rescheduleRequest)) ids.add("deadline");
  if (isCancelled(order)) ids.add("history");
  return [...ids];
}

const COUNTER_MARKER: Record<ReturnType<typeof counterRow>["marker"], MarkerSpec> = {
  success: { icon: CircleCheck, tone: "success" },
  current: { icon: CircleDot, tone: "current" },
  "muted-lock": { icon: Lock, tone: "muted" },
  muted: { icon: CircleDot, tone: "muted" },
};

function CounterRow({
  order,
  escalations,
  escalationsError,
  names,
  resolving,
  onResolve,
}: {
  order: Order;
  escalations: Escalation[];
  escalationsError: string | null;
  names: Record<string, string>;
  resolving: boolean;
  onResolve: (escalationId: string) => void;
}) {
  const row = counterRow(order, escalations, formatDateTime);
  return (
    <SectionRow
      id="counter"
      heading="Counter check"
      summary={row.summary}
      marker={COUNTER_MARKER[row.marker]}
      trailing={row.trailing}
      current={counterStep(order) === "current"}
    >
      <CounterCheck
        order={order}
        escalations={escalations}
        escalationsError={escalationsError}
        names={names}
        resolving={resolving}
        onResolve={onResolve}
      />
    </SectionRow>
  );
}

function physicalInvoiceSummary(order: Order): string {
  const request = order.physicalInvoiceRequest;
  if (!request) return "";
  if (request.promisedDeliveryAt)
    return `Promised ${formatDateTime(request.promisedDeliveryAt)}. Client notified in the app.`;
  return `Paper copy requested ${formatDateTime(request.requestedAt)}.`;
}

function physicalInvoiceMarker(order: Order): MarkerSpec {
  return order.physicalInvoiceRequest?.promisedDeliveryAt
    ? { icon: CircleCheck, tone: "success" }
    : { icon: CircleDot, tone: "current" };
}

function historySummary(order: Order): string {
  const count = order.timeline.length;
  if (count === 0) return "Nothing recorded yet.";
  const latest = [...order.timeline].sort((a, b) => a.at.localeCompare(b.at))[count - 1];
  return `${count === 1 ? "One event" : `${count} events`}, last ${formatDateTime(latest.at)}.`;
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

type MarkerSpec = {
  icon: LucideIcon;
  tone: "success" | "current" | "muted";
};

const STEP_MARKER: Record<StepStatus, MarkerSpec> = {
  done: { icon: CircleCheck, tone: "success" },
  current: { icon: CircleDot, tone: "current" },
  locked: { icon: Lock, tone: "muted" },
};

function payoutMarker(order: Order): MarkerSpec {
  const progress = payoutProgress(order);
  if (progress.count > 0 && progress.releasedCount === progress.count) {
    return { icon: CircleCheck, tone: "success" };
  }
  return releasableMilestones(order).length > 0
    ? { icon: CircleDot, tone: "current" }
    : { icon: Lock, tone: "muted" };
}

function payoutTrailing(order: Order): string {
  const progress = payoutProgress(order);
  if (progress.count === 0) return "";
  if (progress.releasedCount === progress.count) return "Done";
  return releasableMilestones(order).length > 0
    ? "Your call"
    : `${progress.releasedCount} of ${progress.count} released`;
}

const SHOP_MARKER: Record<ReturnType<typeof shopRowTone>, MarkerSpec> = {
  attention: { icon: TriangleAlert, tone: "current" },
  open: { icon: CircleDot, tone: "current" },
  done: { icon: CircleCheck, tone: "success" },
  quiet: { icon: CircleDot, tone: "muted" },
};

function Marker({ icon: Icon, tone }: MarkerSpec) {
  return (
    <span
      className={cn(
        "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-pill border",
        tone === "success" && "border-success text-success",
        tone === "current" && "border-outline bg-surface-variant text-text-primary",
        tone === "muted" && "border-outline-subtle text-text-muted",
      )}
      aria-hidden
    >
      <Icon size={14} strokeWidth={2} />
    </span>
  );
}

type SectionRowProps = {
  id: SectionId;
  heading: string;
  summary: string;
  marker: MarkerSpec;
  /** Short state word on the right: "Done", "You are here", "Locked". */
  trailing?: string;
  current?: boolean;
  children: React.ReactNode;
};

/**
 * One row of the workspace. The trigger carries the heading, the one-line
 * summary and the state word, so the row is read without being opened; the
 * panel carries the evidence and the actions.
 */
function SectionRow({
  id,
  heading,
  summary,
  marker,
  trailing,
  current = false,
  children,
}: SectionRowProps) {
  return (
    <AccordionItem
      value={id}
      render={<section aria-current={current ? "step" : undefined} />}
    >
      <AccordionHeader render={<h2 className="m-0 flex text-h3" />}>
        <AccordionTrigger className={cn(current && "bg-surface-variant/40")}>
          <Marker {...marker} />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-h3 text-text-primary">{heading}</span>
            <span className="text-body text-text-secondary">{summary}</span>
          </span>
          {trailing ? (
            <span className="text-overline text-text-muted mt-1.5 shrink-0">
              {trailing}
            </span>
          ) : null}
        </AccordionTrigger>
      </AccordionHeader>
      <AccordionContent>
        <div className="sm:pl-9">{children}</div>
      </AccordionContent>
    </AccordionItem>
  );
}

type StepRowProps = {
  step: WorkspaceStep;
  order: Order;
  note: string;
  onNote: (value: string) => void;
  checked: Record<string, boolean>;
  onCheck: (next: Record<string, boolean>) => void;
  acting: string | null;
  onConfirmPayment: (installment: PaymentInstallment) => void;
  onRejectPayment: (installment: PaymentInstallment, reason: string) => void;
  basket: Basket | null;
  basketError: string | null;
  tree: "ops" | "admin";
  onConfirmBasket: () => void;
  onRejectBasket: (reason: string) => void;
  onApprove: () => void;
  onCorrection: () => void;
  onCancel: () => void;
  corrections: ProductionCorrection[];
  names: Record<string, string>;
  onCorrectProduction: () => void;
};

function StepRow({
  step,
  order,
  note,
  onNote,
  checked,
  onCheck,
  acting,
  onConfirmPayment,
  onRejectPayment,
  basket,
  basketError,
  tree,
  onConfirmBasket,
  onRejectBasket,
  onApprove,
  onCorrection,
  onCancel,
  corrections,
  names,
  onCorrectProduction,
}: StepRowProps) {
  const definition = STAGES.find((entry) => entry.id === step.id);
  const current = step.status === "current";
  const artwork = artworkSource(order);
  const designLinks = orderDesignLinks(order);
  const qaChecks = qaChecksFor(order);
  const busy = acting !== null;
  const trailing =
    step.id === "payment"
      ? paymentProgress(order).label
      : step.status === "done"
        ? "Done"
        : current
          ? "You are here"
          : "Locked";

  return (
    <SectionRow
      id={step.id as SectionId}
      heading={definition?.label ?? step.label}
      summary={
        step.id === "payment" && basket
          ? basketPaymentSummary(basket)
          : stepSummary(order, step)
      }
      marker={STEP_MARKER[step.status]}
      trailing={trailing}
      current={current}
    >
      {step.id === "payment" ? (
        order.basketId ? (
          <BasketPayment
            order={order}
            basket={basket}
            basketError={basketError}
            tree={tree}
            busy={busy}
            onConfirm={onConfirmBasket}
            onReject={onRejectBasket}
          />
        ) : (
          <PaymentStep
            order={order}
            busy={busy}
            onConfirm={onConfirmPayment}
            onReject={onRejectPayment}
          />
        )
      ) : null}

      {step.id === "qa" ? (
        canDecideFileCheck(order) ? (
          <div className="flex flex-col gap-3">
            {/*
              A design link is the one piece of artwork the rail cannot show:
              the file is behind it. Put it where the check is made.
            */}
            {designLinks.length ? (
              <div className="flex flex-col gap-2">
                <DesignLinkLead fileToo={artwork !== "link"} />
                <DesignLinkList links={designLinks} />
              </div>
            ) : null}
            <QaChecklistFields
              order={order}
              checked={checked}
              onCheck={onCheck}
              disabled={busy}
            />
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
                disabled={busy || qaChecks.some((check) => !checked[check.id])}
              >
                {acting === "approve" ? "Sending…" : "Approve and send to the shop"}
              </Button>
              <Button
                variant="secondary"
                onClick={onCorrection}
                disabled={busy || !note.trim()}
              >
                Send back for changes
              </Button>
              <Button
                variant="secondary"
                onClick={onCancel}
                disabled={busy || !note.trim()}
              >
                Cancel this order
              </Button>
            </div>
            <p className="text-caption text-text-muted m-0">
              Sending back keeps the client&rsquo;s payment. Both a change request and a
              cancellation need a reason — the client is told what you write.
            </p>
          </div>
        ) : step.status === "done" || order.fileCheck?.reviewedAt ? (
          <QaChecklistRecord order={order} names={names} />
        ) : (
          <p className="text-body text-text-secondary m-0">{definition?.hint}</p>
        )
      ) : null}

      {step.id === "production" ? (
        <ProductionStep
          order={order}
          hint={definition?.hint}
          corrections={corrections}
          names={names}
          busy={busy}
          onCorrect={onCorrectProduction}
        />
      ) : null}

      {step.id === "delivery" ? (
        <DeliveryStep order={order} hint={definition?.hint} />
      ) : null}
    </SectionRow>
  );
}

/**
 * A step's closed line. The quality check reads the file's live wait while it
 * is waiting on Operations, and when it was passed once it has been.
 */
/** The Payment row of a basket group speaks for the one payment, not the group's part. */
function basketPaymentSummary(basket: Basket): string {
  const amount = formatPhp(basket.payment?.amountMinor ?? basket.totalMinor);
  const shops = `${basket.groups.length} groups`;
  switch (basket.payment?.status) {
    case "pending_confirmation":
      return `One payment of ${amount} for ${shops} is waiting on you.`;
    case "confirmed":
      return `One payment of ${amount} for ${shops}, confirmed.`;
    default:
      return `One payment of ${amount} for ${shops}, not sent yet.`;
  }
}

function stepSummary(order: Order, step: WorkspaceStep): string {
  const stage = step.id as Exclude<typeof step.id, "done">;
  if (stage === "qa") {
    const check = fileCheckOf(order);
    if (step.status === "current") {
      const waiting = fileCheckWaitLine(order);
      if (waiting) return waiting;
    }
    if (step.status === "done" && check?.status === "passed" && check.reviewedAt) {
      return `File passed ${formatDateTime(check.reviewedAt)}.`;
    }
  }
  // A dropout or a declined deadline request stops the shop's work, whatever
  // state the order still carries.
  if (stage === "production" && step.status === "current") {
    if (recoveryHoldsWork(order.shopRecovery)) {
      return "Paused: the shop dropped out. The rows below say what happens next.";
    }
    if (order.rescheduleRequest?.workHeld) {
      return "Paused while the shop's deadline request is settled.";
    }
  }
  return stageSummary(order, stage, formatPhp, formatDateTime);
}

function PhysicalInvoicePanel({
  order,
  busy,
  onPromise,
}: {
  order: Order;
  busy: boolean;
  onPromise: (instant: string) => void;
}) {
  const request = order.physicalInvoiceRequest;
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  if (!request) return null;

  // Only times still ahead are offered: the API accepts any desk-window
  // instant, including one that has already passed today.
  const now = Date.now();
  const ahead = (ymd: string, hm: string) => Date.parse(deskInstant(ymd, hm)) > now;
  const allTimes = deskTimes();
  const lastTime = allTimes[allTimes.length - 1].value;
  const dates = upcomingDeskDates().filter((option) => ahead(option.value, lastTime));
  const times = date ? allTimes.filter((option) => ahead(date, option.value)) : allTimes;
  const instant = date && time ? deskInstant(date, time) : "";
  const ready =
    Boolean(instant) && isGridgoDeskInstant(instant) && Date.parse(instant) > now;
  const saving = busy;

  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 m-0">
        {(
          [
            ["Contact person", request.contactPerson],
            ["Office address", request.officeAddress],
            ["Operating hours", request.operatingHours],
            ["Requested at", formatDateTime(request.requestedAt)],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-caption text-text-muted">{label}</dt>
            <dd className="text-body text-text-secondary m-0">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-body text-text-secondary m-0">
        Someone is there: {request.operatingHours}
      </p>
      {request.promisedDeliveryAt ? (
        <div
          className="flex items-start gap-2 rounded-field border border-outline-subtle px-3 py-2"
          role="status"
        >
          <BellRing className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
          <p className="text-body text-text-primary m-0">
            Promised for {formatDateTime(request.promisedDeliveryAt)}. Client notified:
            GRIDGO sends them an in-app notice with the time whenever it is set or
            changed.
          </p>
        </div>
      ) : null}
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="text-caption text-text-muted p-0">
          {request.promisedDeliveryAt ? "Change the promise" : "Promise delivery"}
          <span className="mt-0.5 block">{DESK_WINDOW_LABEL}</span>
          <span className="mt-0.5 block">
            The client gets an in-app notice with the time you set.
          </span>
        </legend>
        <div className="flex flex-wrap gap-2">
          <select
            aria-label="Promise delivery date"
            className="h-12 min-w-0 flex-1 rounded-[var(--radius-field)] border border-input bg-card px-3 text-body text-foreground"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          >
            <option value="">Choose a weekday</option>
            {dates.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Promise delivery time"
            className="h-12 min-w-0 rounded-[var(--radius-field)] border border-input bg-card px-3 text-body text-foreground"
            value={time}
            onChange={(event) => setTime(event.target.value)}
          >
            <option value="">Choose a time</option>
            {times.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </fieldset>
      <div>
        <Button
          variant="primary"
          disabled={saving || !ready}
          onClick={() => onPromise(instant)}
        >
          {request.promisedDeliveryAt
            ? "Change promise and notify client"
            : "Set promise and notify client"}
        </Button>
      </div>
    </div>
  );
}

function PaymentStep({
  order,
  busy,
  onConfirm,
  onReject,
}: {
  order: Order;
  busy: boolean;
  onConfirm: (installment: PaymentInstallment) => void;
  onReject: (installment: PaymentInstallment, reason: string) => void;
}) {
  return (
    <PaymentSummary
      order={order}
      renderActions={(installment) =>
        paymentOf(order, installment)?.status === "pending_confirmation" ? (
          <div className="mt-3 flex flex-col gap-2">
            <p className="text-caption text-text-secondary m-0">
              Check the transfer against the amount and receipt before confirming.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                onClick={() => onConfirm(installment)}
                disabled={busy}
              >
                {installment === "balance"
                  ? "Confirm balance payment"
                  : "Confirm this payment"}
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  onReject(
                    installment,
                    "The transfer could not be matched to this order.",
                  )
                }
              >
                {installment === "balance" ? "Reject balance" : "Reject"}
              </Button>
            </div>
          </div>
        ) : null
      }
    />
  );
}

/**
 * The shop's own record of the job.
 *
 * First the progress photos, the same gallery the client sees, or the empty
 * frame that says none has arrived; a shop cannot pack without one. Then any
 * correction Operations made on the shop's behalf, from the audit log. Then
 * the payout proofs the gallery does not already show (a PDF, a legacy file):
 * they belong to the payout, but they are also a sight of the work.
 */
function ProductionStep({
  order,
  hint,
  corrections,
  names,
  busy,
  onCorrect,
}: {
  order: Order;
  hint?: string;
  corrections: ProductionCorrection[];
  names: Record<string, string>;
  busy: boolean;
  onCorrect: () => void;
}) {
  const progress = productionProgressOf(order);
  const photos = progressPhotos(order);
  const photoMissing = productionPhotoMissing(order);
  const showProgress = progress !== null && progressReached(order);
  // An API that predates the gallery does not take the correction either.
  const correctable = progress !== null && canCorrectProduction(order);
  const shopProofs = shopProofStages(order).map((milestone) => ({
    milestone,
    proofs: milestoneProofs(order, milestone),
  }));

  // A start-of-production photo is both a gallery photo and a payout proof.
  // Say so under the photo, and do not show the same picture twice.
  const galleryIds = new Set(photos.map((photo) => photo.fileId));
  const proofOf = new Map<string, string>();
  for (const { milestone, proofs } of shopProofs) {
    for (const proof of proofs) {
      if (galleryIds.has(proof.fileId))
        proofOf.set(proof.fileId, milestoneName(milestone));
    }
  }
  const filed = shopProofs
    .map(({ milestone, proofs }) => ({
      milestone,
      proofs: proofs.filter((proof) => !galleryIds.has(proof.fileId)),
    }))
    .filter((entry) => entry.proofs.length > 0);

  if (!showProgress && !order.packingProgress && filed.length === 0 && corrections.length === 0 && !correctable) {
    return <p className="text-body text-text-secondary m-0">{hint}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {showProgress ? (
        <div>
          <p
            className="text-body text-text-primary m-0"
            style={{ fontFamily: "var(--font-medium)" }}
          >
            Progress photos
          </p>
          <p className="text-caption text-text-muted m-0 mb-2">
            {photoMissing
              ? "The client sees the same thing on their order."
              : "The client sees these on their order too."}
          </p>
          {photoMissing ? (
            <WaitingForPhoto
              tone={canAddProgressPhoto(order) ? "attention" : "neutral"}
              body={
                canAddProgressPhoto(order)
                  ? PRODUCTION_PHOTO_COPY.staffWaiting
                  : PRODUCTION_PHOTO_COPY.staffMovedOnWithout
              }
            />
          ) : (
            <ProgressGallery
              photos={photos}
              noteFor={(photo) => {
                const stage = proofOf.get(photo.fileId);
                return stage ? `Also the payout proof for ${stage.toLowerCase()}` : null;
              }}
            />
          )}
        </div>
      ) : null}

      <PackingPhotos order={order} />

      {corrections.map((correction) => (
        <CorrectionNote key={correction.id} correction={correction} names={names} />
      ))}

      {filed.map(({ milestone, proofs }) => (
        <div key={milestone.code}>
          <p
            className="text-body text-text-primary m-0 mb-2"
            style={{ fontFamily: "var(--font-medium)" }}
          >
            {shopProofHeading(milestone)}
          </p>
          <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2">
            {proofs.map((proof) => (
              <li key={proof.fileId} className="min-w-0">
                <EvidencePlate fileId={proof.fileId} label={proof.label} deletable />
                {proof.attachedAt ? (
                  <p className="text-caption text-text-muted m-0 mt-1">
                    Filed {formatDateTime(proof.attachedAt)}
                    {proof.attachedBy ? ` by ${proof.attachedBy}` : ""}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ))}

      {correctable ? (
        <div className="border-outline-subtle flex flex-col items-start gap-2 border-t pt-3">
          <p className="text-caption text-text-muted m-0 max-w-prose">
            {photoMissing
              ? "If you have seen the finished job yourself, you can move it on without the photo. You will be asked why."
              : "The shop has not marked this job ready for dispatch yet. You can move it on for them. You will be asked why."}
          </p>
          <Button variant="secondary" disabled={busy} onClick={onCorrect}>
            Move to ready for dispatch
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** Who moved the job, the edge, whether a photo existed, and the reason in their words. */
function CorrectionNote({
  correction,
  names,
}: {
  correction: ProductionCorrection;
  names: Record<string, string>;
}) {
  const who =
    (correction.actorId && names[correction.actorId]) ||
    (correction.actorRole === "super_admin" ? "Super Admin" : "Operations");
  const from = correction.from ? presentOrderState(correction.from).label : null;
  const to = correction.to ? presentOrderState(correction.to).label : null;
  return (
    <div
      className="border-outline bg-surface-variant rounded-card flex gap-3 border p-3"
      role="note"
      aria-label="Production step corrected by staff"
    >
      <ShieldAlert
        size={18}
        strokeWidth={1.75}
        className="text-warning mt-0.5 shrink-0"
        aria-hidden
      />
      <div className="flex min-w-0 flex-col gap-1">
        <p
          className="text-body text-text-primary m-0"
          style={{ fontFamily: "var(--font-medium)" }}
        >
          Moved on by {who}
        </p>
        <p className="text-caption text-text-muted m-0">
          {formatDateTime(correction.at)}
          {from && to ? `. From ${from} to ${to}.` : "."}
          {correction.photoMissing ? " No progress photo was on file." : ""}
        </p>
        {correction.reason ? (
          <blockquote className="border-outline text-body text-text-secondary m-0 mt-1 border-l-2 pl-3">
            {correction.reason}
          </blockquote>
        ) : null}
      </div>
    </div>
  );
}

/** What each shop proof shows, in the words the workspace has always used. */
function shopProofHeading(milestone: PayoutMilestone): string {
  switch (milestone.code) {
    case "printing":
      return "Printed run";
    case "packaging_qc":
      return "Packed for pickup";
    case "production_started":
      return "Production started";
    default:
      return milestoneName(milestone);
  }
}

/**
 * The photo at the door, once a rider has it. The pickup itself (count,
 * checks, photos of a failed check, the shop's signature) is the counter
 * check row above.
 */
function DeliveryStep({ order, hint }: { order: Order; hint?: string }) {
  const delivery = deliveryEvidenceItems(order);

  if (delivery.length === 0) {
    return <p className="text-body text-text-secondary m-0">{hint}</p>;
  }

  return (
    <div>
      <p
        className="text-body text-text-primary m-0 mb-2"
        style={{ fontFamily: "var(--font-medium)" }}
      >
        {order.deliveryEvidence
          ? `At the door, ${formatDateTime(order.deliveryEvidence.recordedAt)}`
          : "Delivery photos"}
      </p>
      <EvidenceStrip items={delivery} deletable />
    </div>
  );
}

// ---------------------------------------------------------------------------
// The rail
// ---------------------------------------------------------------------------

/** The workspace is two columns from here up; below it, one column. */
const PHONE_LAYOUT_QUERY = "(max-width: 1023px)";

function usePhoneLayout(): boolean {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(PHONE_LAYOUT_QUERY);
    const apply = () => setPhone(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);
  return phone;
}

/** Closed line for the phone's order file: what is being made, without the plates. */
function orderFileSummary(order: Order): string {
  const made = [describeQuantity(order.quantity, order.unit), order.size, order.material]
    .filter((part) => part && part !== "—")
    .join(", ");
  return made || "Specification, artwork, and delivery";
}

/**
 * The specification, collapsed, for a phone. Opening it is the same rail the
 * desktop keeps beside the steps.
 */
function OrderFile({
  order,
  basket,
  payoutsHref,
}: {
  order: Order;
  basket: Basket | null;
  payoutsHref?: string;
}) {
  return (
    <Collapsible defaultOpen={false} className="gg-card-flush">
      <CollapsibleTrigger
        className={cn(
          "group flex min-h-11 w-full items-start justify-between gap-3 px-4 py-3 text-left",
          "hover:bg-overlay-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-action-yellow",
        )}
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-h3 text-text-primary">Order file</span>
          <span className="text-body text-text-secondary">{orderFileSummary(order)}</span>
        </span>
        <ChevronDown
          size={16}
          strokeWidth={2}
          aria-hidden
          className="mt-1 shrink-0 text-text-muted transition-transform duration-200 motion-reduce:transition-none group-data-[panel-open]:rotate-180"
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-200 ease-out data-ending-style:h-0 data-starting-style:h-0 motion-reduce:transition-none">
        <div className="px-4 pb-4">
          <SpecRail order={order} basket={basket} payoutsHref={payoutsHref} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function SpecRail({
  order,
  basket,
  payoutsHref,
}: {
  order: Order;
  basket: Basket | null;
  payoutsHref?: string;
}) {
  const { paidMinor, remainingMinor } = paymentProgress(order);
  const plan = paymentPlanLabel(order);
  const payout = payoutProgress(order);
  const hasArtwork = artworkSource(order) !== "none";
  return (
    <aside
      className="flex flex-col gap-3 lg:sticky lg:top-4 lg:self-start"
      aria-label="Order details"
    >
      <section className="gg-card p-3">
        <h2 className="text-overline text-text-muted m-0 mb-2">This order</h2>
        <p
          className="text-body-lg text-text-primary m-0"
          style={{ fontFamily: "var(--font-medium)" }}
        >
          {order.title || "Untitled order"}
        </p>
        <p className="text-body text-text-secondary m-0 mt-1">
          {describeQuantity(order.quantity, order.unit)}
        </p>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 m-0 mt-2">
          {(
            [
              ["Size", order.size],
              ["Material", order.material],
              ["Finish", order.finish],
            ] as const
          )
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-caption text-text-muted">{label}</dt>
                <dd className="text-body text-text-secondary m-0">{value}</dd>
              </div>
            ))}
        </dl>
      </section>

      {hasArtwork ? (
        <section className="gg-card p-3">
          <h2 className="text-overline text-text-muted m-0 mb-2">Artwork</h2>
          <OrderArtwork order={order} />
        </section>
      ) : null}

      <OrderFileDeletions order={order} />

      <section className="gg-card p-3">
        <h2 className="text-overline text-text-muted m-0 mb-2">Money</h2>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 m-0">
          {/*
            The shop's price and GRIDGO's fee on top of it, then delivery and
            who it belongs to. Operations and Super Admin only: the API strips
            these from every other role, and the client's own receipt folds the
            fee into the price of the work.
          */}
          <OrderMoneyLines
            order={order}
            totalLabel={
              order.basketId && order.groupLabel
                ? `${order.groupLabel} total`
                : "Client total"
            }
          />
          {basket ? (
            <>
              <dt className="text-caption text-text-muted">Whole order, one payment</dt>
              <dd className="text-body text-text-secondary m-0 tabular-nums">
                {formatPhp(basket.payment?.amountMinor ?? basket.totalMinor)} for{" "}
                {basket.groups.length} groups
              </dd>
            </>
          ) : null}
          {plan ? (
            <>
              <dt className="text-caption text-text-muted">Payment plan</dt>
              <dd className="text-body text-text-secondary m-0">{plan}</dd>
            </>
          ) : null}
          <dt className="text-caption text-text-muted">Paid</dt>
          <dd className="text-body text-text-secondary m-0 tabular-nums">
            {paidMinor != null ? formatPhp(paidMinor) : "—"}
          </dd>
          <dt className="text-caption text-text-muted">Remaining</dt>
          <dd className="text-body text-text-secondary m-0 tabular-nums">
            {remainingMinor != null ? formatPhp(remainingMinor) : "—"}
          </dd>
          {payout.count > 0 ? (
            <>
              <dt className="text-caption text-text-muted">To the shop</dt>
              <dd className="text-body text-text-secondary m-0 tabular-nums">
                {payout.releasedMinor !== null && payout.totalMinor !== null
                  ? `${formatPhp(payout.releasedMinor)} of ${formatPhp(payout.totalMinor)}`
                  : `${payout.releasedCount} of ${payout.count} shares`}
              </dd>
            </>
          ) : null}
        </dl>
        {payoutsHref && payout.count > 0 ? (
          <Link
            href={`${payoutsHref}/${order.id}`}
            className="text-caption text-text-secondary mt-2 inline-block underline-offset-2 hover:underline"
          >
            Review this payout
          </Link>
        ) : null}
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

// Keep the milestone type in this module's public surface for callers that
// pass a release target through.
export type { PayoutMilestone };

// ---------------------------------------------------------------------------
// Client refund
// ---------------------------------------------------------------------------

const HANDOVER_STATES = new Set([
  "delivered",
  "issue_window_open",
  "completed",
  "payout_released",
]);

/** After handover, filing closes at the complaint deadline; late cases are Super Admin's. */
export function refundFilingLate(order: Order, now = Date.now()): boolean {
  const handedOver =
    Boolean(order.issueWindowOpenedAt) || HANDOVER_STATES.has(order.state);
  if (!handedOver) return false;
  if (order.state === "completed" || order.state === "payout_released") return true;
  if (!order.issueWindowExpiresAt) return true;
  return now >= Date.parse(order.issueWindowExpiresAt);
}

/** Money was confirmed and no request is open: a refund can be filed for the client. */
export function canFileRefund(order: Order, refunds: RefundRequest[] | null): boolean {
  if (refunds === null || order.refundHold) return false;
  if (refunds.some(refundIsActive)) return false;
  return Object.values(order.payments ?? {}).some(
    (payment) => payment?.status === "confirmed",
  );
}

function latestRefund(refunds: RefundRequest[] | null): RefundRequest | null {
  if (!refunds?.length) return null;
  const sorted = [...refunds].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return sorted.find(refundIsActive) ?? sorted[0];
}

function refundRowSummary(order: Order, refunds: RefundRequest[] | null): string {
  const latest = latestRefund(refunds);
  if (!latest) {
    if (refunds === null && order.refundHold) {
      return "A refund request is open. It could not be loaded here.";
    }
    return "No refund requested.";
  }
  const status = presentRefundStatus(latest.status).label;
  const amount = latest.payment?.amountMinor ?? latest.settlement?.totalMinor;
  return `${refundKindLabel(latest.kind)}: ${status}${
    amount !== undefined ? `, ${formatPhp(amount)}` : ""
  }.`;
}

function refundMarker(order: Order, refunds: RefundRequest[] | null): MarkerSpec {
  const latest = latestRefund(refunds);
  if (order.refundHold || (latest && refundIsActive(latest))) {
    return { icon: CircleDot, tone: "current" };
  }
  if (latest?.status === "paid") return { icon: CircleCheck, tone: "success" };
  return { icon: CircleDot, tone: "muted" };
}

function RefundHoldBanner({
  refunds,
  tree,
}: {
  refunds: RefundRequest[] | null;
  tree: "ops" | "admin";
}) {
  const active = refunds?.find(refundIsActive) ?? null;
  return (
    <div
      className="gg-card flex flex-wrap items-center justify-between gap-3 p-3"
      role="status"
    >
      <div className="min-w-0 max-w-prose">
        <p
          className="text-body text-text-primary m-0"
          style={{ fontFamily: "var(--font-medium)" }}
        >
          A client refund request is open
        </p>
        <p className="text-body text-text-secondary m-0 mt-1">
          Work and every payout on this order are paused until the refund is settled or
          rejected. Claims on the order stay separate.
        </p>
      </div>
      <Link
        href={active ? `/${tree}/refunds/${active.id}` : `/${tree}/refunds`}
        className="text-body text-text-primary inline-flex min-h-11 items-center underline-offset-2 hover:underline"
      >
        Open the refund case
      </Link>
    </div>
  );
}

function RefundRowPanel({
  order,
  refunds,
  tree,
  busy,
  onFile,
}: {
  order: Order;
  refunds: RefundRequest[] | null;
  tree: "ops" | "admin";
  busy: boolean;
  onFile: () => void;
}) {
  const sorted = [...(refunds ?? [])].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  const late = refundFilingLate(order);
  const mayFile = canFileRefund(order, refunds) && (!late || tree === "admin");
  return (
    <div className="flex flex-col gap-3">
      {refunds === null ? (
        <p className="text-body text-text-secondary m-0">
          Refund requests on this order could not be loaded. Refresh the order to try
          again.
        </p>
      ) : null}
      {sorted.length ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {sorted.map((refund) => {
            const status = presentRefundStatus(refund.status);
            const amount = refund.payment?.amountMinor ?? refund.settlement?.totalMinor;
            return (
              <li
                key={refund.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-outline-subtle px-3 py-2"
              >
                <div className="flex min-w-0 flex-col items-start gap-1">
                  <span className="text-body text-text-primary">
                    {refundKindLabel(refund.kind)}, filed{" "}
                    {formatDateTime(refund.createdAt)}
                    {amount !== undefined ? (
                      <span className="tabular-nums">, {formatPhp(amount)}</span>
                    ) : null}
                  </span>
                  <StatusChip
                    tone={status.tone}
                    label={status.label}
                    icon={status.icon}
                  />
                </div>
                <Link
                  href={`/${tree}/refunds/${refund.id}`}
                  className="text-caption text-text-secondary inline-flex min-h-11 items-center underline-offset-2 hover:underline"
                >
                  Open the refund case
                </Link>
              </li>
            );
          })}
        </ul>
      ) : refunds !== null ? (
        <p className="text-body text-text-secondary m-0">
          The client has not asked for a refund. They can from their order in the GRIDGO
          app.
        </p>
      ) : null}
      {mayFile ? (
        <div className="flex flex-col gap-2">
          <p className="text-caption text-text-muted m-0">
            If the client asked you instead, file it for them. Filing pauses work and
            payouts at once; the client still adds their own receiving QR.
          </p>
          <div>
            <Button variant="secondary" disabled={busy} onClick={onFile}>
              File a refund for the client
            </Button>
          </div>
        </div>
      ) : canFileRefund(order, refunds) && late ? (
        <p className="text-caption text-text-muted m-0">
          The complaint deadline has passed. Super Admin files and decides late refund
          cases.
        </p>
      ) : null}
    </div>
  );
}
