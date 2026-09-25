"use client";

import { useSerializedLoad } from "@/lib/live/useSerializedLoad";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronLeft, CircleCheck, CircleDot, Lock, type LucideIcon } from "lucide-react";

import {
  STAGES,
  isCancelled,
  stageSummary,
  stepsFor,
  type StepStatus,
  type WorkspaceStep,
} from "@/app/ops/_lib/pipeline";
import { opsErrorMessage } from "@/app/ops/_lib/errors";
import { EvidencePlate, EvidenceStrip } from "@/components/orders/EvidencePreview";
import { PaymentSummary } from "@/components/orders/PaymentSummary";
import { formatRatePercent } from "@/components/settings/service-fee";
import { PayoutMilestones } from "@/components/orders/PayoutMilestones";
import {
  ReleaseMilestoneDialog,
  type ReleaseDecision,
  type ReleaseTarget,
} from "@/components/orders/ReleaseMilestoneDialog";
import { Timeline } from "@/components/orders/Timeline";
import {
  Accordion,
  AccordionContent,
  AccordionHeader,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonDetail } from "@/components/ui/loading";
import { StatusChip } from "@/components/ui/StatusChip";
import { Textarea } from "@/components/ui/textarea";
import { installmentsAwaitingConfirmation } from "@/lib/api/constraints";
import { artworkEvidence, deliveryEvidenceItems, pickupEvidence } from "@/lib/evidence";
import {
  confirmPayment,
  getOrder,
  promisePhysicalInvoice,
  rejectPayment,
  releaseMilestoneWithReceipt,
  transitionOrder,
} from "@/lib/api/client";
import type { Order, PaymentInstallment, PayoutMilestone } from "@/lib/api/types";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { formatDateTime, formatPhp } from "@/lib/format";
import {
  DESK_WINDOW_LABEL,
  deskInstant,
  deskTimes,
  isGridgoDeskInstant,
  upcomingDeskDates,
} from "@/lib/physicalInvoiceDesk";
import { presentOrderState } from "@/lib/order-state";
import { paymentOf, paymentProgress } from "@/lib/payments";
import {
  milestoneProofs,
  payoutProgress,
  payoutSummary,
  releasableMilestones,
} from "@/lib/payouts";
import { describeQuantity } from "@/lib/quantity";
import { cn } from "@/lib/utils";
import { orderDeliverySplit, platformShareBps } from "@/lib/delivery-split";

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
  | "delivery"
  | "payout"
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
 * After the four production steps comes the supplier's payout: the four shares
 * of the shop's price. The pictures that justify those shares live on
 * Production; the payout row keeps the wallet receipt and the release.
 *
 * On the right, the whole specification, always visible and never behind a
 * tab, because the one thing a quality check needs is to read the spec and
 * tick the boxes at the same time.
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

  const load = useSerializedLoad(
    useCallback(async () => {
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
    }, [orderId]),
  );

  useLiveReload(["orders", "jobs", "payouts"], load, { matchId: orderId });

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

  const status = presentOrderState(order.state);
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

      {/*
        Steps take the width they need and the rail is fixed, because the rail's
        job is to be read at a glance while the left side is being worked. Below
        the breakpoint they stack, spec first -- on a narrow screen you read
        before you act.
      */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-3">
          <Accordion
            multiple
            value={open}
            onValueChange={(value) => setOpen(value as SectionId[])}
            className="gg-card-flush"
          >
            {steps.map((step) => (
              <StepRow
                key={step.id}
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
                onApprove={() =>
                  run("approve", () =>
                    transitionOrder(order.id, "supplier_assigned", { note }),
                  )
                }
                onCorrection={() =>
                  run("correction", () =>
                    transitionOrder(order.id, "client_correction", { note }),
                  )
                }
                onCancel={() =>
                  run("cancel", () =>
                    transitionOrder(order.id, "cancelled", { reason: note }),
                  )
                }
              />
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

            {order.physicalInvoiceRequest ? (
              <SectionRow
                id="physical-invoice"
                heading="Physical invoice"
                summary={physicalInvoiceSummary(order)}
                marker={physicalInvoiceMarker(order)}
                trailing={order.physicalInvoiceRequest.promisedDeliveryAt ? "Promised" : "Your call"}
              >
                <PhysicalInvoicePanel
                  order={order}
                  busy={busy}
                  onPromise={(instant) =>
                    run("physical-invoice", () => promisePhysicalInvoice(order.id, instant))
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
              <Timeline entries={order.timeline} />
            </SectionRow>
          </Accordion>

          {actionError ? (
            <p className="text-body text-error m-0" role="alert">
              {actionError}
            </p>
          ) : null}
        </div>

        <SpecRail order={order} payoutsHref={payoutsHref} />
      </div>

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
  if (installmentsAwaitingConfirmation(order).length > 0) ids.add("payment");
  if (order.physicalInvoiceRequest && !order.physicalInvoiceRequest.promisedDeliveryAt) {
    ids.add("physical-invoice");
  }
  if (releasableMilestones(order).length > 0) ids.add("payout");
  if (isCancelled(order)) ids.add("history");
  return [...ids];
}

function physicalInvoiceSummary(order: Order): string {
  const request = order.physicalInvoiceRequest;
  if (!request) return "";
  if (request.promisedDeliveryAt) return `Promised ${formatDateTime(request.promisedDeliveryAt)}.`;
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
  onApprove,
  onCorrection,
  onCancel,
}: StepRowProps) {
  const definition = STAGES.find((entry) => entry.id === step.id);
  const current = step.status === "current";
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
      summary={stageSummary(
        order,
        step.id as Exclude<typeof step.id, "done">,
        formatPhp,
        formatDateTime,
      )}
      marker={STEP_MARKER[step.status]}
      trailing={trailing}
      current={current}
    >
      {step.id === "payment" ? (
        <PaymentStep
          order={order}
          busy={busy}
          onConfirm={onConfirmPayment}
          onReject={onRejectPayment}
        />
      ) : null}

      {step.id === "qa" ? (
        current ? (
          <div className="flex flex-col gap-3">
            <ul className="flex flex-col gap-2 m-0 p-0 list-none">
              {QA_CHECKS.map((check) => (
                <li key={check.id}>
                  <label className="flex items-start gap-2 text-body text-text-secondary cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={Boolean(checked[check.id])}
                      onChange={(event) =>
                        onCheck({ ...checked, [check.id]: event.target.checked })
                      }
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
        ) : (
          <p className="text-body text-text-secondary m-0">{definition?.hint}</p>
        )
      ) : null}

      {step.id === "production" ? (
        <ProductionStep order={order} hint={definition?.hint} />
      ) : null}

      {step.id === "delivery" ? (
        <DeliveryStep order={order} hint={definition?.hint} />
      ) : null}
    </SectionRow>
  );
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
  const ready = Boolean(instant) && isGridgoDeskInstant(instant) && Date.parse(instant) > now;
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
      <p className="text-body text-text-secondary m-0">Someone is there: {request.operatingHours}</p>
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="text-caption text-text-muted p-0">
          Promise delivery
          <span className="mt-0.5 block">{DESK_WINDOW_LABEL}</span>
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
          Set promise date
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
 * The shop's own record of the job: the proofs it filed while printing and
 * packing. They belong to the payout, but they are also the only sight
 * Operations gets of the work before a rider collects it.
 */
function ProductionStep({ order, hint }: { order: Order; hint?: string }) {
  const filed = (order.payoutMilestones ?? [])
    .filter((m) => m.code === "printing" || m.code === "packaging_qc")
    .map((m) => ({ milestone: m, proofs: milestoneProofs(order, m) }))
    .filter((entry) => entry.proofs.length > 0);

  if (filed.length === 0) {
    return <p className="text-body text-text-secondary m-0">{hint}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {filed.map(({ milestone, proofs }) => (
        <div key={milestone.code}>
          <p
            className="text-body text-text-primary m-0 mb-2"
            style={{ fontFamily: "var(--font-medium)" }}
          >
            {milestone.code === "printing" ? "Printed run" : "Packed for pickup"}
          </p>
          <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2">
            {proofs.map((proof) => (
              <li key={proof.fileId} className="min-w-0">
                <EvidencePlate fileId={proof.fileId} label={proof.label} />
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
    </div>
  );
}

/** Pickup checks and the photo at the door, once a rider has them. */
function DeliveryStep({ order, hint }: { order: Order; hint?: string }) {
  const pickup = pickupEvidence(order);
  const delivery = deliveryEvidenceItems(order);
  const checklist = order.pickupChecklist;

  if (pickup.length === 0 && delivery.length === 0 && !checklist?.completedAt) {
    return <p className="text-body text-text-secondary m-0">{hint}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {checklist?.completedAt ? (
        <p className="text-body text-text-secondary m-0">
          {checklist.status === "passed"
            ? `Rider and supplier passed all six pickup checks together ${formatDateTime(checklist.completedAt)}.`
            : checklist.status === "failed_escalated"
              ? `A pickup check failed ${formatDateTime(checklist.completedAt)}.${
                  checklist.failureNote ? ` ${checklist.failureNote}` : ""
                }`
              : `Pickup checks recorded ${formatDateTime(checklist.completedAt)}.`}
        </p>
      ) : null}
      {pickup.length > 0 ? <EvidenceStrip items={pickup} /> : null}
      {delivery.length > 0 ? (
        <div>
          <p
            className="text-body text-text-primary m-0 mb-2"
            style={{ fontFamily: "var(--font-medium)" }}
          >
            {order.deliveryEvidence
              ? `At the door, ${formatDateTime(order.deliveryEvidence.recordedAt)}`
              : "Delivery photos"}
          </p>
          <EvidenceStrip items={delivery} />
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The rail
// ---------------------------------------------------------------------------

function SpecRail({ order, payoutsHref }: { order: Order; payoutsHref?: string }) {
  const { paidMinor, remainingMinor } = paymentProgress(order);
  const payout = payoutProgress(order);
  const deliverySplit = orderDeliverySplit(order);
  const artwork = artworkEvidence(order);
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

      {artwork.length ? (
        <section className="gg-card p-3">
          <h2 className="text-overline text-text-muted m-0 mb-2">Artwork</h2>
          <EvidenceStrip items={artwork} />
        </section>
      ) : null}

      <section className="gg-card p-3">
        <h2 className="text-overline text-text-muted m-0 mb-2">Money</h2>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 m-0">
          {/*
            The shop's price and GRIDGO's fee on top of it. Operations and
            Super Admin only: the API strips both from every other role, and
            the client's own receipt folds the fee into the total without a
            line for it.
          */}
          {order.supplierSubtotalMinor != null ? (
            <>
              <dt className="text-caption text-text-muted">Shop price</dt>
              <dd className="text-body text-text-secondary m-0 tabular-nums">
                {formatPhp(order.supplierSubtotalMinor)}
              </dd>
            </>
          ) : null}
          {order.serviceFeeMinor != null ? (
            <>
              <dt className="text-caption text-text-muted">
                Service fee
                {order.serviceFeeRateBps != null
                  ? ` (${formatRatePercent(order.serviceFeeRateBps)})`
                  : ""}
              </dt>
              <dd className="text-body text-text-secondary m-0 tabular-nums">
                {formatPhp(order.serviceFeeMinor)}
              </dd>
            </>
          ) : null}
          {order.deliveryFeeMinor != null ? (
            <>
              <dt className="text-caption text-text-muted">Delivery</dt>
              <dd className="text-body text-text-secondary m-0 tabular-nums">
                {formatPhp(order.deliveryFeeMinor)}
              </dd>
            </>
          ) : null}
          {/*
            Who the delivery fee belongs to, at the rate snapshotted on this
            order. An API without the split sends none of it; the gross fee
            above then stands alone.
          */}
          {deliverySplit ? (
            <>
              <dt className="text-caption text-text-muted pl-3">
                Rider payout
                {deliverySplit.riderCommissionBps != null
                  ? ` (${formatRatePercent(deliverySplit.riderCommissionBps)})`
                  : ""}
              </dt>
              <dd className="text-body text-text-secondary m-0 tabular-nums">
                {formatPhp(deliverySplit.riderPayoutMinor)}
              </dd>
              <dt className="text-caption text-text-muted pl-3">
                GRIDGO delivery share
                {deliverySplit.riderCommissionBps != null
                  ? ` (${formatRatePercent(platformShareBps(deliverySplit.riderCommissionBps))})`
                  : ""}
              </dt>
              <dd className="text-body text-text-secondary m-0 tabular-nums">
                {formatPhp(deliverySplit.platformDeliveryShareMinor)}
              </dd>
            </>
          ) : null}
          <dt className="text-caption text-text-muted">Client total</dt>
          <dd className="text-body text-text-primary m-0 tabular-nums">
            {order.totalMinor != null ? formatPhp(order.totalMinor) : "—"}
          </dd>
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
