import {
  Banknote,
  Bell,
  ClipboardCheck,
  FileSearch,
  Megaphone,
  Package,
  ShieldCheck,
  TriangleAlert,
  Truck,
  UserRoundPlus,
  type LucideIcon,
} from "lucide-react";

import type { Notification } from "@/lib/api/types";

/**
 * How one inbox row reads: which family of event it is, the icon that family
 * wears, and the headline / reference split. Shared by the Desk panel and the
 * arrival toast so a slip looks the same wherever it lands.
 */

export type SlipFamily =
  | "announcement"
  | "signup"
  | "service"
  | "issue"
  | "payment"
  | "check"
  | "role"
  | "delivery"
  | "order"
  | "general";

export const FAMILY_ICON: Record<SlipFamily, LucideIcon> = {
  announcement: Megaphone,
  signup: UserRoundPlus,
  service: ClipboardCheck,
  issue: TriangleAlert,
  payment: Banknote,
  check: FileSearch,
  role: ShieldCheck,
  delivery: Truck,
  order: Package,
  general: Bell,
};

/**
 * One icon per family of event, so a glance down the list reads "money,
 * money, sign-up, issue" before a single title is read. Families follow the
 * same type vocabulary `notificationHref` routes on, so a new API event still
 * lands in a sensible family rather than a blank tile.
 */
export function slipFamily(notification: Notification): SlipFamily {
  const type = notification.type ?? "";
  if (notification.announcementId || type === "announcement") return "announcement";
  if (
    notification.approvalCaseId ||
    type.includes("signup") ||
    type.startsWith("approval_")
  ) {
    return "signup";
  }
  if (type.includes("service")) return "service";
  if (
    type.includes("issue") ||
    type.includes("escalation") ||
    type.includes("claim") ||
    type.includes("rejected") ||
    type.includes("failed") ||
    type.includes("cancelled")
  ) {
    return "issue";
  }
  if (
    type.includes("payment") ||
    type.includes("payout") ||
    type.includes("credit") ||
    type.includes("grant") ||
    type.includes("price") ||
    type.includes("checkout")
  ) {
    return "payment";
  }
  if (
    type.includes("qa") ||
    type.includes("qc") ||
    type.includes("proof") ||
    type.includes("correction")
  ) {
    return "check";
  }
  if (type.includes("role")) return "role";
  if (
    type.includes("rider") ||
    type.includes("dispatch") ||
    type.includes("pickup") ||
    type.includes("picked_up") ||
    type.includes("delivery")
  ) {
    return "delivery";
  }
  if (notification.orderId) return "order";
  return "general";
}

/** `Issue window open · ord_c6af26dd9caf` → the event, and the id it carried. */
const TITLE_WITH_ID = /^\s*(.+?)\s+·\s+([a-z]+_[a-z0-9]+)\s*$/i;

/** `ord_c6af26dd9caf` → `ord_c6af26…`; short ids stay whole. */
export function shortRef(id: string): string {
  const cut = id.indexOf("_");
  if (cut < 0) return id.length > 10 ? `${id.slice(0, 8)}…` : id;
  const prefix = id.slice(0, cut);
  const tail = id.slice(cut + 1);
  return tail.length > 8 ? `${prefix}_${tail.slice(0, 6)}…` : id;
}

/**
 * The event is the headline; the order is the line under it. A raw id never
 * leads a row — the API's `Title · ord_…` shape is split, and the order's own
 * title wins over its id when the slip carries one. A slip with no order
 * simply has no second line; the row still opens the right screen.
 */
export function presentSlip(notification: Notification): {
  headline: string;
  reference: string | null;
} {
  const match = TITLE_WITH_ID.exec(notification.title);
  const headline = match ? match[1] : notification.title;
  const orderTitle = notification.orderTitle?.trim();
  if (orderTitle) return { headline, reference: orderTitle };
  if (notification.orderId) {
    return { headline, reference: `Order ${shortRef(notification.orderId)}` };
  }
  return { headline, reference: null };
}
