"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  presentServiceState,
  presentVerification,
  verificationActions,
  type VerificationAction,
} from "@/app/admin/_lib/present";
import { adminErrorMessage } from "@/app/admin/_lib/errors";
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
} from "@/components/ui/alert-dialog";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { StatusChip } from "@/components/ui/StatusChip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  listSupplierServices,
  listUsers,
  setUserVerification,
  suspendSupplierService,
  verifySupplierService,
} from "@/lib/api/client";
import type { SupplierService, User } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";

type LoadState = {
  suppliers: User[];
  riders: User[];
  services: SupplierService[];
};

type ConfirmUser = {
  user: User;
  action: VerificationAction;
};

type ConfirmService =
  | { kind: "verify"; service: SupplierService }
  | { kind: "suspend"; service: SupplierService };

export default function AdminVerificationPage() {
  const [data, setData] = useState<LoadState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionOk, setActionOk] = useState<string | null>(null);
  const [confirmUser, setConfirmUser] = useState<ConfirmUser | null>(null);
  const [confirmService, setConfirmService] = useState<ConfirmService | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [suppliers, riders, services] = await Promise.all([
        listUsers("supplier"),
        listUsers("rider"),
        listSupplierServices(),
      ]);
      setData({ suppliers, riders, services });
    } catch (err) {
      setData(null);
      setError(
        adminErrorMessage(
          err,
          "Could not load verification queues. Confirm the demo API is running.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const pendingCount = useMemo(() => {
    if (!data) return 0;
    return [...data.suppliers, ...data.riders].filter(
      (u) => u.verificationStatus === "pending",
    ).length;
  }, [data]);

  const serviceColumns = useMemo<DataTableColumn<SupplierService>[]>(
    () => [
      {
        id: "service",
        header: "Service",
        primary: true,
        sortValue: (s) => s.categoryCode,
        filterValue: (s) => `${s.categoryCode} ${s.id} ${s.supplierId} ${s.state}`,
        cell: (s) => (
          <div>
            <p
              className="text-body text-text-primary m-0"
              style={{ fontFamily: "var(--font-medium)" }}
            >
              {s.categoryCode.replace(/_/g, " ")}
            </p>
            <p className="text-caption text-text-muted m-0 mt-0.5">
              Supplier {s.supplierId.replace(/^user_/, "")}
            </p>
          </div>
        ),
      },
      {
        id: "state",
        header: "Status",
        sortValue: (s) => presentServiceState(s.state).label,
        cell: (s) => {
          const p = presentServiceState(s.state);
          return <StatusChip tone={p.tone} label={p.label} icon={p.icon} />;
        },
      },
      {
        id: "zones",
        header: "Zones",
        sortValue: (s) => s.zones.join(", "),
        cell: (s) => (
          <span className="text-body text-text-secondary">
            {s.zones.length ? s.zones.map((z) => z.replace(/_/g, " ")).join(", ") : "—"}
          </span>
        ),
      },
      {
        id: "updated",
        header: "Updated",
        sortValue: (s) => s.updatedAt || "",
        cell: (s) => (
          <span className="text-body text-text-secondary whitespace-nowrap">
            {formatDateTime(s.updatedAt)}
          </span>
        ),
      },
    ],
    [],
  );

  async function applyUserVerification() {
    if (!confirmUser) return;
    setBusy(true);
    setActionError(null);
    setActionOk(null);
    try {
      await setUserVerification(confirmUser.user.id, {
        status: confirmUser.action.status,
        reason: reason.trim() || undefined,
        note: reason.trim() || undefined,
      });
      setActionOk(
        `${confirmUser.user.name}: ${confirmUser.action.label.toLowerCase()} applied.`,
      );
      setConfirmUser(null);
      setReason("");
      await load();
    } catch (err) {
      setActionError(adminErrorMessage(err, "Could not update verification."));
    } finally {
      setBusy(false);
    }
  }

  async function applyServiceAction() {
    if (!confirmService) return;
    setBusy(true);
    setActionError(null);
    setActionOk(null);
    try {
      if (confirmService.kind === "verify") {
        await verifySupplierService(confirmService.service.id, {
          reason: reason.trim() || undefined,
        });
        setActionOk("Service marked live for matching.");
      } else {
        if (!reason.trim()) {
          setActionError("A suspension reason is required.");
          setBusy(false);
          return;
        }
        await suspendSupplierService(confirmService.service.id, {
          reason: reason.trim(),
        });
        setActionOk(
          "Service suspended. It will not be matched to new work; existing orders are unchanged.",
        );
      }
      setConfirmService(null);
      setReason("");
      await load();
    } catch (err) {
      setActionError(adminErrorMessage(err, "Could not update the supplier service."));
    } finally {
      setBusy(false);
    }
  }

  if (loading && !data) {
    return <LoadingBlock label="Loading verification queues…" />;
  }
  if (error || !data) {
    return (
      <ErrorState
        body={error ?? "No data."}
        action={
          <Button variant="secondary" onClick={() => void load()}>
            Retry
          </Button>
        }
      />
    );
  }

  function personColumns(roleLabel: string): DataTableColumn<User>[] {
    return [
      {
        id: "name",
        header: roleLabel,
        primary: true,
        sortValue: (u) => u.name,
        filterValue: (u) => `${u.name} ${u.email} ${u.supplierName ?? ""}`,
        cell: (u) => (
          <div>
            <p
              className="text-body text-text-primary m-0"
              style={{ fontFamily: "var(--font-medium)" }}
            >
              {u.name}
            </p>
            <p className="text-caption text-text-muted m-0 mt-0.5">
              {u.supplierName || u.email}
            </p>
          </div>
        ),
      },
      {
        id: "status",
        header: "Accreditation",
        sortValue: (u) => presentVerification(u.verificationStatus).label,
        filterValue: (u) => presentVerification(u.verificationStatus).label,
        cell: (u) => {
          const p = presentVerification(u.verificationStatus);
          return <StatusChip tone={p.tone} label={p.label} icon={p.icon} />;
        },
      },
      {
        id: "note",
        header: "Note",
        sortValue: (u) => u.verificationNote ?? "",
        cell: (u) => (
          <span className="text-body text-text-secondary">
            {u.verificationNote || "—"}
          </span>
        ),
      },
      {
        id: "verifiedAt",
        header: "Last decision",
        sortValue: (u) => u.verifiedAt ?? "",
        cell: (u) => (
          <span className="text-body text-text-secondary whitespace-nowrap">
            {formatDateTime(u.verifiedAt)}
          </span>
        ),
      },
    ];
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-body text-text-secondary m-0 max-w-prose">
          Supplier and rider accreditation. Suspension stops a supplier’s live services
          from being matched to{" "}
          <strong className="text-text-primary font-medium">new</strong> work; existing
          assigned orders continue. Rider suspension blocks new dispatch offers.
        </p>
        <Button variant="secondary" onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      {pendingCount > 0 ? (
        <div
          className="flex items-start gap-3 rounded-card border border-outline bg-surface px-4 py-3"
          role="status"
        >
          <StatusChip tone="warning" label={`${pendingCount} pending`} icon="clock" />
          <p className="text-body text-text-secondary m-0">
            Accounts waiting for an accreditation decision. Review the Suppliers and
            Riders tabs.
          </p>
        </div>
      ) : null}

      {actionOk ? (
        <p className="text-body text-success m-0" role="status">
          {actionOk}
        </p>
      ) : null}
      {actionError && !confirmUser && !confirmService ? (
        <p className="text-body text-error m-0" role="alert">
          {actionError}
        </p>
      ) : null}

      <Tabs defaultValue="suppliers">
        <TabsList>
          <TabsTrigger value="suppliers">Suppliers ({data.suppliers.length})</TabsTrigger>
          <TabsTrigger value="riders">Riders ({data.riders.length})</TabsTrigger>
          <TabsTrigger value="services">
            Service lines ({data.services.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="suppliers" className="mt-4">
          {!data.suppliers.length ? (
            <EmptyState
              title="No supplier accounts"
              body="Supplier partners appear here once accounts exist on the platform."
            />
          ) : (
            <DataTable
              columns={personColumns("Supplier")}
              data={data.suppliers}
              getRowId={(u) => u.id}
              caption="Supplier verification"
              filterPlaceholder="Filter suppliers…"
              rowActions={(u) => (
                <PersonActions
                  user={u}
                  onAction={(action) => {
                    setActionError(null);
                    setReason("");
                    setConfirmUser({ user: u, action });
                  }}
                />
              )}
            />
          )}
        </TabsContent>

        <TabsContent value="riders" className="mt-4">
          {!data.riders.length ? (
            <EmptyState
              title="No rider accounts"
              body="Riders appear here once accounts exist on the platform."
            />
          ) : (
            <DataTable
              columns={personColumns("Rider")}
              data={data.riders}
              getRowId={(u) => u.id}
              caption="Rider verification"
              filterPlaceholder="Filter riders…"
              rowActions={(u) => (
                <PersonActions
                  user={u}
                  onAction={(action) => {
                    setActionError(null);
                    setReason("");
                    setConfirmUser({ user: u, action });
                  }}
                />
              )}
            />
          )}
        </TabsContent>

        <TabsContent value="services" className="mt-4">
          <p className="text-body text-text-secondary m-0 mb-3 max-w-prose">
            Catalogue lines declared by suppliers. Verifying a line makes it live for
            matching. Suspending a live line removes it from{" "}
            <strong className="text-text-primary font-medium">new</strong> matching only —
            jobs already assigned keep running.
          </p>
          {!data.services.length ? (
            <EmptyState
              title="No supplier services"
              body="Service lines appear when suppliers declare catalogue offerings."
            />
          ) : (
            <DataTable
              columns={serviceColumns}
              data={data.services}
              getRowId={(s) => s.id}
              caption="Supplier service verification"
              filterPlaceholder="Filter services…"
              defaultSortId="state"
              rowActions={(s) => (
                <div className="flex flex-wrap gap-2">
                  {s.state === "pending_verification" || s.state === "draft" ? (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setActionError(null);
                        setReason("");
                        setConfirmService({ kind: "verify", service: s });
                      }}
                    >
                      Verify live
                    </Button>
                  ) : null}
                  {s.state === "live" ? (
                    <Button
                      variant="danger"
                      onClick={() => {
                        setActionError(null);
                        setReason("");
                        setConfirmService({ kind: "suspend", service: s });
                      }}
                    >
                      Suspend
                    </Button>
                  ) : null}
                  {s.state === "suspended" ? (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setActionError(null);
                        setReason("");
                        setConfirmService({ kind: "verify", service: s });
                      }}
                    >
                      Restore live
                    </Button>
                  ) : null}
                </div>
              )}
            />
          )}
        </TabsContent>
      </Tabs>

      <AlertDialog
        open={!!confirmUser}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmUser(null);
            setReason("");
            setActionError(null);
          }
        }}
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmUser?.action.label} {confirmUser?.user.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmUser?.action.consequence}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="verify-reason">
                Reason (optional, stored with the decision)
              </FieldLabel>
              <Textarea
                id="verify-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="e.g. Pilot accreditation complete"
              />
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
              onClick={() => {
                setConfirmUser(null);
                setReason("");
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant={confirmUser?.action.danger ? "danger" : "primary"}
              disabled={busy}
              onClick={() => void applyUserVerification()}
            >
              {busy ? "Saving…" : confirmUser?.action.label}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!confirmService}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmService(null);
            setReason("");
            setActionError(null);
          }
        }}
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmService?.kind === "suspend"
                ? "Suspend this service line?"
                : "Mark this service live?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmService?.kind === "suspend"
                ? "Suspension removes this line from new matching only. Existing orders already assigned to this supplier are not cancelled or rewound. A reason is required and audited."
                : "Verification makes this line eligible for new supplier matching. Suppliers still need an approved account."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="svc-reason">
                {confirmService?.kind === "suspend"
                  ? "Reason (required)"
                  : "Reason (optional)"}
              </FieldLabel>
              <Textarea
                id="svc-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                required={confirmService?.kind === "suspend"}
              />
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
              onClick={() => {
                setConfirmService(null);
                setReason("");
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant={confirmService?.kind === "suspend" ? "danger" : "primary"}
              disabled={busy}
              onClick={() => void applyServiceAction()}
            >
              {busy
                ? "Saving…"
                : confirmService?.kind === "suspend"
                  ? "Suspend service"
                  : "Verify live"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PersonActions({
  user,
  onAction,
}: {
  user: User;
  onAction: (action: VerificationAction) => void;
}) {
  const actions = verificationActions(user.verificationStatus);
  if (!actions.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => (
        <Button
          key={action.status}
          variant={action.danger ? "danger" : "secondary"}
          onClick={() => onAction(action)}
        >
          {action.label}
        </Button>
      ))}
    </div>
  );
}
