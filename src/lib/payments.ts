/**
 * Portal installment names vs the live API money schedule.
 *
 * Screens talk about a downpayment and a balance. The API stores those as
 * `initial` and `final_online`, and pickup plans often have only the initial
 * online collection. Map at the boundary so a missing key never reaches
 * `.status`.
 */

import type {
  Order,
  OrderPayments,
  PaymentInstallment,
  PaymentRecord,
} from "@/lib/api/types";

/** Full order, already-mapped installments, or a payments-only slice. */
export type PaymentSource =
  Order | OrderPayments | Pick<Order, "payments"> | null | undefined;

const PORTAL_FROM_API: Record<string, PaymentInstallment> = {
  downpayment: "downpayment",
  initial: "downpayment",
  balance: "balance",
  final_online: "balance",
};

export function portalInstallment(
  code: string | null | undefined,
): PaymentInstallment | null {
  if (!code) return null;
  return PORTAL_FROM_API[code] ?? null;
}

function asPaymentRecord(value: unknown): PaymentRecord | undefined {
  if (!value || typeof value !== "object") return undefined;
  const rec = value as Partial<PaymentRecord>;
  if (rec.status == null) return undefined;
  return rec as PaymentRecord;
}

function isPaymentsMap(value: object): value is Record<string, unknown> {
  return (
    "downpayment" in value ||
    "balance" in value ||
    "initial" in value ||
    "final_online" in value
  );
}

function paymentsObject(source: unknown): Record<string, unknown> | undefined {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return undefined;
  }
  if ("payments" in source) {
    const nested = (source as { payments?: unknown }).payments;
    if (!nested || typeof nested !== "object" || Array.isArray(nested)) {
      return undefined;
    }
    return isPaymentsMap(nested) ? nested : undefined;
  }
  return isPaymentsMap(source) ? (source as Record<string, unknown>) : undefined;
}

/** Rewrite API keys onto the portal names Operations already uses. */
export function normalizePayments(raw: unknown): OrderPayments | undefined {
  const source = paymentsObject(raw);
  if (!source) return undefined;
  const downpayment = asPaymentRecord(source.initial ?? source.downpayment);
  const balance = asPaymentRecord(source.final_online ?? source.balance);
  if (!downpayment && !balance) return undefined;
  const payments: OrderPayments = {};
  if (downpayment) payments.downpayment = downpayment;
  if (balance) payments.balance = balance;
  return payments;
}

export function normalizeOrder<
  T extends {
    payments?: OrderPayments;
    downpaymentMinor?: number;
    balanceMinor?: number;
  },
>(order: T): T {
  const payments = normalizePayments(order.payments);
  return {
    ...order,
    payments,
    downpaymentMinor: order.downpaymentMinor ?? payments?.downpayment?.amountMinor,
    balanceMinor: order.balanceMinor ?? payments?.balance?.amountMinor,
  };
}

export function normalizeOrders(orders: Order[] | null | undefined): Order[] {
  return (orders ?? []).map((order) => normalizeOrder(order));
}

export function paymentOf(
  source: PaymentSource,
  code: PaymentInstallment,
): PaymentRecord | undefined {
  return normalizePayments(source)?.[code];
}

/**
 * Installments that actually exist on this order — never a missing slot, and
 * never the ₱0 `not_required` balance of an order paid in full up front: there
 * is nothing on it to show, submit, confirm or reject.
 */
export function listedInstallments(source: PaymentSource): PaymentInstallment[] {
  const listed: PaymentInstallment[] = [];
  if (paymentOf(source, "downpayment")) listed.push("downpayment");
  const balance = paymentOf(source, "balance");
  if (balance && balance.status !== BALANCE_NOT_REQUIRED) listed.push("balance");
  return listed;
}

/** Mutation routes use the API's canonical installment names. */
export function apiInstallment(code: PaymentInstallment): "initial" | "final_online" {
  return code === "downpayment" ? "initial" : "final_online";
}

/** Financial progress is independent of production/delivery progress. */
export function paymentProgress(order: Pick<Order, "payments" | "totalMinor">) {
  const records = listedInstallments(order).map((code) => paymentOf(order, code)!);
  const settled = (record: PaymentRecord) => record.status === "confirmed" || record.status === "legacy_confirmed";
  const paidMinor = records.length ? records.reduce((sum, record) => sum + (settled(record) ? record.amountMinor : 0), 0) : null;
  return {
    label: records.some((record) => record.status === "pending_confirmation") ? "Needs review" : records.length && records.every(settled) ? "Done" : "Awaiting client",
    paidMinor,
    remainingMinor: paidMinor !== null && order.totalMinor != null ? Math.max(0, order.totalMinor - paidMinor) : null,
  };
}

/*
 How much of the order the client paid up front.

 The captain moved new orders to 100% on 2026-09-25 (gridgo-api#66): one QR
 transfer, one confirmation, and no balance to chase. Each order snapshots the
 split it was placed under as `downpaymentPercent`, and a paid-up-front order
 keeps its balance installment at ₱0 with status `not_required`. Orders placed
 on 75/25 keep their balance step. Every screen that names a share reads it
 here rather than writing 75 or 25.
*/

/** Orders placed before the split was snapshotted were all 75/25. */
export const LEGACY_DOWNPAYMENT_PERCENT = 75;

/** The balance status of an order paid in full up front. */
export const BALANCE_NOT_REQUIRED = "not_required";

/** An order, or only its payments, as the split helpers read it. */
export type PaymentSplitSource =
  | PaymentSource
  | Partial<Pick<Order, "payments" | "downpaymentPercent" | "balanceMinor">>;

function orderFields(
  source: PaymentSplitSource,
): Partial<Pick<Order, "downpaymentPercent" | "balanceMinor">> {
  if (!source || typeof source !== "object" || !("payments" in source)) return {};
  return source as Partial<Pick<Order, "downpaymentPercent" | "balanceMinor">>;
}

/**
 * True when the order has no balance to pay: it was paid in full up front.
 * A balance of more than ₱0 always means a 75/25 order, whatever else it says.
 */
export function balanceNotRequired(source: PaymentSplitSource): boolean {
  const { balanceMinor, downpaymentPercent } = orderFields(source);
  if (typeof balanceMinor === "number" && balanceMinor > 0) return false;
  if (paymentOf(source as PaymentSource, "balance")?.status === BALANCE_NOT_REQUIRED) {
    return true;
  }
  return balanceMinor === 0 || downpaymentPercent === 100;
}

/** The share of the total this order took up front: 100, or 75 on a split order. */
export function downpaymentPercentOf(source: PaymentSplitSource): number {
  if (balanceNotRequired(source)) return 100;
  const { downpaymentPercent } = orderFields(source);
  return typeof downpaymentPercent === "number" &&
    Number.isFinite(downpaymentPercent) &&
    downpaymentPercent > 0 &&
    downpaymentPercent < 100
    ? downpaymentPercent
    : LEGACY_DOWNPAYMENT_PERCENT;
}

/** "Full payment" on an upfront order; "Downpayment (75%)" / "Balance (25%)" on a split one. */
export function installmentLabel(
  source: PaymentSplitSource,
  code: PaymentInstallment,
): string {
  if (balanceNotRequired(source)) {
    return code === "downpayment" ? "Full payment" : "No balance";
  }
  const percent = downpaymentPercentOf(source);
  return code === "downpayment"
    ? `Downpayment (${percent}%)`
    : `Balance (${100 - percent}%)`;
}

/** The installment's name inside a sentence: "full payment", "downpayment", "balance". */
export function installmentNoun(
  source: PaymentSplitSource,
  code: PaymentInstallment,
): string {
  if (code === "downpayment") {
    return balanceNotRequired(source) ? "full payment" : "downpayment";
  }
  return "balance";
}

/**
 * The plan the order was placed under, for the Money rail: "In full at
 * checkout", or "75% now, 25% before delivery". Null before anything is owed.
 */
export function paymentPlanLabel(
  order: Pick<Order, "payments"> & Partial<Pick<Order, "downpaymentPercent" | "balanceMinor">>,
): string | null {
  if (listedInstallments(order).length === 0) return null;
  if (balanceNotRequired(order)) return "In full at checkout";
  const percent = downpaymentPercentOf(order);
  return `${percent}% now, ${100 - percent}% before delivery`;
}
