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

/** Installments that actually exist on this order — never a missing slot. */
export function listedInstallments(source: PaymentSource): PaymentInstallment[] {
  const listed: PaymentInstallment[] = [];
  if (paymentOf(source, "downpayment")) listed.push("downpayment");
  if (paymentOf(source, "balance")) listed.push("balance");
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
