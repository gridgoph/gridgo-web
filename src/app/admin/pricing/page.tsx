"use client";

import { useCallback, useEffect, useState } from "react";

import { adminErrorMessage } from "@/app/admin/_lib/errors";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { getPricing, updateSettings, type PricingFigure, type PricingPeriod, type PricingReport, type PricingStats } from "@/lib/api/client";
import { formatPhp, pesosToMinor } from "@/lib/format";
import { pricingCsv } from "@/lib/pricing-csv";

const BRACKETS = [
  { id: "", label: "Any price" },
  { id: "under_500", label: "Under ₱500" },
  { id: "500_to_2000", label: "₱500–₱1,999" },
  { id: "2000_to_5000", label: "₱2,000–₱4,999" },
  { id: "5000_up", label: "₱5,000 and over" },
];

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

const EMPTY: Filters = {
  from: "", to: "", compareFrom: "", compareTo: "", category: "", bracket: "", accountType: "", cohort: "",
};

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

function PeriodView({ title, period }: { title: string; period: PricingPeriod }) {
  return (
    <section className="flex flex-col gap-4 rounded-card border border-border bg-surface p-4">
      <h2 className="text-h3 m-0">{title}</h2>
      <div>
        <h3 className="text-body font-medium m-0">Checkout drop-off</h3>
        <p className="text-body text-text-secondary m-0">
          {period.funnel.dropOff} reached checkout and were not paid within 24 hours.
          {" "}{period.funnel.paidInTime} were paid in time. {period.funnel.open} are still inside 24 hours.
        </p>
        <ul className="text-body m-0 pl-5">
          {Object.entries(period.funnel.counts).map(([kind, count]) => (
            <li key={kind}>{kind.replaceAll("_", " ")}: {count}</li>
          ))}
        </ul>
        <p className="text-body m-0">{period.funnel.exitQuestion.message ?? "Exit answers"}</p>
        {period.funnel.exitQuestion.answers.length > 0 && (
          <ul className="text-body m-0 pl-5">
            {period.funnel.exitQuestion.answers.map((row) => (
              <li key={row.answer}>{row.answer}: {row.count}</li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h3 className="text-body font-medium m-0">Operations time</h3>
        <p className="text-body text-text-secondary m-0">{period.operations.note}</p>
        <p className="text-body m-0">Quality check opened to done: {duration(period.operations.qualityCheck)}</p>
        <p className="text-body m-0">Time to the first Operations action: {duration(period.operations.firstAction)}</p>
        <p className="text-body m-0">Manual interventions: {period.operations.manualInterventions}</p>
      </div>
      <div>
        <h3 className="text-body font-medium m-0">Reprints and refunds</h3>
        <p className="text-body m-0">Reprint rate: Unknown. Cost: {money(period.reprints.cost)}. Who bore it: Unknown. {period.reprints.note}</p>
        <p className="text-body m-0">
          Refund rate: {rate(period.refunds.rate)} across {period.refunds.orders} orders.
          GRIDGO {money(period.refunds.gridgo)}, shop {money(period.refunds.shop)}, rider {money(period.refunds.rider)}.
        </p>
      </div>
      <div>
        <h3 className="text-body font-medium m-0">Shop price</h3>
        {[...period.prices.byCategory, ...period.prices.byBracket].map((group) => (
          <p key={`${group.id}-${group.label}`} className="text-body m-0">
            {group.label}: {group.count === 0 ? "No orders" : group.average == null ? "Unknown" : `average ${formatPhp(group.average)}, median ${formatPhp(group.median ?? group.average)} (${group.count})`}
          </p>
        ))}
      </div>
      <div>
        <h3 className="text-body font-medium m-0">Earnings per order</h3>
        {period.earnings.length === 0 && <p className="text-body m-0">No orders in this range.</p>}
        {period.earnings.map((row) => (
          <p key={row.orderId} className="text-body m-0">
            {row.orderId}: fee {money(row.fee)}
            {row.effectiveFeeBps == null ? ", effective fee unknown" : `, effective fee ${row.effectiveFeeBps / 100}%`}
            , remains {money(row.remains)} after payment fee {money(row.paymentFeeMinor)}, vouchers {money(row.voucherMinor)}, discounts {money(row.discountMinor)}, reprint share {money(row.reprintShareMinor)}, refund share {money(row.refundShareMinor)}, delivery absorbed {money(row.deliveryAbsorbedMinor)}.
          </p>
        ))}
      </div>
    </section>
  );
}

export default function PricingPage() {
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [report, setReport] = useState<PricingReport | null>(null);
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
      setError(adminErrorMessage(err, "Could not load pricing."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(EMPTY); }, [load]);

  function set<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function download() {
    if (!report) return;
    const blob = new Blob([pricingCsv(report)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "pricing.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function saveSettings() {
    if (!report?.settings.version || saving) return;
    const fixed = pesosToMinor(fixedCosts);
    const percent = Number(paymentPercent);
    if (fixed == null || !Number.isFinite(percent) || percent < 0 || percent > 100) {
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

  return (
    <div className="flex flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-h1 m-0">Pricing</h1>
        <p className="text-body text-text-secondary m-0 max-w-prose">
          {report?.scope ?? "Checkout figures count only events recorded since this release."}
        </p>
      </header>
      <form
        className="flex flex-wrap gap-3 items-end"
        onSubmit={(event) => { event.preventDefault(); void load(filters); }}
      >
        <label className="flex flex-col gap-1 text-body">From<input type="date" value={filters.from} onChange={(event) => set("from", event.target.value)} /></label>
        <label className="flex flex-col gap-1 text-body">To<input type="date" value={filters.to} onChange={(event) => set("to", event.target.value)} /></label>
        <label className="flex flex-col gap-1 text-body">Compare from<input type="date" value={filters.compareFrom} onChange={(event) => set("compareFrom", event.target.value)} /></label>
        <label className="flex flex-col gap-1 text-body">Compare to<input type="date" value={filters.compareTo} onChange={(event) => set("compareTo", event.target.value)} /></label>
        <label className="flex flex-col gap-1 text-body">Category<input value={filters.category} onChange={(event) => set("category", event.target.value)} /></label>
        <label className="flex flex-col gap-1 text-body">Price bracket
          <select value={filters.bracket} onChange={(event) => set("bracket", event.target.value)}>
            {BRACKETS.map((band) => <option key={band.id} value={band.id}>{band.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-body">Account type
          <select value={filters.accountType} onChange={(event) => set("accountType", event.target.value)}>
            <option value="">Any</option>
            <option value="individual">Individual</option>
            <option value="business">Business</option>
            <option value="organization">Organization</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-body">New or repeat
          <select value={filters.cohort} onChange={(event) => set("cohort", event.target.value)}>
            <option value="">Any</option>
            <option value="new">New</option>
            <option value="repeat">Repeat</option>
          </select>
        </label>
        <Button type="submit">Apply</Button>
        <Button type="button" variant="secondary" disabled={!report} onClick={download}>Export CSV</Button>
      </form>
      <section className="flex flex-col gap-3 rounded-card border border-border p-4">
        <h2 className="text-h3 m-0">Break-even</h2>
        <p className="text-body m-0">
          Orders to break even this month: {report?.breakEven.known ? report.breakEven.orders : "Unknown"}.
          Orders completed this month: {report?.completedThisMonth ?? "Unknown"}.
        </p>
        <label className="flex flex-col gap-1 text-body">Monthly fixed costs (pesos)
          <input value={fixedCosts} onChange={(event) => setFixedCosts(event.target.value)} inputMode="decimal" />
        </label>
        <label className="flex flex-col gap-1 text-body">Payment fee (percent)
          <input value={paymentPercent} onChange={(event) => setPaymentPercent(event.target.value)} inputMode="decimal" />
        </label>
        <label className="flex flex-col gap-1 text-body">Reason
          <input value={reason} onChange={(event) => setReason(event.target.value)} />
        </label>
        <Button type="button" disabled={saving || !report} onClick={() => void saveSettings()}>Save settings</Button>
        {saved && <p className="text-body m-0">{saved}</p>}
      </section>
      {error && <ErrorState body={error} />}
      {loading && <p className="text-body">Loading pricing.</p>}
      {report && <PeriodView title="Selected dates" period={report.period} />}
      {report?.compare && <PeriodView title="Comparison" period={report.compare} />}
    </div>
  );
}
