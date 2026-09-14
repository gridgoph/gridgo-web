"use client";

import { useLiveReload } from "@/lib/live/useLiveReload";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle, Eye, Unlock, type LucideIcon } from "lucide-react";

import {
  buildRecoveryItems,
  presentRecoveryKind,
  type RecoveryItem,
} from "@/app/ops/_lib/recovery";
import {
  presentIssueKind,
  presentIssueStatus,
} from "@/app/ops/_lib/present";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DataTable,
  DataTableRowAction,
  type DataTableColumn,
} from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { StatusChip } from "@/components/ui/StatusChip";
import { Textarea } from "@/components/ui/textarea";
import {
  ApiError,
  listClaims,
  listIssues,
  listOrders,
  resolveIssue,
} from "@/lib/api/client";
import type { Claim, Issue, Order } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import { presentOrderState } from "@/lib/order-state";

export default function OpsRecoveryPage() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [resolveTarget, setResolveTarget] = useState<Issue | null>(null);
  const [resolution, setResolution] = useState("");
  const [resolving, setResolving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [o, c, i] = await Promise.all([
        listOrders(),
        listClaims(),
        listIssues(),
      ]);
      setOrders(o);
      setClaims(c);
      setIssues(i);
    } catch (err) {
      setOrders(null);
      if (err instanceof ApiError) {
        setError(`Could not load recovery data (${err.code}).`);
      } else {
        setError("Network error loading recovery queues.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useLiveReload(["orders", "claims", "escalations"], load);

  useEffect(() => {
    void load();
  }, [load]);

  const items = useMemo(
    () => (orders ? buildRecoveryItems(orders, claims, issues) : []),
    [orders, claims, issues],
  );

  const openIssues = useMemo(
    () => issues.filter((i) => i.status === "open"),
    [issues],
  );

  async function submitResolve() {
    if (!resolveTarget) return;
    const text = resolution.trim();
    if (!text) {
      setActionError("Record how the issue was resolved before continuing.");
      return;
    }
    setResolving(true);
    setActionError(null);
    try {
      await resolveIssue(resolveTarget.id, {
        resolution: text,
        reason: text,
        status: "resolved",
        // Do not auto-release payout — money actions stay on Claims.
        releasePayout: false,
      });
      setResolveTarget(null);
      setResolution("");
      await load();
    } catch (err) {
      if (err instanceof ApiError) {
        setActionError(`Could not resolve issue (${err.code}).`);
      } else {
        setActionError("Network error while resolving. Try again.");
      }
    } finally {
      setResolving(false);
    }
  }

  const columns = useMemo<DataTableColumn<RecoveryItem>[]>(
    () => [
      {
        id: "order",
        header: "Order",
        primary: true,
        sortValue: (r) => r.orderTitle,
        filterValue: (r) =>
          `${r.orderTitle} ${r.orderId} ${r.summary} ${presentRecoveryKind(r.kind)}`,
        cell: (r) => (
          <div>
            <p
              className="text-body text-text-primary m-0"
              style={{ fontFamily: "var(--font-medium)" }}
            >
              {r.orderTitle}
            </p>
            <p className="text-caption text-text-muted m-0 mt-0.5">
              Order {r.orderId}
            </p>
            <p className="text-caption text-text-muted m-0 mt-0.5">
              {presentRecoveryKind(r.kind)}
            </p>
          </div>
        ),
      },
      {
        id: "status",
        header: "Order status",
        sortValue: (r) => presentOrderState(r.orderState).label,
        cell: (r) => {
          if (!r.orderState) {
            return (
              <span className="text-body text-text-muted">Unknown</span>
            );
          }
          const s = presentOrderState(r.orderState);
          return (
            <StatusChip tone={s.tone} label={s.label} icon={s.icon} />
          );
        },
      },
      {
        id: "summary",
        header: "What happened",
        sortValue: (r) => r.summary,
        cell: (r) => (
          <span className="text-body text-text-secondary">{r.summary}</span>
        ),
      },
      {
        id: "updated",
        header: "Updated",
        sortValue: (r) => r.updatedAt,
        cell: (r) => (
          <span className="text-body text-text-secondary whitespace-nowrap">
            {formatDateTime(r.updatedAt)}
          </span>
        ),
      },
      {
        id: "next",
        header: "Next step",
        sortValue: (r) => r.nextLabel,
        cell: (r) => (
          <span className="text-body text-text-secondary">{r.nextLabel}</span>
        ),
      },
    ],
    [],
  );

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

  const pending = loading && !orders;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-body text-text-secondary m-0 max-w-prose">
          Failed QC paths, client issues, and payout holds — each row has a
          next action. Resolving an issue does not release payout; use Claims
          for money holds.
        </p>
        <Button
          variant="secondary"
          disabled={loading}
          onClick={() => void load()}
        >
          Refresh
        </Button>
      </div>

      {openIssues.length > 0 ? (
        <section
          className="gg-card flex flex-col gap-3"
          aria-labelledby="open-issues-heading"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2
              id="open-issues-heading"
              className="text-h3 text-text-primary m-0"
            >
              Open issues ({openIssues.length})
            </h2>
            <StatusChip
              tone="warning"
              label="Action required"
              icon="triangle-alert"
            />
          </div>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {openIssues.map((issue) => {
              const status = presentIssueStatus(issue.status);
              const order = orders?.find((o) => o.id === issue.orderId);
              return (
                <li
                  key={issue.id}
                  className="rounded-[var(--radius-card)] border border-outline p-3 flex flex-col gap-2"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p
                        className="text-body text-text-primary m-0"
                        style={{ fontFamily: "var(--font-medium)" }}
                      >
                        {order?.title ?? issue.orderId}
                      </p>
                      <p className="text-caption text-text-muted m-0 mt-0.5">
                        Order {issue.orderId}
                      </p>
                      <p className="text-caption text-text-muted m-0 mt-0.5">
                        {presentIssueKind(issue.kind)} ·{" "}
                        {formatDateTime(issue.createdAt)}
                      </p>
                    </div>
                    <StatusChip
                      tone={status.tone}
                      label={status.label}
                      icon={status.icon}
                    />
                  </div>
                  <p className="text-body text-text-secondary m-0">
                    {issue.description}
                  </p>
                  <p className="text-caption text-text-muted m-0">
                    Resolving records the fix. Active payout holds stay until
                    released on Claims.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setResolveTarget(issue);
                        setResolution("");
                        setActionError(null);
                      }}
                    >
                      Resolve issue
                    </Button>
                    <Button
                      variant="secondary"
                      nativeButton={false}
                      render={<Link href="/ops/claims" />}
                    >
                      Open claims
                    </Button>
                    {order ? (
                      <Button
                        variant="secondary"
                        nativeButton={false}
                        render={<Link href={`/ops/orders/${order.id}`} />}
                      >
                        Open order
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {!pending && !items.length ? (
        <EmptyState
          title="Nothing in recovery"
          body="No open issues, payout holds, client corrections, or stalled assignments. When a path fails, it lands here with a next step."
          action={
            <Button variant="secondary" onClick={() => void load()}>
              Refresh
            </Button>
          }
        />
      ) : (
        <section aria-labelledby="recovery-list-heading">
          <h2
            id="recovery-list-heading"
            className="text-h3 text-text-primary m-0 mb-3"
          >
            Recovery queue{pending ? "" : ` (${items.length})`}
          </h2>
          <DataTable
            columns={columns}
            data={items}
            loading={pending}
            getRowId={(r) => r.id}
            caption="Recovery items needing Operations"
            filterPlaceholder="Filter recovery…"
            rowActions={(r) => {
              if (r.kind === "open_issue" && r.issueId) {
                const issue = issues.find((i) => i.id === r.issueId);
                return (
                  <DataTableRowAction
                    label="Resolve"
                    icon={CheckCircle}
                    onClick={() => {
                      if (issue) {
                        setResolveTarget(issue);
                        setResolution("");
                        setActionError(null);
                      }
                    }}
                  />
                );
              }
              return (
                <DataTableRowAction
                  label={r.nextLabel}
                  icon={recoveryActionIcon(r)}
                  href={r.nextHref}
                />
              );
            }}
          />
        </section>
      )}

      <Dialog
        open={resolveTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setResolveTarget(null);
            setActionError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Resolve issue</DialogTitle>
            <DialogDescription>
              Record what was done. This does not release a payout hold —
              release holds on Claims with their own reason.
            </DialogDescription>
          </DialogHeader>
          {resolveTarget ? (
            <FieldGroup>
              <p className="text-body text-text-secondary m-0">
                {resolveTarget.description}
              </p>
              <Field>
                <FieldLabel htmlFor="resolution">Resolution</FieldLabel>
                <Textarea
                  id="resolution"
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  placeholder="e.g. Reprinted and redelivered"
                  rows={3}
                  required
                />
              </Field>
              {actionError ? (
                <p className="text-body text-error m-0" role="alert">
                  {actionError}
                </p>
              ) : null}
            </FieldGroup>
          ) : null}
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setResolveTarget(null)}
              disabled={resolving}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={resolving}
              onClick={() => void submitResolve()}
            >
              {resolving ? "Saving…" : "Resolve issue"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function recoveryActionIcon(item: RecoveryItem): LucideIcon {
  switch (item.kind) {
    case "payout_hold":
      return Unlock;
    case "issue_window":
      return item.nextLabel === "Close as completed" ? CheckCircle : Eye;
    default:
      return Eye;
  }
}
