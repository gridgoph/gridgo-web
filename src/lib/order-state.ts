/**
 * Plain-language order state presentation.
 * No API snake_case reaches the screen.
 */

export type StatusTone = "success" | "warning" | "error" | "info" | "neutral";
export type StatusIconName =
  | "circle-check"
  | "triangle-alert"
  | "circle-x"
  | "clock"
  | "square-pen";

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
      return { label: "Proof with client", tone: "info", icon: "clock" };
    case "approved_for_matching":
      return { label: "Ready to match supplier", tone: "info", icon: "clock" };
    case "supplier_assigned":
      return { label: "Awaiting supplier decision", tone: "warning", icon: "triangle-alert" };
    case "supplier_accepted":
      return { label: "Supplier accepted", tone: "info", icon: "circle-check" };
    case "awaiting_payment":
      return { label: "Awaiting payment", tone: "warning", icon: "clock" };
    case "payment_authorized":
      return { label: "Paid — start production", tone: "info", icon: "circle-check" };
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
