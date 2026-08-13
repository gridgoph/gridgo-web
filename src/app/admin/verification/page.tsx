"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban, Check, Play } from "lucide-react";

import { adminErrorMessage } from "@/app/admin/_lib/errors";
import { presentServiceState } from "@/app/admin/_lib/present";
import { SignupApprovals } from "@/components/approvals/SignupApprovals";
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
import { presentZone } from "@/lib/order-state";
import {
  DataTable,
  DataTableRowAction,
  type DataTableColumn,
} from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { StatusChip } from "@/components/ui/StatusChip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  listSupplierServices,
  suspendSupplierService,
  verifySupplierService,
} from "@/lib/api/client";
import type { SupplierService } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";

type ConfirmService =
  | { kind: "verify"; service: SupplierService }
  | { kind: "suspend"; service: SupplierService };

/**
 * Accreditation has two halves: the account itself, and the catalogue lines it
 * offers. The account queue is the same surface Operations works from — one
 * implementation, mounted here too — so the two can never drift apart.
 */
export default function AdminVerificationPage() {
  return (
    <Tabs defaultValue="signups">
      <TabsList>
        <TabsTrigger value="signups">Sign-ups</TabsTrigger>
        <TabsTrigger value="services">Service lines</TabsTrigger>
      </TabsList>

      <TabsContent value="signups" className="mt-4">
        <SignupApprovals intro="Suppliers and riders sign themselves up and can be given no work until they are approved. Approving an account does not make its catalogue lines live — those are verified on the Service lines tab." />
      </TabsContent>

      <TabsContent value="services" className="mt-4">
        <ServiceLines />
      </TabsContent>
    </Tabs>
  );
}

function ServiceLines() {
  const [services, setServices] = useState<SupplierService[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionOk, setActionOk] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmService | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setServices(await listSupplierServices());
    } catch (err) {
      setServices(null);
      setError(
        adminErrorMessage(
          err,
          "Could not load supplier service lines. Confirm the demo API is running.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const columns = useMemo<DataTableColumn<SupplierService>[]>(
    () => [
      {
        id: "service",
        header: "Service",
        primary: true,
        sortValue: (s) => s.categoryCode,
        filterValue: (s) =>
          `${s.categoryCode} ${s.id} ${s.supplierId} ${s.state}`,
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
            {s.zones.length
              ? s.zones.map(presentZone).join(", ")
              : "—"}
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

  async function apply() {
    if (!confirm) return;
    setBusy(true);
    setActionError(null);
    setActionOk(null);
    try {
      if (confirm.kind === "verify") {
        await verifySupplierService(confirm.service.id, {
          reason: reason.trim() || undefined,
        });
        setActionOk("Service is live and can be matched to new orders.");
      } else {
        if (!reason.trim()) {
          setActionError("A suspension reason is required.");
          setBusy(false);
          return;
        }
        await suspendSupplierService(confirm.service.id, {
          reason: reason.trim(),
        });
        setActionOk(
          "Service suspended. It will not be matched to new work; orders already assigned carry on.",
        );
      }
      setConfirm(null);
      setReason("");
      await load();
    } catch (err) {
      setActionError(
        adminErrorMessage(err, "Could not update the supplier service."),
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading && !services) {
    return <LoadingBlock label="Loading service lines…" />;
  }
  if (error || !services) {
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

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-body text-text-secondary m-0 max-w-prose">
          Catalogue lines declared by suppliers. Verifying one makes it live for
          matching — the supplier&rsquo;s account must be approved as well.
          Suspending a live line removes it from new matching only; jobs already
          assigned keep running.
        </p>
        <Button variant="secondary" onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      {actionOk ? (
        <p className="text-body text-success m-0" role="status">
          {actionOk}
        </p>
      ) : null}
      {actionError && !confirm ? (
        <p className="text-body text-error m-0" role="alert">
          {actionError}
        </p>
      ) : null}

      {!services.length ? (
        <EmptyState
          title="No service lines"
          body="Lines appear when a supplier declares what it can make. Approve their account first so they can submit one."
        />
      ) : (
        <DataTable
          columns={columns}
          data={services}
          getRowId={(s) => s.id}
          caption="Supplier service verification"
          filterPlaceholder="Filter services…"
          defaultSortId="state"
          rowActions={(s) => (
            <>
              {s.state === "pending_verification" || s.state === "draft" ? (
                <DataTableRowAction
                  label="Make live"
                  icon={Play}
                  onClick={() => {
                    setActionError(null);
                    setReason("");
                    setConfirm({ kind: "verify", service: s });
                  }}
                />
              ) : null}
              {s.state === "live" ? (
                <DataTableRowAction
                  label="Suspend"
                  icon={Ban}
                  variant="danger"
                  onClick={() => {
                    setActionError(null);
                    setReason("");
                    setConfirm({ kind: "suspend", service: s });
                  }}
                />
              ) : null}
              {s.state === "suspended" ? (
                <DataTableRowAction
                  label="Restore"
                  icon={Check}
                  onClick={() => {
                    setActionError(null);
                    setReason("");
                    setConfirm({ kind: "verify", service: s });
                  }}
                />
              ) : null}
            </>
          )}
        />
      )}

      <AlertDialog
        open={!!confirm}
        onOpenChange={(open) => {
          if (!open) {
            setConfirm(null);
            setReason("");
            setActionError(null);
          }
        }}
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === "suspend"
                ? "Suspend this service line?"
                : "Make this service live?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === "suspend"
                ? "Suspension removes this line from new matching only. Orders already assigned to this supplier are not cancelled or rewound. A reason is required and audited."
                : "Verification makes this line eligible for new matching. The supplier still needs an approved account before any work reaches them."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="svc-reason">
                {confirm?.kind === "suspend"
                  ? "Reason (required)"
                  : "Reason (optional)"}
              </FieldLabel>
              <Textarea
                id="svc-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                required={confirm?.kind === "suspend"}
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
                setConfirm(null);
                setReason("");
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant={confirm?.kind === "suspend" ? "danger" : "primary"}
              disabled={busy}
              onClick={() => void apply()}
            >
              {busy
                ? "Saving…"
                : confirm?.kind === "suspend"
                  ? "Suspend service"
                  : "Make live"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
