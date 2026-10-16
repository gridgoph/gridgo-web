import type { PricingFigure, PricingPeriod, PricingReport } from "@/lib/api/client";

/**
 * Exit answers are the client's own words, so a cell that a spreadsheet would
 * read as a formula is written as text, the way the API's audit CSV does.
 */
function cell(value: unknown): string {
  let text = value == null ? "" : String(value);
  if (/^[\s]*[=+@-]|^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function figure(value: PricingFigure | undefined): string {
  if (!value?.known || value.minor == null) return "unknown";
  return String(value.minor);
}

/** Every figure on the pricing page, for the selected range and the comparison. */
export function pricingCsv(report: PricingReport): string {
  const rows: unknown[][] = [["section", "figure", "period", "value"]];
  const add = (section: string, name: string, period: string, value: unknown) => {
    rows.push([section, name, period, value == null || value === "" ? "unknown" : value]);
  };
  add("scope", "note", "", report.scope);
  add("break-even", "orders per month", "month", report.breakEven.known ? report.breakEven.orders : "unknown");
  add("break-even", "orders completed this month", "month", report.completedThisMonth);
  add("settings", "fixed costs minor", "", report.settings.fixedCostsMinor ?? "unknown");
  add("settings", "payment fee bps", "", report.settings.paymentFeeBps ?? "unknown");
  const writePeriod = (periodName: string, period: PricingPeriod) => {
    for (const [kind, count] of Object.entries(period.funnel.counts)) add("funnel", kind, periodName, count);
    add("funnel", "reached checkout", periodName, period.funnel.reached);
    add("funnel", "drop-off after 24 hours", periodName, period.funnel.dropOff);
    add("funnel", "still inside 24 hours", periodName, period.funnel.open);
    add("funnel", "paid within 24 hours", periodName, period.funnel.paidInTime);
    add("funnel", "exit question", periodName, period.funnel.exitQuestion.asked ? "asked" : period.funnel.exitQuestion.message);
    for (const answer of period.funnel.exitQuestion.answers) add("exit answer", answer.answer, periodName, answer.count);
    add("operations", "note", periodName, period.operations.note);
    add("operations", "quality check average ms", periodName, period.operations.qualityCheck.average ?? "unknown");
    add("operations", "quality check median ms", periodName, period.operations.qualityCheck.median ?? "unknown");
    add("operations", "quality check count", periodName, period.operations.qualityCheck.count);
    add("operations", "first action average ms", periodName, period.operations.firstAction.average ?? "unknown");
    add("operations", "first action median ms", periodName, period.operations.firstAction.median ?? "unknown");
    add("operations", "first action count", periodName, period.operations.firstAction.count);
    add("operations", "manual interventions", periodName, period.operations.manualInterventions);
    add("reprints", "rate", periodName, period.reprints.rate ?? "unknown");
    add("reprints", "cost minor", periodName, figure(period.reprints.cost));
    add("reprints", "borne by", periodName, period.reprints.borneBy ?? "unknown");
    add("reprints", "note", periodName, period.reprints.note);
    add("refunds", "orders", periodName, period.refunds.orders);
    add("refunds", "rate", periodName, period.refunds.rate ?? "unknown");
    add("refunds", "gridgo minor", periodName, figure(period.refunds.gridgo));
    add("refunds", "shop minor", periodName, figure(period.refunds.shop));
    add("refunds", "rider minor", periodName, figure(period.refunds.rider));
    for (const group of [...period.prices.byCategory, ...period.prices.byBracket]) {
      add("price", `${group.label} average minor`, periodName, group.average ?? "unknown");
      add("price", `${group.label} median minor`, periodName, group.median ?? "unknown");
      add("price", `${group.label} count`, periodName, group.count);
    }
    for (const row of period.earnings) {
      add("earnings", `${row.orderId} fee minor`, periodName, figure(row.fee));
      add("earnings", `${row.orderId} effective fee bps`, periodName, row.effectiveFeeBps ?? "unknown");
      add("earnings", `${row.orderId} remains minor`, periodName, figure(row.remains));
      add("earnings", `${row.orderId} payment fee minor`, periodName, figure(row.paymentFeeMinor));
      add("earnings", `${row.orderId} voucher minor`, periodName, figure(row.voucherMinor));
      add("earnings", `${row.orderId} discount minor`, periodName, figure(row.discountMinor));
      add("earnings", `${row.orderId} reprint share minor`, periodName, figure(row.reprintShareMinor));
      add("earnings", `${row.orderId} refund share minor`, periodName, figure(row.refundShareMinor));
      add("earnings", `${row.orderId} delivery absorbed minor`, periodName, figure(row.deliveryAbsorbedMinor));
    }
  };
  writePeriod("selected", report.period);
  if (report.compare) writePeriod("compare", report.compare);
  return rows.map((row) => row.map(cell).join(",")).join("\r\n");
}
