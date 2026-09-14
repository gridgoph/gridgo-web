"use client";

import { useSerializedLoad } from "@/lib/live/useSerializedLoad";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { History, ListChecks, Wallet } from "lucide-react";

import { pesosToMinor } from "@/app/admin/_lib/errors";
import { MilestoneList } from "@/components/orders/MilestoneList";
import { OrderMeta } from "@/components/orders/OrderMeta";
import { Timeline } from "@/components/orders/Timeline";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ErrorState } from "@/components/ui/ErrorState";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SkeletonDetail } from "@/components/ui/loading";
import { StatusChip } from "@/components/ui/StatusChip";
import { ApiError, getOrder, transitionOrder } from "@/lib/api/client";
import type { Order } from "@/lib/api/types";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { formatDateTime, formatPhp } from "@/lib/format";
import { presentOrderState } from "@/lib/order-state";
import {
  actionsForJob,
  supplierWaitingOn,
  type SupplierAction,
} from "@/lib/supplier-actions";
import { jobActivity, relativeTime } from "@/app/supplier/_lib/job-activity";

function supplierErrorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) {
    return "Network error while updating. Try again.";
  }
  switch (err.code) {
    case "transition_not_allowed":
      return "That step is no longer available for this job. Refresh to see where it stands.";
    case "verification_not_approved":
    case "supplier_not_approved":
      return "Your account is still waiting for approval, so it cannot be given work yet. Operations will be in touch.";
    case "payment_method_not_allowed":
      return "Only digital payment exists on this platform now.";
    default:
      return err.kind === "validation"
        ? "Check the details you entered and try again."
        : "Could not update this job. Try again.";
  }
}

export default function SupplierJobDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const orderId = params.id;

  const [job, setJob] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmDecline, setConfirmDecline] = useState(false);
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [pricePesos, setPricePesos] = useState("");
  const [promisedDate, setPromisedDate] = useState("");

  const load = useSerializedLoad(useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setJob(await getOrder(orderId));
    } catch (err) {
      setJob(null);
      if (err instanceof ApiError) {
        setError(
          err.status === 404
            ? "This job is not in your inbox. It may have been given to another supplier."
            : "Could not load this job. Retry when the API responds.",
        );
      } else {
        setError(
          "Network error loading this job. Retry when the API is reachable.",
        );
      }
    } finally {
      setLoading(false);
    }
  }, [orderId]));

  useLiveReload("jobs", load, { matchId: orderId });

  useEffect(() => {
    void load();
  }, [load]);

  async function runAction(action: SupplierAction) {
    if (!job) return;
    if (action.needsPrice) {
      setActionError(null);
      setAcceptOpen(true);
      return;
    }
    if (action.destructive && !confirmDecline) {
      setConfirmDecline(true);
      return;
    }
    setActing(action.kind);
    setActionError(null);
    try {
      const note =
        action.kind === "decline"
          ? "Supplier declined — returned for rematch"
          : action.kind === "self_qc"
            ? "Self-QC passed"
            : action.label;
      setJob(await transitionOrder(job.id, action.targetState, { note }));
      setConfirmDecline(false);
    } catch (err) {
      setActionError(supplierErrorMessage(err));
      await load();
    } finally {
      setActing(null);
    }
  }

  async function acceptWithPrice() {
    if (!job) return;
    const supplierPriceMinor = pesosToMinor(pricePesos);
    if (supplierPriceMinor === null || supplierPriceMinor <= 0) {
      setActionError("Enter your price in pesos, like 1000 or 1000.50.");
      return;
    }
    setActing("accept");
    setActionError(null);
    try {
      const updated = await transitionOrder(job.id, "supplier_accepted", {
        supplierPriceMinor,
        promisedDate: promisedDate
          ? new Date(promisedDate).toISOString()
          : undefined,
        note: "Accepted and priced",
      });
      setJob(updated);
      setAcceptOpen(false);
      setPricePesos("");
      setPromisedDate("");
    } catch (err) {
      setActionError(supplierErrorMessage(err));
    } finally {
      setActing(null);
    }
  }

  if (loading && !job) {
    return <SkeletonDetail label="Loading order workspace" panels={3} />;
  }
  if (error || !job) {
    return (
      <ErrorState
        body={error ?? "Job not found."}
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void load()}>
              Retry
            </Button>
            <Button
              variant="secondary"
              onClick={() => router.push("/supplier/jobs")}
            >
              Back to inbox
            </Button>
          </div>
        }
      />
    );
  }

  const status = presentOrderState(job.state);
  const activity = jobActivity(job);
  const actions = actionsForJob(job.state);
  const primary = actions.find((a) => a.primary);
  const secondary = actions.filter((a) => !a.primary);
  const waiting = supplierWaitingOn(job.state);
  const previewMinor = pesosToMinor(pricePesos);

  return (
    <div className="flex w-full flex-col gap-3">
      <header className="gg-card flex flex-col gap-3 p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-h2 text-text-primary m-0">{job.title}</h2>
            <p className="text-caption text-text-muted m-0 mt-1">Order {job.id}</p>
            {job.supplierPriceMinor !== undefined ? (
              <p className="text-caption text-text-muted m-0 mt-1">
                You earn {formatPhp(job.supplierPriceMinor)} on this job
              </p>
            ) : null}
          </div>
          <StatusChip tone={status.tone} label={status.label} icon={status.icon} />
        </div>

        {/*
          What just happened, at the top.

          The state chip says where the job stands; it does not say what moved
          it there or when. That was only readable by scrolling to the bottom
          of the timeline, which is the wrong end of a growing list for the one
          question a shop opens this page with.
        */}
        {activity.at !== null ? (
          <div className="border-outline-subtle bg-surface-variant rounded-field flex flex-wrap items-baseline gap-x-2 gap-y-1 border px-3 py-2">
            <span className="text-overline text-text-muted uppercase">Latest</span>
            <span
              className="text-body text-text-primary"
              style={{ fontFamily: "var(--font-medium)" }}
            >
              {activity.what}
            </span>
            <span className="text-caption text-text-muted">
              {relativeTime(activity.at)}
              {activity.who ? ` · ${activity.who}` : ""}
              {activity.iso ? ` · ${formatDateTime(activity.iso)}` : ""}
            </span>
          </div>
        ) : null}

        <div className="flex flex-col gap-2 border-t border-outline-subtle pt-3">
          {primary || secondary.length ? (
            <div className="flex flex-wrap gap-2">
              {primary ? (
                <Button
                  variant="primary"
                  disabled={acting !== null}
                  onClick={() => void runAction(primary)}
                >
                  {acting === primary.kind ? "Working…" : primary.label}
                </Button>
              ) : null}
              {secondary.map((action) => (
                <Button
                  key={action.kind}
                  variant={action.destructive ? "danger" : "secondary"}
                  disabled={acting !== null}
                  onClick={() => void runAction(action)}
                >
                  {action.label}
                </Button>
              ))}
            </div>
          ) : (
            <p className="text-body text-text-secondary m-0">
              {waiting ??
                "Nothing for you to do on this job right now. The timeline below shows where it has got to."}
            </p>
          )}
          {primary && waiting ? (
            <p className="text-caption text-text-muted m-0">{waiting}</p>
          ) : null}
          {actionError && !acceptOpen && !confirmDecline ? (
            <p className="text-body text-error m-0" role="alert">
              {actionError}
            </p>
          ) : null}
        </div>
      </header>

      {/*
        Two explicit columns rather than one auto-flowing grid. Spec, payout and
        timeline flowing in sequence put the timeline under the spec and left
        the whole right column empty below the payout — a screen of nothing
        beside the thing a shop scrolls to read.
      */}
      <div className="grid w-full gap-3 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] lg:items-start">
        <div className="flex min-w-0 flex-col gap-3">
          <section className="gg-card p-3" aria-labelledby="spec-heading">
            <h3
              id="spec-heading"
              className="text-h3 text-text-primary m-0 mb-3 flex items-center gap-2"
            >
              <ListChecks size={18} strokeWidth={1.75} aria-hidden />
              Spec
            </h3>
            <OrderMeta order={job} showMoney={false} />
          </section>

          <section className="gg-card p-3" aria-labelledby="timeline-heading">
            <h3
              id="timeline-heading"
              className="text-h3 text-text-primary m-0 mb-1 flex items-center gap-2"
            >
              <History size={18} strokeWidth={1.75} aria-hidden />
              Timeline
            </h3>
            <p className="text-caption text-text-muted m-0 mb-3">
              Most recent first.
            </p>
            <Timeline entries={job.timeline} newestFirst />
          </section>
        </div>

        {job.payoutMilestones?.length ? (
          <section
            className="gg-card p-3 lg:sticky lg:top-3"
            aria-labelledby="payout-heading"
          >
            <h3
              id="payout-heading"
              className="text-h3 text-text-primary m-0 flex items-center gap-2"
            >
              <Wallet size={18} strokeWidth={1.75} aria-hidden />
              Your payout
            </h3>
            <p className="text-body text-text-secondary m-0 mt-1 mb-3 max-w-prose">
              {/*
                Counted, not asserted. The blueprint describes four stages and
                the running API issues two, so a hardcoded "four" was wrong on
                this very screen.
              */}
              {job.payoutMilestones.length === 1
                ? "One release of your own price, paid by Operations once they have seen the proof."
                : `${job.payoutMilestones.length} parts of your own price, each released by Operations once they have seen the proof for that stage.`}
            </p>
            <MilestoneList order={job} />
          </section>
        ) : null}
      </div>

      <Dialog
        open={acceptOpen}
        onOpenChange={(open) => {
          if (!open) {
            setAcceptOpen(false);
            setActionError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Accept this job at your price</DialogTitle>
            <DialogDescription>
              Name what you want for the work. The client is told the final
              price straight away and sends a 75% downpayment; you start
              production once Operations confirms it arrived. You keep your
              price in full.
            </DialogDescription>
          </DialogHeader>

          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="supplier-price">Your price (₱)</FieldLabel>
              <Input
                id="supplier-price"
                inputMode="decimal"
                value={pricePesos}
                onChange={(e) => setPricePesos(e.target.value)}
                placeholder="1000.00"
                autoComplete="off"
              />
              <FieldDescription>
                {previewMinor !== null && previewMinor > 0
                  ? `You will be paid ${formatPhp(previewMinor)} across four milestones.`
                  : "What you are paid, before GRIDGO adds its own charges and delivery on top."}
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="promised-date">
                Promise it by (optional)
              </FieldLabel>
              <Input
                id="promised-date"
                type="datetime-local"
                value={promisedDate}
                onChange={(e) => setPromisedDate(e.target.value)}
              />
              <FieldDescription>
                Shown to Operations on the schedule. Leave blank to use the
                client&rsquo;s deadline.
              </FieldDescription>
            </Field>
          </FieldGroup>

          {actionError ? (
            <p className="text-body text-error m-0" role="alert">
              {actionError}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              variant="secondary"
              disabled={acting !== null}
              onClick={() => setAcceptOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={acting !== null}
              onClick={() => void acceptWithPrice()}
            >
              {acting === "accept" ? "Accepting…" : "Accept and tell the client"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={confirmDecline}
        onOpenChange={(open) => {
          if (!open) setConfirmDecline(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Decline this job?</AlertDialogTitle>
            <AlertDialogDescription>
              It goes back to Operations to be given to another supplier, and
              you lose this assignment.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {actionError ? (
            <p className="text-body text-error m-0" role="alert">
              {actionError}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel variant="secondary" disabled={acting !== null}>
              Keep job
            </AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              disabled={acting !== null}
              onClick={() => {
                const decline = secondary.find((action) => action.destructive);
                if (decline) void runAction(decline);
              }}
            >
              {acting === "decline" ? "Declining…" : "Confirm decline"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
