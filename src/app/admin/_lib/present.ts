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
      return { label: "Verified", tone: "success", icon: "circle-check" };
    case "pending":
      return { label: "Pending review", tone: "warning", icon: "clock" };
    case "suspended":
      return { label: "Suspended", tone: "error", icon: "triangle-alert" };
    case "rejected":
      return { label: "Rejected", tone: "error", icon: "circle-x" };
    case "unverified":
    case null:
    case undefined:
    case "":
      return { label: "Not verified", tone: "neutral", icon: "square-pen" };
    default:
      return { label: "Verification unknown", tone: "neutral", icon: "clock" };
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
          label: "Verify",
          consequence:
            "Marks this account as accredited. Verified suppliers can offer live services for matching; verified riders can receive dispatch offers.",
        },
        {
          status: "rejected",
          label: "Reject",
          danger: true,
          consequence:
            "Rejects accreditation. The account stays signed in but cannot pass matching or dispatch eligibility until re-verified.",
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
            "Restores verified status. Live services become eligible for new matching again; existing orders were never disrupted.",
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
          label: "Mark pending",
          consequence:
            "Places the account in the review queue so Super Admin or Operations can decide next.",
        },
        {
          status: "approved",
          label: "Verify",
          consequence:
            "Marks this account as accredited without a separate pending step.",
        },
      ];
    default:
      return [
        {
          status: "pending",
          label: "Mark pending",
          consequence: "Places the account in the review queue.",
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

export function presentPaymentStatus(status: string | null | undefined): Presentation {
  switch (status) {
    case "authorized":
      return { label: "Authorised", tone: "info", icon: "circle-check" };
    case "collected":
      return { label: "Collected", tone: "success", icon: "circle-check" };
    case "unpaid":
      return { label: "Unpaid", tone: "warning", icon: "clock" };
    case "failed":
      return { label: "Payment failed", tone: "error", icon: "circle-x" };
    case "refunded":
      return { label: "Refunded", tone: "neutral", icon: "circle-x" };
    default:
      return { label: "Payment unknown", tone: "neutral", icon: "clock" };
  }
}

export function presentPaymentMethod(
  method: string | null | undefined,
): string {
  switch (method) {
    case "cod":
      return "Cash on delivery";
    case "pilot_credit":
      return "Pilot Credits";
    case null:
    case undefined:
    case "":
      return "Not chosen";
    default:
      return "Other method";
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
