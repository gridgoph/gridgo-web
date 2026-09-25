"use client";

import { useSerializedLoad } from "@/lib/live/useSerializedLoad";

import { useCallback, useEffect, useMemo, useState } from "react";

import { opsErrorMessage } from "@/app/ops/_lib/errors";
import { EvidencePlate } from "@/components/orders/EvidencePreview";
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
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { SkeletonCards } from "@/components/ui/loading";
import { StatusChip } from "@/components/ui/StatusChip";
import { Textarea } from "@/components/ui/textarea";
import {
  getFile,
  listEscalations,
  listOrders,
  resolveEscalation,
} from "@/lib/api/client";
import type { Escalation, Order, StoredFile } from "@/lib/api/types";
import { useLiveReload } from "@/lib/live/useLiveReload";
import { formatDateTime } from "@/lib/format";
import {
  presentEscalationStatus,
  presentOrderState,
  presentPickupCheck,
} from "@/lib/order-state";

type Loaded = {
  escalations: Escalation[];
  orders: Record<string, Order>;
  evidence: Record<string, StoredFile>;
};

export default function OpsEscalationsPage() {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionOk, setActionOk] = useState<string | null>(null);
  const [resolving, setResolving] = useState<Escalation | null>(null);
  const [instruction, setInstruction] = useState("");

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

        // Evidence metadata is a best-effort read — a missing file must not take
        // the whole queue down, so each lookup fails on its own.
        const fileIds = [...new Set(escalations.flatMap((e) => e.evidenceFileIds))];
        const files = await Promise.all(
          fileIds.map((id) => getFile(id).catch(() => null)),
        );
        const evidence: Record<string, StoredFile> = {};
        for (const file of files) if (file) evidence[file.fileId] = file;

        setData({ escalations, orders, evidence });
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

  async function apply() {
    if (!resolving) return;
    if (!instruction.trim()) {
      setActionError(
        "Write the instruction. The rider is waiting at the supplier and this is what they act on.",
      );
      return;
    }
    setBusy(true);
    setActionError(null);
    setActionOk(null);
    try {
      await resolveEscalation(resolving.id, { resolution: instruction.trim() });
      setActionOk(
        "Instruction sent. The rider repeats all six checks before they can transport.",
      );
      setResolving(null);
      setInstruction("");
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
          A rider who fails any of the six pickup checks must not transport the order.
          They photograph the problem and wait here for instruction. A defect that leaves
          the supplier unlogged becomes GRIDGO&rsquo;s liability rather than the
          supplier&rsquo;s, which is what the Zero-Risk Reprint Guarantee rests on.
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
            body="Every pickup has either passed its six checks or already had an instruction. A failed check appears here straight away — riders cannot move without one."
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
                evidence={data?.evidence ?? {}}
                onResolve={() => {
                  setActionError(null);
                  setInstruction("");
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
                evidence={data?.evidence ?? {}}
              />
            ))}
          </ul>
        </section>
      ) : null}

      <AlertDialog
        open={!!resolving}
        onOpenChange={(open) => {
          if (!open) {
            setResolving(null);
            setInstruction("");
            setActionError(null);
          }
        }}
      >
        <AlertDialogContent className="sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Tell the rider what to do</AlertDialogTitle>
            <AlertDialogDescription>
              The rider is at the supplier and cannot move until you answer. Whatever you
              write here reaches them, and they then repeat all six checks from the start
              before transporting.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="instruction">Instruction</FieldLabel>
              <Textarea
                id="instruction"
                rows={4}
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="e.g. Supplier is reprinting the affected batch. Wait on site, then repeat all six checks."
              />
              <FieldDescription>
                Say what happens to the order and what the rider does next.
              </FieldDescription>
            </Field>
          </FieldGroup>
          {actionError ? (
            <p className="text-body text-error m-0" role="alert">
              {actionError}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel
              variant="secondary"
              disabled={busy}
              onClick={() => setResolving(null)}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="primary"
              disabled={busy}
              onClick={() => void apply()}
            >
              {busy ? "Sending…" : "Send instruction"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EscalationCard({
  escalation,
  order,
  evidence,
  onResolve,
}: {
  escalation: Escalation;
  order: Order | undefined;
  evidence: Record<string, StoredFile>;
  onResolve?: () => void;
}) {
  const status = presentEscalationStatus(escalation.status);
  const orderStatus = order ? presentOrderState(order.state, order) : null;

  return (
    <li className="gg-card flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className="text-body text-text-primary m-0"
            style={{ fontFamily: "var(--font-medium)" }}
          >
            {order?.title ?? "Order no longer visible"}
          </p>
          <p className="text-caption text-text-muted m-0 mt-0.5">
            Order {escalation.orderId}
          </p>
          <p className="text-caption text-text-muted m-0 mt-0.5">
            Raised {formatDateTime(escalation.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {orderStatus ? (
            <StatusChip
              tone={orderStatus.tone}
              label={orderStatus.label}
              icon={orderStatus.icon}
            />
          ) : null}
          <StatusChip tone={status.tone} label={status.label} icon={status.icon} />
        </div>
      </div>

      <div>
        <p className="text-caption text-text-muted m-0">Checks that failed</p>
        <ul className="m-0 mt-1 flex list-none flex-wrap gap-2 p-0">
          {escalation.failedCheckCodes.map((code) => (
            <li key={code}>
              <StatusChip tone="error" label={presentPickupCheck(code)} icon="circle-x" />
            </li>
          ))}
        </ul>
      </div>

      {escalation.failureNote ? (
        <div>
          <p className="text-caption text-text-muted m-0">What the rider saw</p>
          <p className="text-body text-text-primary m-0 mt-1">{escalation.failureNote}</p>
        </div>
      ) : null}

      <div>
        <p className="text-caption text-text-muted m-0">Photo evidence</p>
        {escalation.evidenceFileIds.length ? (
          <ul className="m-0 mt-2 flex list-none flex-col gap-3 p-0">
            {escalation.evidenceFileIds.map((fileId) => {
              const file = evidence[fileId];
              return (
                <li key={fileId}>
                  <EvidencePlate
                    fileId={fileId}
                    label={file?.originalFilename || "Pickup photo"}
                    caption={file?.originalFilename}
                  />
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-body text-text-secondary m-0 mt-1">
            No photo was attached. Ask the rider for one before deciding — it is what
            protects the guarantee.
          </p>
        )}
      </div>

      {escalation.resolution ? (
        <div className="border-t border-outline-subtle pt-3">
          <p className="text-caption text-text-muted m-0">Instruction given</p>
          <p className="text-body text-text-primary m-0 mt-1">{escalation.resolution}</p>
          <p className="text-caption text-text-muted m-0 mt-1">
            {formatDateTime(escalation.resolvedAt)}
          </p>
        </div>
      ) : null}

      {onResolve ? (
        <div className="border-t border-outline-subtle pt-3">
          <Button variant="secondary" onClick={onResolve}>
            Give an instruction
          </Button>
        </div>
      ) : null}
    </li>
  );
}
