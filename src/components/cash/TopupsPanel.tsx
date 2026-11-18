"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, X } from "lucide-react";

import type { DeskContext, DeskData } from "@/components/cash/CashDesk";
import { EvidenceButton, ErrorLine, MoneyPlate, ReasonField } from "@/components/cash/parts";
import { Confirmation } from "@/components/refunds/dialogs";
import { useCommandKeys } from "@/components/refunds/useCommand";
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
import {
  DataTable,
  DataTableRowAction,
  type DataTableColumn,
} from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/EmptyState";
import { FieldGroup } from "@/components/ui/field";
import { StatusChip } from "@/components/ui/StatusChip";
import { toast } from "@/components/ui/toast";
import { confirmCashTopup, rejectCashTopup, type CashTopupRow } from "@/lib/api/cash";
import {
  cashErrorMessage,
  cashErrorNeedsReload,
  sameReferenceTopups,
  sortTopups,
  topupStatus,
  type TopupStatus,
} from "@/lib/cash";
import { formatDateTime, formatPhp } from "@/lib/format";

const medium = { fontFamily: "var(--font-medium)" } as const;

const STATUS_LABEL: Record<TopupStatus, string> = {
  waiting: "Waiting",
  confirmed: "Confirmed",
  rejected: "Rejected",
};

function TopupStatusChip({ status }: { status: TopupStatus }) {
  if (status === "confirmed") return <StatusChip tone="success" icon="circle-check" label="Confirmed" />;
  if (status === "rejected") return <StatusChip tone="error" icon="circle-x" label="Rejected" />;
  return <StatusChip tone="warning" icon="clock" label="Waiting" />;
}

type Decision = { row: CashTopupRow; action: "confirm" | "reject" };

/**
 * Riders top up by paying GRIDGO's QR and sending the reference. Nothing is
 * spendable until a person finds the transfer in the bank and confirms it
 * here; rejecting closes it with no credit.
 */
export function TopupsPanel({ data, ctx }: { data: DeskData; ctx: DeskContext }) {
  const rows = useMemo(() => sortTopups(data.topups), [data.topups]);
  const [decision, setDecision] = useState<Decision | null>(null);

  const columns = useMemo<DataTableColumn<CashTopupRow>[]>(
    () => [
      {
        id: "rider",
        header: "Rider",
        primary: true,
        alwaysVisible: true,
        sortValue: (row) => ctx.riderName(row.rider_id),
        cell: (row) => (
          <span className="text-body text-text-primary" style={medium}>
            {ctx.riderName(row.rider_id)}
          </span>
        ),
      },
      {
        id: "amount",
        header: "Amount",
        alwaysVisible: true,
        sortValue: (row) => row.evidence.amountMinor,
        cell: (row) => (
          <span className="text-body text-text-primary tabular-nums" style={medium}>
            {formatPhp(row.evidence.amountMinor)}
          </span>
        ),
      },
      {
        id: "reference",
        header: "Reference",
        sortValue: (row) => row.evidence.reference,
        cell: (row) => (
          <span className="text-body text-text-primary break-all tracking-wide">
            {row.evidence.reference}
          </span>
        ),
      },
      {
        id: "submitted",
        header: "Submitted",
        sortValue: (row) => Date.parse(row.created_at),
        cell: (row) => (
          <span className="text-body text-text-secondary whitespace-nowrap">
            {formatDateTime(row.created_at)}
          </span>
        ),
      },
      {
        id: "status",
        header: "Status",
        sortValue: (row) => topupStatus(row),
        cell: (row) => <TopupStatusChip status={topupStatus(row)} />,
      },
      {
        id: "screenshot",
        header: "Screenshot",
        cell: (row) => (
          <EvidenceButton
            fileId={row.evidence.screenshotFileId}
            label="View"
            title={`Top-up screenshot, ${formatPhp(row.evidence.amountMinor)}`}
          />
        ),
      },
    ],
    [ctx],
  );

  return (
    <div className="flex flex-col gap-3">
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        caption="Rider wallet top-ups"
        itemLabel="top-ups"
        rowActionsDensity="labeled"
        pageSize={25}
        facets={[
          {
            columnId: "status",
            title: "Status",
            options: (["waiting", "confirmed", "rejected"] as const).map((value) => ({
              value,
              label: STATUS_LABEL[value],
            })),
          },
        ]}
        empty={
          <EmptyState
            title="No top-ups yet"
            body="When a rider pays GRIDGO's QR and sends the reference, it waits here for a bank check."
          />
        }
        rowActions={(row) =>
          topupStatus(row) === "waiting" ? (
            <>
              <DataTableRowAction
                label="Confirm"
                icon={Check}
                onClick={() => setDecision({ row, action: "confirm" })}
              />
              <DataTableRowAction
                label="Reject"
                icon={X}
                onClick={() => setDecision({ row, action: "reject" })}
              />
            </>
          ) : null
        }
      />
      <p className="text-caption text-text-secondary m-0">
        The latest 100 top-ups. A pending top-up is never spendable.
      </p>
      <TopupDecisionDialog
        decision={decision}
        rows={data.topups}
        ctx={ctx}
        onClose={() => setDecision(null)}
      />
    </div>
  );
}

function TopupDecisionDialog({
  decision,
  rows,
  ctx,
  onClose,
}: {
  decision: Decision | null;
  rows: CashTopupRow[];
  ctx: DeskContext;
  onClose: () => void;
}) {
  const { keyFor, reset } = useCommandKeys();
  const [reason, setReason] = useState("");
  const [found, setFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = decision !== null;

  useEffect(() => {
    if (!open) return;
    reset();
    setReason("");
    setFound(false);
    setError(null);
  }, [open, decision, reset]);

  if (!decision) {
    return <AlertDialog open={false} />;
  }
  const { row, action } = decision;
  const confirming = action === "confirm";
  const amount = row.evidence.amountMinor;
  const rider = ctx.riderName(row.rider_id);
  const twins = sameReferenceTopups(rows, row);
  const ready = reason.trim().length > 0 && (!confirming || found);

  async function submit() {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    const body = { reason: reason.trim() };
    try {
      if (confirming) await confirmCashTopup(row.id, body, keyFor({ id: row.id, action, ...body }));
      else await rejectCashTopup(row.id, body, keyFor({ id: row.id, action, ...body }));
      toast.add({
        type: "success",
        title: confirming
          ? `${formatPhp(amount)} added to ${rider}'s wallet`
          : `Top-up rejected; ${rider}'s wallet is unchanged`,
      });
      onClose();
      await ctx.reload();
    } catch (err) {
      setError(
        cashErrorMessage(
          err,
          confirming ? "Could not confirm the top-up. Try again." : "Could not reject the top-up. Try again.",
        ),
      );
      if (cashErrorNeedsReload(err)) void ctx.reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <AlertDialogContent className="sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {confirming
              ? `Confirm ${formatPhp(amount)} for ${rider}?`
              : `Reject ${rider}'s ${formatPhp(amount)} top-up?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {confirming
              ? "Find this exact amount and reference in GRIDGO's bank account first. Confirming credits the rider's wallet once and cannot be undone."
              : "Reject when the transfer is not in the bank or does not match. Nothing is credited; the rider can send a new top-up."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <MoneyPlate
          caption={confirming ? "Credit to the rider's wallet" : "Top-up to close without credit"}
          amountMinor={amount}
          lines={[
            { label: "Rider", value: rider },
            {
              label: "Reference",
              value: <span className="break-all tracking-wide">{row.evidence.reference}</span>,
            },
            { label: "Submitted", value: formatDateTime(row.created_at) },
          ]}
        />
        <EvidenceButton
          fileId={row.evidence.screenshotFileId}
          label="View the rider's screenshot"
          title={`Top-up screenshot, ${formatPhp(amount)}`}
        />
        {twins.length ? (
          <p className="text-body text-warning m-0" role="note">
            {twins.length === 1 ? "Another top-up" : `${twins.length} other top-ups`} quote this
            reference. A reference can be confirmed only once.
          </p>
        ) : null}
        <FieldGroup>
          {confirming ? (
            <Confirmation id="topup-found" checked={found} disabled={busy} onChange={setFound}>
              I found {formatPhp(amount)} with reference {row.evidence.reference} in GRIDGO&rsquo;s
              bank account.
            </Confirmation>
          ) : null}
          <ReasonField
            id="topup-reason"
            label={confirming ? "Bank check note" : "Reason"}
            value={reason}
            onChange={setReason}
            disabled={busy}
            placeholder={
              confirming ? "e.g. Matched in GCash history 18 Nov 10:42" : "e.g. No transfer with this reference"
            }
            description="Kept with the decision in the audit log."
          />
        </FieldGroup>
        <ErrorLine error={error} />
        <AlertDialogFooter>
          <AlertDialogCancel variant="secondary" disabled={busy}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            variant={confirming ? "primary" : "destructive"}
            disabled={busy || !ready}
            onClick={() => void submit()}
          >
            {busy
              ? confirming
                ? "Confirming…"
                : "Rejecting…"
              : confirming
                ? `Confirm ${formatPhp(amount)}`
                : "Reject top-up"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
