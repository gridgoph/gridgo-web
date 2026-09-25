/**
 * Plain-language presentation for Super Admin surfaces.
 * No API snake_case reaches the screen.
 */

import type {
  Role,
  SupplierServiceState,
  VerificationStatus,
} from "@/lib/api/types";
import type { StatusIconName, StatusTone } from "@/lib/order-state";
import { roleLabel } from "@/lib/routes";

export type Presentation = {
  label: string;
  tone: StatusTone;
  icon: StatusIconName;
};

export function presentRole(role: Role | string): string {
  if (
    role === "client" ||
    role === "supplier" ||
    role === "rider" ||
    role === "ops_admin" ||
    role === "super_admin"
  ) {
    return roleLabel(role);
  }
  return "Unknown role";
}

/** Roles that can be assigned through the Super Admin role control. */
export const ASSIGNABLE_ROLES: Role[] = [
  "client",
  "supplier",
  "rider",
  "ops_admin",
  "super_admin",
];

export function presentVerification(
  status: VerificationStatus | string | null | undefined,
): Presentation {
  switch (status) {
    case "approved":
      return { label: "Approved", tone: "success", icon: "circle-check" };
    case "pending":
      return { label: "Waiting for a decision", tone: "warning", icon: "clock" };
    case "suspended":
      return { label: "Suspended", tone: "error", icon: "triangle-alert" };
    case "rejected":
      return { label: "Rejected", tone: "error", icon: "circle-x" };
    case "unverified":
    case null:
    case undefined:
    case "":
      return { label: "Not approved", tone: "neutral", icon: "square-pen" };
    default:
      return { label: "Approval unknown", tone: "neutral", icon: "clock" };
  }
}

/**
 * Verification transitions available from the current status.
 * Maps to setUserVerification status values.
 */
export type VerificationAction = {
  status: VerificationStatus;
  label: string;
  /** Destructive / high-impact styling. */
  danger?: boolean;
  /** Plain-language consequence shown before confirm. */
  consequence: string;
};

export function verificationActions(
  status: VerificationStatus | string | null | undefined,
): VerificationAction[] {
  switch (status) {
    case "pending":
      return [
        {
          status: "approved",
          label: "Approve",
          consequence:
            "Lets this account start working. An approved supplier can be matched to orders; an approved rider can accept dispatch offers. Neither can do anything until this decision is made.",
        },
        {
          status: "rejected",
          label: "Reject",
          danger: true,
          consequence:
            "Turns this sign-up down. The account can still sign in but will never be offered work. Give a reason — it is the only thing they have to go on.",
        },
      ];
    case "approved":
      return [
        {
          status: "suspended",
          label: "Suspend",
          danger: true,
          consequence:
            "Stops this supplier’s live services from being matched to new work. Existing assigned orders continue undisturbed. Riders stop receiving new dispatch offers.",
        },
      ];
    case "suspended":
      return [
        {
          status: "approved",
          label: "Reinstate",
          consequence:
            "Restores approved status. Live services become eligible for new matching again; existing orders were never disrupted.",
        },
      ];
    case "rejected":
    case "unverified":
    case null:
    case undefined:
    case "":
      return [
        {
          status: "pending",
          label: "Move to the queue",
          consequence:
            "Places the account back in the sign-up queue so Operations or Super Admin can decide next.",
        },
        {
          status: "approved",
          label: "Approve",
          consequence:
            "Lets this account start working straight away, without a separate queue step.",
        },
      ];
    default:
      return [
        {
          status: "pending",
          label: "Move to the queue",
          consequence: "Places the account back in the sign-up queue.",
        },
      ];
  }
}

export function presentServiceState(
  state: SupplierServiceState | string,
): Presentation {
  switch (state) {
    case "draft":
      return { label: "Draft", tone: "neutral", icon: "square-pen" };
    case "pending_verification":
      return { label: "Awaiting verification", tone: "warning", icon: "clock" };
    case "live":
      return { label: "Live", tone: "success", icon: "circle-check" };
    case "suspended":
      return { label: "Suspended", tone: "error", icon: "triangle-alert" };
    case "withdrawn":
      return { label: "Withdrawn", tone: "neutral", icon: "circle-x" };
    default:
      return { label: "Unknown", tone: "neutral", icon: "clock" };
  }
}

/** Plain consequence of a platform role change — shown before confirm. */
export function roleChangeConsequence(
  from: Role | string,
  to: Role | string,
): string {
  const fromLabel = presentRole(from);
  const toLabel = presentRole(to);
  const parts = [`Changes this account from ${fromLabel} to ${toLabel}.`];

  if (to === "super_admin") {
    parts.push(
      "They will gain full platform governance: roles, verification, zones, credits, and audit.",
    );
  } else if (from === "super_admin" && to !== "super_admin") {
    parts.push(
      "They will lose Super Admin access immediately, including this control surface.",
    );
  }

  if (to === "ops_admin") {
    parts.push("They will access Operations queues and cannot open Super Admin routes.");
  } else if (to === "supplier") {
    parts.push(
      "They become a supplier partner surface only — no Operations or Super Admin access.",
    );
  } else if (to === "client") {
    parts.push(
      "They become a client account. Portal web surfaces for Operations and Super Admin will refuse them.",
    );
  } else if (to === "rider") {
    parts.push(
      "They become a rider account. Rider work stays on the rider app; this portal will refuse them.",
    );
  }

  parts.push("This change is written to the platform audit log.");
  return parts.join(" ");
}

/**
 * The legacy roll-up summary on an order. `Order.payments` is the authoritative
 * split — prefer `presentPaymentProgress` from `@/lib/order-state` on screens
 * that show a live order.
 */
export function presentPaymentStatus(status: string | null | undefined): Presentation {
  switch (status) {
    case "downpayment_pending":
      return {
        label: "Downpayment to confirm",
        tone: "warning",
        icon: "triangle-alert",
      };
    case "downpayment_confirmed":
    case "authorized":
      return { label: "Downpayment in", tone: "info", icon: "circle-check" };
    case "balance_pending":
      return {
        label: "Balance to confirm",
        tone: "warning",
        icon: "triangle-alert",
      };
    case "paid":
      return { label: "Paid in full", tone: "success", icon: "circle-check" };
    case "unpaid":
      return { label: "Nothing paid yet", tone: "warning", icon: "clock" };
    case "refunded":
      return { label: "Refunded", tone: "neutral", icon: "circle-x" };
    default:
      return { label: "Payment unknown", tone: "neutral", icon: "clock" };
  }
}

export function presentClaimStatus(status: string): Presentation {
  switch (status) {
    case "open":
      return { label: "Open", tone: "warning", icon: "clock" };
    case "payout_held":
      return { label: "Payout held", tone: "error", icon: "triangle-alert" };
    case "released":
      return { label: "Hold released", tone: "success", icon: "circle-check" };
    default:
      return { label: "Claim update", tone: "neutral", icon: "clock" };
  }
}

export function presentLedgerType(type: string): string {
  switch (type) {
    case "grant":
      return "Administrative grant";
    case "authorize":
    case "authorise":
      return "Authorised against order";
    case "capture":
      return "Captured";
    case "release":
      return "Released";
    case "refund":
      return "Refunded";
    default:
      return "Ledger entry";
  }
}

/** Map audit action codes to sentence-case labels. */
export function presentAuditAction(action: string): string {
  const map: Record<string, string> = {
    "credits.grant": "Granted Pilot Credits",
    "user.role_update": "Changed user role",
    "user.role": "Changed user role",
    "user.verification": "Updated verification",
    "zone.create": "Created delivery zone",
    "zone.update": "Updated delivery zone",
    "taxonomy.category.create": "Created category",
    "taxonomy.category.update": "Updated category",
    "taxonomy.material.create": "Created material",
    "taxonomy.material.update": "Updated material",
    "taxonomy.finish.create": "Created finish",
    "taxonomy.finish.update": "Updated finish",
    "supplier_service.verify": "Verified supplier service",
    "supplier_service.suspend": "Suspended supplier service",
    "issue.report": "Client reported issue",
    "issue.resolve": "Resolved issue",
    "claim.create": "Raised claim",
    "claim.hold": "Held payout",
    "claim.release": "Released payout hold",
    "tracker.status": "Changed tracker status",
    "tracker.decision": "Recorded tracker decision",
  };
  if (map[action]) return map[action];

  // Fallback: dots/underscores → words, never raw snake_case
  return action
    .replace(/[._]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase());
}

export function presentAuditEntityType(
  entityType: string | null | undefined,
): string {
  if (!entityType) return "—";
  const map: Record<string, string> = {
    user: "User",
    credits: "Pilot Credits",
    zone: "Zone",
    category: "Category",
    material: "Material",
    finish: "Finish",
    supplier_service: "Supplier service",
    claim: "Claim",
    issue: "Issue",
    order: "Order",
  };
  if (map[entityType]) return map[entityType];
  return entityType
    .replace(/[._]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase());
}

export function presentActorRole(role: string | null | undefined): string {
  if (!role) return "System";
  return presentRole(role);
}
