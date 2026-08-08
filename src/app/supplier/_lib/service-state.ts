/**
 * Plain-language supplier service lifecycle presentation.
 * No API snake_case reaches the screen.
 */

import type { SupplierService, SupplierServiceState } from "@/lib/api/types";
import type { StatusIconName, StatusTone } from "@/lib/order-state";

export type ServicePresentation = {
  label: string;
  tone: StatusTone;
  icon: StatusIconName;
  /** Why this line is not live, or null when live. */
  whyNotLive: string | null;
  /** What the supplier should do next. */
  nextStep: string;
};

export function presentServiceState(
  state: SupplierServiceState | string,
  service?: Pick<SupplierService, "suspendReason">,
): ServicePresentation {
  switch (state) {
    case "draft":
      return {
        label: "Draft",
        tone: "neutral",
        icon: "square-pen",
        whyNotLive:
          "This line is still a draft. Matching will not offer it until you submit it for verification.",
        nextStep: "Finish the details, then submit for verification.",
      };
    case "pending_verification":
      return {
        label: "Awaiting verification",
        tone: "warning",
        icon: "clock",
        whyNotLive:
          "GRIDGO is reviewing this capability. It is not offered to new jobs until verification completes.",
        nextStep: "Wait for Operations or Super Admin to verify. No action needed from you.",
      };
    case "live":
      return {
        label: "Live",
        tone: "success",
        icon: "circle-check",
        whyNotLive: null,
        nextStep: "Available for matching. Edit capacity freely; expanding materials or category re-enters verification.",
      };
    case "suspended": {
      const reason = service?.suspendReason?.trim();
      return {
        label: "Suspended",
        tone: "error",
        icon: "triangle-alert",
        whyNotLive: reason
          ? `GRIDGO suspended this line: ${reason}`
          : "GRIDGO suspended this line. It is not offered to new jobs.",
        nextStep:
          "Fix the issue if you can, then submit again for re-verification.",
      };
    }
    case "withdrawn":
      return {
        label: "Withdrawn",
        tone: "neutral",
        icon: "circle-x",
        whyNotLive:
          "You withdrew this line from matching. In-flight orders keep running — withdrawal only stops new matches.",
        nextStep:
          "Submit again if you want this capability re-verified and returned to matching.",
      };
    default:
      return {
        label: "Unknown status",
        tone: "neutral",
        icon: "clock",
        whyNotLive: "Status is not recognised for this line.",
        nextStep: "Refresh the catalogue or contact Operations.",
      };
  }
}

export type ServiceActionKind = "edit" | "submit" | "withdraw";

export type ServiceAction = {
  kind: ServiceActionKind;
  label: string;
  /** Destructive path (withdraw) needs confirm. */
  destructive?: boolean;
};

/** Valid supplier actions for a service line state. */
export function actionsForService(
  state: SupplierServiceState | string,
): ServiceAction[] {
  switch (state) {
    case "draft":
      return [
        { kind: "edit", label: "Edit draft" },
        { kind: "submit", label: "Submit for verification" },
        { kind: "withdraw", label: "Withdraw", destructive: true },
      ];
    case "pending_verification":
      return [
        { kind: "edit", label: "Edit details" },
        { kind: "withdraw", label: "Withdraw", destructive: true },
      ];
    case "live":
      return [
        { kind: "edit", label: "Edit capacity & details" },
        { kind: "withdraw", label: "Withdraw from matching", destructive: true },
      ];
    case "suspended":
      return [
        { kind: "edit", label: "Edit details" },
        { kind: "submit", label: "Re-submit for verification" },
        { kind: "withdraw", label: "Withdraw", destructive: true },
      ];
    case "withdrawn":
      return [
        { kind: "edit", label: "Edit details" },
        { kind: "submit", label: "Re-submit for verification" },
      ];
    default:
      return [];
  }
}

/** Plain labels for pricing basis codes from the platform taxonomy envelope. */
export function presentPricingBasis(basis: string): string {
  switch (basis) {
    case "per_sqm":
      return "Per square metre";
    case "per_pack":
      return "Per pack";
    case "per_unit":
      return "Per unit";
    case "per_hour":
      return "Per hour";
    default:
      return basis.replace(/_/g, " ");
  }
}

export const PRICING_BASIS_OPTIONS = [
  { value: "per_sqm", label: "Per square metre" },
  { value: "per_pack", label: "Per pack" },
  { value: "per_unit", label: "Per unit" },
  { value: "per_hour", label: "Per hour" },
] as const;

/** Sort: action-needed first (draft/suspended), then pending, live, withdrawn. */
export function sortServices(services: SupplierService[]): SupplierService[] {
  const rank = (state: string): number => {
    switch (state) {
      case "draft":
        return 0;
      case "suspended":
        return 1;
      case "pending_verification":
        return 2;
      case "live":
        return 3;
      case "withdrawn":
        return 4;
      default:
        return 5;
    }
  };
  return [...services].sort((a, b) => {
    const dr = rank(a.state) - rank(b.state);
    if (dr !== 0) return dr;
    return a.categoryCode.localeCompare(b.categoryCode);
  });
}
