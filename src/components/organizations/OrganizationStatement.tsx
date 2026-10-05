"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Download, Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  downloadOrganizationStatement,
  getOrganizationStatement,
  getUser,
  isApiError,
} from "@/lib/api/client";
import type {
  OrganizationStatement as Statement,
  OrganizationStatementRow,
  StatementPeriod,
} from "@/lib/api/types";
import { formatPhp } from "@/lib/format";
import { useSerializedLoad } from "@/lib/live/useSerializedLoad";
import { asDeduction } from "@/lib/organization-discount";
import {
  PERIOD_CHOICES,
  STATEMENT_NOTICE,
  describePeriod,
  isPlainId,
  manilaMonthStart,
  manilaToday,
  statementErrorMessage,
  statementFileName,
  statementPeriod,
  type PeriodChoice,
} from "@/lib/statements";

const medium = { fontFamily: "var(--font-medium)" } as const;

type Props = {
  clientId: string;
  tree: "ops" | "admin";
};

/**
 * One organization's spend statement, as the organization itself exports it:
 * its closed orders in a Manila calendar period, what each cost after the
 * organization discount, the discount it earned, and the officer recorded on
 * each order when it was placed.
 *
 * Read-only. Not a tax document — the page and both exports say so, and the
 * per-order official receipt process is unchanged.
 */
export function OrganizationStatement({ clientId, tree }: Props) {
  // The id comes from the URL. Only a plain id is ever put into a request path.
  if (!isPlainId(clientId)) {
    return (
      <ErrorState
        title="Not an organization link"
        body="This address does not name an organization. Open the statement from the Organizations list."
      />
    );
  }
  return <StatementView clientId={clientId} tree={tree} />;
}

function StatementView({ clientId, tree }: Props) {
  const [choice, setChoice] = useState<PeriodChoice>("this_month");
  const [from, setFrom] = useState(() => manilaMonthStart());
  const [to, setTo] = useState(() => manilaToday());
  const [requested, setRequested] = useState<StatementPeriod>({ period: "this_month" });
  const [statement, setStatement] = useState<Statement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"pdf" | "csv" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const custom = statementPeriod(choice, from, to);
  const customProblem = "problem" in custom ? custom.problem : null;

  const load = useSerializedLoad(
    useCallback(async () => {
      setLoading(true);
      setError(null);
      try {
        setStatement(await getOrganizationStatement(clientId, requested));
      } catch (err) {
        setStatement(null);
        setError(
          isApiError(err)
            ? statementErrorMessage(err.code)
            : "Could not reach the API. Check it is running, then retry.",
        );
      } finally {
        setLoading(false);
      }
    }, [clientId, requested]),
  );

  useEffect(() => {
    void load();
  }, [load]);

  // The organization's name, best effort: the statement reads fine without it.
  useEffect(() => {
    let cancelled = false;
    getUser(clientId).then(
      (user) => {
        if (!cancelled) setName(user.orgName || user.name || null);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  function choose(next: PeriodChoice) {
    setChoice(next);
    if (next !== "custom") setRequested({ period: next });
  }

  async function exportAs(format: "pdf" | "csv") {
    setExporting(format);
    setExportError(null);
    try {
      const blob = await downloadOrganizationStatement(clientId, requested, format);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = statementFileName(
        statement?.period ??
          (requested.period === "custom"
            ? requested
            : { from: manilaMonthStart(), to: manilaToday() }),
        format,
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch (err) {
      setExportError(
        isApiError(err)
          ? statementErrorMessage(err.code)
          : `The ${format.toUpperCase()} could not be downloaded. Try again.`,
      );
    } finally {
      setExporting(null);
    }
  }

  const columns = useMemo<DataTableColumn<OrganizationStatementRow>[]>(
    () => [
      {
        id: "date",
        header: "Closed",
        sortValue: (row) => row.closedAt,
        cell: (row) => (
          <span className="text-body text-text-secondary whitespace-nowrap tabular-nums">
            {row.date}
          </span>
        ),
      },
      {
        id: "product",
        header: "Order",
        primary: true,
        sortValue: (row) => row.product,
        filterValue: (row) => `${row.product} ${row.orderId} ${row.invoiceNumber}`,
        cell: (row) => (
          <div className="min-w-0">
            <p className="text-body text-text-primary m-0 truncate" style={medium}>
              {row.product || "Unnamed product"}
            </p>
            <Link
              href={`/${tree}/orders/${encodeURIComponent(row.orderId)}`}
              className="text-caption text-text-muted underline-offset-2 hover:underline"
            >
              Order {row.orderId}
            </Link>
          </div>
        ),
      },
      {
        id: "amount",
        header: "Paid",
        sortValue: (row) => row.amountMinor,
        cell: (row) => (
          <span className="text-body text-text-primary tabular-nums whitespace-nowrap">
            {formatPhp(row.amountMinor)}
          </span>
        ),
      },
      {
        id: "discount",
        header: "Discount",
        sortValue: (row) => row.organizationDiscountMinor,
        cell: (row) => (
          <span className="text-body text-text-secondary tabular-nums whitespace-nowrap">
            {row.organizationDiscountMinor > 0
              ? asDeduction(formatPhp(row.organizationDiscountMinor))
              : "None"}
          </span>
        ),
      },
      {
        id: "invoice",
        header: "Invoice",
        sortValue: (row) => row.invoiceNumber,
        hideOnMobile: true,
        cell: (row) => (
          <span className="text-body text-text-secondary whitespace-nowrap">
            {row.invoiceNumber || "—"}
          </span>
        ),
      },
      {
        id: "officer",
        header: "Officer of record",
        sortValue: (row) => row.officerOfRecord,
        filterValue: (row) => row.officerOfRecord,
        cell: (row) => (
          <span className="text-body text-text-secondary">
            {row.officerOfRecord || "Not recorded"}
          </span>
        ),
      },
    ],
    [tree],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="min-w-0">
        <Link
          href={`/${tree}/organizations`}
          className="text-caption text-text-muted inline-flex items-center gap-1 hover:text-text-secondary"
        >
          <ChevronLeft size={14} strokeWidth={2} aria-hidden />
          Organizations
        </Link>
        <h1 className="text-h2 text-text-primary m-0 mt-1">
          {name ? `${name}: spend statement` : "Spend statement"}
        </h1>
      </div>

      <p
        className="text-body text-text-primary m-0 flex items-start gap-2 rounded-card border border-info px-3 py-2"
        data-testid="statement-notice"
      >
        <Info
          size={18}
          strokeWidth={2}
          aria-hidden
          className="mt-0.5 shrink-0"
          style={{ color: "var(--color-info)" }}
        />
        {statement?.notice || STATEMENT_NOTICE}
      </p>

      <section className="gg-card flex flex-col gap-3" aria-label="Period and export">
        <div className="flex flex-wrap items-end gap-3">
          <ToggleGroup
            value={[choice]}
            onValueChange={(values) => {
              const next = values[0] as PeriodChoice | undefined;
              if (next) choose(next);
            }}
            variant="outline"
            spacing={0}
            aria-label="Statement period"
          >
            {PERIOD_CHOICES.map((entry) => (
              <ToggleGroupItem key={entry.value} value={entry.value}>
                {entry.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={exporting !== null || loading || Boolean(error)}
              onClick={() => void exportAs("pdf")}
            >
              <Download data-icon="inline-start" aria-hidden />
              {exporting === "pdf" ? "Preparing PDF…" : "Export PDF"}
            </Button>
            <Button
              variant="secondary"
              disabled={exporting !== null || loading || Boolean(error)}
              onClick={() => void exportAs("csv")}
            >
              <Download data-icon="inline-start" aria-hidden />
              {exporting === "csv" ? "Preparing CSV…" : "Export CSV"}
            </Button>
          </div>
        </div>
        {choice === "custom" ? (
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if ("period" in custom) setRequested(custom.period);
            }}
          >
            <Field className="w-auto">
              <FieldLabel htmlFor="statement-from">From</FieldLabel>
              <Input
                id="statement-from"
                type="date"
                value={from}
                max={to || undefined}
                onChange={(event) => setFrom(event.target.value)}
              />
            </Field>
            <Field className="w-auto">
              <FieldLabel htmlFor="statement-to">To</FieldLabel>
              <Input
                id="statement-to"
                type="date"
                value={to}
                min={from || undefined}
                onChange={(event) => setTo(event.target.value)}
              />
            </Field>
            <Button type="submit" variant="secondary" disabled={Boolean(customProblem)}>
              Show these dates
            </Button>
            {customProblem ? (
              <p className="text-body text-error m-0 w-full" role="alert">
                {customProblem}
              </p>
            ) : null}
          </form>
        ) : null}
        {exportError ? (
          <p className="text-body text-error m-0" role="alert">
            {exportError}
          </p>
        ) : null}
        <p className="text-caption text-text-muted m-0">
          Manila calendar dates, both ends included. Exports are made fresh from the same
          figures and are not stored.
        </p>
      </section>

      {error ? (
        <ErrorState
          body={error}
          action={
            <Button variant="secondary" onClick={() => void load()}>
              Retry
            </Button>
          }
        />
      ) : (
        <>
          <Summary statement={statement} loading={loading} />
          {!loading && statement && statement.orders.length === 0 ? (
            <EmptyState
              title="No closed orders in this period"
              body="A statement counts orders once they are completed. Try a longer period, or check the organization's open orders in the Orders queue."
            />
          ) : (
            <DataTable
              columns={columns}
              data={statement?.orders ?? []}
              loading={loading}
              getRowId={(row) => row.orderId}
              caption="Orders on this statement"
              filterPlaceholder="Filter orders…"
              itemLabel="orders"
              defaultSortId="date"
            />
          )}
          <p className="text-caption text-text-muted m-0 max-w-prose">
            Paid is what the organization was charged for each closed order, after its
            discount. Open and cancelled orders are left out. Each shop of a multi-shop
            order is its own order here, and a refund made later does not change these
            figures.
          </p>
        </>
      )}
    </div>
  );
}

/**
 * The three numbers a treasurer copies into a budget, in one band: the
 * period, total spend, how many orders, and the discount earned.
 */
function Summary({
  statement,
  loading,
}: {
  statement: Statement | null;
  loading: boolean;
}) {
  const figures = [
    {
      label: "Total spend",
      value: statement ? formatPhp(statement.totalSpendMinor) : "",
      testId: "statement-total",
    },
    {
      label: "Orders",
      value: statement ? String(statement.orderCount) : "",
      testId: "statement-count",
    },
    {
      label: "Discount earned",
      value: statement ? formatPhp(statement.discountEarnedMinor) : "",
      testId: "statement-discount",
    },
  ];
  return (
    <section className="gg-card flex flex-col gap-3" aria-label="Statement summary">
      <p className="text-body text-text-secondary m-0" aria-live="polite">
        {statement
          ? describePeriod(statement.period)
          : loading
            ? "Totalling this period…"
            : ""}
      </p>
      <dl className="m-0 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-outline">
        {figures.map((figure, index) => (
          <div key={figure.label} className={index > 0 ? "sm:pl-4" : "sm:pr-4"}>
            <dt className="text-caption text-text-muted">{figure.label}</dt>
            <dd
              className="text-h2 text-text-primary m-0 mt-1 tabular-nums"
              data-testid={figure.testId}
            >
              {loading || !statement ? (
                <Skeleton className="h-6 w-24" aria-hidden />
              ) : (
                figure.value
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
