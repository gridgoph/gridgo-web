"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Download } from "lucide-react";

import { adminErrorMessage } from "@/app/admin/_lib/errors";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SkeletonDetail } from "@/components/ui/loading";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getPricing,
  getTaxonomy,
  updateSettings,
  type PricingFigure,
  type PricingPeriod,
  type PricingReport,
  type PricingStats,
} from "@/lib/api/client";
import type { Taxonomy } from "@/lib/api/types";
import { manilaToday } from "@/lib/audit";
import { formatDate, formatPhp, pesosToMinor } from "@/lib/format";
import { categoryName, subcategoryName } from "@/lib/listings";
import { pricingCsv } from "@/lib/pricing-csv";
import { pricingRangeError, pricingRangeProblem } from "@/lib/pricing-range";

const ANY = "any";

const BRACKETS = [
  { id: "under_500", label: "Under ₱500" },
  { id: "500_to_2000", label: "₱500–₱1,999" },
  { id: "2000_to_5000", label: "₱2,000–₱4,999" },
  { id: "5000_up", label: "₱5,000 and over" },
];

const ACCOUNT_TYPES = [
  { id: "individual", label: "Individual" },
  { id: "business", label: "Business" },
  { id: "organization", label: "Organization" },
];

const COHORTS = [
  { id: "new", label: "New client" },
  { id: "repeat", label: "Repeat client" },
];

/** The checkout steps the client app reports, in the order a client meets them. */
const FUNNEL_LABELS: Record<string, string> = {
  product_viewed: "Viewed a product",
  listing_viewed: "Viewed a listing",
  checkout_reached: "Reached checkout",
  paid: "Paid",
  checkout_left: "Left checkout",
};

type Filters = {
  from: string;
  to: string;
  compareFrom: string;
  compareTo: string;
  category: string;
  bracket: string;
  accountType: string;
  cohort: string;
};

/**
 * Opens on this month so far, never on everything: the dashboard is read from
 * every order and event in the range, so the range is always bounded.
 */
function thisMonth(): Filters {
  const today = manilaToday();
  return {
    from: `${today.slice(0, 8)}01`,
    to: today,
    compareFrom: "",
    compareTo: "",
    category: "",
    bracket: "",
    accountType: "",
    cohort: "",
  };
}

/**
 * The API reads a date as that UTC day, so the range it returns is named by
 * its calendar day, not shifted into Manila time.
 */
function rangeDay(iso: string): string {
  return formatDate(`${iso.slice(0, 10)}T12:00:00+08:00`);
}

function money(figure: PricingFigure | undefined): string {
  if (!figure?.known || figure.minor == null) return "Unknown";
  return formatPhp(figure.minor);
}

function duration(stats: PricingStats): string {
  if (stats.average == null || stats.median == null) return "Unknown";
  const text = (ms: number) => {
    const minutes = Math.round(ms / 60_000);
    const hours = Math.floor(minutes / 60);
    return hours === 0 ? `${minutes} min` : `${hours} h ${minutes % 60} min`;
  };
  return `Average ${text(stats.average)}, median ${text(stats.median)} (${stats.count} recorded)`;
}

function rate(value: number | null): string {
  if (value == null) return "Unknown";
  return `${Math.round(value * 1000) / 10}%`;
}

/** The API names a product type by its code; show the name the catalogue uses. */
function productTypeName(taxonomy: Taxonomy | null, code: string): string {
  if (taxonomy?.subcategories?.some((entry) => entry.code === code)) {
    return subcategoryName(taxonomy, code);
  }
  return categoryName(taxonomy, code);
}

function Facts({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="m-0 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-[minmax(12rem,auto)_minmax(0,1fr)]">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-caption text-text-muted sm:text-body">{label}</dt>
          <dd className="text-body text-text-primary m-0 mb-2 tabular-nums sm:mb-0">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-body text-text-primary m-0" style={{ fontFamily: "var(--font-medium)" }}>
        {title}
      </h3>
      {note ? <p className="text-caption text-text-muted m-0">{note}</p> : null}
      {children}
    </div>
  );
}

function PeriodView({
  title,
  period,
  taxonomy,
}: {
  title: string;
  period: PricingPeriod;
  taxonomy: Taxonomy | null;
}) {
  return (
    <section className="gg-card flex flex-col gap-6">
      <h2 className="text-h3 text-text-primary m-0">{title}</h2>

      <Section
        title="Checkout drop-off"
        note={`${period.funnel.dropOff} reached checkout and were not paid within 24 hours. ${period.funnel.paidInTime} were paid in time. ${period.funnel.open} are still inside 24 hours.`}
      >
        <Facts
          rows={Object.entries(period.funnel.counts).map(([kind, count]) => [
            FUNNEL_LABELS[kind] ?? kind.replaceAll("_", " "),
            String(count),
          ])}
        />
        <p className="text-caption text-text-muted m-0">
          {period.funnel.exitQuestion.message ?? "Why clients left checkout, in their words"}
        </p>
        {period.funnel.exitQuestion.answers.length ? (
          <Facts
            rows={period.funnel.exitQuestion.answers.map((row) => [row.answer, String(row.count)])}
          />
        ) : null}
      </Section>

      <Section title="Operations time" note={period.operations.note}>
        <Facts
          rows={[
            ["Quality check opened to done", duration(period.operations.qualityCheck)],
            ["First Operations action", duration(period.operations.firstAction)],
            ["Manual interventions", String(period.operations.manualInterventions)],
          ]}
        />
      </Section>

      <Section title="Reprints and refunds" note={period.reprints.note}>
        <Facts
          rows={[
            ["Reprint rate", period.reprints.recorded ? rate(period.reprints.rate) : "Unknown"],
            ["Reprint cost", money(period.reprints.cost)],
            ["Reprint cost borne by", period.reprints.borneBy ?? "Unknown"],
            ["Refund rate", `${rate(period.refunds.rate)} of ${period.refunds.orders} orders`],
            ["Refunded by GRIDGO", money(period.refunds.gridgo)],
            ["Refunded by the shop", money(period.refunds.shop)],
            ["Refunded by the rider", money(period.refunds.rider)],
          ]}
        />
      </Section>

      <Section title="Shop price" note="Average and median of the shop's own price, per order.">
        <Facts
          rows={[
            ...period.prices.byCategory.map((group) => ({
              ...group,
              label: productTypeName(taxonomy, group.id),
            })),
            ...period.prices.byBracket,
          ].map((group) => [
            group.label,
            group.count === 0
              ? "No orders"
              : group.average == null
                ? "Unknown"
                : `Average ${formatPhp(group.average)}, median ${formatPhp(group.median ?? group.average)} (${group.count})`,
          ])}
        />
      </Section>

      <Section
        title="Earnings per order"
        note="GRIDGO's fee and what remains of it after the payment fee, vouchers, discounts, reprints, refunds and absorbed delivery."
      >
        {period.earnings.length === 0 ? (
          <p className="text-body text-text-secondary m-0">No orders in this range.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] border-collapse text-left">
              <thead>
                <tr className="border-b border-outline-subtle">
                  {[
                    "Order",
                    "Fee",
                    "Effective fee",
                    "Remains",
                    "Payment fee",
                    "Vouchers",
                    "Discounts",
                    "Reprint share",
                    "Refund share",
                    "Delivery absorbed",
                  ].map((heading) => (
                    <th
                      key={heading}
                      scope="col"
                      className="text-caption text-text-muted py-1.5 pr-3 [font-weight:inherit]"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {period.earnings.map((row) => (
                  <tr key={row.orderId} className="border-b border-outline-subtle align-baseline">
                    <th scope="row" className="text-body text-text-primary py-2 pr-3 [font-weight:inherit]">
                      {row.orderId}
                    </th>
                    {[
                      money(row.fee),
                      row.effectiveFeeBps == null ? "Unknown" : `${row.effectiveFeeBps / 100}%`,
                      money(row.remains),
                      money(row.paymentFeeMinor),
                      money(row.voucherMinor),
                      money(row.discountMinor),
                      money(row.reprintShareMinor),
                      money(row.refundShareMinor),
                      money(row.deliveryAbsorbedMinor),
                    ].map((value, index) => (
                      <td key={index} className="text-body text-text-secondary py-2 pr-3 tabular-nums">
                        {value}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </section>
  );
}

function ChoiceField({
  id,
  label,
  value,
  anyLabel,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  anyLabel: string;
  options: { id: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const nameOf = (choice: string) =>
    choice === ANY ? anyLabel : (options.find((option) => option.id === choice)?.label ?? choice);
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select
        value={value || ANY}
        onValueChange={(next) => onChange(!next || next === ANY ? "" : String(next))}
      >
        <SelectTrigger id={id} className="min-h-11 w-full">
          <SelectValue>{(choice) => nameOf(String(choice ?? ANY))}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>{anyLabel}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

export default function PricingPage() {
  const [filters, setFilters] = useState<Filters>(thisMonth);
  const [report, setReport] = useState<PricingReport | null>(null);
  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fixedCosts, setFixedCosts] = useState("");
  const [paymentPercent, setPaymentPercent] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  const load = useCallback(async (next: Filters) => {
    setLoading(true);
    setError(null);
    try {
      const result = await getPricing(next);
      setReport(result);
      if (result.settings.fixedCostsMinor != null) setFixedCosts((result.settings.fixedCostsMinor / 100).toFixed(2));
      if (result.settings.paymentFeeBps != null) setPaymentPercent((result.settings.paymentFeeBps / 100).toString());
    } catch (err) {
      setError(pricingRangeError(err) ?? adminErrorMessage(err, "Could not load pricing."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(thisMonth());
    // Names for product types; codes still show if the chart cannot be read.
    getTaxonomy().then(setTaxonomy).catch(() => setTaxonomy(null));
  }, [load]);

  function set<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  const rangeProblem = pricingRangeProblem(filters);

  function apply(event: FormEvent) {
    event.preventDefault();
    if (rangeProblem) return;
    void load(filters);
  }

  function download() {
    if (!report) return;
    const blob = new Blob([pricingCsv(report)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `gridgo-pricing-${filters.from || "start"}-${filters.to || manilaToday()}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  async function saveSettings() {
    if (!report?.settings.version || saving) return;
    const fixed = pesosToMinor(fixedCosts);
    const percent = Number(paymentPercent);
    if (fixed == null || paymentPercent.trim() === "" || !Number.isFinite(percent) || percent < 0 || percent > 100) {
      setSaved("Enter monthly fixed costs in pesos and a payment fee from 0 to 100 percent.");
      return;
    }
    if (!reason.trim()) {
      setSaved("A reason is required to save these settings.");
      return;
    }
    setSaving(true);
    setSaved(null);
    try {
      await updateSettings({
        expectedVersion: report.settings.version,
        pricingFixedCostsMinor: fixed,
        pricingPaymentFeeBps: Math.round(percent * 100),
        reason: reason.trim(),
      });
      setReason("");
      setSaved("Saved.");
      await load(filters);
    } catch (err) {
      setSaved(adminErrorMessage(err, "Could not save the pricing settings."));
    } finally {
      setSaving(false);
    }
  }

  const categories = (taxonomy?.subcategories ?? [])
    .filter((entry) => entry.active !== false)
    .map((entry) => ({ id: entry.code, label: entry.name }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return (
    <div className="flex flex-col gap-4">
      <p className="text-body text-text-secondary m-0 max-w-prose">
        {report?.scope ?? "Checkout figures count only events recorded since this release."}
      </p>

      <form className="gg-card flex flex-col gap-4" onSubmit={apply}>
        <FieldGroup className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Field>
            <FieldLabel htmlFor="pricing-from">From</FieldLabel>
            <Input
              id="pricing-from"
              type="date"
              value={filters.from}
              max={filters.to || manilaToday()}
              onChange={(event) => set("from", event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="pricing-to">To</FieldLabel>
            <Input
              id="pricing-to"
              type="date"
              value={filters.to}
              min={filters.from || undefined}
              onChange={(event) => set("to", event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="pricing-compare-from">Compare from</FieldLabel>
            <Input
              id="pricing-compare-from"
              type="date"
              value={filters.compareFrom}
              max={filters.compareTo || manilaToday()}
              onChange={(event) => set("compareFrom", event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="pricing-compare-to">Compare to</FieldLabel>
            <Input
              id="pricing-compare-to"
              type="date"
              value={filters.compareTo}
              min={filters.compareFrom || undefined}
              onChange={(event) => set("compareTo", event.target.value)}
            />
          </Field>
          <ChoiceField
            id="pricing-category"
            label="Product type"
            value={filters.category}
            anyLabel="Every product type"
            options={categories}
            onChange={(value) => set("category", value)}
          />
          <ChoiceField
            id="pricing-bracket"
            label="Shop price"
            value={filters.bracket}
            anyLabel="Any price"
            options={report?.brackets.length ? report.brackets : BRACKETS}
            onChange={(value) => set("bracket", value)}
          />
          <ChoiceField
            id="pricing-account"
            label="Account type"
            value={filters.accountType}
            anyLabel="Any account"
            options={ACCOUNT_TYPES}
            onChange={(value) => set("accountType", value)}
          />
          <ChoiceField
            id="pricing-cohort"
            label="New or repeat"
            value={filters.cohort}
            anyLabel="New and repeat"
            options={COHORTS}
            onChange={(value) => set("cohort", value)}
          />
        </FieldGroup>
        <p className="text-caption text-text-muted m-0">
          Dates are when the order was placed, up to 366 days. Leave Compare empty to see one range.
        </p>
        {rangeProblem ? (
          <p className="text-body text-destructive m-0" role="alert">
            {rangeProblem}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={loading || rangeProblem != null}>
            {loading ? "Loading…" : "Apply"}
          </Button>
          <Button type="button" variant="secondary" disabled={!report} onClick={download}>
            <Download data-icon="inline-start" aria-hidden />
            Export CSV
          </Button>
        </div>
      </form>

      <section className="gg-card flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-h3 text-text-primary m-0">Break-even</h2>
          <p className="text-body text-text-secondary m-0">
            Orders to break even this month:{" "}
            {report?.breakEven.known ? report.breakEven.orders : "Unknown"}. Orders completed this
            month: {report?.completedThisMonth ?? "Unknown"}.
          </p>
        </div>
        <FieldGroup className="grid gap-3 md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="pricing-fixed">Monthly fixed costs (pesos)</FieldLabel>
            <Input
              id="pricing-fixed"
              value={fixedCosts}
              onChange={(event) => setFixedCosts(event.target.value)}
              inputMode="decimal"
              placeholder="0.00"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="pricing-fee">Payment fee (percent)</FieldLabel>
            <Input
              id="pricing-fee"
              value={paymentPercent}
              onChange={(event) => setPaymentPercent(event.target.value)}
              inputMode="decimal"
              placeholder="0"
            />
          </Field>
          <Field className="md:col-span-2">
            <FieldLabel htmlFor="pricing-reason">Reason</FieldLabel>
            <Input
              id="pricing-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Why these figures changed"
            />
            <FieldDescription>Kept in the audit log with the change.</FieldDescription>
          </Field>
        </FieldGroup>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="primary" disabled={saving || !report} onClick={() => void saveSettings()}>
            {saving ? "Saving…" : "Save settings"}
          </Button>
          {saved ? (
            <p className="text-body text-text-secondary m-0" role="status">
              {saved}
            </p>
          ) : null}
        </div>
      </section>

      {error ? (
        <ErrorState
          body={error}
          action={
            <Button type="button" onClick={() => void load(filters)}>
              Try again
            </Button>
          }
        />
      ) : null}
      {loading && !report ? <SkeletonDetail label="Loading pricing" /> : null}
      {report ? (
        <PeriodView
          title={
            report.range
              ? `${rangeDay(report.range.from)} to ${rangeDay(report.range.to)}`
              : "Selected dates"
          }
          period={report.period}
          taxonomy={taxonomy}
        />
      ) : null}
      {report?.compare ? (
        <PeriodView
          title={
            report.compareRange
              ? `Comparison: ${rangeDay(report.compareRange.from)} to ${rangeDay(report.compareRange.to)}`
              : "Comparison"
          }
          period={report.compare}
          taxonomy={taxonomy}
        />
      ) : null}
    </div>
  );
}
