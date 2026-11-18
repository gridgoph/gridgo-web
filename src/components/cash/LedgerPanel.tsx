"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ListFilter, X } from "lucide-react";

import type { DeskContext, DeskData } from "@/components/cash/CashDesk";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  DataTableRowAction,
  type DataTableColumn,
} from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonCards } from "@/components/ui/loading";
import { StatusChip } from "@/components/ui/StatusChip";
import {
  getCashReconciliation,
  type CashJournal,
  type CashReconciliation,
} from "@/lib/api/cash";
import type { Order } from "@/lib/api/types";
import {
  checkErrorCopy,
  journalAmount,
  journalBalanced,
  journalLabel,
  reconciliationProblems,
  sortJournals,
  unattributedHeldMinor,
  walletsFromLedger,
  type RiderWalletRow,
} from "@/lib/cash";
import { formatDateTime, formatPhp } from "@/lib/format";
import { opsErrorMessage } from "@/app/ops/_lib/errors";

const medium = { fontFamily: "var(--font-medium)" } as const;

const sumOf = (recon: CashReconciliation, prefix: string): number =>
  recon.accounts
    .filter((a) => a.id === prefix || a.id.startsWith(`${prefix}:`))
    .reduce((total, a) => total + Number(a.balanceMinor), 0);

/**
 * Rider wallets as the ledger derives them, every movement, and the API's
 * reconciliation: journals balance, balances match their entries, and each
 * order's movements match its snapshot amounts.
 */
export function LedgerPanel({ data, ctx }: { data: DeskData; ctx: DeskContext }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const riderId = search.get("rider");
  const orderId = search.get("order");

  // The whole ledger: wallet figures and the reconciliation card always come
  // from here, so narrowing the movements never changes what a wallet holds.
  const [recon, setRecon] = useState<CashReconciliation | null>(null);
  // The rider/order filter's own read: its movements and checks only.
  const [scoped, setScoped] = useState<CashReconciliation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const filtered = Boolean(riderId || orderId);

  const load = useCallback(async () => {
    const mine = ++generation.current;
    setError(null);
    try {
      const [whole, narrow] = await Promise.all([
        getCashReconciliation({}),
        filtered ? getCashReconciliation({ riderId, orderId }) : Promise.resolve(null),
      ]);
      if (mine === generation.current) {
        setRecon(whole);
        setScoped(narrow);
      }
    } catch (err) {
      if (mine === generation.current) {
        setError(opsErrorMessage(err, "Could not read the cash ledger. Try again."));
      }
    }
  }, [riderId, orderId, filtered]);

  useEffect(() => {
    setScoped(null);
    void load();
  }, [load]);
  // The desk reloads its lists on every change; read the ledger again then.
  useEffect(() => {
    if (recon) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const setFilter = useCallback(
    (key: "rider" | "order", value: string | null) => {
      const params = new URLSearchParams(search.toString());
      if (value) params.set(key, value);
      else params.delete(key);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, search],
  );

  const orders = useMemo(
    () => new Map<string, Order>(data.orders.map((o) => [o.id, o])),
    [data.orders],
  );
  const wallets = useMemo(() => {
    const all = recon ? walletsFromLedger(recon) : [];
    return riderId ? all.filter((wallet) => wallet.riderId === riderId) : all;
  }, [recon, riderId]);
  const unattributed = useMemo(() => (recon ? unattributedHeldMinor(recon) : 0), [recon]);
  const movements = filtered ? scoped : recon;
  const journals = useMemo(
    () => (movements ? sortJournals(movements.journals) : []),
    [movements],
  );

  const walletColumns = useMemo<DataTableColumn<RiderWalletRow>[]>(
    () => [
      {
        id: "rider",
        header: "Rider",
        primary: true,
        alwaysVisible: true,
        sortValue: (row) => ctx.riderName(row.riderId),
        cell: (row) => (
          <span className="text-body text-text-primary" style={medium}>
            {ctx.riderName(row.riderId)}
          </span>
        ),
      },
      {
        id: "available",
        header: "Available",
        sortValue: (row) => row.availableMinor,
        cell: (row) => (
          <span className="flex flex-col items-start gap-1">
            <span className="text-body text-text-primary tabular-nums" style={medium}>
              {formatPhp(row.availableMinor)}
            </span>
            {row.lowBalance ? (
              <StatusChip tone="warning" icon="triangle-alert" label="Low balance" />
            ) : null}
          </span>
        ),
      },
      {
        id: "reserved",
        header: "Reserved for orders",
        sortValue: (row) => row.reservedMinor,
        cell: (row) => (
          <span className="text-body text-text-primary tabular-nums">
            {formatPhp(row.reservedMinor)}
          </span>
        ),
      },
      {
        id: "balance",
        header: "Wallet total",
        sortValue: (row) => row.balanceMinor,
        cell: (row) => (
          <span className="text-body text-text-primary tabular-nums">
            {formatPhp(row.balanceMinor)}
          </span>
        ),
      },
      {
        id: "pending",
        header: "Top-ups waiting",
        sortValue: (row) => row.pendingTopupMinor,
        cell: (row) => (
          <span className="text-body text-text-secondary tabular-nums">
            {row.pendingTopupMinor ? formatPhp(row.pendingTopupMinor) : "None"}
          </span>
        ),
      },
      {
        id: "ok",
        header: "Ledger",
        sortValue: (row) => (row.ok ? "ok" : "problem"),
        cell: (row) =>
          row.ok ? (
            <StatusChip tone="success" icon="circle-check" label="Matches" />
          ) : (
            <StatusChip tone="error" icon="circle-x" label="Does not match" />
          ),
      },
    ],
    [ctx],
  );

  const journalColumns = useMemo<DataTableColumn<CashJournal>[]>(
    () => [
      {
        id: "movement",
        header: "Movement",
        primary: true,
        alwaysVisible: true,
        sortValue: (row) => journalLabel(row.kind),
        cell: (row) => (
          <span className="text-body text-text-primary" style={medium}>
            {journalLabel(row.kind)}
          </span>
        ),
      },
      {
        id: "amount",
        header: "Amount",
        sortValue: (row) => journalAmount(row, orders) ?? -1,
        cell: (row) => {
          const value = journalAmount(row, orders);
          return (
            <span className="text-body text-text-primary tabular-nums">
              {value === null ? "Not stated" : formatPhp(value)}
            </span>
          );
        },
      },
      {
        id: "when",
        header: "When",
        sortValue: (row) => Date.parse(row.created_at),
        cell: (row) => (
          <span className="text-body text-text-secondary whitespace-nowrap">
            {formatDateTime(row.created_at)}
          </span>
        ),
      },
      {
        id: "rider",
        header: "Rider",
        sortValue: (row) => (row.rider_id ? ctx.riderName(row.rider_id) : ""),
        cell: (row) => (
          <span className="text-body text-text-primary">
            {row.rider_id ? ctx.riderName(row.rider_id) : "None"}
          </span>
        ),
      },
      {
        id: "order",
        header: "Order",
        sortValue: (row) => row.order_id ?? "",
        cell: (row) =>
          row.order_id ? (
            <Link
              href={`${ctx.base}/orders/${encodeURIComponent(row.order_id)}`}
              className="text-body text-text-primary underline underline-offset-4 break-all"
            >
              {row.order_id}
            </Link>
          ) : (
            <span className="text-body text-text-secondary">None</span>
          ),
      },
      {
        id: "reference",
        header: "Reference",
        sortValue: (row) =>
          typeof row.evidence?.reference === "string" ? row.evidence.reference : "",
        cell: (row) => (
          <span className="text-body text-text-secondary break-all">
            {typeof row.evidence?.reference === "string"
              ? row.evidence.reference
              : "None"}
          </span>
        ),
      },
      {
        id: "balanced",
        header: "Balanced",
        sortValue: (row) => (journalBalanced(row) ? "yes" : "no"),
        cell: (row) =>
          journalBalanced(row) ? (
            <StatusChip tone="success" icon="circle-check" label="Balanced" />
          ) : (
            <StatusChip tone="error" icon="circle-x" label="Unbalanced" />
          ),
      },
    ],
    [ctx, orders],
  );

  if (error && !recon) {
    return (
      <ErrorState
        title="Could not read the cash ledger"
        body={error}
        action={<Button onClick={() => void load()}>Try again</Button>}
      />
    );
  }
  if (!recon)
    return (
      <SkeletonCards
        count={2}
        lines={3}
        label="Reading the cash ledger"
        className="gap-3"
      />
    );

  const problems = reconciliationProblems(recon);
  const failedOrders = recon.orderChecks.filter((check) => !check.ok);

  return (
    <div className="flex flex-col gap-6">
      <section
        aria-labelledby="cash-recon"
        className={`gg-card flex flex-col gap-3 p-3 ${recon.ok ? "" : "border-error"}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="cash-recon" className="text-h3 text-text-primary m-0">
            Reconciliation
          </h2>
          {recon.ok ? (
            <StatusChip tone="success" icon="circle-check" label="Ledger reconciles" />
          ) : (
            <StatusChip
              tone="error"
              icon="circle-x"
              label={`${problems} ${problems === 1 ? "problem" : "problems"}`}
            />
          )}
        </div>
        <p className="text-body text-text-secondary m-0 max-w-prose">
          {recon.ok
            ? `Every journal balances, every balance matches its entries and ${recon.orderChecks.length} cash ${recon.orderChecks.length === 1 ? "order matches its" : "orders match their"} amounts.`
            : "Stop and look before enabling cash or confirming more money. Each order below names what does not add up."}{" "}
          Open claims and no-show debts reconcile as amounts still owed, never as cash
          received.
        </p>
        <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-2 lg:grid-cols-4">
          {[
            { label: "Received in GRIDGO's bank", value: sumOf(recon, "gridgo_bank") },
            { label: "GRIDGO revenue", value: -sumOf(recon, "gridgo_revenue") },
            { label: "Clients owe (no-shows)", value: sumOf(recon, "client_receivable") },
            { label: "Shops owe riders (claims)", value: sumOf(recon, "rider_claim") },
          ].map((fact) => (
            <div key={fact.label} className="flex flex-col">
              <dt className="text-caption text-text-secondary">{fact.label}</dt>
              <dd className="m-0 text-body text-text-primary tabular-nums" style={medium}>
                {formatPhp(fact.value)}
              </dd>
            </div>
          ))}
        </dl>
        {failedOrders.length ? (
          <ul className="m-0 flex list-disc flex-col gap-1 pl-5">
            {failedOrders.map((check) => (
              <li key={check.orderId} className="text-body text-text-primary">
                <Link
                  href={`${ctx.base}/orders/${encodeURIComponent(check.orderId)}`}
                  className="underline underline-offset-4"
                >
                  {check.orderId}
                </Link>
                : {[...new Set(check.errors.map(checkErrorCopy))].join("; ")}.
              </li>
            ))}
          </ul>
        ) : null}
        {recon.invalidReservations.length ? (
          <p className="text-body text-error m-0" role="alert">
            {recon.invalidReservations.length} wallet{" "}
            {recon.invalidReservations.length === 1
              ? "reservation does"
              : "reservations do"}{" "}
            not match the held balance.
          </p>
        ) : null}
        {unattributed ? (
          <p className="text-body text-error m-0" role="alert">
            {formatPhp(unattributed)} is held for orders whose reservation names no rider,
            so it is in no wallet below.
          </p>
        ) : null}
      </section>

      {filtered ? (
        <div className="flex flex-wrap items-center gap-2" role="status">
          <span className="text-body text-text-primary">
            Showing {riderId ? `${ctx.riderName(riderId)}'s movements` : null}
            {riderId && orderId ? " on " : null}
            {orderId ? `order ${orderId}` : null}. Wallet figures and the checks above
            still cover the whole ledger.
          </span>
          {scoped ? (
            scoped.ok ? (
              <StatusChip
                tone="success"
                icon="circle-check"
                label="These movements reconcile"
              />
            ) : (
              <StatusChip
                tone="error"
                icon="circle-x"
                label={`${reconciliationProblems(scoped)} ${reconciliationProblems(scoped) === 1 ? "problem" : "problems"} in these movements`}
              />
            )
          ) : (
            <StatusChip tone="neutral" icon="clock" label="Reading these movements" />
          )}
          <Button
            variant="outline"
            onClick={() => {
              const params = new URLSearchParams(search.toString());
              params.delete("rider");
              params.delete("order");
              router.replace(`${pathname}?${params.toString()}`, { scroll: false });
            }}
          >
            <X aria-hidden data-icon="inline-start" />
            Show the whole ledger
          </Button>
        </div>
      ) : null}

      <section aria-labelledby="cash-wallets" className="flex flex-col gap-2">
        <h2 id="cash-wallets" className="text-h3 text-text-primary m-0">
          Rider wallets
        </h2>
        <p className="text-body text-text-secondary m-0 max-w-prose">
          Available funds cover GRIDGO&rsquo;s share of the next cash offer; a rider
          without enough receives no cash offers. Lowest available first.
        </p>
        <DataTable
          columns={walletColumns}
          data={wallets}
          getRowId={(row) => row.riderId}
          caption="Rider wallets"
          itemLabel="wallets"
          rowActionsDensity="labeled"
          pageSize={25}
          empty={
            <EmptyState
              title="No rider wallet yet"
              body="A wallet appears when a rider sends their first top-up."
            />
          }
          rowActions={(row) =>
            riderId === row.riderId ? null : (
              <DataTableRowAction
                label="Show movements"
                icon={ListFilter}
                onClick={() => setFilter("rider", row.riderId)}
              />
            )
          }
        />
      </section>

      <section aria-labelledby="cash-journals" className="flex flex-col gap-2">
        <h2 id="cash-journals" className="text-h3 text-text-primary m-0">
          Cash ledger
        </h2>
        <p className="text-body text-text-secondary m-0 max-w-prose">
          Every cash movement, newest first. Entries are never edited or removed.
        </p>
        <DataTable
          columns={journalColumns}
          data={journals}
          loading={filtered && !scoped}
          getRowId={(row) => row.id}
          caption="Cash ledger movements"
          itemLabel="movements"
          rowActionsDensity="labeled"
          pageSize={25}
          empty={
            <EmptyState
              title="No cash has moved yet"
              body="Top-ups, shop payments and collections appear here."
            />
          }
          rowActions={(row) =>
            row.order_id && orderId !== row.order_id ? (
              <DataTableRowAction
                label="Check this order"
                icon={ListFilter}
                onClick={() => setFilter("order", row.order_id)}
              />
            ) : null
          }
        />
      </section>
    </div>
  );
}
