/**
 * Plain-language presentation of the v2 order model.
 * No API snake_case reaches the screen.
 */

import type {
  OrderPayments,
  PaymentInstallment,
  PayoutMilestone,
  PickupCheckCode,
} from "@/lib/api/types";
import { paymentOf } from "@/lib/payments";

export type StatusTone = "success" | "warning" | "error" | "info" | "neutral";
export type StatusIconName =
  "circle-check" | "triangle-alert" | "circle-x" | "clock" | "square-pen";

export type StatePresentation = {
  label: string;
  tone: StatusTone;
  icon: StatusIconName;
};

export function presentOrderState(state: string): StatePresentation {
  switch (state) {
    case "draft":
      return { label: "Draft", tone: "neutral", icon: "square-pen" };
    case "submitted":
      return { label: "Submitted for QA", tone: "info", icon: "clock" };
    case "needs_qa":
      return { label: "Needs QA review", tone: "warning", icon: "triangle-alert" };
    case "client_correction":
      return { label: "Awaiting client correction", tone: "warning", icon: "square-pen" };
    case "proof_approval":
      return { label: "Artwork with client", tone: "info", icon: "clock" };
    case "approved_for_matching":
      return { label: "Ready to match supplier", tone: "info", icon: "clock" };
    case "supplier_assigned":
      return {
        label: "Awaiting supplier decision",
        tone: "warning",
        icon: "triangle-alert",
      };
    case "awaiting_initial_payment":
    case "awaiting_downpayment":
      return { label: "Awaiting downpayment", tone: "warning", icon: "clock" };
    case "initial_payment_review":
    case "downpayment_review":
      return {
        label: "Downpayment needs confirming",
        tone: "warning",
        icon: "triangle-alert",
      };
    case "payment_authorized":
      return { label: "Downpayment confirmed", tone: "info", icon: "circle-check" };
    case "production":
      return { label: "In production", tone: "info", icon: "square-pen" };
    case "supplier_self_qc":
      return { label: "Self-QC done", tone: "success", icon: "circle-check" };
    case "ready_for_dispatch":
      return { label: "Ready for dispatch", tone: "success", icon: "circle-check" };
    case "rider_assigned":
      return { label: "Rider assigned", tone: "info", icon: "clock" };
    case "picked_up":
      return { label: "Picked up", tone: "info", icon: "circle-check" };
    case "out_for_delivery":
      return { label: "Out for delivery", tone: "info", icon: "clock" };
    case "delivered":
      return { label: "Delivered", tone: "success", icon: "circle-check" };
    case "issue_window_open":
      return { label: "Issue window open", tone: "warning", icon: "clock" };
    case "completed":
      return { label: "Completed", tone: "success", icon: "circle-check" };
    case "payout_released":
      return { label: "Payout released", tone: "success", icon: "circle-check" };
    default:
      return { label: "In progress", tone: "neutral", icon: "clock" };
  }
}

export function presentTimelineActor(by: string): string {
  if (by === "system") return "GRIDGO";
  if (by === "user_client") return "Client";
  if (by === "user_supplier") return "Supplier";
  if (by === "user_rider") return "Rider";
  if (by === "user_ops") return "Operations";
  if (by === "user_admin") return "Super Admin";
  if (by.startsWith("user_")) return "Team";
  return by;
}

// ---------------------------------------------------------------------------
// Split payment
// ---------------------------------------------------------------------------

export const INSTALLMENT_LABEL: Record<PaymentInstallment, string> = {
  downpayment: "Downpayment",
  balance: "Balance",
};

/** "Downpayment (75%)" — the share is part of how the team talks about it. */
export function presentInstallment(installment: PaymentInstallment): string {
  return installment === "downpayment" ? "Downpayment (75%)" : "Balance (25%)";
}

export function presentPaymentStatus(
  status: string | undefined | null,
): StatePresentation {
  switch (status) {
    case "not_submitted":
      return { label: "Not submitted", tone: "neutral", icon: "clock" };
    case "pending_confirmation":
      return {
        label: "Waiting on Operations",
        tone: "warning",
        icon: "triangle-alert",
      };
    case "confirmed":
      return { label: "Confirmed", tone: "success", icon: "circle-check" };
    case "legacy_confirmed":
      return {
        label: "Confirmed before v2",
        tone: "success",
        icon: "circle-check",
      };
    default:
      return { label: "Payment", tone: "neutral", icon: "clock" };
  }
}

/** How the money was sent. Only digital methods exist. */
export function presentPaymentMethod(method: string | null): string {
  switch (method) {
    case "qr_manual":
      return "QR transfer";
    case "digital_manual_legacy":
      return "Digital transfer (recorded before v2)";
    case null:
    case undefined:
    case "":
      return "Not set";
    default:
      return "Digital transfer";
  }
}

/** Who confirmed it, and how. */
export function presentConfirmationSource(source: string | null): string {
  switch (source) {
    case "manual_ops":
      return "Confirmed by hand in this portal";
    case null:
    case undefined:
    case "":
      return "Not confirmed yet";
    default:
      return "Confirmed automatically";
  }
}

/** Roll-up of both installments for a list row. */
export function presentPaymentProgress(
  payments: OrderPayments | undefined,
): StatePresentation {
  const downpayment = paymentOf(payments, "downpayment");
  const balance = paymentOf(payments, "balance");
  if (!downpayment && !balance) {
    return { label: "No payment set up", tone: "neutral", icon: "clock" };
  }
  if (downpayment?.status === "pending_confirmation") {
    return {
      label: "Downpayment to confirm",
      tone: "warning",
      icon: "triangle-alert",
    };
  }
  if (balance?.status === "pending_confirmation") {
    return {
      label: "Balance to confirm",
      tone: "warning",
      icon: "triangle-alert",
    };
  }
  const settled = (record: { status: string } | undefined) =>
    record?.status === "confirmed" || record?.status === "legacy_confirmed";
  if (settled(downpayment) && (!balance || settled(balance))) {
    return { label: "Paid in full", tone: "success", icon: "circle-check" };
  }
  if (settled(downpayment)) {
    return { label: "Downpayment in", tone: "info", icon: "circle-check" };
  }
  return { label: "Nothing paid yet", tone: "neutral", icon: "clock" };
}

// ---------------------------------------------------------------------------
// Payout milestones
// ---------------------------------------------------------------------------

export function presentMilestone(code: string): string {
  switch (code) {
    case "printing":
      return "Printing in progress";
    case "packaging_qc":
      return "Packaging and quality check";
    case "delivered":
      return "Delivered";
    case "retention":
      return "Client retention";
    default:
      return "Milestone";
  }
}

/** Who is expected to supply the Proof of Fulfilment for this milestone. */
export function milestoneProofSource(code: string): string {
  switch (code) {
    case "printing":
    case "packaging_qc":
      return "Supplier uploads the proof";
    case "delivered":
      return "Rider uploads the proof at delivery";
    case "retention":
      return "Covered by the delivered proof";
    default:
      return "Proof required";
  }
}

export function presentMilestoneStatus(
  status: PayoutMilestone["status"],
): StatePresentation {
  switch (status) {
    case "released":
      return { label: "Released", tone: "success", icon: "circle-check" };
    case "pof_attached":
      return { label: "Proof attached", tone: "info", icon: "circle-check" };
    case "pending_pof":
      return { label: "Proof needed", tone: "warning", icon: "clock" };
    default:
      return { label: "Milestone", tone: "neutral", icon: "clock" };
  }
}

// ---------------------------------------------------------------------------
// Rider pickup checklist
// ---------------------------------------------------------------------------

/** The six checks, in the order the rider works through them. */
export const PICKUP_CHECKS: readonly {
  code: PickupCheckCode;
  label: string;
  verify: string;
}[] = [
  {
    code: "quantity_match",
    label: "Quantity match",
    verify: "Physical count matches the order ticket quantity",
  },
  {
    code: "specification_match",
    label: "Specification match",
    verify: "Item matches the described size, colour, material and design",
  },
  {
    code: "visible_defects",
    label: "Visible defects",
    verify: "No tears, misprints, colour shifts, cracks or stains",
  },
  {
    code: "packaging_integrity",
    label: "Packaging integrity",
    verify: "Wrapped or boxed well enough to travel on a motorcycle",
  },
  {
    code: "documentation",
    label: "Documentation",
    verify: "Delivery receipt or order slip included, and matching this order",
  },
  {
    code: "supplier_sign_off",
    label: "Supplier sign-off",
    verify: "Supplier confirmed the handoff",
  },
];

export function presentPickupCheck(code: string): string {
  return PICKUP_CHECKS.find((c) => c.code === code)?.label ?? "Pickup check";
}

export function presentChecklistStatus(status: string | undefined): StatePresentation {
  switch (status) {
    case "passed":
      return { label: "All six checks passed", tone: "success", icon: "circle-check" };
    case "failed_escalated":
      return { label: "Check failed — escalated", tone: "error", icon: "circle-x" };
    case "not_started":
    case undefined:
      return { label: "Not checked yet", tone: "neutral", icon: "clock" };
    default:
      return { label: "Pickup check", tone: "neutral", icon: "clock" };
  }
}

export function presentEscalationStatus(status: string): StatePresentation {
  switch (status) {
    case "open":
      return { label: "Waiting on Operations", tone: "error", icon: "triangle-alert" };
    case "resolved":
      return { label: "Instruction given", tone: "success", icon: "circle-check" };
    default:
      return { label: "Escalation", tone: "neutral", icon: "clock" };
  }
}

/**
 * Delivery zone id → the name a person uses. Zone ids are API-shaped; the id
 * itself must never reach the screen.
 */
export function presentZone(zone: string | null | undefined): string {
  if (zone == null || !String(zone).trim()) return "—";
  const map: Record<string, string> = {
    davao_central: "Davao Central",
    davao_north: "Davao North",
    davao_south: "Davao South",
    davao_east: "Davao East",
    davao_west: "Davao West",
  };
  if (map[zone]) return map[zone];
  return zone
    .split(/[_-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
