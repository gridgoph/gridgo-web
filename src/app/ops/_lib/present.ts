/**
 * Ops-local plain-language presentation.
 * Kept under the ops route so parallel role workers do not touch src/lib.
 * No snake_case or raw API codes on screen.
 */

import type {
  ClaimStatus,
  IssueStatus,
  SupplierServiceState,
  VerificationStatus,
} from "@/lib/api/types";
import type { StatusIconName, StatusTone } from "@/lib/order-state";
import { presentTimelineActor } from "@/lib/order-state";

export type ChipPresentation = {
  label: string;
  tone: StatusTone;
  icon: StatusIconName;
};

/** Re-exported so Operations screens keep one import for plain language. */
export { presentZone } from "@/lib/order-state";

export function presentVerification(
  status: VerificationStatus | string | undefined | null,
): ChipPresentation {
  switch (status) {
    case "approved":
      return { label: "Verified", tone: "success", icon: "circle-check" };
    case "pending":
      return { label: "Verification pending", tone: "warning", icon: "clock" };
    case "suspended":
      return { label: "Suspended", tone: "error", icon: "circle-x" };
    case "rejected":
      return { label: "Verification rejected", tone: "error", icon: "circle-x" };
    case "unverified":
    case undefined:
    case null:
    case "":
      return { label: "Not verified", tone: "neutral", icon: "triangle-alert" };
    default:
      return { label: "Verification unknown", tone: "neutral", icon: "clock" };
  }
}

export function presentServiceState(
  state: SupplierServiceState | string,
): ChipPresentation {
  switch (state) {
    case "live":
      return { label: "Live", tone: "success", icon: "circle-check" };
    case "pending_verification":
      return { label: "Awaiting verification", tone: "warning", icon: "clock" };
    case "draft":
      return { label: "Draft", tone: "neutral", icon: "square-pen" };
    case "suspended":
      return { label: "Suspended", tone: "error", icon: "circle-x" };
    case "withdrawn":
      return { label: "Withdrawn", tone: "neutral", icon: "circle-x" };
    default:
      return { label: "Service", tone: "neutral", icon: "clock" };
  }
}

export function presentClaimStatus(
  status: ClaimStatus | string,
): ChipPresentation {
  switch (status) {
    case "open":
      return { label: "Open", tone: "warning", icon: "triangle-alert" };
    case "payout_held":
      return { label: "Payout held", tone: "error", icon: "circle-x" };
    case "released":
      return { label: "Released", tone: "success", icon: "circle-check" };
    default:
      return { label: "Claim", tone: "neutral", icon: "clock" };
  }
}

export function presentIssueStatus(
  status: IssueStatus | string,
): ChipPresentation {
  switch (status) {
    case "open":
      return { label: "Open issue", tone: "warning", icon: "triangle-alert" };
    case "resolved":
      return { label: "Resolved", tone: "success", icon: "circle-check" };
    case "dismissed":
      return { label: "Dismissed", tone: "neutral", icon: "circle-x" };
    default:
      return { label: "Issue", tone: "neutral", icon: "clock" };
  }
}

export function presentIssueKind(kind: string): string {
  switch (kind) {
    case "material_quality":
      return "Material quality";
    case "wrong_item":
      return "Wrong item";
    case "damage":
      return "Damage in transit";
    case "late":
      return "Late delivery";
    default:
      return kind
        .split(/[_-]/)
        .filter(Boolean)
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join(" ");
  }
}

/**
 * Map eligibility reason codes from the matching API to plain language.
 * Codes often look like `svc_…:product_family_mismatch` or bare tokens.
 */
export function presentMatchReason(raw: string): string {
  const code = raw.includes(":") ? raw.split(":").slice(1).join(":") : raw;
  const serviceHint = raw.includes(":") ? raw.split(":")[0] : null;

  const phrase = (() => {
    switch (code) {
      case "product_family_mismatch":
        return "Product family does not match this order";
      case "qty_below_min":
        return "Quantity is below the service minimum";
      case "qty_above_max":
        return "Quantity exceeds the service maximum";
      case "zone_mismatch":
        return "Service does not cover this delivery zone";
      case "material_mismatch":
        return "Material is not declared on the service";
      case "finish_mismatch":
        return "Finish is not declared on the service";
      case "size_out_of_range":
        return "Size is outside the service range";
      case "not_live":
        return "Service is not live";
      case "service_not_live":
        return "Service is not live";
      case "supplier_not_verified":
      case "verification_not_approved":
        return "Supplier is not verified";
      case "capacity_exhausted":
        return "Declared capacity is exhausted";
      case "zone_covered":
        return "Zone is covered by a live service";
      case "product_family_match":
        return "Product family matches a live service";
      case "material_match":
        return "Material is on a live service";
      case "quantity_in_range":
        return "Quantity is within service limits";
      case "verified":
        return "Supplier is verified";
      case "live_service":
        return "Has a live matching service";
      default: {
        const words = code
          .split(/[_-]/)
          .filter(Boolean)
          .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
          .join(" ");
        return words || "Eligibility note";
      }
    }
  })();

  if (serviceHint && serviceHint.startsWith("svc_")) {
    return phrase;
  }
  return phrase;
}

export function presentClaimAction(action: string): string {
  switch (action) {
    case "raised":
      return "Claim raised";
    case "raised_and_held":
      return "Claim raised and payout held";
    case "hold":
      return "Payout held";
    case "auto_hold_from_issue":
      return "Auto-held from client issue";
    case "release":
      return "Payout hold released";
    default:
      return action
        .split(/[_.-]/)
        .filter(Boolean)
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join(" ");
  }
}

export function presentAuditAction(action: string): string {
  const map: Record<string, string> = {
    "claim.raise": "Claim raised",
    "claim.hold": "Payout held",
    "claim.release": "Payout hold released",
    "issue.report": "Issue reported",
    "issue.resolve": "Issue resolved",
    "credits.grant": "Pilot Credits granted",
    "zone.create": "Zone created",
    "zone.update": "Zone updated",
    "user.role": "Role changed",
    "user.verification": "Verification updated",
    "supplier_service.create": "Supplier service created",
    "supplier_service.update": "Supplier service updated",
    "supplier_service.submit": "Supplier service submitted",
    "supplier_service.verify": "Supplier service verified",
    "supplier_service.suspend": "Supplier service suspended",
    "supplier_service.withdraw": "Supplier service withdrawn",
    "order.transition": "Order state changed",
    "taxonomy.create": "Taxonomy entry created",
    "taxonomy.update": "Taxonomy entry updated",
  };
  if (map[action]) return map[action];
  return action
    .split(/[._-]/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

export function presentEntityType(entityType: string | null | undefined): string {
  if (!entityType) return "Record";
  switch (entityType) {
    case "claim":
      return "Claim";
    case "issue":
      return "Issue";
    case "order":
      return "Order";
    case "zone":
      return "Zone";
    case "credits":
      return "Credits";
    case "supplier_service":
      return "Supplier service";
    case "user":
      return "User";
    case "taxonomy":
      return "Taxonomy";
    default:
      return entityType
        .split(/[_-]/)
        .filter(Boolean)
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join(" ");
  }
}

export function presentActorRole(role: string | null | undefined): string {
  switch (role) {
    case "ops_admin":
      return "Operations";
    case "super_admin":
      return "Super Admin";
    case "supplier":
      return "Supplier";
    case "client":
      return "Client";
    case "rider":
      return "Rider";
    case null:
    case undefined:
    case "":
      return "System";
    default:
      return role;
  }
}

export function presentActor(
  actorId: string | null | undefined,
  actorRole?: string | null,
): string {
  if (!actorId || actorId === "system") {
    return actorRole ? presentActorRole(actorRole) : "GRIDGO";
  }
  const fromId = presentTimelineActor(actorId);
  if (fromId !== actorId) return fromId;
  // Unknown actor id — prefer role label over dumping the raw id on screen.
  return presentActorRole(actorRole);
}

/** Prefer display name without raw id when we only have a role map. */
export function shortRecordId(id: string | null | undefined): string {
  if (!id) return "—";
  if (id.length <= 14) return id;
  return `${id.slice(0, 10)}…`;
}
