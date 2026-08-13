"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Check, ChevronRight, CircleDot } from "lucide-react";

import {
  explainCandidates,
  formatCapacity,
  formatTurnaround,
  formatZones,
  type ExplainedCandidate,
} from "@/app/ops/_lib/matching";
import {
  presentServiceState,
  presentVerification,
  presentZone,
} from "@/app/ops/_lib/present";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  DataTableRowAction,
  type DataTableColumn,
} from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { StatusChip } from "@/components/ui/StatusChip";
import {
  ApiError,
  getEligibleSuppliers,
  listOrders,
  transitionOrder,
} from "@/lib/api/client";
import type { EligibleSuppliersResult, Order } from "@/lib/api/types";
import { presentOrderState } from "@/lib/order-state";

export default function OpsMatchingPage() {
  const searchParams = useSearchParams();
  const preselect = searchParams.get("order");

  const [orders, setOrders] = useState<Order[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(preselect);
  const [eligible, setEligible] = useState<EligibleSuppliersResult | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [eligibleError, setEligibleError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingEligible, setLoadingEligible] = useState(false);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNote, setActionNote] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listOrders();
      setOrders(data);
    } catch (err) {
      setOrders(null);
      if (err instanceof ApiError) {
        setError(`Could not load orders (${err.code}).`);
      } else {
        setError("Network error loading orders for matching.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  const matchingQueue = useMemo(() => {
    if (!orders) return [];
    return orders
      .filter((o) => o.state === "approved_for_matching")
      .sort((a, b) => (a.updatedAt || "").localeCompare(b.updatedAt || ""));
  }, [orders]);

  useEffect(() => {
    if (!matchingQueue.length) {
      setSelectedId(null);
      return;
    }
    if (selectedId && matchingQueue.some((o) => o.id === selectedId)) return;
    if (preselect && matchingQueue.some((o) => o.id === preselect)) {
      setSelectedId(preselect);
      return;
    }
    setSelectedId(matchingQueue[0].id);
  }, [matchingQueue, selectedId, preselect]);

  const loadEligible = useCallback(async (orderId: string) => {
    setLoadingEligible(true);
    setEligibleError(null);
    setEligible(null);
    setActionError(null);
    try {
      const result = await getEligibleSuppliers(orderId);
      setEligible(result);
    } catch (err) {
      setEligible(null);
      if (err instanceof ApiError) {
        setEligibleError(
          `Could not load eligible suppliers (${err.code}).`,
        );
      } else {
        setEligibleError("Network error loading eligible suppliers.");
      }
    } finally {
      setLoadingEligible(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) void loadEligible(selectedId);
  }, [selectedId, loadEligible]);

  const candidates = useMemo(
    () => (eligible ? explainCandidates(eligible.candidates) : []),
    [eligible],
  );

  const selectedOrder = matchingQueue.find((o) => o.id === selectedId) ?? null;

  async function assignSupplier(candidate: ExplainedCandidate) {
    if (!selectedOrder || !candidate.eligible) return;
    setAssigning(candidate.supplierId);
    setActionError(null);
    setActionNote(null);
    try {
      await transitionOrder(selectedOrder.id, "supplier_assigned", {
        supplierId: candidate.supplierId,
        matchingServiceIds: candidate.matchingServiceIds,
        note: `Assigned ${candidate.supplierName}`,
      });
      setActionNote(
        `${candidate.supplierName} assigned. The order left the matching queue.`,
      );
      await loadOrders();
      setEligible(null);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "transition_not_allowed") {
          setActionError(
            "Assignment is not allowed from the current state. Refresh and try again.",
          );
        } else {
          setActionError(`Could not assign supplier (${err.code}).`);
        }
      } else {
        setActionError("Network error while assigning. Try again.");
      }
    } finally {
      setAssigning(null);
    }
  }

  const queueColumns = useMemo<DataTableColumn<Order>[]>(
    () => [
      {
        id: "order",
        header: "Order",
        primary: true,
        sortValue: (o) => o.title,
        filterValue: (o) => `${o.title} ${o.id}`,
        cell: (o) => (
          <div>
            <p
              className="text-body text-text-primary m-0"
              style={{ fontFamily: "var(--font-medium)" }}
            >
              {o.title}
            </p>
            <p className="text-caption text-text-muted m-0 mt-0.5">
              {presentZone(o.zone)} · qty {o.quantity}
            </p>
          </div>
        ),
      },
      {
        id: "material",
        header: "Material",
        sortValue: (o) => o.material,
        cell: (o) => (
          <span className="text-body text-text-secondary">{o.material}</span>
        ),
      },
    ],
    [],
  );

  if (loading && !orders) {
    return <LoadingBlock label="Loading matching queue…" />;
  }

  if (error) {
    return (
      <ErrorState
        body={error}
        action={
          <Button variant="secondary" onClick={() => void loadOrders()}>
            Retry
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-body text-text-secondary m-0 max-w-prose">
          Operations chooses the supplier. Each candidate shows why it
          qualifies — this is not an auto-ranker.
        </p>
        <Button variant="secondary" onClick={() => void loadOrders()}>
          Refresh
        </Button>
      </div>

      {actionNote ? (
        <p className="text-body text-success m-0" role="status">
          {actionNote}
        </p>
      ) : null}

      {!matchingQueue.length ? (
        <EmptyState
          title="No orders waiting for matching"
          body="Orders appear here after QA approves them for matching. Open the QA queue to progress work into this stage."
          action={
            <Button
              variant="secondary"
              nativeButton={false}
              render={<Link href="/ops/qa" />}
            >
              Open QA queue
            </Button>
          }
        />
      ) : (
        <>
          <section aria-labelledby="match-queue-heading">
            <h2
              id="match-queue-heading"
              className="text-h3 text-text-primary m-0 mb-3"
            >
              Ready to match ({matchingQueue.length})
            </h2>
            <DataTable
              columns={queueColumns}
              data={matchingQueue}
              getRowId={(o) => o.id}
              caption="Orders ready for supplier matching"
              filterPlaceholder="Filter matching queue…"
              rowActions={(o) => (
                <DataTableRowAction
                  label={o.id === selectedId ? "Selected" : "Select"}
                  icon={o.id === selectedId ? Check : CircleDot}
                  variant={o.id === selectedId ? "default" : "outline"}
                  aria-pressed={o.id === selectedId}
                  onClick={() => setSelectedId(o.id)}
                />
              )}
            />
          </section>

          {selectedOrder ? (
            <section
              className="gg-card flex flex-col gap-4"
              aria-labelledby="candidates-heading"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2
                    id="candidates-heading"
                    className="text-h3 text-text-primary m-0"
                  >
                    Eligible suppliers
                  </h2>
                  <p className="text-body text-text-secondary m-0 mt-1">
                    {selectedOrder.title} · {presentZone(selectedOrder.zone)} ·{" "}
                    {selectedOrder.material} · qty {selectedOrder.quantity}
                  </p>
                  <p className="text-caption text-text-muted m-0 mt-1">
                    Status: {presentOrderState(selectedOrder.state).label}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  nativeButton={false}
                  render={<Link href={`/ops/qa/${selectedOrder.id}`} />}
                >
                  Open workspace
                  <ChevronRight data-icon="inline-end" aria-hidden />
                </Button>
              </div>

              {loadingEligible ? (
                <LoadingBlock label="Loading eligible suppliers…" />
              ) : eligibleError ? (
                <ErrorState
                  body={eligibleError}
                  action={
                    <Button
                      variant="secondary"
                      onClick={() => void loadEligible(selectedOrder.id)}
                    >
                      Retry
                    </Button>
                  }
                />
              ) : !candidates.length ? (
                <EmptyState
                  title="No supplier candidates returned"
                  body="The matching endpoint returned an empty list. Confirm suppliers have live services covering this zone, material, and quantity."
                />
              ) : (
                <ul className="m-0 flex list-none flex-col gap-3 p-0">
                  {candidates.map((c) => {
                    const verification = presentVerification(
                      c.verificationStatus,
                    );
                    return (
                      <li
                        key={c.supplierId}
                        className="rounded-[var(--radius-card)] border border-outline p-4 flex flex-col gap-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p
                              className="text-body text-text-primary m-0"
                              style={{ fontFamily: "var(--font-medium)" }}
                            >
                              {c.supplierName}
                            </p>
                            <p className="text-caption text-text-muted m-0 mt-1">
                              Capacity {formatCapacity(c.capacityDaily, c.capacityWeekly)}
                              {" · "}
                              Turnaround {formatTurnaround(c.minTurnaroundHours)}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <StatusChip
                              tone={c.eligible ? "success" : "error"}
                              label={c.eligible ? "Eligible" : "Not eligible"}
                              icon={
                                c.eligible ? "circle-check" : "circle-x"
                              }
                            />
                            <StatusChip
                              tone={verification.tone}
                              label={verification.label}
                              icon={verification.icon}
                            />
                          </div>
                        </div>

                        <div>
                          <p className="text-caption text-text-muted m-0 mb-1">
                            Why this supplier
                          </p>
                          <ul className="m-0 pl-4 text-body text-text-secondary">
                            {c.reasons.length ? (
                              c.reasons.map((r, i) => (
                                <li key={`${c.supplierId}-r-${i}`}>{r}</li>
                              ))
                            ) : (
                              <li>
                                {c.eligible
                                  ? "Meets declared service criteria"
                                  : "No reasons returned"}
                              </li>
                            )}
                          </ul>
                        </div>

                        <dl className="m-0 grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <div>
                            <dt className="text-caption text-text-muted">
                              Zones on live services
                            </dt>
                            <dd className="text-body text-text-primary m-0">
                              {formatZones(c.zones)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-caption text-text-muted">
                              Declared services
                            </dt>
                            <dd className="text-body text-text-primary m-0">
                              {c.services.length
                                ? c.services
                                    .map((s) => {
                                      const cat = s.categoryCode
                                        .split(/[_-]/)
                                        .map(
                                          (p) =>
                                            p.charAt(0).toUpperCase() +
                                            p.slice(1),
                                        )
                                        .join(" ");
                                      return `${cat} (${presentServiceState(s.state).label})`;
                                    })
                                    .join("; ")
                                : "None listed"}
                            </dd>
                          </div>
                        </dl>

                        {c.eligible ? (
                          <div>
                            {/* Outline only — assign is a row action, not a page-level yellow CTA. */}
                            <Button
                              variant="secondary"
                              disabled={assigning !== null}
                              onClick={() => void assignSupplier(c)}
                            >
                              {assigning === c.supplierId
                                ? "Assigning…"
                                : `Assign ${c.supplierName}`}
                            </Button>
                            <p className="text-caption text-text-muted m-0 mt-2">
                              Assignment records the matching services the API
                              returned for this candidate.
                            </p>
                          </div>
                        ) : (
                          <p className="text-caption text-text-muted m-0">
                            Not eligible for this order — review the reasons
                            above before changing supplier services.
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              {actionError ? (
                <p className="text-body text-error m-0" role="alert">
                  {actionError}
                </p>
              ) : null}
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
