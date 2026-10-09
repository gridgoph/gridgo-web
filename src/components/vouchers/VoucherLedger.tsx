"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Download, X } from "lucide-react";

import { personLabel } from "@/components/vouchers/data";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatCard } from "@/components/ui/StatCard";
import { downloadVoucherLedger, listVoucherLedger } from "@/lib/api/client";
import type {
  User,
  VoucherCampaign,
  VoucherLedgerEntry,
  VoucherLedgerFilter,
} from "@/lib/api/types";
import { formatPhp } from "@/lib/format";
import {
  LEDGER_KINDS,
  formatManila,
  formatMinorString,
  ledgerKindLabel,
  ledgerMovesBudget,
  ledgerOrderIds,
  manilaDayEnd,
  manilaDayStart,
  minorStringIsNegative,
  voucherErrorMessage,
} from "@/lib/vouchers";

const PAGE = 100;
/** In-table links keep the 44px touch floor. */
const LINK =
  "text-body text-text-primary inline-flex min-h-11 items-center underline-offset-2 hover:underline";
const ANY = "__any__";

type Filters = { campaignId: string; kind: string; from: string; to: string; clientId: string };

/**
 * Super Admin's voucher activity: every issue, checkout hold, use, give-back,
 * refund decision, void and reissue, newest first, with the net budget the
 * filters cover and a CSV of every matching row.
 *
 * On a campaign's own page `fixedCampaignId` pins the campaign, so the budget
 * shown is that campaign's lifetime net spend.
 */
export function VoucherLedger({
  campaigns,
  people,
  fixedCampaignId,
  initialClientId = "",
  onClientChange,
}: {
  campaigns: VoucherCampaign[] | null;
  people: User[] | null;
  fixedCampaignId?: string;
  initialClientId?: string;
  onClientChange?: (clientId: string) => void;
}) {
  const [filters, setFilters] = useState<Filters>({
    campaignId: fixedCampaignId ?? "",
    kind: "",
    from: "",
    to: "",
    clientId: initialClientId,
  });
  const [entries, setEntries] = useState<VoucherLedgerEntry[] | null>(null);
  const [total, setTotal] = useState(0);
  const [budget, setBudget] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    setFilters((current) =>
      current.clientId === initialClientId ? current : { ...current, clientId: initialClientId },
    );
  }, [initialClientId]);

  const query = useMemo<VoucherLedgerFilter>(
    () => ({
      campaignId: filters.campaignId || undefined,
      clientId: filters.clientId || undefined,
      kind: filters.kind || undefined,
      from: manilaDayStart(filters.from),
      to: manilaDayEnd(filters.to),
    }),
    [filters],
  );
  const datesBackwards = Boolean(filters.from && filters.to && filters.from > filters.to);

  const load = useCallback(async () => {
    if (datesBackwards) return;
    setLoading(true);
    setError(null);
    try {
      const page = await listVoucherLedger(query, { limit: PAGE });
      setEntries(page.entries);
      setTotal(page.total);
      setBudget(page.budgetUsedMinor);
    } catch (err) {
      setError(voucherErrorMessage(err, "Could not load the activity. Try again."));
    } finally {
      setLoading(false);
    }
  }, [query, datesBackwards]);

  useEffect(() => {
    void load();
  }, [load]);

  async function loadMore() {
    setMore(true);
    try {
      const page = await listVoucherLedger(query, { offset: entries?.length ?? 0, limit: PAGE });
      setEntries((current) => [...(current ?? []), ...page.entries]);
      setTotal(page.total);
    } catch (err) {
      setError(voucherErrorMessage(err, "Could not load older activity. Try again."));
    } finally {
      setMore(false);
    }
  }

  async function exportCsv() {
    setExporting(true);
    setExportError(null);
    try {
      const blob = await downloadVoucherLedger(query);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "voucher-ledger.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setExportError(voucherErrorMessage(err, "The CSV could not be downloaded. Try again."));
    } finally {
      setExporting(false);
    }
  }

  function set<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
    if (key === "clientId") onClientChange?.(value);
  }

  const campaignName = useCallback(
    (id: string) =>
      campaigns === null
        ? "…"
        : (campaigns.find((campaign) => campaign.id === id)?.name ?? "Deleted campaign"),
    [campaigns],
  );

  const columns = useMemo<DataTableColumn<VoucherLedgerEntry>[]>(() => {
    const cols: DataTableColumn<VoucherLedgerEntry>[] = [
      {
        id: "at",
        header: "When",
        sortValue: (row) => Date.parse(row.at),
        cell: (row) => (
          <span className="text-body text-text-secondary whitespace-nowrap">{formatManila(row.at)}</span>
        ),
      },
      {
        id: "kind",
        header: "What happened",
        primary: true,
        sortValue: (row) => ledgerKindLabel(row.kind),
        cell: (row) => (
          <div className="min-w-0">
            <p className="text-body text-text-primary m-0">{ledgerKindLabel(row.kind)}</p>
            {typeof row.data?.reason === "string" && row.data.reason ? (
              <p className="text-caption text-text-muted m-0 mt-0.5 max-w-prose break-words">
                &ldquo;{row.data.reason}&rdquo;
              </p>
            ) : null}
            {row.data?.actorId && row.data.actorId !== row.clientId ? (
              <p className="text-caption text-text-muted m-0 mt-0.5">
                By {personLabel(people, row.data.actorId)}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        id: "client",
        header: "Client",
        sortValue: (row) => personLabel(people, row.clientId),
        cell: (row) => (
          <Link
            href={`/admin/vouchers?tab=lookup&client=${encodeURIComponent(row.clientId)}`}
            className={LINK}
          >
            {personLabel(people, row.clientId)}
          </Link>
        ),
      },
    ];
    if (!fixedCampaignId) {
      cols.push({
        id: "campaign",
        header: "Campaign",
        hideOnMobile: true,
        sortValue: (row) => campaignName(row.campaignId),
        cell: (row) => (
          <Link href={`/admin/vouchers/${encodeURIComponent(row.campaignId)}`} className={LINK}>
            {campaignName(row.campaignId)}
          </Link>
        ),
      });
    }
    cols.push(
      {
        id: "amount",
        header: "Budget",
        sortValue: (row) => (ledgerMovesBudget(row.kind) ? row.amountMinor : 0),
        cell: (row) =>
          ledgerMovesBudget(row.kind) ? (
            <span className="text-body text-text-primary tabular-nums whitespace-nowrap">
              {row.amountMinor < 0 ? `−${formatPhp(-row.amountMinor)}` : formatPhp(row.amountMinor)}
            </span>
          ) : (
            <span className="text-body text-text-muted" aria-label="No budget moved">
              —
            </span>
          ),
      },
      {
        id: "orders",
        header: "Order",
        hideOnMobile: true,
        sortable: false,
        cell: (row) => {
          const ids = ledgerOrderIds(row.data ?? {});
          if (!ids.length) return <span className="text-body text-text-muted">—</span>;
          return (
            <div className="flex flex-col items-start">
              {ids.map((id) => (
                <Link key={id} href={`/admin/orders/${encodeURIComponent(id)}`} className={LINK}>
                  Open order
                  {ids.length > 1 ? ` ${ids.indexOf(id) + 1}` : ""}
                </Link>
              ))}
            </div>
          );
        },
      },
    );
    return cols;
  }, [people, fixedCampaignId, campaignName]);

  const filtered = Boolean(
    (!fixedCampaignId && filters.campaignId) || filters.kind || filters.from || filters.to || filters.clientId,
  );
  const negative = budget !== null && minorStringIsNegative(budget);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard
          label={fixedCampaignId && !filtered ? "Budget used by this campaign" : "Net budget used"}
          value={budget !== null ? formatMinorString(budget) : "—"}
          loading={loading && budget === null}
          hint={
            negative
              ? "More was given back than used in this slice."
              : "Used on orders, minus vouchers given back, for what is shown here."
          }
        />
        <StatCard
          label="Activity"
          value={total.toLocaleString("en-PH")}
          loading={loading && entries === null}
          hint={filtered ? "Entries matching the filters." : "Every entry, newest first."}
        />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        {!fixedCampaignId ? (
          <Field className="w-full sm:w-56">
            <FieldLabel htmlFor="ledger-campaign">Campaign</FieldLabel>
            <Select
              value={filters.campaignId || ANY}
              onValueChange={(value) => set("campaignId", !value || value === ANY ? "" : String(value))}
            >
              <SelectTrigger id="ledger-campaign" className="min-h-11 w-full">
                <SelectValue>
                  {(value) => (!value || value === ANY ? "Every campaign" : campaignName(String(value)))}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Every campaign</SelectItem>
                {(campaigns ?? []).map((campaign) => (
                  <SelectItem key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ) : null}
        <Field className="w-full sm:w-56">
          <FieldLabel htmlFor="ledger-kind">What happened</FieldLabel>
          <Select
            value={filters.kind || ANY}
            onValueChange={(value) => set("kind", !value || value === ANY ? "" : String(value))}
          >
            <SelectTrigger id="ledger-kind" className="min-h-11 w-full">
              <SelectValue>
                {(value) => (!value || value === ANY ? "Everything" : ledgerKindLabel(String(value)))}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Everything</SelectItem>
              {LEDGER_KINDS.map((row) => (
                <SelectItem key={row.kind} value={row.kind}>
                  {row.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field className="w-[calc(50%-0.375rem)] sm:w-44">
          <FieldLabel htmlFor="ledger-from">From</FieldLabel>
          <Input
            id="ledger-from"
            type="date"
            value={filters.from}
            max={filters.to || undefined}
            onChange={(event) => set("from", event.target.value)}
          />
        </Field>
        <Field className="w-[calc(50%-0.375rem)] sm:w-44">
          <FieldLabel htmlFor="ledger-to">To</FieldLabel>
          <Input
            id="ledger-to"
            type="date"
            value={filters.to}
            min={filters.from || undefined}
            onChange={(event) => set("to", event.target.value)}
          />
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          {filtered ? (
            <Button
              variant="ghost"
              onClick={() => {
                setFilters({ campaignId: fixedCampaignId ?? "", kind: "", from: "", to: "", clientId: "" });
                if (filters.clientId) onClientChange?.("");
              }}
            >
              Clear filters
            </Button>
          ) : null}
          <Button variant="outline" disabled={exporting || !total} onClick={() => void exportCsv()}>
            <Download aria-hidden />
            {exporting ? "Preparing…" : "Export CSV"}
          </Button>
        </div>
      </div>

      {filters.clientId ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-caption text-text-muted">Client</span>
          <span className="border-outline text-body text-text-primary inline-flex min-h-11 items-center gap-1 rounded-full border pr-1 pl-3">
            {personLabel(people, filters.clientId)}
            <button
              type="button"
              aria-label="Show every client"
              className="hover:bg-surface-variant inline-flex size-9 items-center justify-center rounded-full"
              onClick={() => set("clientId", "")}
            >
              <X className="size-4" aria-hidden />
            </button>
          </span>
        </div>
      ) : null}

      <p className="text-caption text-text-muted m-0">
        Dates are Philippine time and include both days. The CSV holds every matching row, not
        just the ones loaded here, and names accounts by ID only.
      </p>
      {datesBackwards ? (
        <p className="text-body text-error m-0" role="alert">
          The From date is after the To date.
        </p>
      ) : null}
      {exportError ? (
        <p className="text-body text-error m-0" role="alert">
          {exportError}
        </p>
      ) : null}

      {error && !entries ? (
        <ErrorState
          body={error}
          action={
            <Button variant="secondary" onClick={() => void load()}>
              Retry
            </Button>
          }
        />
      ) : entries && !entries.length && !loading ? (
        <EmptyState
          title={filtered ? "Nothing matches these filters" : "No voucher activity yet"}
          body={
            filtered
              ? "Widen the dates or clear a filter."
              : "Activity appears here once a campaign is issued or a client adds a shared code."
          }
          action={
            filtered ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setFilters({ campaignId: fixedCampaignId ?? "", kind: "", from: "", to: "", clientId: "" });
                  if (filters.clientId) onClientChange?.("");
                }}
              >
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={entries ?? []}
          loading={loading && !entries}
          getRowId={(row) => row.id}
          caption="Voucher activity"
          itemLabel="entries"
          defaultSortId="at"
          defaultSortDirection="desc"
          pageSize={Math.max(PAGE, entries?.length ?? 0)}
        />
      )}
      {error && entries ? (
        <p className="text-body text-error m-0" role="alert">
          {error}
        </p>
      ) : null}
      {entries && entries.length < total ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" disabled={more} onClick={() => void loadMore()}>
            {more ? "Loading…" : "Show older activity"}
          </Button>
          <span className="text-caption text-text-muted">
            Showing {entries.length.toLocaleString("en-PH")} of {total.toLocaleString("en-PH")}
          </span>
        </div>
      ) : null}
    </div>
  );
}
