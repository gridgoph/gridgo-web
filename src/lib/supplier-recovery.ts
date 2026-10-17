import type { ShopAcceptance, ShopFailureKind, ShopRecovery } from "@/lib/api/types";
import type { StatusIconName, StatusTone } from "@/lib/order-state";

/**
 * A job this shop let go, in the shop's words (gridgo-api `docs/SHOP_RECOVERY_API.md`).
 *
 * The order keeps its old state until the client chooses, so the state alone
 * would still offer the next step. A recovery the client already accepted
 * belongs to the replacement shop, which sees an ordinary job of its own.
 */

export type ShopRelease = {
  kind: ShopFailureKind;
  chip: { label: string; tone: StatusTone; icon: StatusIconName };
  title: string;
  body: string;
};

const KINDS: readonly ShopFailureKind[] = ["timed_out", "declined", "cancelled"];

type ReleaseOrder = {
  state: string;
  shopAcceptance?: ShopAcceptance | null;
  shopRecovery?: ShopRecovery | null;
};

function kindOf(order: ReleaseOrder): ShopFailureKind {
  const status = order.shopAcceptance?.status;
  const known = KINDS.find((kind) => kind === status);
  if (known) return known;
  return order.state === "supplier_assigned" ? "declined" : "cancelled";
}

const CHIPS: Record<ShopFailureKind, string> = {
  timed_out: "Not answered in time",
  declined: "Passed on",
  cancelled: "Cancelled by you",
};

const TITLES: Record<ShopFailureKind, string> = {
  timed_out: "The hour to answer ran out",
  declined: "You passed on this job",
  cancelled: "You cancelled this job",
};

/** Where a job this shop let go stands, or null while the job is still the shop's. */
export function shopRelease(order: ReleaseOrder): ShopRelease | null {
  const recovery = order.shopRecovery;
  if (!recovery || recovery.status === "accepted") return null;
  const kind = kindOf(order);
  const body =
    recovery.status === "refund_requested" || recovery.status === "refunded"
      ? "The client chose a full refund. Nothing more is needed from your shop."
      : recovery.status === "ops_review"
        ? "Operations is working out the next step with the client. Leave the job as it is; they will message you if they need your shop."
        : "GRIDGO has offered the client another vetted shop or a full refund. Leave the job as it is — nothing more is needed from your shop.";
  return {
    kind,
    chip: { label: CHIPS[kind], tone: "neutral", icon: "circle-x" },
    title: TITLES[kind],
    body,
  };
}
