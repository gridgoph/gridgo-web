"use client";

/**
 * One client refund, from request to recorded transfer, for the person
 * deciding it. Operations and Super Admin mount the same case.
 *
 * The page reads as the steps the money takes: the request, the client's
 * receiving account, the settlement, the transfer. A closed step still says
 * what happened there. On the right, where the money stands, always visible:
 * what the client paid, what already went to the shop, and what is reserved
 * or paid back. Every figure is the server's; the screen never computes a
 * refund of its own.
 *
 * Contract: `gridgo-api/docs/REFUNDS_API.md`.
 */

import { useSerializedLoad } from "@/lib/live/useSerializedLoad";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ChevronLeft,
  CircleCheck,
  CircleDot,
  Lock,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

import { opsErrorMessage } from "@/app/ops/_lib/errors";
import { EvidencePlate } from "@/components/orders/EvidencePreview";
import { SettlementPayouts } from "@/components/orders/SettlementPayouts";
import {
  ApproveSettlementDialog,
  CLIENT_READS_THIS,
  Confirmation,
  ReconcileDialog,
  RecordTransferDialog,
  RejectRefundDialog,
  SettlementPayoutDialog,
  type ReconcileMode,
  type SettlementPayoutRecord,
  type TransferRecord,
} from "@/components/refunds/dialogs";
import {
  RefundDestinationView,
  SettlementLedger,
  refundProviderLabel,
} from "@/components/refunds/parts";
import { useCommandKeys, useUploadOnce } from "@/components/refunds/useCommand";
import {
  Accordion,
  AccordionContent,
  AccordionHeader,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SkeletonDetail } from "@/components/ui/loading";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { StatusChip } from "@/components/ui/StatusChip";
import { Textarea } from "@/components/ui/textarea";
import {
  getOrder,
  getRefund,
  getUser,
  isApiError,
  listClaims,
  previewRefundSettlement,
  reconcileRefundPayment,
  recordRefundPayment,
  recordSupplierSettlementPayout,
  rejectRefund,
  reserveRefundPayment,
  reviewRefund,
  settleRefund,
  uploadPayoutReceipt,
  uploadRefundReceipt,
} from "@/lib/api/client";
import { claimBlocksPayout } from "@/lib/api/constraints";
import type {
  Claim,
  Order,
  RefundPreview,
  RefundRequest,
  SettlementInput,
  SupplierSettlementPayout,
} from "@/lib/api/types";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  formatDate,
  formatDateTime,
  formatPhp,
  minorToPesosInput,
  pesosToMinor,
} from "@/lib/format";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { presentOrderState } from "@/lib/order-state";
import {
  SENDING_WALLET_PROVIDERS,
  TRANSFER_EVIDENCE_LABEL,
  canDecideRefund,
  canRecordTransfer,
  presentRefundState,
  previousRefundTotal,
  refundHistoryLabel,
  refundIsUndecided,
  refundKindLabel,
  refundNextStep,
  sumComponents,
  walletLabel,
  type RefundViewer,
} from "@/lib/refunds";
import { cn } from "@/lib/utils";
import { orderVoucher } from "@/lib/vouchers";

type Tree = "ops" | "admin";

type Loaded = {
  refund: RefundRequest;
  order: Order | null;
  claims: Claim[];
};

type StepId = "request" | "account" | "settlement" | "transfer" | "history";

const HANDOVER_STATES = new Set([
  "delivered",
  "issue_window_open",
  "completed",
  "payout_released",
]);

/** After handover a settlement completes the order; before it, it cancels it. */
export function settlementCancelsOrder(order: Order | null): boolean {
  if (!order) return true;
  if (order.refundDisposition) return order.refundDisposition === "cancelled";
  return !(order.issueWindowOpenedAt || HANDOVER_STATES.has(order.state));
}

/** Refund refusals that carry the figure the person needs next. */
export function refundErrorMessage(err: unknown, fallback: string): string {
  if (isApiError(err)) {
    const available =
      err.detail<number>("availableTotalMinor") ??
      err.detail<number>("availablePrincipalMinor");
    if (err.code === "refund_exceeds_available_funds" && typeof available === "number") {
      const which =
        err.detail("availableTotalMinor") !== undefined ? "in all" : "for the print work";
      return `At most ${formatPhp(available)} can go back ${which}. There is no override: refer anything larger to Super Admin.`;
    }
    if (err.code === "refund_stale") {
      return "Someone else changed this refund while you were reading it. It has been reloaded; check it and try again.";
    }
  }
  return opsErrorMessage(err, fallback);
}

export function RefundCase({ tree }: { tree: Tree }) {
  const { id: refundId } = useParams<{ id: string }>();
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
  const [open, setOpen] = useState<StepId[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [acting, setActing] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [dialog, setDialog] = useState<
    | { kind: "reject" }
    | { kind: "record" }
    | { kind: "reconcile"; mode: ReconcileMode }
    | { kind: "shop"; payout: SupplierSettlementPayout }
    | null
  >(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const keys = useCommandKeys();
  const uploadReceipt = useUploadOnce(uploadRefundReceipt);
  const uploadShopReceipt = useUploadOnce(uploadPayoutReceipt);

  const load = useSerializedLoad(
    useCallback(async () => {
      setLoading(true);
      setError(null);
      try {
        const refund = await getRefund(refundId);
        // The order and its claims frame the case; if either read fails the
        // refund itself still shows.
        const [order, claims] = await Promise.all([
          getOrder(refund.orderId).catch(() => null),
          listClaims({ orderId: refund.orderId }).catch(() => [] as Claim[]),
        ]);
        setData({ refund, order, claims });
      } catch (err) {
        setData(null);
        setError(opsErrorMessage(err, "That refund could not be loaded."));
      } finally {
        setLoading(false);
      }
    }, [refundId]),
  );

  // Refund events invalidate orders, payouts and claims; reload on any of them.
  useLiveReload(["orders", "payouts", "claims"], load);

  useEffect(() => {
    void load();
  }, [load]);

  const refund = data?.refund ?? null;

  // Open the step that needs someone, once; never close what a person opened.
  useEffect(() => {
    if (!refund) return;
    const current = currentStep(refund);
    setOpen((existing) => {
      // While undecided, the request itself is read alongside the review.
      if (existing === null) {
        return refundIsUndecided(refund) && current !== "request"
          ? ["request", current]
          : [current];
      }
      return existing.includes(current) ? existing : [...existing, current];
    });
  }, [refund]);

  const people = useMemo(() => {
    if (!refund) return "";
    const ids = new Set<string>();
    if (refund.attempt?.payerId) ids.add(refund.attempt.payerId);
    if (refund.settlement?.createdBy) ids.add(refund.settlement.createdBy);
    if (refund.payment?.recordedBy) ids.add(refund.payment.recordedBy);
    return [...ids].sort().join(",");
  }, [refund]);

  useEffect(() => {
    const missing = people.split(",").filter((id) => id && !(id in names));
    if (!missing.length) return;
    let cancelled = false;
    void Promise.all(
      missing.map((id) =>
        getUser(id).then(
          (found) => [id, found.name] as const,
          () => [id, ""] as const,
        ),
      ),
    ).then((found) => {
      if (!cancelled)
        setNames((current) => ({ ...current, ...Object.fromEntries(found) }));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people]);

  const nameOf = (id: string | null | undefined, fallback: string) => {
    if (!id) return fallback;
    if (id === viewer.userId) return "you";
    return names[id] || fallback;
  };

  /** Run one refund command; a stale version reloads so the person sees why. */
  async function act(
    label: string,
    command: () => Promise<RefundRequest>,
    success: string,
    inDialog = false,
  ): Promise<boolean> {
    setActing(label);
    setActionError(null);
    setDialogError(null);
    setDone(null);
    try {
      const next = await command();
      setData((current) => (current ? { ...current, refund: next } : current));
      setDone(success);
      keys.reset();
      void load();
      return true;
    } catch (err) {
      const message = refundErrorMessage(
        err,
        "That did not go through. Reload the refund and try again.",
      );
      if (inDialog) setDialogError(message);
      else setActionError(message);
      if (
        isApiError(err) &&
        (err.code === "refund_stale" || err.code === "refund_state_conflict")
      ) {
        void load();
      }
      return false;
    } finally {
      setActing(null);
    }
  }

  if (loading && !data) return <SkeletonDetail label="Loading this refund…" />;
  if (error || !data || !refund) {
    return (
      <ErrorState
        body={error ?? "That refund could not be found."}
        action={
          <Button variant="secondary" onClick={() => void load()}>
            Retry
          </Button>
        }
      />
    );
  }

  const { order, claims } = data;
  const status = presentRefundState(refund);
  const decides = canDecideRefund(refund, viewer);
  const busy = acting !== null;
  const openClaims = claims.filter(
    (claim) => claim.status === "open" || claimBlocksPayout(claim.status),
  );
  const title = order?.title || "Untitled order";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/${tree}/refunds`}
            className="text-caption text-text-muted inline-flex min-h-11 items-center gap-1 hover:text-text-secondary"
          >
            <ChevronLeft size={14} strokeWidth={2} aria-hidden />
            Back to refunds
          </Link>
          <h1 className="text-h2 text-text-primary m-0 truncate">Refund on {title}</h1>
          <p className="text-body text-text-secondary m-0 mt-1">
            {refundKindLabel(refund.kind)} filed {formatDateTime(refund.createdAt)}
          </p>
        </div>
        <StatusChip tone={status.tone} label={status.label} icon={status.icon} />
      </div>

      <NextStepPanel refund={refund} viewer={viewer} />

      {refund.late ? (
        <div className="rounded-card border border-warning px-4 py-3" role="note">
          <p
            className="text-body text-text-primary m-0"
            style={{ fontFamily: "var(--font-medium)" }}
          >
            Filed after the complaint deadline
            {refund.filingDeadlineAt
              ? ` (${formatDateTime(refund.filingDeadlineAt)})`
              : ""}
          </p>
          <p className="text-body text-text-secondary m-0 mt-1">
            {viewer.role === "super_admin"
              ? "You decide this one. The same limit applies as for any refund: only money GRIDGO still holds can go back, with no override."
              : "Super Admin reviews, settles or rejects late cases. You can read it here; the payment steps after approval are open to Operations as usual."}
          </p>
        </div>
      ) : null}

      {done ? (
        <p className="text-body text-success m-0" role="status">
          {done}
        </p>
      ) : null}
      {actionError ? (
        <p className="text-body text-error m-0" role="alert">
          {actionError}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Accordion
          multiple
          value={open ?? []}
          onValueChange={(value) => setOpen(value as StepId[])}
          className="gg-card-flush self-start"
        >
          <Step
            id="request"
            heading="Request"
            summary={requestSummary(refund)}
            marker={stepMarker(refund, "request")}
          >
            <RequestPanel
              refund={refund}
              canReject={decides && refundIsUndecided(refund)}
              busy={busy}
              onReject={() => {
                setDialogError(null);
                setDialog({ kind: "reject" });
              }}
            />
          </Step>

          <Step
            id="account"
            heading="Client's receiving account"
            summary={accountSummary(refund)}
            marker={stepMarker(refund, "account")}
          >
            <AccountPanel
              refund={refund}
              decides={decides}
              busy={busy}
              onReview={(input) =>
                act(
                  "review",
                  () =>
                    reviewRefund(
                      refund,
                      input,
                      keys.keyFor({ review: refund.version, ...input }),
                    ),
                  refund.status === "destination_review"
                    ? "New receiving QR verified. The approved refund can be paid."
                    : "Marked reviewed. Settle the refund next.",
                )
              }
            />
          </Step>

          <Step
            id="settlement"
            heading="Settlement"
            summary={settlementSummary(refund)}
            marker={stepMarker(refund, "settlement")}
          >
            {refund.settlement ? (
              <SettlementRecord
                refund={refund}
                approvedBy={nameOf(refund.settlement.createdBy, "Operations")}
                claims={openClaims}
                order={order}
                busy={busy}
                releasing={acting?.startsWith("shop-") ? acting.slice(5) : null}
                onReleaseShop={(payout) => {
                  setDialogError(null);
                  setDialog({ kind: "shop", payout });
                }}
              />
            ) : refund.status === "reviewed" && decides ? (
              <SettlementForm
                refund={refund}
                order={order}
                busy={busy}
                error={dialogError}
                onApprove={(input) =>
                  act(
                    "settle",
                    () =>
                      settleRefund(
                        refund,
                        input,
                        keys.keyFor({ settle: refund.version, ...input }),
                      ),
                    `Approved ${formatPhp(input.totalMinor)}. No money has been sent yet.`,
                    true,
                  )
                }
              />
            ) : (
              <p className="text-body text-text-secondary m-0">
                {refund.status === "requested"
                  ? "The settlement opens once the request and the client's receiving account are reviewed."
                  : refund.status === "reviewed"
                    ? "Super Admin settles this late case."
                    : "No settlement was approved."}
              </p>
            )}
          </Step>

          <Step
            id="transfer"
            heading="Transfer to the client"
            summary={transferSummary(refund, nameOf)}
            marker={stepMarker(refund, "transfer")}
          >
            <TransferPanel
              refund={refund}
              viewer={viewer}
              busy={busy}
              nameOf={nameOf}
              onReserve={(input) =>
                act(
                  "reserve",
                  () =>
                    reserveRefundPayment(
                      refund,
                      input,
                      keys.keyFor({ reserve: refund.version, ...input }),
                    ),
                  "Reserved for you. Send the exact amount, then record it.",
                )
              }
              onRecord={() => {
                setDialogError(null);
                setDialog({ kind: "record" });
              }}
              onReconcile={(mode) => {
                setDialogError(null);
                setDialog({ kind: "reconcile", mode });
              }}
            />
          </Step>

          <Step
            id="history"
            heading="History"
            summary={
              refund.history.length
                ? `${refund.history.length} ${refund.history.length === 1 ? "event" : "events"}, last ${formatDateTime(refund.history[refund.history.length - 1].at)}.`
                : "Nothing recorded yet."
            }
            marker={{ icon: CircleDot, tone: "muted" }}
          >
            <ol className="m-0 flex list-none flex-col gap-3 p-0">
              {refund.history.map((entry, index) => (
                <li key={`${entry.kind}-${index}`} className="flex flex-col gap-0.5">
                  <span className="text-body text-text-primary">
                    {refundHistoryLabel(entry)}
                    {entry.kind === "supplier_paid" ? (
                      <span className="text-caption text-text-muted"> (staff only)</span>
                    ) : null}
                  </span>
                  <span className="text-caption text-text-muted">
                    {formatDateTime(entry.at)}
                  </span>
                  {entry.reason ? (
                    <span className="text-body text-text-secondary">
                      &ldquo;{entry.reason}&rdquo;
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
          </Step>
        </Accordion>

        <aside
          className="flex flex-col gap-3 lg:sticky lg:top-4 lg:self-start"
          aria-label="Refund details"
        >
          <MoneyCard refund={refund} />
          <OrderCard refund={refund} order={order} tree={tree} />
          <ClaimsCard claims={openClaims} tree={tree} />
        </aside>
      </div>

      <RejectRefundDialog
        open={dialog?.kind === "reject"}
        busy={acting === "reject"}
        error={dialogError}
        onCancel={() => setDialog(null)}
        onReject={async (reason) => {
          const ok = await act(
            "reject",
            () =>
              rejectRefund(
                refund,
                reason,
                keys.keyFor({ reject: refund.version, reason }),
              ),
            "Rejected. The client has your reason, and the order's work and payouts resume.",
            true,
          );
          if (ok) setDialog(null);
        }}
      />

      <RecordTransferDialog
        open={dialog?.kind === "record"}
        attempt={refund.attempt ?? null}
        unconfirmed={refund.status === "payment_unknown"}
        busy={acting === "record"}
        error={dialogError}
        onCancel={() => setDialog(null)}
        onRecord={async (record: TransferRecord) => {
          const attempt = refund.attempt;
          if (!attempt) return;
          const ok = await act(
            "record",
            async () => {
              const receiptFileId = await uploadReceipt(record.evidence);
              const input = {
                reason: record.reason,
                attemptId: attempt.id,
                amountMinor: attempt.amountMinor,
                reference: record.reference,
                receiptFileId,
                paidAt: record.paidAt,
              };
              return recordRefundPayment(
                refund,
                input,
                keys.keyFor({ pay: refund.version, ...input }),
              );
            },
            `Recorded. ${formatPhp(attempt.amountMinor)} is on record as paid to the client.`,
            true,
          );
          if (ok) setDialog(null);
        }}
      />

      <ReconcileDialog
        mode={dialog?.kind === "reconcile" ? dialog.mode : null}
        busy={acting === "reconcile"}
        error={dialogError}
        onCancel={() => setDialog(null)}
        onReconcile={async (reason) => {
          if (dialog?.kind !== "reconcile") return;
          const input =
            dialog.mode === "failed"
              ? ({ reason, outcome: "failed", noTransferConfirmed: true } as const)
              : ({ reason, outcome: "unknown" } as const);
          const ok = await act(
            "reconcile",
            () =>
              reconcileRefundPayment(
                refund,
                input,
                keys.keyFor({ reconcile: refund.version, ...input }),
              ),
            dialog.mode === "failed"
              ? "No transfer happened. The refund can be reserved and sent again."
              : "Marked unconfirmed. Nobody can send again until the wallet history settles it.",
            true,
          );
          if (ok) setDialog(null);
        }}
      />

      <SettlementPayoutDialog
        payout={dialog?.kind === "shop" ? dialog.payout : null}
        account={refund.supplierPayoutAccount ?? null}
        busy={acting?.startsWith("shop-") ?? false}
        error={dialogError}
        onCancel={() => setDialog(null)}
        onRecord={async (record: SettlementPayoutRecord) => {
          if (dialog?.kind !== "shop") return;
          const { payout } = dialog;
          const account = refund.supplierPayoutAccount;
          if (!account) return;
          const ok = await act(
            `shop-${payout.id}`,
            async () => {
              const receiptFileId = await uploadShopReceipt(record.receipt);
              const input = {
                reason: record.reason,
                amountMinor: payout.amountMinor,
                payoutAccountVersion: account.version,
                destinationVerified: true as const,
                reference: record.reference,
                receiptFileId,
              };
              return recordSupplierSettlementPayout(
                refund,
                input,
                keys.keyFor({ shop: refund.version, ...input }),
              );
            },
            `Recorded ${formatPhp(payout.amountMinor)} to the shop.`,
            true,
          );
          if (ok) setDialog(null);
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header pieces
// ---------------------------------------------------------------------------

function NextStepPanel({
  refund,
  viewer,
}: {
  refund: RefundRequest;
  viewer: RefundViewer;
}) {
  const warning = refund.status === "payment_unknown";
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-card border px-4 py-3",
        warning ? "border-error" : "border-outline",
      )}
      role={warning ? "alert" : "note"}
    >
      {warning ? (
        <TriangleAlert
          size={20}
          strokeWidth={2}
          className="text-error mt-0.5 shrink-0"
          aria-hidden
        />
      ) : (
        <CircleDot
          size={20}
          strokeWidth={2}
          className="text-text-secondary mt-0.5 shrink-0"
          aria-hidden
        />
      )}
      <p className="text-body text-text-primary m-0 max-w-prose">
        {refundNextStep(refund, viewer)}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

type MarkerSpec = { icon: LucideIcon; tone: "success" | "current" | "muted" };

function currentStep(refund: RefundRequest): StepId {
  switch (refund.status) {
    case "requested":
      return refund.destination ? "account" : "request";
    case "destination_review":
      return "account";
    case "reviewed":
      return "settlement";
    case "approved":
    case "payment_in_progress":
    case "payment_unknown":
    case "paid":
      return "transfer";
    default:
      return "request";
  }
}

const ORDER: StepId[] = ["request", "account", "settlement", "transfer"];

function stepMarker(refund: RefundRequest, step: StepId): MarkerSpec {
  if (refund.status === "rejected" || refund.status === "withdrawn") {
    return step === "request"
      ? { icon: CircleCheck, tone: "success" }
      : { icon: Lock, tone: "muted" };
  }
  if (refund.status === "paid") return { icon: CircleCheck, tone: "success" };
  const current = currentStep(refund);
  const here = ORDER.indexOf(current);
  const index = ORDER.indexOf(step);
  if (index < here) return { icon: CircleCheck, tone: "success" };
  if (index === here) return { icon: CircleDot, tone: "current" };
  return { icon: Lock, tone: "muted" };
}

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

function Step({
  id,
  heading,
  summary,
  marker,
  children,
}: {
  id: StepId;
  heading: string;
  summary: string;
  marker: MarkerSpec;
  children: React.ReactNode;
}) {
  return (
    <AccordionItem
      value={id}
      render={<section aria-current={marker.tone === "current" ? "step" : undefined} />}
    >
      <AccordionHeader render={<h2 className="m-0 flex text-h3" />}>
        <AccordionTrigger
          className={cn(marker.tone === "current" && "bg-surface-variant/40")}
        >
          <Marker {...marker} />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-h3 text-text-primary">{heading}</span>
            <span className="text-body text-text-secondary">{summary}</span>
          </span>
        </AccordionTrigger>
      </AccordionHeader>
      <AccordionContent>
        <div className="sm:pl-9">{children}</div>
      </AccordionContent>
    </AccordionItem>
  );
}

function requestSummary(refund: RefundRequest): string {
  const base = `${refundKindLabel(refund.kind)}, ${formatDate(refund.createdAt)}`;
  if (refund.status === "rejected") return `${base}. Rejected.`;
  if (refund.status === "withdrawn") return `${base}. Withdrawn by the client.`;
  return refund.beforeProduction
    ? `${base}, before production.`
    : `${base}, after production started.`;
}

function accountSummary(refund: RefundRequest): string {
  const d = refund.destination;
  if (!d) return "Waiting on the client to add their receiving QR.";
  const words = `${refundProviderLabel(d.provider)}, ${d.accountName}, revision ${d.revision}`;
  if (refund.status === "destination_review") return `${words}. New, not yet verified.`;
  if (refund.status === "requested") return `${words}. Not yet verified.`;
  return `${words}.`;
}

function settlementSummary(refund: RefundRequest): string {
  const s = refund.settlement;
  if (!s) {
    if (refund.status === "reviewed") return "Reviewed. Ready to preview and approve.";
    if (refund.status === "rejected" || refund.status === "withdrawn")
      return "Not settled.";
    return "Not settled yet.";
  }
  const when = s.approvedAt ?? s.createdAt;
  return `${formatPhp(s.totalMinor)} approved${when ? ` ${formatDate(when)}` : ""}.`;
}

function transferSummary(
  refund: RefundRequest,
  nameOf: (id: string | null | undefined, fallback: string) => string,
): string {
  switch (refund.status) {
    case "approved":
      return "Approved. No money sent yet.";
    case "destination_review":
      return "Waiting on the new receiving QR to be verified.";
    case "payment_in_progress":
      return `Reserved by ${nameOf(refund.attempt?.payerId, "another payer")}. Not recorded yet.`;
    case "payment_unknown":
      return "Unconfirmed. Do not send again.";
    case "paid":
      return refund.payment
        ? `${formatPhp(refund.payment.amountMinor)} sent ${formatDate(refund.payment.paidAt)}, reference ${refund.payment.reference}.`
        : "Paid.";
    default:
      return "Nothing to pay until a settlement is approved.";
  }
}

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------

function RequestPanel({
  refund,
  canReject,
  busy,
  onReject,
}: {
  refund: RefundRequest;
  canReject: boolean;
  busy: boolean;
  onReject: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <blockquote className="m-0 border-l-2 border-outline pl-3">
        <p className="text-body text-text-primary m-0 whitespace-pre-line">
          {refund.reason}
        </p>
      </blockquote>
      <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
        <dt className="text-caption text-text-muted">Asked for</dt>
        <dd className="m-0 text-body text-text-secondary">
          {refundKindLabel(refund.kind)}
        </dd>
        <dt className="text-caption text-text-muted">Filed</dt>
        <dd className="m-0 text-body text-text-secondary">
          {formatDateTime(refund.createdAt)}
        </dd>
        <dt className="text-caption text-text-muted">Timing</dt>
        <dd className="m-0 text-body text-text-secondary">
          {refund.beforeProduction
            ? "Before production: all verified money goes back, and the shop and rider are owed nothing."
            : "After production started: what goes back depends on what the shop and rider keep."}
        </dd>
        {refund.filingDeadlineAt ? (
          <>
            <dt className="text-caption text-text-muted">Complaint deadline</dt>
            <dd className="m-0 text-body text-text-secondary">
              {formatDateTime(refund.filingDeadlineAt)}
              {refund.late ? ", filed after it" : ", filed in time"}
            </dd>
          </>
        ) : null}
      </dl>
      {refund.evidenceFileIds.length ? (
        <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2">
          {refund.evidenceFileIds.map((fileId, index) => (
            <li key={fileId} className="min-w-0">
              <EvidencePlate
                fileId={fileId}
                label={
                  refund.evidenceFileIds.length > 1
                    ? `Evidence ${index + 1} of ${refund.evidenceFileIds.length}`
                    : "Evidence"
                }
                deletable
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-caption text-text-muted m-0">No evidence attached.</p>
      )}
      {canReject ? (
        <div>
          <Button variant="destructive" disabled={busy} onClick={onReject}>
            Reject with a reason
          </Button>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Receiving account and review
// ---------------------------------------------------------------------------

function AccountPanel({
  refund,
  decides,
  busy,
  onReview,
}: {
  refund: RefundRequest;
  decides: boolean;
  busy: boolean;
  onReview: (input: {
    reason: string;
    destinationVerified: true;
    substantiated?: boolean;
  }) => void;
}) {
  const reviewing =
    refund.status === "requested" || refund.status === "destination_review";
  const replaced = refund.status === "destination_review";
  const complaint = refund.kind === "complaint" && !replaced;
  const [verified, setVerified] = useState(false);
  const [substantiated, setSubstantiated] = useState(false);
  const [reason, setReason] = useState("");

  useEffect(() => {
    setVerified(false);
    setSubstantiated(false);
    setReason(
      replaced
        ? "Your new receiving account was checked."
        : complaint
          ? "Your evidence was reviewed and your receiving account checked."
          : "Your request and receiving account were checked.",
    );
  }, [refund.version, replaced, complaint]);

  if (!refund.destination) {
    return (
      <p className="text-body text-text-secondary m-0">
        The client has not added a receiving QR yet. Only they can, in the GRIDGO app, and
        it cannot be reviewed before that. The request stays open meanwhile, holding work
        and payouts.
      </p>
    );
  }

  const ready = verified && reason.trim().length > 0 && (!complaint || substantiated);

  return (
    <div className="flex flex-col gap-4">
      {replaced ? (
        <p className="text-body text-text-primary m-0 rounded-card border border-warning px-3 py-2">
          The client replaced their receiving QR after approval. Nobody can pay until the
          new one is verified.
        </p>
      ) : null}
      <RefundDestinationView destination={refund.destination} />
      {reviewing && decides ? (
        <FieldGroup>
          <div className="flex flex-col gap-1">
            <Confirmation
              id="destination-verified"
              checked={verified}
              onChange={setVerified}
              disabled={busy}
            >
              I scanned this QR in a wallet app and it named{" "}
              <span style={{ fontFamily: "var(--font-medium)" }}>
                {refund.destination.accountName}
              </span>
              .
            </Confirmation>
            {complaint ? (
              <Confirmation
                id="complaint-substantiated"
                checked={substantiated}
                onChange={setSubstantiated}
                disabled={busy}
              >
                The evidence substantiates the complaint. If it does not, reject the
                request with a reason instead.
              </Confirmation>
            ) : null}
          </div>
          <Field>
            <FieldLabel htmlFor="review-reason">Note for the client</FieldLabel>
            <Textarea
              id="review-reason"
              rows={2}
              maxLength={2000}
              value={reason}
              disabled={busy}
              onChange={(event) => setReason(event.target.value)}
            />
            <FieldDescription>{CLIENT_READS_THIS}</FieldDescription>
          </Field>
          <div>
            <Button
              variant="primary"
              disabled={busy || !ready}
              onClick={() =>
                onReview({
                  reason: reason.trim(),
                  destinationVerified: true,
                  ...(refund.kind === "complaint" ? { substantiated: true } : {}),
                })
              }
            >
              {busy ? "Saving…" : replaced ? "Verify the new QR" : "Mark reviewed"}
            </Button>
          </div>
        </FieldGroup>
      ) : reviewing ? (
        <p className="text-caption text-text-muted m-0">
          Super Admin verifies this late case.
        </p>
      ) : (
        <p className="text-caption text-text-muted m-0">
          Verified against revision {refund.destination.revision}. A replaced QR must be
          verified again before anyone pays.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settlement: preview, then record
// ---------------------------------------------------------------------------

function SettlementForm({
  refund,
  order,
  busy,
  error,
  onApprove,
}: {
  refund: RefundRequest;
  order: Order | null;
  busy: boolean;
  error: string | null;
  onApprove: (
    input: SettlementInput & {
      totalMinor: number;
      reason: string;
      workStopped: true;
      shopAgreement: string;
      deliveryEvidence: string;
      clientCaused?: boolean;
    },
  ) => Promise<boolean>;
}) {
  const early = refund.beforeProduction;
  // A GRIDGO-funded voucher on the order: staff decide whose fault the refund
  // is, because a no-fault refund gives the client the voucher back.
  const hasVoucher = Boolean(order && orderVoucher(order));
  const released = refund.releasedShopMinor ?? 0;
  const directStore =
    (order as (Order & { directStoreDueMinor?: number }) | null)?.directStoreDueMinor ??
    0;
  const [shop, setShop] = useState(() => minorToPesosInput(early ? 0 : released));
  const [rider, setRider] = useState(() => minorToPesosInput(0));
  const [principal, setPrincipal] = useState("");
  const [preview, setPreview] = useState<{
    signature: string;
    result: RefundPreview;
    input: SettlementInput;
  } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [agreement, setAgreement] = useState(
    early ? "Filed before production. The shop keeps nothing and is owed nothing." : "",
  );
  const [deliveryNote, setDeliveryNote] = useState("");
  const [reason, setReason] = useState("");
  const [stopped, setStopped] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [fault, setFault] = useState<"client" | "not_client" | null>(null);

  const shopMinor = early ? 0 : pesosToMinor(shop);
  const riderMinor = early ? 0 : pesosToMinor(rider);
  const principalMinor = principal.trim() ? pesosToMinor(principal) : undefined;
  const inputValid = shopMinor !== null && riderMinor !== null && principalMinor !== null;
  const input: SettlementInput | null = inputValid
    ? {
        shopEntitlementMinor: shopMinor as number,
        riderEntitlementMinor: riderMinor as number,
        ...(principalMinor !== undefined ? { principalMinor } : {}),
        ...(directStore > 0 ? { directStoreCollectedMinor: 0 as const } : {}),
      }
    : null;
  const signature = JSON.stringify({ input, version: refund.version });
  const current = preview && preview.signature === signature ? preview : null;
  const stale = preview !== null && current === null;

  async function runPreview() {
    if (!input) return;
    setPreviewing(true);
    setPreviewError(null);
    try {
      const result = await previewRefundSettlement(refund, input);
      setPreview({ signature, result, input });
    } catch (err) {
      setPreview(null);
      setPreviewError(
        refundErrorMessage(err, "The preview could not be calculated. Try again."),
      );
    } finally {
      setPreviewing(false);
    }
  }

  const amounts = current?.result.amounts;
  const ready =
    Boolean(current?.result.canSettle) &&
    stopped &&
    agreement.trim().length > 0 &&
    deliveryNote.trim().length > 0 &&
    reason.trim().length > 0 &&
    (!hasVoucher || fault !== null);

  return (
    <div className="flex flex-col gap-4">
      <FieldGroup>
        {early ? (
          <p className="text-body text-text-secondary m-0">
            Filed before production, so every verified peso goes back: the shop and the
            rider are owed nothing. Preview the full refund, then approve it.
          </p>
        ) : (
          <>
            <Field>
              <FieldLabel htmlFor="shop-entitlement">
                What the shop keeps in all (₱)
              </FieldLabel>
              <Input
                id="shop-entitlement"
                inputMode="decimal"
                value={shop}
                disabled={busy}
                aria-invalid={shopMinor === null ? true : undefined}
                onChange={(event) => setShop(event.target.value)}
              />
              <FieldDescription>
                The shop&rsquo;s agreed final amount for this order, including the{" "}
                {formatPhp(released)} it has already been paid. It cannot be less than
                that.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="rider-entitlement">
                What the rider earned (₱)
              </FieldLabel>
              <Input
                id="rider-entitlement"
                inputMode="decimal"
                value={rider}
                disabled={busy}
                aria-invalid={riderMinor === null ? true : undefined}
                onChange={(event) => setRider(event.target.value)}
              />
              <FieldDescription>
                0 when no trip started. A completed delivery keeps the rider&rsquo;s share
                {order?.riderPayoutMinor !== undefined
                  ? ` (${formatPhp(order.riderPayoutMinor)})`
                  : ""}
                .
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="principal">
                Print work to refund (₱, optional)
              </FieldLabel>
              <Input
                id="principal"
                inputMode="decimal"
                value={principal}
                disabled={busy}
                placeholder="Leave empty for the most available"
                aria-invalid={principalMinor === null ? true : undefined}
                onChange={(event) => setPrincipal(event.target.value)}
              />
              <FieldDescription>
                For a partial refund. The service fee on it and any unused delivery are
                added by the server.
              </FieldDescription>
            </Field>
          </>
        )}
        {directStore > 0 ? (
          <p className="text-caption text-text-muted m-0">
            This order had a direct-store part. The preview assumes the shop collected
            nothing directly; if it did, stop and refer the case to Super Admin.
          </p>
        ) : null}
        <div>
          <Button
            variant="secondary"
            disabled={busy || previewing || !input}
            onClick={() => void runPreview()}
          >
            {previewing
              ? "Calculating…"
              : current
                ? "Preview again"
                : "Preview the refund"}
          </Button>
        </div>
        {previewError ? (
          <p className="text-body text-error m-0" role="alert">
            {previewError}
          </p>
        ) : null}
      </FieldGroup>

      {stale ? (
        <p className="text-body text-text-secondary m-0" role="status">
          The figures changed. Preview again before approving.
        </p>
      ) : null}

      {current && amounts ? (
        <section
          aria-labelledby="settlement-preview-heading"
          className="flex flex-col gap-3"
        >
          <h3
            id="settlement-preview-heading"
            className="text-body text-text-primary m-0"
            style={{ fontFamily: "var(--font-medium)" }}
          >
            The server&rsquo;s calculation
          </h3>
          <SettlementLedger amounts={amounts} />
          {current.result.availableTotalMinor > amounts.totalMinor ? (
            <p className="text-caption text-text-muted m-0">
              Up to {formatPhp(current.result.availableTotalMinor)} could go back with
              these obligations. This is a partial refund.
            </p>
          ) : null}
          {!current.result.canSettle ? (
            <p
              className="text-body text-text-primary m-0 rounded-card border border-warning px-3 py-2"
              role="status"
            >
              No money is left to return with these figures. There is no override. Refer
              the client&rsquo;s remedy to Super Admin.
            </p>
          ) : (
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="shop-agreement">
                  The shop&rsquo;s agreement
                </FieldLabel>
                <Textarea
                  id="shop-agreement"
                  rows={2}
                  maxLength={2000}
                  value={agreement}
                  disabled={busy}
                  placeholder={`e.g. The shop keeps ${formatPhp(amounts.shopEntitlementMinor)} and waives the rest.`}
                  onChange={(event) => setAgreement(event.target.value)}
                />
                <FieldDescription>
                  Who agreed, and how. Operations and Super Admin only.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="delivery-evidence">
                  Delivery and the rider
                </FieldLabel>
                <Textarea
                  id="delivery-evidence"
                  rows={2}
                  maxLength={2000}
                  value={deliveryNote}
                  disabled={busy}
                  placeholder="e.g. No trip started; no rider earnings."
                  onChange={(event) => setDeliveryNote(event.target.value)}
                />
                <FieldDescription>
                  What happened on the road. Operations and Super Admin only.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="decision-reason">Decision for the client</FieldLabel>
                <Textarea
                  id="decision-reason"
                  rows={3}
                  maxLength={2000}
                  value={reason}
                  disabled={busy}
                  placeholder="e.g. You get back the print work not done, its service fee, and the unused delivery."
                  onChange={(event) => setReason(event.target.value)}
                />
                <FieldDescription>
                  {CLIENT_READS_THIS} Explain what comes back and what does not.
                </FieldDescription>
              </Field>
              {hasVoucher ? (
                <VoucherFaultField value={fault} onChange={setFault} disabled={busy} />
              ) : null}
              <Confirmation
                id="work-stopped"
                checked={stopped}
                onChange={setStopped}
                disabled={busy}
              >
                Production and delivery have stopped for this order.
              </Confirmation>
              <div>
                <Button
                  variant="primary"
                  disabled={busy || !ready}
                  onClick={() => setConfirming(true)}
                >
                  Approve {formatPhp(amounts.totalMinor)} refund
                </Button>
              </div>
            </FieldGroup>
          )}
        </section>
      ) : null}

      <ApproveSettlementDialog
        open={confirming && Boolean(current)}
        totalMinor={amounts?.totalMinor ?? 0}
        remainingShopMinor={amounts?.remainingShopMinor ?? 0}
        cancelsOrder={settlementCancelsOrder(order)}
        busy={busy}
        error={error}
        onCancel={() => setConfirming(false)}
        onApprove={async () => {
          if (!current || !amounts) return;
          const ok = await onApprove({
            ...current.input,
            totalMinor: amounts.totalMinor,
            reason: reason.trim(),
            workStopped: true,
            shopAgreement: agreement.trim(),
            deliveryEvidence: deliveryNote.trim(),
            ...(hasVoucher ? { clientCaused: fault === "client" } : {}),
          });
          if (ok) setConfirming(false);
        }}
      />
    </div>
  );
}

/**
 * Whose fault the refund is, asked only on a voucher order. The API needs the
 * answer (`400 voucher_refund_fault_required`); the client cannot give it.
 */
function VoucherFaultField({
  value,
  onChange,
  disabled,
}: {
  value: "client" | "not_client" | null;
  onChange: (value: "client" | "not_client") => void;
  disabled: boolean;
}) {
  const options = [
    {
      value: "not_client" as const,
      label: "Not the client's fault",
      body: "The client gets the voucher back once the refund is sent, if it has not expired.",
    },
    {
      value: "client" as const,
      label: "The client's fault",
      body: "The voucher stays used. It is never paid out as cash either way.",
    },
  ];
  return (
    <Field>
      <FieldLabel id="voucher-fault-label">This order used a GRIDGO voucher</FieldLabel>
      <FieldDescription>
        Whose fault is this refund? Staff only; the client does not see this answer.
      </FieldDescription>
      <RadioGroup
        aria-labelledby="voucher-fault-label"
        value={value ?? ""}
        onValueChange={(next) => onChange(next as "client" | "not_client")}
        disabled={disabled}
        className="gap-1"
      >
        {options.map((option) => (
          <label key={option.value} className="flex min-h-11 cursor-pointer items-start gap-2 py-1">
            <RadioGroupItem
              value={option.value}
              aria-labelledby={`voucher-fault-${option.value}`}
              aria-describedby={`voucher-fault-${option.value}-body`}
              className="mt-1"
            />
            <span className="flex flex-col">
              <span id={`voucher-fault-${option.value}`} className="text-body text-text-primary">
                {option.label}
              </span>
              <span id={`voucher-fault-${option.value}-body`} className="text-caption text-text-muted">
                {option.body}
              </span>
            </span>
          </label>
        ))}
      </RadioGroup>
    </Field>
  );
}

function SettlementRecord({
  refund,
  approvedBy,
  claims,
  order,
  busy,
  releasing,
  onReleaseShop,
}: {
  refund: RefundRequest;
  approvedBy: string;
  claims: Claim[];
  order: Order | null;
  busy: boolean;
  releasing: string | null;
  onReleaseShop: (payout: SupplierSettlementPayout) => void;
}) {
  const settlement = refund.settlement!;
  const payouts = refund.supplierSettlementPayouts ?? [];
  return (
    <div className="flex flex-col gap-4">
      {settlement.snapshot ? (
        <SettlementLedger
          amounts={settlement.snapshot}
          caption="What the approved refund is made of"
        />
      ) : null}
      <dl className="m-0 grid grid-cols-1 gap-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-x-4">
        <dt className="text-caption text-text-muted">Approved</dt>
        <dd className="m-0 text-body text-text-secondary">
          {formatDateTime(settlement.approvedAt ?? settlement.createdAt)} by {approvedBy}.{" "}
          {settlement.disposition === "cancelled"
            ? "The order was cancelled."
            : "The order closed as delivered, with this refund."}
        </dd>
        <dt className="text-caption text-text-muted">Decision for the client</dt>
        <dd className="m-0 text-body text-text-primary">
          &ldquo;{settlement.reason}&rdquo;
        </dd>
        {settlement.shopAgreement ? (
          <>
            <dt className="text-caption text-text-muted">
              Shop&rsquo;s agreement (staff only)
            </dt>
            <dd className="m-0 text-body text-text-secondary">
              {settlement.shopAgreement}
            </dd>
          </>
        ) : null}
        {typeof settlement.snapshot?.clientCaused === "boolean" ? (
          <>
            <dt className="text-caption text-text-muted">Voucher (staff only)</dt>
            <dd className="m-0 text-body text-text-secondary">
              {settlement.snapshot.clientCaused
                ? "Recorded as the client's fault: the voucher stays used."
                : "Recorded as not the client's fault: the voucher goes back to the client once the refund is sent, if it has not expired."}
            </dd>
          </>
        ) : null}
        {settlement.deliveryEvidence ? (
          <>
            <dt className="text-caption text-text-muted">
              Delivery and rider (staff only)
            </dt>
            <dd className="m-0 text-body text-text-secondary">
              {settlement.deliveryEvidence}
            </dd>
          </>
        ) : null}
      </dl>
      {payouts.length ? (
        <SettlementPayouts
          order={{ payoutHold: order?.payoutHold, supplierSettlementPayouts: payouts }}
          holds={claims.filter((claim) => claimBlocksPayout(claim.status))}
          onRelease={busy ? undefined : onReleaseShop}
          releasing={releasing}
        />
      ) : (
        <p className="text-caption text-text-muted m-0">
          The shop is owed nothing more on this order.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Transfer to the client
// ---------------------------------------------------------------------------

function TransferPanel({
  refund,
  viewer,
  busy,
  nameOf,
  onReserve,
  onRecord,
  onReconcile,
}: {
  refund: RefundRequest;
  viewer: RefundViewer;
  busy: boolean;
  nameOf: (id: string | null | undefined, fallback: string) => string;
  onReserve: (input: {
    reason: string;
    destinationRevision: number;
    destinationVerified: true;
    provider: string;
    sourceWallet: string;
  }) => void;
  onRecord: () => void;
  onReconcile: (mode: ReconcileMode) => void;
}) {
  const [provider, setProvider] = useState("gcash");
  const [wallet, setWallet] = useState("");
  const [verified, setVerified] = useState(false);
  const [reason, setReason] = useState("Your refund transfer is being sent.");

  useEffect(() => {
    setVerified(false);
  }, [refund.version]);

  const settlement = refund.settlement;
  const attempt = refund.attempt ?? null;
  const payment = refund.payment;

  if (refund.status === "paid" && payment) {
    return (
      <div className="flex flex-col gap-3">
        <p
          className="text-h3 text-text-primary m-0 tabular-nums"
          style={{ fontFamily: "var(--font-bold)" }}
        >
          {formatPhp(payment.amountMinor)} sent
        </p>
        <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
          <dt className="text-caption text-text-muted">Sent at</dt>
          <dd className="m-0 text-body text-text-secondary">
            {formatDateTime(payment.paidAt)}
          </dd>
          <dt className="text-caption text-text-muted">Reference</dt>
          <dd className="m-0 text-body text-text-primary tabular-nums">
            {payment.reference}
          </dd>
          {payment.provider ? (
            <>
              <dt className="text-caption text-text-muted">From</dt>
              <dd className="m-0 text-body text-text-secondary">
                {walletLabel(payment.provider)}, {payment.sourceWallet}
              </dd>
            </>
          ) : null}
          <dt className="text-caption text-text-muted">Recorded by</dt>
          <dd className="m-0 text-body text-text-secondary">
            {nameOf(payment.recordedBy, "Operations")}
          </dd>
        </dl>
        <div className="max-w-sm">
          <EvidencePlate
            fileId={payment.receiptFileId}
            label={payment.evidenceLabel || TRANSFER_EVIDENCE_LABEL}
            caption={payment.reference}
            deletable
          />
        </div>
      </div>
    );
  }

  if (!settlement || refund.status === "rejected" || refund.status === "withdrawn") {
    return (
      <p className="text-body text-text-secondary m-0">
        Nothing to pay until a settlement is approved.
      </p>
    );
  }

  if (refund.status === "destination_review") {
    return (
      <p className="text-body text-text-secondary m-0">
        The client replaced their receiving QR after approval. Verify the new one under
        Client&rsquo;s receiving account before anyone reserves or sends this refund.
      </p>
    );
  }

  if (refund.status === "approved" && refund.destination) {
    const destination = refund.destination;
    const ready = verified && wallet.trim().length > 0 && reason.trim().length > 0;
    return (
      <div className="flex flex-col gap-4">
        <p className="text-body text-text-primary m-0">
          <span
            className="text-h3 tabular-nums"
            style={{ fontFamily: "var(--font-bold)" }}
          >
            {formatPhp(settlement.totalMinor)}
          </span>{" "}
          approved. No money has been sent. Reserve it before opening a wallet, so only
          one person pays.
        </p>
        <RefundDestinationView destination={destination} />
        <FieldGroup>
          <Field>
            <FieldLabel id="sending-wallet-label">You are sending from</FieldLabel>
            <RadioGroup
              aria-labelledby="sending-wallet-label"
              value={provider}
              onValueChange={(value) => setProvider(String(value))}
              disabled={busy}
              className="grid-cols-2 gap-1 sm:grid-cols-4"
            >
              {SENDING_WALLET_PROVIDERS.map((option) => (
                <label
                  key={option.value}
                  className="flex min-h-11 cursor-pointer items-center gap-2"
                >
                  <RadioGroupItem value={option.value} aria-label={option.label} />
                  <span className="text-body text-text-primary">{option.label}</span>
                </label>
              ))}
            </RadioGroup>
          </Field>
          <Field>
            <FieldLabel htmlFor="source-wallet">
              Which of GRIDGO&rsquo;s wallets
            </FieldLabel>
            <Input
              id="source-wallet"
              value={wallet}
              maxLength={120}
              autoComplete="off"
              disabled={busy}
              placeholder="e.g. ops-gcash-1"
              onChange={(event) => setWallet(event.target.value)}
            />
            <FieldDescription>
              A stable name for the sending wallet. Never a password or a PIN.
            </FieldDescription>
          </Field>
          <Confirmation
            id="payment-destination-verified"
            checked={verified}
            onChange={setVerified}
            disabled={busy}
          >
            I will pay QR revision {destination.revision}, and the wallet names{" "}
            <span style={{ fontFamily: "var(--font-medium)" }}>
              {destination.accountName}
            </span>
            .
          </Confirmation>
          <Field>
            <FieldLabel htmlFor="reserve-reason">Note for the client</FieldLabel>
            <Textarea
              id="reserve-reason"
              rows={2}
              maxLength={2000}
              value={reason}
              disabled={busy}
              onChange={(event) => setReason(event.target.value)}
            />
            <FieldDescription>{CLIENT_READS_THIS}</FieldDescription>
          </Field>
          <div>
            <Button
              variant="primary"
              disabled={busy || !ready}
              onClick={() =>
                onReserve({
                  reason: reason.trim(),
                  destinationRevision: destination.revision,
                  destinationVerified: true,
                  provider,
                  sourceWallet: wallet.trim(),
                })
              }
            >
              {busy ? "Reserving…" : "Reserve this transfer for me"}
            </Button>
          </div>
        </FieldGroup>
      </div>
    );
  }

  if (
    attempt &&
    (refund.status === "payment_in_progress" || refund.status === "payment_unknown")
  ) {
    const mine = canRecordTransfer(refund, viewer);
    const unknown = refund.status === "payment_unknown";
    return (
      <div className="flex flex-col gap-4">
        {unknown ? (
          <div className="rounded-card border border-error px-4 py-3" role="alert">
            <p
              className="text-body text-text-primary m-0"
              style={{ fontFamily: "var(--font-medium)" }}
            >
              Do not send this refund again.
            </p>
            <p className="text-body text-text-secondary m-0 mt-1">
              The wallet did not confirm whether money moved. Check the sending
              wallet&rsquo;s history. If the transfer is there, record that same transfer.
              If nothing left, confirm it so the refund can be sent again.
            </p>
          </div>
        ) : null}
        <div className="flex flex-col gap-1">
          <p className="text-caption text-text-muted m-0">Send exactly</p>
          <p
            className="text-h2 text-text-primary m-0 tabular-nums"
            style={{ fontFamily: "var(--font-bold)" }}
          >
            {formatPhp(attempt.amountMinor)}
          </p>
          <p className="text-caption text-text-secondary m-0">
            Reserved by {nameOf(attempt.payerId, "another payer")}{" "}
            {formatDateTime(attempt.createdAt)}, from {walletLabel(attempt.provider)} (
            {attempt.sourceWallet}).
          </p>
        </div>
        <RefundDestinationView destination={attempt.destination} />
        {mine ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={busy} onClick={onRecord}>
              {unknown ? "Record the same transfer" : "Record the transfer"}
            </Button>
            {unknown ? null : (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => onReconcile("unknown")}
              >
                The wallet did not confirm
              </Button>
            )}
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => onReconcile("failed")}
            >
              No money left the wallet
            </Button>
          </div>
        ) : (
          <p className="text-body text-text-secondary m-0">
            Only {nameOf(attempt.payerId, "the reserved payer")} or Super Admin can record
            or reconcile this transfer. Do not send it yourself.
          </p>
        )}
      </div>
    );
  }

  return <p className="text-body text-text-secondary m-0">Nothing to pay right now.</p>;
}

// ---------------------------------------------------------------------------
// Rail
// ---------------------------------------------------------------------------

function MoneyRow({
  label,
  minor,
  strong = false,
}: {
  label: string;
  minor: number;
  strong?: boolean;
}) {
  return (
    <>
      <dt className="text-caption text-text-muted">{label}</dt>
      <dd
        className="text-body text-text-primary m-0 text-right tabular-nums"
        style={strong ? { fontFamily: "var(--font-bold)" } : undefined}
      >
        {formatPhp(minor)}
      </dd>
    </>
  );
}

function MoneyCard({ refund }: { refund: RefundRequest }) {
  const collected = refund.collections ? sumComponents(refund.collections) : null;
  const previous = previousRefundTotal(refund);
  const s = refund.settlement;
  const reserved =
    refund.attempt &&
    (refund.attempt.status === "in_progress" || refund.attempt.status === "unknown")
      ? refund.attempt.amountMinor
      : null;
  return (
    <section className="gg-card p-3" aria-labelledby="refund-money-heading">
      <h2 id="refund-money-heading" className="text-overline text-text-muted m-0 mb-2">
        Where the money stands
      </h2>
      <dl className="m-0 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5">
        {collected !== null ? (
          <MoneyRow label="Verified from the client" minor={collected} strong />
        ) : null}
        {refund.collections ? (
          <>
            <MoneyRow label="Print work" minor={refund.collections.principalMinor} />
            <MoneyRow label="Service fee" minor={refund.collections.feeMinor} />
            <MoneyRow label="Delivery" minor={refund.collections.deliveryMinor} />
          </>
        ) : null}
        <MoneyRow
          label="Already paid to the shop"
          minor={refund.releasedShopMinor ?? 0}
        />
        <MoneyRow label="Earlier refunds on this order" minor={previous} />
        {s ? (
          <MoneyRow label="This refund, approved" minor={s.totalMinor} strong />
        ) : null}
        {reserved !== null ? (
          <MoneyRow label="Reserved for one payer" minor={reserved} />
        ) : null}
        {refund.payment ? (
          <MoneyRow
            label="Paid to the client"
            minor={refund.payment.amountMinor}
            strong
          />
        ) : null}
      </dl>
      <p className="text-caption text-text-muted m-0 mt-2">
        Money already paid to the shop or earned by the rider is never taken back.
      </p>
    </section>
  );
}

function OrderCard({
  refund,
  order,
  tree,
}: {
  refund: RefundRequest;
  order: Order | null;
  tree: Tree;
}) {
  const state = order ? presentOrderState(order.state, order) : null;
  return (
    <section className="gg-card p-3" aria-labelledby="refund-order-heading">
      <h2 id="refund-order-heading" className="text-overline text-text-muted m-0 mb-2">
        The order
      </h2>
      <p
        className="text-body-lg text-text-primary m-0"
        style={{ fontFamily: "var(--font-medium)" }}
      >
        {order?.title || "Untitled order"}
      </p>
      {state ? (
        <div className="mt-2">
          <StatusChip tone={state.tone} label={state.label} icon={state.icon} />
        </div>
      ) : (
        <p className="text-caption text-text-muted m-0 mt-1">
          The order could not be loaded.
        </p>
      )}
      {order?.refundHold ? (
        <p className="text-caption text-text-secondary m-0 mt-2">
          Work and payouts on this order are paused while this refund is open.
        </p>
      ) : null}
      <div className="mt-2 flex flex-col">
        <Link
          href={`/${tree}/orders/${refund.orderId}`}
          className="text-caption text-text-secondary inline-flex min-h-11 items-center underline-offset-2 hover:underline"
        >
          Open the order workspace
        </Link>
        {tree === "ops" ? (
          <Link
            href={`/ops/payouts/${refund.orderId}`}
            className="text-caption text-text-secondary inline-flex min-h-11 items-center underline-offset-2 hover:underline"
          >
            Open the shop&rsquo;s payout review
          </Link>
        ) : null}
      </div>
    </section>
  );
}

function ClaimsCard({ claims, tree }: { claims: Claim[]; tree: Tree }) {
  return (
    <section className="gg-card p-3" aria-labelledby="refund-claims-heading">
      <h2 id="refund-claims-heading" className="text-overline text-text-muted m-0 mb-2">
        Claims on this order
      </h2>
      {claims.length ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {claims.map((claim) => (
            <li key={claim.id} className="text-body text-text-secondary">
              {claim.holdReason || claim.reason}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-body text-text-secondary m-0">None open.</p>
      )}
      <p className="text-caption text-text-muted m-0 mt-2">
        Claims are separate. Settling or rejecting this refund does not resolve them, and
        an open claim still holds the shop&rsquo;s settlement payout.
        {tree === "ops" ? (
          <>
            {" "}
            <Link href="/ops/claims" className="underline-offset-2 hover:underline">
              Claims and holds
            </Link>
          </>
        ) : null}
      </p>
    </section>
  );
}
