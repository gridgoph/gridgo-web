"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

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
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { StatusChip } from "@/components/ui/StatusChip";
import { ApiError, getOrder, transitionOrder } from "@/lib/api/client";
import type { Order } from "@/lib/api/types";
import { presentOrderState } from "@/lib/order-state";
import { actionsForJob, type SupplierAction } from "@/lib/supplier-actions";

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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getOrder(orderId);
      setJob(data);
    } catch (err) {
      setJob(null);
      if (err instanceof ApiError) {
        setError(
          err.status === 404
            ? "This job is not in your inbox. It may have been reassigned."
            : `Could not load job (${err.code}).`,
        );
      } else {
        setError("Network error loading this job. Retry when the API is reachable.");
      }
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runAction(action: SupplierAction) {
    if (!job) return;
    if (action.destructive && !confirmDecline) {
      setConfirmDecline(true);
      return;
    }
    setActing(action.kind);
    setActionError(null);
    try {
      const note =
        action.kind === "decline"
          ? "Supplier declined — return for rematch"
          : action.kind === "self_qc"
            ? "Self-QC passed"
            : action.label;
      const updated = await transitionOrder(job.id, action.targetState, { note });
      setJob(updated);
      setConfirmDecline(false);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "transition_not_allowed") {
          setActionError(
            "That action is no longer valid for this job. Refresh to see the current state.",
          );
        } else {
          setActionError(`Could not update job (${err.code}).`);
        }
      } else {
        setActionError("Network error while updating. Try again.");
      }
      await load();
    } finally {
      setActing(null);
    }
  }

  if (loading && !job) return <LoadingBlock label="Loading order workspace…" />;
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
  const actions = actionsForJob(job.state);
  const primary = actions.find((a) => a.primary);
  const secondary = actions.filter((a) => !a.primary);

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <header className="gg-card flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-h2 text-text-primary m-0">{job.title}</h2>
            <p className="text-caption text-text-muted m-0 mt-1">{job.id}</p>
          </div>
          <StatusChip tone={status.tone} label={status.label} icon={status.icon} />
        </div>

        {primary || secondary.length ? (
          <div className="flex flex-col gap-2 border-t border-outline-subtle pt-3">
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
            {actionError ? (
              <p className="text-body text-error m-0" role="alert">
                {actionError}
              </p>
            ) : null}
            {!primary && !secondary.length ? (
              <p className="text-body text-text-secondary m-0">
                No supplier action is available in this state. Track progress below.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-body text-text-secondary m-0 border-t border-outline-subtle pt-3">
            No supplier action is available in this state. Track progress below.
          </p>
        )}
      </header>

      <section className="gg-card" aria-labelledby="spec-heading">
        <h3 id="spec-heading" className="text-h3 text-text-primary m-0 mb-3">
          Spec
        </h3>
        <OrderMeta order={job} />
      </section>

      <section className="gg-card" aria-labelledby="timeline-heading">
        <h3 id="timeline-heading" className="text-h3 text-text-primary m-0 mb-3">
          Timeline
        </h3>
        <Timeline entries={job.timeline} />
      </section>

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
              The order returns to Operations for rematch. You will lose this assignment.
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
