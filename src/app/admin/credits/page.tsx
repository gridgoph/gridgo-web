"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { adminErrorMessage, pesosToMinor } from "@/app/admin/_lib/errors";
import { presentLedgerType } from "@/app/admin/_lib/present";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SkeletonValue } from "@/components/ui/loading";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  creditBalance,
  grantCredits,
  listUsers,
} from "@/lib/api/client";
import type { CreditBalance, CreditLedgerEntry, User } from "@/lib/api/types";
import { formatDateTime, formatPhp } from "@/lib/format";

/**
 * Pilot Credits are an administrative pilot instrument — never a purchase.
 * This screen intentionally has no Top Up, buy, withdraw, or transfer control.
 */
export default function AdminCreditsPage() {
  const [clients, setClients] = useState<User[] | null>(null);
  const [selectedId, setSelectedId] = useState<string>("");
  const [balance, setBalance] = useState<CreditBalance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionOk, setActionOk] = useState<string | null>(null);
  const [grantOpen, setGrantOpen] = useState(false);
  const [amountPesos, setAmountPesos] = useState("");
  const [reason, setReason] = useState("");

  const loadClients = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const users = await listUsers("client");
      setClients(users);
      setSelectedId((prev) => prev || users[0]?.id || "");
    } catch (err) {
      setClients(null);
      setError(
        adminErrorMessage(
          err,
          "Could not load clients. Confirm the demo API is running.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const loadBalance = useCallback(async (clientId: string) => {
    if (!clientId) {
      setBalance(null);
      return;
    }
    setLedgerLoading(true);
    setActionError(null);
    try {
      setBalance(await creditBalance(clientId));
    } catch (err) {
      setBalance(null);
      setActionError(
        adminErrorMessage(err, "Could not load this client’s Pilot Credit ledger."),
      );
    } finally {
      setLedgerLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadClients();
  }, [loadClients]);

  useEffect(() => {
    if (selectedId) void loadBalance(selectedId);
  }, [selectedId, loadBalance]);

  const selectedClient = useMemo(
    () => clients?.find((c) => c.id === selectedId) ?? null,
    [clients, selectedId],
  );

  const ledgerColumns = useMemo<DataTableColumn<CreditLedgerEntry>[]>(
    () => [
      {
        id: "at",
        header: "When",
        primary: true,
        sortValue: (e) => e.at,
        cell: (e) => (
          <span className="text-body text-text-primary whitespace-nowrap">
            {formatDateTime(e.at)}
          </span>
        ),
      },
      {
        id: "type",
        header: "Entry",
        sortValue: (e) => presentLedgerType(e.type),
        filterValue: (e) =>
          `${presentLedgerType(e.type)} ${e.reason} ${e.orderId ?? ""}`,
        cell: (e) => (
          <div>
            <p className="text-body text-text-primary m-0">
              {presentLedgerType(e.type)}
            </p>
            <p className="text-caption text-text-muted m-0 mt-0.5">
              {e.reason || "—"}
            </p>
          </div>
        ),
      },
      {
        id: "amount",
        header: "Amount",
        sortValue: (e) => e.amountMinor,
        cell: (e) => (
          <span
            className="text-body text-text-primary"
            style={{ fontFamily: "var(--font-medium)" }}
          >
            {e.amountMinor >= 0 ? "+" : ""}
            {formatPhp(e.amountMinor)}
          </span>
        ),
      },
      {
        id: "balance",
        header: "Balance after",
        sortValue: (e) => e.balanceAfterMinor,
        cell: (e) => (
          <span className="text-body text-text-secondary">
            {formatPhp(e.balanceAfterMinor)}
          </span>
        ),
      },
    ],
    [],
  );

  async function applyGrant() {
    const amountMinor = pesosToMinor(amountPesos);
    if (!selectedId) return;
    if (amountMinor === null || amountMinor <= 0) {
      setActionError("Enter a positive grant amount in pesos.");
      return;
    }
    if (!reason.trim()) {
      setActionError("A grant reason is required and will be audited.");
      return;
    }
    setBusy(true);
    setActionError(null);
    setActionOk(null);
    try {
      const result = await grantCredits({
        clientId: selectedId,
        amountMinor,
        reason: reason.trim(),
      });
      setBalance({
        clientId: result.clientId,
        balanceMinor: result.balanceMinor,
        ledger: result.ledger,
      });
      setActionOk(
        `Granted ${formatPhp(amountMinor)} to ${selectedClient?.name ?? "client"}. This is an administrative pilot instrument, not a purchase.`,
      );
      setGrantOpen(false);
      setAmountPesos("");
      setReason("");
    } catch (err) {
      setActionError(adminErrorMessage(err, "Could not grant Pilot Credits."));
    } finally {
      setBusy(false);
    }
  }

  const pending = loading && !clients;

  if (!pending && (error || !clients)) {
    return (
      <ErrorState
        body={error ?? "No data."}
        action={
          <Button variant="secondary" onClick={() => void loadClients()}>
            Retry
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-prose">
          <p className="text-body text-text-secondary m-0">
            Pilot Credits are a non-cash, non-transferable pilot instrument —
            not a wallet, not a purchase, and not withdrawable. Granting is an
            administrative act with a reason, and it is audited.
          </p>
          <p className="text-caption text-text-muted m-0 mt-2">
            This screen has no Top Up, buy, withdraw, or transfer control on
            purpose.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={loading}
            onClick={() => {
              void loadClients();
              if (selectedId) void loadBalance(selectedId);
            }}
          >
            Refresh
          </Button>
          <Button
            variant="primary"
            disabled={!selectedId}
            onClick={() => {
              setGrantOpen(true);
              setActionError(null);
              setAmountPesos("");
              setReason("");
            }}
          >
            Grant credits
          </Button>
        </div>
      </div>

      {actionOk ? (
        <p className="text-body text-success m-0" role="status">
          {actionOk}
        </p>
      ) : null}

      {!pending && !clients?.length ? (
        <EmptyState
          title="No client accounts"
          body="Client accounts appear here once they exist on the platform. Grants require a client destination."
        />
      ) : (
        <div className="grid w-full gap-3 lg:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)] lg:items-start">
          <section className="gg-card flex flex-col gap-3 p-3" aria-labelledby="client-pick">
            <h2 id="client-pick" className="text-h3 text-text-primary m-0">
              Client ledger
            </h2>
            <Field>
              <FieldLabel>Client</FieldLabel>
              <Select
                value={selectedId}
                disabled={pending}
                onValueChange={(v) => setSelectedId(v ?? "")}
              >
                <SelectTrigger className="min-h-11 w-full">
                  <SelectValue
                    placeholder={pending ? "Loading clients…" : "Choose a client"}
                  >
                    {(v) => {
                      const c = clients?.find((x) => x.id === v);
                      return c ? `${c.name} · ${c.email}` : "Choose a client";
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(clients ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} · {c.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {ledgerLoading ? (
              <div
                className="flex flex-wrap items-end justify-between gap-3"
                role="status"
                aria-busy="true"
              >
                <span className="sr-only">Loading ledger</span>
                <div aria-hidden>
                  <p className="text-caption text-text-muted m-0">Balance</p>
                  <SkeletonValue className="mt-1 h-8 w-32" />
                </div>
                <Skeleton className="h-3 w-24" aria-hidden />
              </div>
            ) : balance ? (
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-caption text-text-muted m-0">Balance</p>
                  <p className="text-h2 text-text-primary m-0 mt-1">
                    {formatPhp(balance.balanceMinor)}
                  </p>
                </div>
                <p className="text-caption text-text-muted m-0">
                  {balance.ledger.length} ledger entr
                  {balance.ledger.length === 1 ? "y" : "ies"}
                </p>
              </div>
            ) : (
              <p className="text-body text-text-muted m-0" role="status">
                {actionError ?? "No ledger returned for this client."}
              </p>
            )}
          </section>

          {ledgerLoading ? (
            <DataTable
              columns={ledgerColumns}
              data={[]}
              loading
              getRowId={(e) => e.id}
              caption="Pilot Credit ledger"
              filterPlaceholder="Filter ledger…"
              defaultSortId="at"
              defaultSortDirection="desc"
            />
          ) : balance && balance.ledger.length > 0 ? (
            <DataTable
              columns={ledgerColumns}
              data={[...balance.ledger].sort((a, b) =>
                (b.at || "").localeCompare(a.at || ""),
              )}
              getRowId={(e) => e.id}
              caption="Pilot Credit ledger"
              filterPlaceholder="Filter ledger…"
              defaultSortId="at"
              defaultSortDirection="desc"
            />
          ) : balance ? (
            <EmptyState
              title="No ledger entries yet"
              body="Use Grant credits above to seed this client’s pilot balance. Grants are administrative, not purchases — never a wallet top-up."
            />
          ) : null}
        </div>
      )}

      <Dialog
        open={grantOpen}
        onOpenChange={(open) => {
          setGrantOpen(open);
          if (!open) setActionError(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Grant Pilot Credits</DialogTitle>
            <DialogDescription>
              Administrative pilot instrument for{" "}
              {selectedClient?.name ?? "this client"}. Not a purchase, not
              transferable, not withdrawable. Your reason is written to the
              audit log.
            </DialogDescription>
          </DialogHeader>

          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="grant-amount">Amount (₱)</FieldLabel>
              <Input
                id="grant-amount"
                inputMode="decimal"
                value={amountPesos}
                onChange={(e) => setAmountPesos(e.target.value)}
                placeholder="500.00"
              />
              <FieldDescription>
                Positive grants only. There is no withdraw or transfer path.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="grant-reason">
                Reason (required — audited)
              </FieldLabel>
              <Textarea
                id="grant-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="e.g. Pilot cohort allocation for Davao Events"
                required
              />
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
              disabled={busy}
              onClick={() => setGrantOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => void applyGrant()}
            >
              {busy ? "Granting…" : "Grant credits"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
