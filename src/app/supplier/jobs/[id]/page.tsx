"use client";

import { useSerializedLoad } from "@/lib/live/useSerializedLoad";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { History, ListChecks, Wallet } from "lucide-react";

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
import { SkeletonDetail } from "@/components/ui/loading";
import { StatusChip } from "@/components/ui/StatusChip";
import {
  ApiError,
  attachFulfilmentProof,
  getOrder,
  transitionOrder,
  uploadFulfilmentProof,
} from "@/lib/api/client";
import type { Order } from "@/lib/api/types";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { formatDateTime, formatPhp } from "@/lib/format";
import { presentOrderState } from "@/lib/order-state";
import {
  actionsForJob,
  shopProofOutstanding,
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
  const [proofOpen, setProofOpen] = useState(false);
  const [proofFileId, setProofFileId] = useState<string | null>(null);
  const [proofFileName, setProofFileName] = useState<string | null>(null);
  const proofInput = useRef<HTMLInputElement>(null);
  const [proofError, setProofError] = useState<string | null>(null);
  const [filedNote, setFiledNote] = useState<string | null>(null);

  const load = useSerializedLoad(
    useCallback(async () => {
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
          setError("Network error loading this job. Retry when the API is reachable.");
        }
      } finally {
        setLoading(false);
      }
    }, [orderId]),
  );

  useLiveReload("jobs", load, { matchId: orderId });

  useEffect(() => {
    void load();
  }, [load]);

  function closeProof() {
    setProofOpen(false);
    setProofFileId(null);
    setProofFileName(null);
    setProofError(null);
    if (proofInput.current) proofInput.current.value = "";
    setActing(null);
  }

  async function runAction(action: SupplierAction) {
    if (!job) return;
    if (action.kind === "add_proof" || action.targetState === null) {
      setActionError(null);
      setProofError(null);
      setProofFileId(null);
      setProofFileName(null);
      setProofOpen(true);
      return;
    }
    if (action.kind === "ready_for_pickup" && shopProofOutstanding(job)) return;
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
          : action.kind === "accept"
            ? "Accepted"
            : action.kind === "ready_for_pickup"
              ? "Packaging ready — packed and staged for joint pickup checks with the rider"
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

  async function onProofFile(file: File | undefined) {
    if (!file) return;
    setActing("add_proof");
    setProofError(null);
    setProofFileId(null);
    setProofFileName(file.name);
    try {
      const stored = await uploadFulfilmentProof(file);
      setProofFileId(stored.fileId);
    } catch {
      setProofError("File storage is unavailable, so this evidence was not filed.");
    } finally {
      setActing(null);
    }
  }

  async function fileProof(action: SupplierAction) {
    if (!job || !proofFileId || !action.milestoneCode) return;
    setActing("add_proof");
    setProofError(null);
    try {
      await attachFulfilmentProof(proofFileId, job.id, action.milestoneCode);
      const reloaded = await getOrder(job.id);
      setJob(reloaded);
      const part = action.proofNoun ?? "stage";
      setFiledNote(
        `GRIDGO has your ${part} evidence. Operations reviews it before that part is paid.`,
      );
      closeProof();
    } catch (err) {
      setProofError(supplierErrorMessage(err));
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
            <Button variant="secondary" onClick={() => router.push("/supplier/jobs")}>
              Back to inbox
            </Button>
          </div>
        }
      />
    );
  }

  const status = presentOrderState(job.state);
  const activity = jobActivity(job);
  const actions = actionsForJob(job);
  const proofAction = actions.find((action) => action.kind === "add_proof") ?? null;
  const primary = actions.find((a) => a.primary);
  const secondary = actions.filter((a) => !a.primary);
  const waiting = supplierWaitingOn(job.state, job);
  const confirmedMinor = job.supplierSubtotalMinor ?? job.supplierPriceMinor;
  const confirmedDate = job.readyBy ?? job.promisedDate ?? job.deadline;

  return (
    <div className="flex w-full flex-col gap-3">
      <header className="gg-card flex flex-col gap-3 p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-h2 text-text-primary m-0">{job.title}</h2>
            <p className="text-caption text-text-muted m-0 mt-1">Order {job.id}</p>
            {confirmedMinor !== undefined ? (
              <p className="text-caption text-text-muted m-0 mt-1">
                You earn {formatPhp(confirmedMinor)} on this job
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
                  {acting === primary.kind
                    ? primary.kind === "accept"
                      ? "Accepting…"
                      : "Working…"
                    : primary.label}
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
          {primary?.kind === "accept" ? (
            <div className="flex max-w-prose flex-col gap-1">
              <p className="text-body text-text-secondary m-0">
                Your shop commits to this job at the price already on your board, by the
                date GRIDGO already promised the client.
              </p>
              <p className="text-caption text-text-muted m-0">
                {confirmedMinor !== undefined
                  ? `Price: ${formatPhp(confirmedMinor)}`
                  : "Price already set on your board"}
              </p>
              {confirmedDate ? (
                <p className="text-caption text-text-muted m-0">
                  Date: {formatDateTime(confirmedDate)}
                </p>
              ) : null}
            </div>
          ) : null}
          {filedNote ? (
            <p className="text-body text-text-secondary m-0">{filedNote}</p>
          ) : null}
          {actionError && !confirmDecline && !proofOpen ? (
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
            <p className="text-caption text-text-muted m-0 mb-3">Most recent first.</p>
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
                Counted, not asserted. Orders placed under the escrow plan have
                three stages and older ones four, so a hardcoded count is wrong
                on one of them.
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
        open={proofOpen && proofAction !== null}
        onOpenChange={(open) => {
          if (!open) closeProof();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{proofAction?.proofLabel ?? "Proof"}</DialogTitle>
            <DialogDescription>{proofAction?.proofHint ?? ""}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <p className="text-caption text-text-muted m-0">JPEG, PNG, WebP, or PDF</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={acting !== null}
                onClick={() => proofInput.current?.click()}
              >
                Choose file
              </Button>
              <span className="text-caption text-text-secondary min-w-0 truncate">
                {proofFileName ?? "No file chosen"}
              </span>
            </div>
            <input
              ref={proofInput}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="sr-only"
              tabIndex={-1}
              disabled={acting !== null}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                void onProofFile(file);
              }}
            />
          </div>
          {proofError ? (
            <p className="text-body text-error m-0" role="alert">
              {proofError}
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="secondary" disabled={acting !== null} onClick={closeProof}>
              Not yet
            </Button>
            <Button
              variant="primary"
              disabled={acting !== null || !proofFileId || !proofAction}
              onClick={() => {
                if (proofAction) void fileProof(proofAction);
              }}
            >
              {acting === "add_proof" ? "Filing…" : "File this evidence"}
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
              It goes back to Operations to be given to another supplier, and you lose
              this assignment.
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
