"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { ServiceFormDialog } from "@/app/supplier/_components/ServiceFormDialog";
import {
  actionsForService,
  presentPricingBasis,
  presentServiceState,
  sortServices,
} from "@/app/supplier/_lib/service-state";
import {
  categoryName,
  finishNames,
  materialNames,
  zoneNames,
} from "@/app/supplier/_lib/taxonomy-labels";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { StatusChip } from "@/components/ui/StatusChip";
import {
  ApiError,
  createSupplierService,
  getTaxonomy,
  listSupplierServices,
  listZones,
  submitSupplierService,
  updateSupplierService,
  withdrawSupplierService,
} from "@/lib/api/client";
import type {
  CreateSupplierServiceInput,
  SupplierService,
  Taxonomy,
  Zone,
} from "@/lib/api/types";
import { formatPhp } from "@/lib/format";

type LoadState = {
  services: SupplierService[];
  taxonomy: Taxonomy;
  zones: Zone[];
};

export default function SupplierCataloguePage() {
  const [data, setData] = useState<LoadState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [editing, setEditing] = useState<SupplierService | null>(null);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [withdrawTarget, setWithdrawTarget] = useState<SupplierService | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [services, taxonomy, zones] = await Promise.all([
        listSupplierServices(),
        getTaxonomy(),
        listZones(),
      ]);
      setData({
        services: sortServices(services),
        taxonomy,
        zones,
      });
    } catch (err) {
      setData(null);
      if (err instanceof ApiError) {
        setError(
          err.status === 403
            ? "The service catalogue is only available to supplier accounts."
            : `Could not load catalogue (${err.code}). Check the API and try again.`,
        );
      } else {
        setError(
          "Network error loading the catalogue. Confirm the demo API is running, then retry.",
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(input: CreateSupplierServiceInput) {
    setFormBusy(true);
    setFormError(null);
    try {
      await createSupplierService(input);
      setFormOpen(false);
      await load();
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(
          err.code === "unknown_taxonomy_code" || err.kind === "validation"
            ? "That code is not on the platform taxonomy. Pick only listed categories, materials, finishes, and zones."
            : `Could not save draft (${err.code}).`,
        );
      } else {
        setFormError("Network error while saving. Try again.");
      }
    } finally {
      setFormBusy(false);
    }
  }

  async function handleUpdate(input: CreateSupplierServiceInput) {
    if (!editing) return;
    setFormBusy(true);
    setFormError(null);
    try {
      await updateSupplierService(editing.id, input);
      setFormOpen(false);
      setEditing(null);
      await load();
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(
          err.code === "service_withdrawn"
            ? "This line was withdrawn and cannot be edited until re-submitted."
            : err.kind === "validation"
              ? "That update used a code outside the platform taxonomy."
              : `Could not save changes (${err.code}).`,
        );
      } else {
        setFormError("Network error while saving. Try again.");
      }
    } finally {
      setFormBusy(false);
    }
  }

  async function handleSubmit(service: SupplierService) {
    setActionBusy(service.id);
    setActionError(null);
    try {
      await submitSupplierService(service.id);
      await load();
    } catch (err) {
      if (err instanceof ApiError) {
        setActionError(
          err.code === "already_live"
            ? "This line is already live."
            : `Could not submit (${err.code}).`,
        );
      } else {
        setActionError("Network error while submitting. Try again.");
      }
    } finally {
      setActionBusy(null);
    }
  }

  async function handleWithdraw() {
    if (!withdrawTarget) return;
    setActionBusy(withdrawTarget.id);
    setActionError(null);
    try {
      await withdrawSupplierService(withdrawTarget.id);
      setWithdrawTarget(null);
      await load();
    } catch (err) {
      if (err instanceof ApiError) {
        setActionError(`Could not withdraw (${err.code}).`);
      } else {
        setActionError("Network error while withdrawing. Try again.");
      }
    } finally {
      setActionBusy(null);
    }
  }

  const columns = useMemo<DataTableColumn<SupplierService>[]>(() => {
    if (!data) return [];
    const { taxonomy, zones } = data;
    return [
      {
        id: "capability",
        header: "Capability",
        primary: true,
        sortValue: (s) => categoryName(s.categoryCode, taxonomy),
        filterValue: (s) =>
          [
            categoryName(s.categoryCode, taxonomy),
            ...materialNames(s.materialCodes, taxonomy),
            ...finishNames(s.finishCodes, taxonomy),
          ].join(" "),
        cell: (s) => (
          <div>
            <p
              className="text-body text-text-primary m-0"
              style={{ fontFamily: "var(--font-medium)" }}
            >
              {categoryName(s.categoryCode, taxonomy)}
            </p>
            <p className="text-caption text-text-muted m-0 mt-0.5">
              {materialNames(s.materialCodes, taxonomy).join(", ") || "No materials"}
            </p>
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        sortValue: (s) => presentServiceState(s.state, s).label,
        filterValue: (s) => presentServiceState(s.state, s).label,
        cell: (s) => {
          const status = presentServiceState(s.state, s);
          return (
            <StatusChip tone={status.tone} label={status.label} icon={status.icon} />
          );
        },
      },
      {
        id: "pricing",
        header: "Pricing",
        sortValue: (s) => s.referenceRateMinor,
        cell: (s) => (
          <span className="text-body text-text-secondary">
            {formatPhp(s.referenceRateMinor)} · {presentPricingBasis(s.pricingBasis)}
          </span>
        ),
      },
      {
        id: "turnaround",
        header: "Turnaround",
        sortValue: (s) => s.turnaroundHours,
        cell: (s) => (
          <span className="text-body text-text-secondary whitespace-nowrap">
            {s.turnaroundHours}h
          </span>
        ),
      },
      {
        id: "capacity",
        header: "Capacity",
        sortValue: (s) => s.capacityDaily ?? -1,
        cell: (s) => (
          <span className="text-body text-text-secondary">
            {s.capacityDaily != null ? `${s.capacityDaily}/day` : "—"}
            {s.capacityWeekly != null ? ` · ${s.capacityWeekly}/wk` : ""}
          </span>
        ),
      },
      {
        id: "zones",
        header: "Zones",
        filterValue: (s) => zoneNames(s.zones, zones).join(" "),
        cell: (s) => (
          <span className="text-body text-text-secondary">
            {zoneNames(s.zones, zones).join(", ") || "—"}
          </span>
        ),
      },
      {
        id: "next",
        header: "Why / next",
        filterValue: (s) => {
          const p = presentServiceState(s.state, s);
          return `${p.whyNotLive ?? ""} ${p.nextStep}`;
        },
        cell: (s) => {
          const p = presentServiceState(s.state, s);
          return (
            <div className="max-w-xs">
              {p.whyNotLive ? (
                <p className="text-caption text-text-secondary m-0">{p.whyNotLive}</p>
              ) : null}
              <p className="text-caption text-text-muted m-0 mt-0.5">{p.nextStep}</p>
            </div>
          );
        },
      },
    ];
  }, [data]);

  if (loading && !data) {
    return <LoadingBlock label="Loading service catalogue…" />;
  }
  if (error || !data) {
    return (
      <ErrorState
        body={error ?? "Could not load catalogue."}
        action={
          <Button variant="secondary" onClick={() => void load()}>
            Retry
          </Button>
        }
      />
    );
  }

  const { services, taxonomy, zones } = data;
  const needsAttention = services.filter((s) =>
    ["draft", "suspended", "pending_verification"].includes(s.state),
  ).length;

  return (
    <>
      <AlertDialog
        open={withdrawTarget != null}
        onOpenChange={(open) => {
          if (!open) setWithdrawTarget(null);
        }}
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="max-w-prose">
              <p className="text-body text-text-secondary m-0">
                Declare what your shop can produce using platform categories, materials,
                finishes, and zones. Lines move{" "}
                <span style={{ fontFamily: "var(--font-medium)" }}>
                  draft → verification → live
                </span>
                . Withdrawing a line stops new matches only — in-flight orders keep
                running.
              </p>
              <p className="text-caption text-text-muted m-0 mt-1">
                {services.length} line{services.length === 1 ? "" : "s"}
                {needsAttention > 0 ? ` · ${needsAttention} not live yet` : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => void load()}>
                Refresh
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setFormMode("create");
                  setEditing(null);
                  setFormError(null);
                  setFormOpen(true);
                }}
              >
                Add service line
              </Button>
            </div>
          </div>

          {actionError ? (
            <p className="text-body text-error m-0" role="alert">
              {actionError}
            </p>
          ) : null}

          {!services.length ? (
            <EmptyState
              title="No service lines yet"
              body="Add a capability from the platform taxonomy so Operations can match jobs to your shop."
              action={
                // Secondary: the page already carries its one yellow CTA above.
                <Button
                  variant="secondary"
                  onClick={() => {
                    setFormMode("create");
                    setEditing(null);
                    setFormError(null);
                    setFormOpen(true);
                  }}
                >
                  Add service line
                </Button>
              }
            />
          ) : (
            <DataTable
              columns={columns}
              data={services}
              getRowId={(s) => s.id}
              caption="Service catalogue"
              filterPlaceholder="Filter services…"
              rowActions={(s) => {
                const actions = actionsForService(s.state);
                return (
                  <div className="flex flex-wrap gap-2">
                    {actions.map((action) => {
                      if (action.kind === "edit") {
                        return (
                          <Button
                            key={action.kind}
                            variant="secondary"
                            disabled={actionBusy === s.id}
                            onClick={() => {
                              setFormMode("edit");
                              setEditing(s);
                              setFormError(null);
                              setFormOpen(true);
                            }}
                          >
                            {action.label}
                          </Button>
                        );
                      }
                      if (action.kind === "submit") {
                        return (
                          <Button
                            key={action.kind}
                            variant="secondary"
                            disabled={actionBusy === s.id}
                            onClick={() => void handleSubmit(s)}
                          >
                            {actionBusy === s.id ? "Submitting…" : action.label}
                          </Button>
                        );
                      }
                      return (
                        <AlertDialogTrigger
                          key={action.kind}
                          render={
                            <Button variant="danger" disabled={actionBusy === s.id} />
                          }
                          onClick={() => setWithdrawTarget(s)}
                        >
                          {action.label}
                        </AlertDialogTrigger>
                      );
                    })}
                  </div>
                );
              }}
            />
          )}
        </div>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Withdraw from matching?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the line from new job matches only. In-flight orders already
              assigned to your shop keep running — withdrawal does not cancel them. You
              can re-submit later for verification.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              variant="secondary"
              disabled={actionBusy != null}
              onClick={() => setWithdrawTarget(null)}
            >
              Keep line
            </AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              disabled={actionBusy != null}
              onClick={() => void handleWithdraw()}
            >
              {actionBusy ? "Withdrawing…" : "Confirm withdraw"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ServiceFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) {
            setEditing(null);
            setFormError(null);
          }
        }}
        mode={formMode}
        service={editing}
        taxonomy={taxonomy}
        zones={zones}
        busy={formBusy}
        error={formError}
        onSubmit={formMode === "create" ? handleCreate : handleUpdate}
      />
    </>
  );
}
